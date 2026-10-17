// Tests for the Student Free Console backend: POST /api/student/console/run and
// GET /api/student/console/languages.
//
// The run endpoint is covered with the executor stubbed, so no network call to a
// compiler is made and the assertions are about this route's own contract,
// validation and authorisation.
//
// The provider envelopes below are the real ones captured from
// https://api.onlinecompiler.io/api/run-code-sync/ (output/error/status/
// exit_code/signal/time/total/memory), not invented shapes. That matters: the
// previous suite stubbed `stdout`/`stderr`/`exitCode`, which the provider never
// sends, so the one genuine bug in this path went unnoticed - see the
// "provider could not execute the program" block.
//
// Covered here:
//   - authentication and role authorization on both routes
//   - /languages is served by the route itself, so the UI can never offer a
//     language the run endpoint would reject
//   - language validation, missing code and the 50,000-character limit
//   - compiler resolution failure and execution failure map to the documented
//     statuses and HTTP codes
//   - every advertised language has a working provider compiler
//   - a real compile diagnostic stays a 200 compile_error
//   - a real runtime failure stays a 200 runtime_error and is NOT called a
//     compile error
//   - the provider's `exit_code: -1` placeholder is a 502 provider failure,
//     never a compile error, and its zeroed metrics are not reported as real
//   - upstream error text is never echoed back to the client
//   - a successful run reports runtime and memory ONLY when the executor measured
//     them; nothing is substituted for a missing measurement
//   - stdin is passed through under either `input` or `stdin`
//   - stdin is validated and bounded, and rejected as a client error rather than
//     surfacing an opaque provider failure
//   - the documented `signal` and `total` fields survive normalization
//   - the provider's upstream status decides what the student is told: 400 is a
//     rejected request, 429 is rate limiting, a rejected credential stays a fault
//   - every rejection names the compiler that was actually resolved

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');

jest.mock('../src/services/OnlineCompilerExecutor', () => ({
  execute: jest.fn(),
}));

const { execute } = require('../src/services/OnlineCompilerExecutor');

jest.mock('../src/services/compilerRegistry', () => {
  const actual = jest.requireActual('../src/services/compilerRegistry');
  return {
    ...actual,
    mapLegacyToCompiler: jest.fn(),
    getCompilerById: jest.fn(),
  };
});

const { mapLegacyToCompiler, getCompilerById, LEGACY_TO_COMPILER } = require('../src/services/compilerRegistry');

/** A real provider success envelope (python-3.14, captured live). */
const providerSuccess = {
  output: 'Hello, student!\n',
  error: '',
  status: 'success',
  exit_code: 0,
  signal: null,
  time: '0.0678',
  total: '0.1049',
  memory: '14048',
};

/** A real C compile failure envelope (gcc-15, captured live). */
const providerCompileError = {
  output: '',
  error: "1:13: error: 'oops' undeclared (first use in this function)\n",
  status: 'error',
  exit_code: 1,
  signal: null,
  time: '0.0000',
  total: '0.0730',
  memory: '0',
};

/** A real runtime failure that actually ran (exit code, output produced). */
const providerRuntimeError = {
  output: 'before\n',
  error: 'ValueError: boom\n',
  status: 'error',
  exit_code: 1,
  signal: null,
  time: '0.0410',
  total: '0.0900',
  memory: '14100',
};

/**
 * The provider's placeholder envelope. Returned live for EVERY failed
 * Python / Java / TypeScript run and for any C/C++ run killed by a signal.
 * `exit_code: -1` is outside the documented range and carries no diagnostic.
 */
const providerExecutionFailure = {
  output: '',
  error: 'Internal error: code execution failed',
  status: 'error',
  exit_code: -1,
  signal: null,
  time: '0',
  total: '0',
  memory: '0',
};

async function createUser({ name, email, password, role = 'STUDENT' }) {
  const passwordHash = await authService.hashPassword(password);
  return User.create({ name, email, passwordHash, role, status: 'ACTIVE' });
}

async function tokenFor(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'pwd' });
  return res.body.token;
}

const run = (token, body) =>
  request(app).post('/api/student/console/run').set('Authorization', `Bearer ${token}`).send(body);

const languages = (token) =>
  request(app).get('/api/student/console/languages').set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  await User.deleteMany({});
  jest.clearAllMocks();
  // Resolve through the real registry table so the language → compiler mapping
  // under test is the production one.
  mapLegacyToCompiler.mockImplementation((lang) => LEGACY_TO_COMPILER[lang] || null);
  getCompilerById.mockImplementation(async (id) => (id ? { id, name: id } : null));
  execute.mockResolvedValue(providerSuccess);
});

describe('GET /api/student/console/languages', () => {
  test('unauthenticated request is rejected', async () => {
    expect((await request(app).get('/api/student/console/languages')).status).toBe(401);
  });

  test('a trainer is refused', async () => {
    const trainer = await createUser({ name: 'T', email: 't@test.com', password: 'pwd', role: 'TRAINER' });
    expect((await languages(await tokenFor(trainer))).status).toBe(403);
  });

  test('serves exactly the languages the run endpoint accepts', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await languages(await tokenFor(student));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const values = res.body.data.map((l) => l.value);
    expect(values).toEqual(['c', 'cpp', 'java', 'python', 'typescript']);

    // Every advertised language must carry a label and a filename so the UI does
    // not have to keep its own copy of either.
    for (const entry of res.body.data) {
      expect(entry).toEqual(expect.objectContaining({ value: expect.any(String), label: expect.any(String), file: expect.any(String) }));
    }
  });

  test('every advertised language is actually accepted by the run endpoint', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);
    const res = await languages(token);

    for (const entry of res.body.data) {
      const runRes = await run(token, { language: entry.value, code: 'print(1)' });
      // Anything other than "unsupported language" proves the two lists agree.
      expect(runRes.body.code).not.toBe('UNSUPPORTED_LANGUAGE');
      expect(runRes.status).toBe(200);
    }
  });
});

describe('POST /api/student/console/run — language/compiler coverage', () => {
  test('every advertised language maps to a distinct, non-empty provider compiler', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);
    const { body } = await languages(token);

    const used = [];
    for (const { value } of body.data) {
      const compilerId = LEGACY_TO_COMPILER[value];
      expect(compilerId).toBeTruthy();

      const res = await run(token, { language: value, code: 'print(1)' });
      expect(res.status).toBe(200);
      // The compiler actually resolved for that language is reported back.
      expect(res.body.compiler).toBe(compilerId);
      used.push(compilerId);
    }

    expect(new Set(used).size).toBe(body.data.length);
  });

  test('a valid program returns its expected output for every supported language', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);
    const { body } = await languages(token);

    for (const { value } of body.data) {
      execute.mockResolvedValue({ ...providerSuccess, output: `${value} ran\n` });
      const res = await run(token, { language: value, code: 'print(1)' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        status: 'success',
        language: value,
        exitCode: 0,
        output: `${value} ran\n`,
      });
      expect(res.body.error).toBeNull();
      expect(res.body.time).toBe('0.0678');
      expect(res.body.memory).toBe('14048');
    }
  });
});

describe('POST /api/student/console/run — authorisation and validation', () => {
  test('unauthenticated request is rejected', async () => {
    expect((await request(app).post('/api/student/console/run').send({ code: 'x', language: 'python' })).status).toBe(401);
  });

  test('a trainer is refused', async () => {
    const trainer = await createUser({ name: 'T', email: 't@test.com', password: 'pwd', role: 'TRAINER' });
    expect((await run(await tokenFor(trainer), { code: 'x', language: 'python' })).status).toBe(403);
  });

  test('a language outside the supported list is refused before anything executes', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { code: 'package main', language: 'go' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_LANGUAGE');
    expect(res.body.success).toBe(false);
    // Nothing was sent to a compiler.
    expect(execute).not.toHaveBeenCalled();
  });

  test('missing or non-string code is refused', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    expect((await run(token, { language: 'python' })).status).toBe(400);
    expect((await run(token, { language: 'python', code: 42 })).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  test('a request with no JSON body is a client error, not a 500', async () => {
    // express.json() only populates req.body when a JSON body is actually sent.
    // A bodyless request, or one sent as text/plain or as a form, arrives with
    // req.body undefined; the handler used to dereference it and the resulting
    // TypeError surfaced as HTTP 500 with a stack trace.
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    const bodyless = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`);
    expect(bodyless.status).toBe(400);
    expect(bodyless.body.success).toBe(false);
    expect(bodyless.body.status).toBe('invalid_request');
    expect(bodyless.body.message ?? bodyless.body.error).toMatch(/code/i);
    // Nothing reached a compiler.
    expect(execute).not.toHaveBeenCalled();

    const wrongType = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/plain')
      .send('{"code":"print(1)","language":"python"}');
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.status).toBe('invalid_request');
    expect(execute).not.toHaveBeenCalled();

    const form = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .type('form')
      .send({ code: 'print(1)', language: 'python' });
    expect(form.status).toBe(400);
    expect(form.body.status).toBe('invalid_request');
    expect(execute).not.toHaveBeenCalled();
  });

  test('malformed JSON is rejected by the parser, not by a crash', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"code":"print(1)"');

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  test('the 50,000 character limit is enforced', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    const ok = await run(token, { language: 'python', code: 'x'.repeat(50_000) });
    expect(ok.status).toBe(200);

    const tooBig = await run(token, { language: 'python', code: 'x'.repeat(50_001) });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatch(/50,000/);
  });

  test('a compiler that cannot be resolved is reported, not silently run', async () => {
    getCompilerById.mockResolvedValue(null);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPILER_NOT_SUPPORTED');
    expect(execute).not.toHaveBeenCalled();
  });

  test('stdin is forwarded under either field name', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    await run(token, { language: 'python', code: 'print(1)', input: '7' });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ stdin: '7' }));

    await run(token, { language: 'python', code: 'print(1)', stdin: '8' });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ stdin: '8' }));
  });

  test('the compiler is resolved server-side and never taken from the client', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    await run(await tokenFor(student), { language: 'python', code: 'print(1)', compilerId: 'attacker-chosen' });

    expect(mapLegacyToCompiler).toHaveBeenCalledWith('python');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ compilerId: LEGACY_TO_COMPILER.python }));
  });
});

describe('POST /api/student/console/run — provider integration', () => {
  test('the client budget stays above the provider sandbox limit', () => {
    // The provider caps a single execution at 30s but can only answer after
    // compilation and execution finish (measured: ~31.5s for Java). A client
    // budget at or below the provider limit aborts first and discards a real
    // provider response, turning it into a bogus client-side timeout.
    const { DEFAULT_EXECUTION_TIMEOUT_MS } = jest.requireActual('../src/services/OnlineCompilerExecutor');
    expect(DEFAULT_EXECUTION_TIMEOUT_MS).toBeGreaterThan(30_000);
  });

  test('the resolved compiler and forwarded stdin match the documented request', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    await run(await tokenFor(student), { language: 'python', code: 'print(1)', input: 'x' });

    // The route calls execute({ source, language, stdin, compilerId }); the
    // executor turns those into the provider's { compiler, code, input }.
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      compilerId: 'python-3.14',
      source: 'print(1)',
      stdin: 'x',
    }));
  });
});

describe('POST /api/student/console/run — result classification', () => {
  test('a successful run reports the provider output, exit code and measurements', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      status: 'success',
      exitCode: 0,
      output: 'Hello, student!\n',
      error: null,
      time: '0.0678',
      memory: '14048',
    });
  });

  test('runtime and memory are OMITTED when the executor did not measure them', async () => {
    execute.mockResolvedValue({ output: 'ok', error: '', status: 'success', exit_code: 0 });
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(200);
    // Previously these were replaced with '0.02' and '1024', which the UI then
    // rendered as a real measurement.
    expect(res.body).not.toHaveProperty('time');
    expect(res.body).not.toHaveProperty('memory');
  });

  test('a real compiler diagnostic stays a 200 compile_error with its text', async () => {
    execute.mockResolvedValue(providerCompileError);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'c', code: 'int main(){ oops }' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('compile_error');
    expect(res.body.compile_output).toContain("'oops' undeclared");
    expect(res.body.exitCode).toBe(1);
  });

  test('a compile failure does not report runtime or memory for code that never ran', async () => {
    execute.mockResolvedValue(providerCompileError);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'c', code: 'int main(){ oops }' });

    // The provider reports time "0.0000" and memory "0" because compilation
    // failed before the program started. Showing them would read as a real
    // measurement of a program that never executed.
    expect(res.body).not.toHaveProperty('time');
    expect(res.body).not.toHaveProperty('memory');
  });

  test('a runtime failure is a runtime_error, not a compile_error', async () => {
    execute.mockResolvedValue(providerRuntimeError);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'raise ValueError()' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('runtime_error');
    // Output produced before the failure is preserved.
    expect(res.body.output).toBe('before\n');
    expect(res.body.stderr).toContain('ValueError');
    // Not a compilation problem, so nothing goes in compile_output.
    expect(res.body.compile_output).toBe('');
  });
});

describe('POST /api/student/console/run — provider failures', () => {
  test('the provider placeholder is a 502 provider failure, never a compile error', async () => {
    execute.mockResolvedValue(providerExecutionFailure);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'def broken(:' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('execution_failed');
    // The provider's placeholder text is not a student-facing diagnostic.
    expect(res.body.error).not.toMatch(/Internal error/i);
    expect(res.body.compile_output).toBeUndefined();
    expect(res.body.output).toBe('');
  });

  test('a provider placeholder never reports its zeroed metrics as real', async () => {
    execute.mockResolvedValue(providerExecutionFailure);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'typescript', code: 'const x: = ;' });

    // The provider reports time "0" and memory "0" because it never ran. Those
    // are placeholders, not measurements.
    expect(res.body).not.toHaveProperty('time');
    expect(res.body).not.toHaveProperty('memory');
  });

  /**
   * Python and Java are the two console languages the provider never emits a
   * diagnostic for. Measured live against https://api.onlinecompiler.io
   * (25+ failure modes, not just these two):
   *
   *   python-3.14   print("hello"        -> 200 {exit_code:-1, error:"Internal error: code execution failed"}
   *   python-3.14   def broken(:         -> 200 {exit_code:-1, ...placeholder...}
   *   python-3.14   if True: / unindented-> 200 {exit_code:-1, ...placeholder...}
   *   openjdk-25    missing ';'         -> 200 {exit_code:-1, ...placeholder...}
   *   openjdk-25    type mismatch       -> 200 {exit_code:-1, ...placeholder...}
   *
   * gcc-15 and g++-15, by contrast, return exit_code 1 with the real compiler
   * text ("error: expected ';' before 'return'"). So this is a provider
   * limitation for interpreted/JIT languages, NOT a broken diagnostic path:
   * nothing real is lost, because nothing real arrives.
   *
   * These tests pin the behaviour that follows: the honest message, the `-1`
   * preserved verbatim, and above all the absence of any invented traceback.
   */
  test('a Python syntax error is an honest execution failure, never a fabricated SyntaxError', async () => {
    execute.mockResolvedValue(providerExecutionFailure);
    const student = await createUser({ name: 'S', email: 'py@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print("hello"\n' });

    expect(res.status).toBe(502);
    expect(res.body.status).toBe('execution_failed');
    expect(res.body.exitCode).toBe(-1);
    expect(res.body.signal).toBeNull();
    expect(res.body.output).toBe('');
    // No compile_output key at all: nothing was compiled, as far as anyone knows.
    expect(res.body.compile_output).toBeUndefined();

    const message = res.body.error;
    expect(message).toBeTruthy();
    expect(message).toMatch(/could not run this program/i);
    expect(message).toMatch(/no diagnostics/i);

    // Nothing that could be mistaken for a real Python diagnostic.
    expect(message).not.toMatch(/SyntaxError/);
    expect(message).not.toMatch(/Traceback/);
    expect(message).not.toMatch(/line \d+/);
    expect(message).not.toMatch(/was never closed/);
    expect(message).not.toMatch(/File "/);
  });

  test('a Java compile error is an honest execution failure, never a fabricated javac diagnostic', async () => {
    execute.mockResolvedValue(providerExecutionFailure);
    const student = await createUser({ name: 'S', email: 'ja@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), {
      language: 'java',
      code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("hello")\n    }\n}\n',
    });

    expect(res.status).toBe(502);
    expect(res.body.status).toBe('execution_failed');
    expect(res.body.exitCode).toBe(-1);

    const message = res.body.error;
    expect(message).toMatch(/could not run this program/i);

    // Nothing that could be mistaken for javac output.
    expect(message).not.toMatch(/Exception in thread/);
    expect(message).not.toMatch(/error:/);
    expect(message).not.toMatch(/Main\.java/);
    expect(message).not.toMatch(/required:/);
    expect(message).not.toMatch(/found;/);
  });

  test('an ambiguous failure is never reported as a confirmed infrastructure or configuration fault', async () => {
    // This is the specific misclassification being guarded against. A first pass
    // at this integration treated `exit_code === -1` as "the compiler
    // infrastructure failed - check the compiler id and API configuration", and
    // told the student exactly that. That claim is not supported by anything the
    // provider sends: `-1` arrives for every failed Python and Java run, compile
    // error or runtime error, with no diagnostic and no error code.
    //
    // Nothing in the response may point the student at the compiler id, the API
    // key or the service configuration.
    execute.mockResolvedValue(providerExecutionFailure);
    const student = await createUser({ name: 'S', email: 'ambig@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print("hello"\n' });

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/infrastructure/i);
    expect(serialised).not.toMatch(/compiler id/i);
    expect(serialised).not.toMatch(/api configuration/i);
    expect(serialised).not.toMatch(/check the compiler/i);
    expect(serialised).not.toMatch(/wrapper/i);
    expect(serialised).not.toMatch(/Internal error/i);

    // What it must say instead: the cause could not be determined.
    expect(res.body.error).toMatch(/could not be determined|could not run this program/i);
  });

  test('a successful program that produces no output is a success, not a failure', async () => {
    // Phase: "handle successful programs that produce no output correctly".
    // exit_code 0 with an empty output is a legitimate result, and must not be
    // turned into a failure (or padded with invented output).
    execute.mockResolvedValue({
      output: '',
      error: '',
      status: 'success',
      exit_code: 0,
      signal: null,
      time: '0.0410',
      total: '0.0700',
      memory: '14000',
    });
    const student = await createUser({ name: 'S', email: 'silent@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'pass\n' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('success');
    expect(res.body.exitCode).toBe(0);
    expect(res.body.signal).toBeNull();
    // Genuinely empty, and nothing invented to fill it.
    expect(res.body.output).toBe('');
    expect(res.body.error).toBeNull();
    // Real measurements from a run that did happen.
    expect(res.body.time).toBe('0.041');
    expect(res.body.memory).toBe('14000');
  });

  test('a genuine compiler diagnostic is still delivered verbatim for the languages that provide one', async () => {
    // The contrast case that proves the pipeline is intact: gcc-15 returns real
    // text with exit_code 1, and it must reach the student unchanged.
    execute.mockResolvedValue({
      output: '',
      error: "2:28: error: expected ';' before 'return'\n    2 | int main(void){ printf(\"x\")\n      |                            ^\n",
      status: 'error',
      exit_code: 1,
      signal: null,
      time: '0.0000',
      total: '0.0717',
      memory: '0',
    });
    const student = await createUser({ name: 'S', email: 'c@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'c', code: 'int main(void){ printf("x")\n return 0; }\n' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('compile_error');
    expect(res.body.exitCode).toBe(1);
    // Byte-for-byte what the provider sent.
    expect(res.body.error).toContain("error: expected ';' before 'return'");
    expect(res.body.stderr).toBe(res.body.error);
    expect(res.body.compile_output).toBe(res.body.error);
    // Still no runtime/memory for code that never started.
    expect(res.body).not.toHaveProperty('time');
    expect(res.body).not.toHaveProperty('memory');
  });

  test('every supported language reports a provider failure the same way', async () => {
    execute.mockResolvedValue(providerExecutionFailure);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);
    const { body } = await languages(token);

    for (const { value } of body.data) {
      const res = await run(token, { language: value, code: 'boom' });
      expect(res.status).toBe(502);
      expect(res.body.status).toBe('execution_failed');
      expect(res.body.error).not.toMatch(/Internal error/i);
    }
  });

  test('a non-zero exit reported without diagnostics is a runtime error, not a provider failure', async () => {
    execute.mockResolvedValue({ output: '', error: '', status: 'error', exit_code: 3, signal: null, time: '0.0120', total: '0.05', memory: '14000' });
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'sys.exit(3)' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('runtime_error');
    expect(res.body.exitCode).toBe(3);
  });

  test('upstream error text is never echoed back to the client', async () => {
    execute.mockRejectedValue(new Error('OnlineCompiler error 500: <html>stack trace</html>'));
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('compiler_unavailable');
    expect(res.body.error).not.toMatch(/stack trace/);
    expect(res.body.error).not.toMatch(/OnlineCompiler error/);
  });

  test('a timeout is reported as 408', async () => {
    const timeout = new Error('OnlineCompiler request timed out');
    timeout.code = 'ONLINE_COMPILER_TIMEOUT';
    execute.mockRejectedValue(timeout);

    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'while True: pass' });

    expect(res.status).toBe(408);
    expect(res.body.status).toBe('timeout');
    expect(res.body.success).toBe(false);
  });

  test('any other execution failure is reported as a service failure, not a crash', async () => {
    execute.mockRejectedValue(new Error('OnlineCompiler error: upstream refused'));
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('compiler_unavailable');
  });
});

/**
 * Standard input was forwarded verbatim with no validation of its own. Measured
 * live against the provider, each of these client mistakes produced a nonsense
 * answer rather than a rejection:
 *
 *   input: {a:1}        -> provider 200 + exit_code -1 -> reported as 502 execution_failed
 *   input: 12345        -> provider 500               -> reported as 502 compiler_unavailable
 *   input: 120 KB text  -> provider 400 "Input exceeds maximum size of 100KB"
 *                                                     -> reported as 502 compiler_unavailable
 *
 * A request the provider refuses is not the provider being unavailable, so these
 * are now refused here, before a provider request is spent at all.
 */
describe('POST /api/student/console/run — standard input validation', () => {
  test('a non-string input is refused before anything is executed', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    for (const input of [{ a: 1 }, 12345, true, ['a']]) {
      const res = await run(token, { language: 'python', code: 'print(1)', input });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('invalid_request');
      expect(res.body.error).toMatch(/input/i);
    }

    // Nothing reached a compiler, for any of them.
    expect(execute).not.toHaveBeenCalled();
  });

  test('the same rejection applies to the legacy stdin field name', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    const res = await run(token, { language: 'python', code: 'print(1)', stdin: { a: 1 } });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('invalid_request');
    expect(execute).not.toHaveBeenCalled();
  });

  test('input over the provider 100 KB ceiling is refused locally', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    // Measured in bytes, not characters: the provider's ceiling is a byte limit,
    // and 100_000 four-byte characters is ~400 KB while 100_000 ASCII characters
    // is ~100 KB.
    const justOverBytes = 'A'.repeat(100 * 1024 + 1);
    const justOverChars = '\u{1F600}'.repeat(30_000);

    for (const input of [justOverBytes, justOverChars]) {
      const res = await run(token, { language: 'python', code: 'print(1)', input });
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('invalid_request');
      expect(res.body.error).toMatch(/100 KB/);
    }

    expect(execute).not.toHaveBeenCalled();
  });

  test('input exactly at the ceiling is accepted and forwarded unchanged', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);
    const input = 'A'.repeat(100 * 1024);

    const res = await run(token, { language: 'python', code: 'print(1)', input });

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ stdin: input }));
  });

  test('an intentionally empty input and an absent input are both preserved', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    // An empty string is a real instruction ("no stdin"), not the same as omitting
    // the field, and neither may be silently turned into the other.
    await run(token, { language: 'python', code: 'print(1)', input: '' });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ stdin: '' }));

    await run(token, { language: 'python', code: 'print(1)', input: null });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ stdin: null }));

    await run(token, { language: 'python', code: 'print(1)' });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ stdin: undefined }));
  });
});

/**
 * `signal` and `total` are documented provider fields. Both are normalised by
 * executionResult.js, the sibling route (student/problems.js) already forwards
 * both, and this route dropped them, so a process killed by a signal was
 * indistinguishable here from a plain non-zero exit.
 */
describe('POST /api/student/console/run — provider fields are not dropped', () => {
  test('a successful run carries signal and total alongside time and memory', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(200);
    expect(res.body.signal).toBeNull();
    expect(res.body.total).toBe('0.1049');
    expect(res.body.time).toBe('0.0678');
    expect(res.body.memory).toBe('14048');
  });

  test('signal is null when the provider sent null, and preserved when it did not', async () => {
    // signal: null is meaningful information ("not killed by a signal") and must
    // not be dropped or rewritten.
    execute.mockResolvedValue({ ...providerSuccess, signal: null });
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const nullSignal = await run(await tokenFor(student), { language: 'c', code: 'int main(){return 0;}' });
    expect(nullSignal.body).toHaveProperty('signal', null);

    execute.mockResolvedValue({ output: 'x', error: 'Segmentation fault', status: 'error', exit_code: 139, signal: 11, time: '0.01', total: '0.05', memory: '14000' });
    const withSignal = await run(await tokenFor(student), { language: 'c', code: 'int main(){ *0 = 1; }' });
    expect(withSignal.status).toBe(200);
    expect(withSignal.body.signal).toBe(11);
    expect(withSignal.body.exitCode).toBe(139);
  });

  test('the provider failure report keeps exit_code -1 verbatim and keeps signal', async () => {
    execute.mockResolvedValue(providerExecutionFailure);
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'raise ValueError()' });

    expect(res.status).toBe(502);
    expect(res.body.status).toBe('execution_failed');
    // `-1` is the provider's own value. It is not exit code 1.
    expect(res.body.exitCode).toBe(-1);
    expect(res.body.signal).toBeNull();
  });

  test('a measurement the provider did not report stays absent', async () => {
    execute.mockResolvedValue({ output: 'ok', error: '', status: 'success', exit_code: 0, signal: null });
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    // signal: null was explicitly supplied, so it is present; time/total/memory
    // were not, so none of them may appear.
    expect(res.body).toHaveProperty('signal', null);
    expect(res.body).not.toHaveProperty('time');
    expect(res.body).not.toHaveProperty('total');
    expect(res.body).not.toHaveProperty('memory');
  });
});

/**
 * Every non-timeout executor failure used to collapse into one 502 "service
 * temporarily unavailable", so a request the provider actively rejected and a
 * request the provider rate-limited were both reported to the student as an
 * outage of this platform.
 */
describe('POST /api/student/console/run — upstream status is reported truthfully', () => {
  const upstreamError = (status, extra = {}) => {
    const err = new Error(`OnlineCompiler error ${status}`);
    err.code = 'ONLINE_COMPILER_UPSTREAM';
    err.upstreamStatus = status;
    return Object.assign(err, extra);
  };

  test('a provider 400 is a rejected request, not an outage', async () => {
    // Live: 400 {"error":"Unsupported or missing compiler"} and
    // 400 {"error":"Input exceeds maximum size of 100KB"} are both this.
    execute.mockRejectedValue(upstreamError(400));
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('invalid_request');
    expect(res.body.status).not.toBe('compiler_unavailable');
  });

  test('a provider 429 is reported as rate limiting, with Retry-After', async () => {
    execute.mockRejectedValue(upstreamError(429, { retryAfter: '30' }));
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(429);
    expect(res.body.status).toBe('rate_limited');
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body.error).toMatch(/rate limit/i);
  });

  test('a provider rejecting our credential is still a service fault', async () => {
    // Live: 403 {"error":"Missing Authorization header"} and
    // 404 {"error":"Invalid or inactive API key"}. The student did nothing wrong,
    // so this must not be reported back to them as a rejected request.
    for (const status of [401, 403, 404]) {
      execute.mockRejectedValue(upstreamError(status));
      const student = await createUser({ name: 'S', email: `s${status}@test.com`, password: 'pwd' });
      const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

      expect(res.status).toBe(502);
      expect(res.body.status).toBe('compiler_unavailable');
    }
  });

  test('a provider 5xx stays a service fault', async () => {
    execute.mockRejectedValue(upstreamError(500));
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(502);
    expect(res.body.status).toBe('compiler_unavailable');
  });

  test('no upstream status on the error keeps the previous service-fault mapping', async () => {
    execute.mockRejectedValue(new Error('fetch failed'));
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

    expect(res.status).toBe(502);
    expect(res.body.status).toBe('compiler_unavailable');
  });

  test('upstream response text is never forwarded, whatever the status', async () => {
    for (const status of [400, 429, 500]) {
      execute.mockRejectedValue(upstreamError(status));
      const student = await createUser({ name: 'S', email: `t${status}@test.com`, password: 'pwd' });
      const res = await run(await tokenFor(student), { language: 'python', code: 'print(1)' });

      expect(JSON.stringify(res.body)).not.toMatch(/OnlineCompiler error/);
    }
  });
});

describe('POST /api/student/console/run — one compiler identity per language', () => {
  test('every rejection names the compiler that was actually resolved', async () => {
    const student = await createUser({ name: 'S', email: 's@test.com', password: 'pwd' });
    const token = await tokenFor(student);

    // The oversized-code branch used to answer the literal 'onlinecompiler' while
    // every other branch answered the resolved id, so one rejected request
    // described the compiler differently from another for the same language.
    const tooBig = await run(token, { language: 'python', code: 'x'.repeat(50_001) });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.compiler).toBe(LEGACY_TO_COMPILER.python);

    const badInput = await run(token, { language: 'c', code: 'int main(){}', input: { a: 1 } });
    expect(badInput.status).toBe(400);
    expect(badInput.body.compiler).toBe(LEGACY_TO_COMPILER.c);

    const missingCode = await run(token, { language: 'java' });
    expect(missingCode.body.compiler).toBe(LEGACY_TO_COMPILER.java);
  });
});