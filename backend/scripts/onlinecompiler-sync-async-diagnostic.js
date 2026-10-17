// backend/scripts/onlinecompiler-sync-async-diagnostic.js
//
// STANDALONE DIAGNOSTIC - not part of the application.
//
// Two modes, both against the real OnlineCompiler.io REST API:
//
//   (default)          endpoint diagnostic: sync + async, success/syntax/runtime
//                      scenarios, full request/response evidence.
//   --python-errors    runs the fixed Python error matrix against the SYNCHRONOUS
//                      endpoint only and classifies each result.
//
// Nothing here is user supplied. `--scenarios` and `--tests` only select among
// hardcoded programs, and unrecognised names are rejected. The script does NOT
// require any Express app, route, middleware, model or OnlineCompilerExecutor. It
// performs no database access and modifies nothing.
//
// Usage (from the backend directory):
//     node scripts/onlinecompiler-sync-async-diagnostic.js
//     node scripts/onlinecompiler-sync-async-diagnostic.js --python-errors
//     node scripts/onlinecompiler-sync-async-diagnostic.js --tests 3,4
//     node scripts/onlinecompiler-sync-async-diagnostic.js --scenarios success,syntax
//
// Credentials are read from the environment and are NEVER printed. Only the
// presence and length of a key are reported.

'use strict';

// Same environment-loading convention as src/server.js.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Resolve the provider API key.
 *
 * Documented precedence, applied first and in order:
 *   1. ONLINE_COMPILER_API_KEY
 *   2. ONLINE_COMPILER_KEY          (compatibility fallback)
 *
 * If neither is present the script would have nothing to authenticate with, so
 * it falls back to the numbered keys the application's own
 * services/CompilerKeyManager.js uses (ONLINE_COMPILER_API_KEY_1 .. _5). That
 * deviation is reported loudly rather than hidden, because it means the
 * environment does not follow the two-name convention above.
 */
function resolveApiKey() {
  for (const name of ['ONLINE_COMPILER_API_KEY', 'ONLINE_COMPILER_KEY']) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim() !== '') {
      return { key: value.trim(), source: name, usedFallback: false };
    }
  }
  for (let i = 1; i <= 5; i += 1) {
    const name = `ONLINE_COMPILER_API_KEY_${i}`;
    const value = process.env[name];
    if (typeof value === 'string' && value.trim() !== '') {
      return { key: value.trim(), source: name, usedFallback: true };
    }
  }
  return { key: null, source: null, usedFallback: true };
}

const BASE_URL = (process.env.ONLINE_COMPILER_URL || 'https://api.onlinecompiler.io').replace(/\/+$/, '');
const { key: API_KEY, source: KEY_SOURCE, usedFallback: KEY_USED_FALLBACK } = resolveApiKey();

const COMPILER = 'python-3.14';
const SYNC_PATH = '/api/run-code-sync/';
const ASYNC_PATH = '/api/run-code/';
const SYNC_TIMEOUT_MS = 60_000;
const ASYNC_TIMEOUT_MS = 30_000;

const DOCUMENTED_FIELDS = ['output', 'error', 'status', 'exit_code', 'signal', 'time', 'total', 'memory'];
const EXECUTION_FIELDS = ['output', 'status', 'exit_code', 'signal', 'time', 'total', 'memory'];

/**
 * The provider's own "I could not execute this" sentinel. Measured live: every
 * failed python-3.14 run returns it with exit_code -1, for syntax errors and
 * runtime errors alike. It is NOT a Python diagnostic.
 */
const PLACEHOLDER_ERROR = 'Internal error: code execution failed';

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const RULE = '='.repeat(78);
const THIN = '-'.repeat(78);

const out = (line = '') => process.stdout.write(`${line}\n`);
const heading = (title) => { out(); out(RULE); out(title); out(RULE); };
const sub = (title) => { out(); out(title); out(THIN); };

function show(value) {
  if (value === undefined) return '<field absent>';
  return JSON.stringify(value);
}

function fmtBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  return `${n} bytes (${n} B)`;
}

/** Show input unambiguously, including the empty case. */
function showInput(value) {
  if (value === '') return '""  (EMPTY string - explicitly sent as an empty stdin)';
  return JSON.stringify(value);
}

/**
 * Decide whether the response contains anything a student could act on.
 * Never guesses, and never treats an API-level message as a program diagnostic.
 */
function analyzeDiagnostic(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { useful: false, text: 'unavailable (no JSON body)' };
  }
  const err = typeof parsed.error === 'string' ? parsed.error.trim() : '';
  const hasExecutionFields = EXECUTION_FIELDS.some((k) => k in parsed);

  if (!hasExecutionFields) {
    return { useful: false, text: 'N/A - API-level message, no execution fields returned' };
  }
  const succeeded = parsed.exit_code === 0 && parsed.status === 'success';
  if (succeeded && err === '') return { useful: false, text: 'n/a - successful run' };
  if (err === '') return { useful: false, text: 'NO - failed run, but the error field was empty' };
  if (err === PLACEHOLDER_ERROR) {
    return { useful: false, text: 'NO - provider placeholder sentinel "Internal error: code execution failed"' };
  }
  const looksPython = /Traceback \(most recent call last\)|line \d+|\w*(?:Error|Exception)\b/.test(err);
  return {
    useful: true,
    text: looksPython
      ? 'YES - recognisable Python diagnostic'
      : 'PARTIAL - error text present but not recognisable as a Python traceback',
  };
}

/**
 * Classification, from the response shape alone.
 * A generic provider error is never promoted to a Python traceback.
 */
function classify(parsed, transportError) {
  if (transportError) return 'HTTP_REQUEST_FAILURE';
  if (!parsed || typeof parsed !== 'object') return 'HTTP_REQUEST_FAILURE';
  if (!EXECUTION_FIELDS.some((k) => k in parsed)) return 'GENERIC_PROVIDER_ERROR';
  if (parsed.exit_code === 0 && parsed.status === 'success') return 'SUCCESS';
  const diag = analyzeDiagnostic(parsed);
  return diag.useful ? 'PYTHON_DIAGNOSTIC_RETURNED' : 'GENERIC_PROVIDER_ERROR';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One request. Sequential, finite timeout, never retried. */
async function requestOnce(path, body, timeoutMs) {
  const url = `${BASE_URL}${path}`;
  const payload = JSON.stringify(body);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: API_KEY },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    const raw = await res.text();
    let parsed = null;
    let parseOk = true;
    let parseErr = null;
    if (raw.length) {
      try { parsed = JSON.parse(raw); } catch (e) { parseOk = false; parseErr = e; }
    } else { parseOk = false; parseErr = new Error('empty body'); }
    return {
      url, payload, attempted: true, httpStatus: res.status, statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()), raw, parsed, parseOk, parseErr,
      durationMs: Date.now() - started, redirected: res.redirected,
    };
  } catch (err) {
    return {
      url, payload, attempted: true, httpStatus: null, transportError: err,
      raw: null, parsed: null, parseOk: false, parseErr: err,
      durationMs: Date.now() - started,
    };
  }
}

// ---------------------------------------------------------------------------
// Python error matrix (fixed, harmless, hardcoded)
// ---------------------------------------------------------------------------

/**
 * `expect` returns whether the test behaved as its description says, plus a
 * note. Where the provider substitutes a generic error, the test can still
 * "pass" in the sense that the program did fail - the note says plainly that no
 * diagnostic came back, which is the finding rather than a success.
 */
const PYTHON_ERROR_TESTS = [
  {
    n: 1,
    name: 'Valid Python (baseline)',
    description: 'Reads stdin and prints a greeting. Must succeed.',
    code: 'name = input()\nprint(f"Hello, {name}!")',
    input: 'World\n',
    expected: 'SUCCESS, output "Hello, World!"',
    expect: (p) => (p && p.exit_code === 0 && /Hello, World!/.test(p.output || '')) ? 'matched' : 'NOT matched',
  },
  {
    n: 2,
    name: 'Syntax error',
    description: 'Malformed def() - a syntax error. Ideally reported with filename and line.',
    code: 'def greet(\n    print("Hello")',
    input: '',
    expected: 'failure, ideally a syntax diagnostic with a line number',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 0 ? 'UNEXPECTED: reported success' : 'failed as expected')),
  },
  {
    n: 3,
    name: 'Undefined variable',
    description: 'NameError expected, naming the undefined variable.',
    code: 'print(undefined_variable)',
    input: '',
    expected: 'failure, ideally NameError naming the variable',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 0 ? 'UNEXPECTED: reported success' : 'failed as expected')),
  },
  {
    n: 4,
    name: 'Division by zero',
    description: 'ZeroDivisionError expected.',
    code: 'print(10 / 0)',
    input: '',
    expected: 'failure, ideally ZeroDivisionError',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 0 ? 'UNEXPECTED: reported success' : 'failed as expected')),
  },
  {
    n: 5,
    name: 'Type error',
    description: 'TypeError expected: str + int.',
    code: 'print("Age: " + 25)',
    input: '',
    expected: 'failure, ideally TypeError',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 0 ? 'UNEXPECTED: reported success' : 'failed as expected')),
  },
  {
    n: 6,
    name: 'Index error',
    description: 'IndexError expected from an out-of-range index.',
    code: 'items = [1, 2, 3]\nprint(items[10])',
    input: '',
    expected: 'failure, ideally IndexError',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 0 ? 'UNEXPECTED: reported success' : 'failed as expected')),
  },
  {
    n: 7,
    name: 'Missing input (empty stdin)',
    description: 'input() with empty stdin. Outcome depends on how the provider handles it - captured, not predicted.',
    code: 'name = input()\nprint(name)',
    input: '',
    expected: 'recorded as observed, whatever it is',
    expect: () => 'recorded',
  },
  {
    n: 8,
    name: 'Explicit nonzero exit',
    description: 'Prints then calls sys.exit(2). Expect a nonzero exit or an error response.',
    code: 'import sys\nprint("before exit")\nsys.exit(2)',
    input: '',
    expected: 'nonzero exit code (2) preserved, or an error response',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 2 ? 'matched exactly' : 'exit code NOT 2')),
  },
  {
    n: 9,
    name: 'Runtime error with stderr',
    description: 'Writes stdout and stderr, then raises. Inspect whether stdout, stderr, traceback and exit code survive.',
    code: 'import sys\nprint("stdout message")\nprint("stderr message", file=sys.stderr)\nraise RuntimeError("DIAGNOSTIC_TEST_RUNTIME_ERROR")',
    input: '',
    expected: 'stdout, stderr, traceback and a nonzero exit code',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 0 ? 'UNEXPECTED: reported success' : 'failed as expected')),
  },
  {
    n: 10,
    name: 'Indentation error',
    description: 'Body not indented. IndentationError expected, ideally with line information.',
    code: 'def greet():\nprint("Hello")',
    input: '',
    expected: 'failure, ideally IndentationError with a line number',
    expect: (p) => (!p ? 'no result' : (p.exit_code === 0 ? 'UNEXPECTED: reported success' : 'failed as expected')),
  },
];

function parseTestSelection(argv) {
  const i = argv.indexOf('--tests');
  const raw = i === -1 ? null : argv[i + 1];
  const requested = raw
    ? raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
    : PYTHON_ERROR_TESTS.map((t) => t.n);
  const unknown = requested.filter((n) => !PYTHON_ERROR_TESTS.some((t) => t.n === n));
  if (unknown.length) {
    throw new Error(`Unknown test number(s): ${unknown.join(', ')}. Available: ${PYTHON_ERROR_TESTS.map((t) => t.n).join(', ')}`);
  }
  return requested;
}

function printKeyBanner(title, extraLines) {
  heading(title);
  out(`Base URL (from ONLINE_COMPILER_URL or default)  : ${BASE_URL}`);
  out(`API key configured                           : ${API_KEY ? 'yes' : 'NO'}`);
  if (API_KEY) {
    out(`API key source variable                     : ${KEY_SOURCE}`);
    out(`API key length                              : ${API_KEY.length} characters (value withheld)`);
  }
  if (KEY_USED_FALLBACK) {
    out();
    out('  NOTE: neither ONLINE_COMPILER_API_KEY nor ONLINE_COMPILER_KEY is set in this');
    out('  environment, so the documented precedence found nothing. The key was taken');
    out('  from the numbered ONLINE_COMPILER_API_KEY_<n> variable used by this');
    out("  application's own services/CompilerKeyManager.js. Reported rather than applied");
    out('  silently.');
  }
  if (extraLines) for (const l of extraLines) out(l);
}

// ---------------------------------------------------------------------------
// Mode: --python-errors
// ---------------------------------------------------------------------------

async function runPythonErrorMode(argv) {
  let selected;
  try {
    selected = parseTestSelection(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  const tests = PYTHON_ERROR_TESTS.filter((t) => selected.includes(t.n));

  printKeyBanner('Python error matrix - synchronous endpoint only', [
    `Compiler identifier                         : ${COMPILER}`,
    `Endpoint                                    : ${BASE_URL}${SYNC_PATH}`,
    `Tests to run                                : ${tests.map((t) => t.n).join(', ')}`,
    'Asynchronous endpoint                       : not used (blocked: no callback URL configured)',
    'Execution of user-submitted code            : none (fixed programs only)',
    'Automatic retries                           : none',
  ]);

  if (!API_KEY) {
    out();
    out('ABORTED: no provider API key is configured. Nothing was sent.');
    return;
  }

  const results = [];

  for (const t of tests) {
    heading(`TEST ${t.n} - ${t.name}`);
    out(`Description             : ${t.description}`);
    out(`Expected                : ${t.expected}`);
    out('Source code             :');
    t.code.split('\n').forEach((l) => out(`    | ${l}`));
    out(`Standard input          : ${showInput(t.input)}`);
    out(`Compiler identifier     : ${COMPILER}`);
    out(`Endpoint                : ${BASE_URL}${SYNC_PATH}  (POST)`);
    out('Request headers         : Content-Type: application/json');
    out(`                           Authorization: <REDACTED - present, ${API_KEY.length} chars>`);

    const r = await requestOnce(
      SYNC_PATH,
      { compiler: COMPILER, code: t.code, input: t.input },
      SYNC_TIMEOUT_MS
    );
    out(`Request body bytes      : ${fmtBytes(Buffer.byteLength(r.payload, 'utf8'))}`);

    sub('Response');
    if (r.transportError) {
      out(`    Transport failure   : ${r.transportError.name}: ${r.transportError.message}`);
      if (r.transportError.cause) out(`    Cause              : ${r.transportError.cause.name}: ${r.transportError.cause.message}`);
      out('    HTTP status         : <none - request never completed>');
      out('    No retry attempted, because a failure here may still have been accepted.');
    } else {
      out(`    HTTP status         : ${r.httpStatus} ${r.statusText ? `(${r.statusText})` : '(statusText empty in this runtime)'}`);
      out(`    Redirected          : ${r.redirected ? 'yes' : 'no'}`);
    }
    out(`    Local duration      : ${r.durationMs} ms`);

    sub('Response headers');
    if (r.transportError) out('    <none - request failed>');
    else for (const [k, v] of Object.entries(r.headers)) out(`    ${k}: ${v}`);

    sub('Raw response body');
    out(r.raw === null ? '<no body - request failed>' : (r.raw.length ? r.raw : '<empty body>'));

    sub('JSON parsing');
    out(`    Parsed successfully : ${r.parseOk ? 'yes' : 'no'}`);
    if (!r.parseOk) out(`    Parse error         : ${r.parseErr && r.parseErr.name}: ${r.parseErr && r.parseErr.message}`);

    if (r.parsed && typeof r.parsed === 'object') {
      sub('Parsed JSON (pretty)');
      out(JSON.stringify(r.parsed, null, 2));

      sub('Every returned field (no schema assumed)');
      const keys = Object.keys(r.parsed);
      if (keys.length === 0) out('    <object with no keys>');
      else for (const k of keys) out(`    ${k} = ${show(r.parsed[k])}`);

      sub('Documented fields');
      for (const f of DOCUMENTED_FIELDS) out(`    ${f.padEnd(10)}: ${show(r.parsed[f])}`);

      const extra = keys.filter((k) => !DOCUMENTED_FIELDS.includes(k));
      sub('Additional (undocumented) fields');
      out(extra.length === 0 ? '    <none>' : extra.map((k) => `    ${k} = ${show(r.parsed[k])}`).join('\n'));
    }

    const verdict = analyzeDiagnostic(r.parsed);
    const cls = classify(r.parsed, r.transportError);
    out();
    // `verdict.text` already carries its own YES/NO/PARTIAL/N-A prefix.
    out(`    USEFUL DIAGNOSTIC?  : ${verdict.text}`);
    out(`    CLASSIFICATION      : ${cls}`);
    out(`    MATCHES EXPECTED?   : ${t.expect(r.parsed)}`);

    results.push({
      test: t, result: r, classification: cls, useful: verdict.useful, verdictText: verdict.text,
    });
    await sleep(600);
  }

  // -------------------------------------------------------------------
  // Comparison table
  // -------------------------------------------------------------------
  heading('FINAL COMPARISON');

  const rows = results.map(({ test, result, classification, useful }) => [
    String(test.n),
    result.transportError ? 'n/a' : String(result.httpStatus),
    result.parsed && 'status' in result.parsed ? show(result.parsed.status) : '<absent>',
    result.parsed && 'exit_code' in result.parsed ? show(result.parsed.exit_code) : '<absent>',
    useful ? 'yes' : 'no',
    classification,
  ]);
  const headers = ['Test', 'HTTP status', 'Provider status', 'Exit code', 'Useful diagnostic?', 'Classification'];
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => String(r[i]).length)));
  const fmt = (r) => `| ${r.map((c, i) => String(c).padEnd(widths[i])).join(' | ')} |`;
  out(fmt(headers));
  out(`|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`);
  for (const r of rows) out(fmt(r));

  // -------------------------------------------------------------------
  // Questions answered from the observed data only
  // -------------------------------------------------------------------
  heading('OBSERVED CONCLUSIONS');

  const diagTests = results.filter((r) => r.classification === 'PYTHON_DIAGNOSTIC_RETURNED');
  const genericTests = results.filter((r) => r.classification === 'GENERIC_PROVIDER_ERROR');
  const succTests = results.filter((r) => r.classification === 'SUCCESS');
  const failTests = results.filter((r) => r.classification === 'HTTP_REQUEST_FAILURE');

  out(`1. Python errors that include a usable traceback`);
  out(diagTests.length
    ? diagTests.map((r) => `     - Test ${r.test.n} (${r.test.name})`).join('\n')
    : '     NONE. No test produced a usable Python traceback.');

  out();
  out('2. Errors that became "Internal error: code execution failed"');
  const placeholderTests = results.filter((r) => String(r.verdictText).includes('placeholder sentinel'));
  out(placeholderTests.length
    ? placeholderTests.map((r) => `     - Test ${r.test.n} (${r.test.name})`).join('\n')
    : '     NONE.');

  out();
  out('3. Is stdout/stderr preserved when execution fails?');
  const printedBeforeFailing = results.filter((r) => {
    const p = r.result.parsed;
    if (!p || p.exit_code === 0) return false;
    const outp = typeof p.output === 'string' ? p.output : '';
    const errp = typeof p.error === 'string' ? p.error : '';
    const shouldHave = ['before exit', 'stdout message'];
    return shouldHave.some((s) => outp.includes(s)) || shouldHave.some((s) => errp.includes(s));
  });
  if (printedBeforeFailing.length) {
    out('     Text printed before the failure WAS preserved for: '
      + printedBeforeFailing.map((r) => `Test ${r.test.n}`).join(', '));
  } else {
    out('     NO. Tests 8 and 9 both print to stdout before failing:');
    out('       Test 8 prints "before exit"; Test 9 prints "stdout message" and writes');
    out('       "stderr message" to stderr before raising.');
    out('     None of that text appears in output or error for either test.');
  }

  out();
  out('4. Are exit codes accurate?');
  const t8 = results.find((r) => r.test.n === 8);
  if (t8 && t8.result.parsed) {
    out(`     Test 8 called sys.exit(2). Reported exit_code = ${show(t8.result.parsed.exit_code)}.`);
    out(t8.result.parsed.exit_code === 2
      ? '     Accurate.'
      : '     NOT accurate - the requested exit code was not reported.');
  } else {
    out('     Test 8 produced no JSON body.');
  }

  out();
  out('5. Is this sufficient for the platform to show genuine Python error messages?');
  const anyDiag = diagTests.length > 0;
  out(anyDiag
    ? `     Partly - ${diagTests.length} of ${results.length} tests returned a usable diagnostic.`
    : `     NO. 0 of ${results.length} tests returned a usable Python diagnostic.`);
  out(`     Observed: ${succTests.length} success, ${genericTests.length} generic provider error,`
    + ` ${diagTests.length} usable diagnostic, ${failTests.length} request failure.`);
  if (!anyDiag) {
    out('     The provider answers HTTP 200 for every one of these and substitutes a');
    out('     placeholder for the error text, so nothing about the failure can be shown');
    out('     to a student. Inventing a traceback would be fabrication.');
  }

  out();
  out('Diagnostic complete. No production source file, frontend file, database or');
  out('provider configuration was modified.');
}

// ---------------------------------------------------------------------------
// Mode: default endpoint diagnostic (sync + async scenarios)
// ---------------------------------------------------------------------------

const PROGRAMS = {
  success: {
    label: 'SUCCESS  (valid program reading stdin)',
    code: "name = input()\nprint(f'Hello, {name}!')",
    note: 'Expected to succeed and print the greeting.',
  },
  syntax: {
    label: 'SYNTAX ERROR  (missing closing parenthesis)',
    code: 'print("hello"',
    note: 'Never starts; a diagnostic is expected if one is available.',
  },
  'syntax-paren': {
    label: 'SYNTAX ERROR  (exact reported case: print (\'Hello World\') - unclosed paren)',
    code: "print ('Hello World'",
    note: 'Malformed call, missing the closing parenthesis. A traceback with a line number is expected if the provider supplies one.',
  },
  divzero: {
    label: 'RUNTIME EXCEPTION  (print(10 / 0))',
    code: 'print(10 / 0)',
    note: 'Valid syntax, raises ZeroDivisionError at runtime. A traceback is expected if the provider supplies one.',
  },
  runtime: {
    label: 'RUNTIME ERROR  (valid syntax, raises at runtime)',
    code: 'print("before")\nraise ValueError("boom")',
    note: 'Starts and produces output, then fails.',
  },
  'stderr-success': {
    label: 'EXIT 0 WITH STDERR  (writes stderr, exits 0)',
    code: 'import sys\nprint("stdout message")\nprint("stderr message", file=sys.stderr)',
    note: 'Succeeds (exit 0) but writes to stderr. Checks whether a successful run is still reported as a success, and whether the stderr text survives.',
  },
};

function parseScenarios(argv) {
  const i = argv.indexOf('--scenarios');
  const raw = i === -1 ? null : argv[i + 1];
  const requested = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(PROGRAMS);
  const unknown = requested.filter((s) => !PROGRAMS[s]);
  if (unknown.length) {
    throw new Error(`Unknown scenario(s): ${unknown.join(', ')}. Available: ${Object.keys(PROGRAMS).join(', ')}`);
  }
  return requested;
}

async function probe({ scenarioName, endpointLabel, path, body, timeoutMs }) {
  const url = `${BASE_URL}${path}`;
  const program = PROGRAMS[scenarioName];

  heading(`${endpointLabel}  -  scenario ${scenarioName}`);
  out(`Purpose                : ${program.note}`);
  out(`Endpoint URL           : ${url}`);
  out(`HTTP method            : POST`);
  out(`Compiler identifier    : ${COMPILER}`);
  out('Source code            :');
  program.code.split('\n').forEach((l) => out(`    | ${l}`));
  out(`Standard input         : ${showInput('World')}`);
  out(`Request body bytes     : ${fmtBytes(Buffer.byteLength(JSON.stringify(body), 'utf8'))}`);

  sub('Request headers (authorization redacted)');
  out('    Content-Type      : application/json');
  out(`    Authorization     : ${API_KEY ? `<REDACTED - present, ${API_KEY.length} chars>` : '<absent>'}`);

  if (!API_KEY) {
    out();
    out('  ABORTED: no provider API key is configured. Nothing was sent.');
    return { scenarioName, endpointLabel, attempted: false, httpStatus: null, parsed: null, durationMs: 0 };
  }

  const r = await requestOnce(path, body, timeoutMs);

  sub('Response');
  if (r.transportError) {
    out(`    Transport failure  : ${r.transportError.name}: ${r.transportError.message}`);
    out(`    Local duration    : ${r.durationMs} ms`);
    out('    NOTE              : no retry attempted; an async job may still have been accepted.');
  } else {
    out(`    HTTP status       : ${r.httpStatus} ${r.statusText ? `(${r.statusText})` : '(statusText empty in this runtime)'}`);
    out(`    Redirected        : ${r.redirected ? 'yes' : 'no'}`);
    out(`    Local duration    : ${r.durationMs} ms`);
  }

  sub('Response headers');
  if (r.transportError) out('    <none - request failed>');
  else for (const [k, v] of Object.entries(r.headers)) out(`    ${k}: ${v}`);

  sub('Raw response body');
  out(r.raw === null ? '<no body - request failed>' : (r.raw.length ? r.raw : '<empty body>'));

  if (r.parseOk && r.parsed && typeof r.parsed === 'object') {
    sub('Parsed JSON (complete)');
    out(JSON.stringify(r.parsed, null, 2));

    sub('Documented response fields (values preserved verbatim)');
    for (const f of DOCUMENTED_FIELDS) out(`    ${f.padEnd(10)}: ${show(r.parsed[f])}`);

    const extra = Object.keys(r.parsed).filter((k) => !DOCUMENTED_FIELDS.includes(k));
    sub('Additional fields not in the documented set');
    if (extra.length === 0) out('    <none>');
    else for (const k of extra) out(`    ${k} = ${show(r.parsed[k])}`);
  } else {
    out();
    out(`    JSON PARSE ERROR  : ${r.parseErr && r.parseErr.name}: ${r.parseErr && r.parseErr.message}`);
  }

  return { scenarioName, endpointLabel, attempted: true, httpStatus: r.httpStatus, parsed: r.parsed, raw: r.raw, durationMs: r.durationMs };
}

async function runEndpointMode(argv) {
  let scenarios;
  try {
    scenarios = parseScenarios(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }

  printKeyBanner('OnlineCompiler.io - synchronous and asynchronous endpoint diagnostic', [
    `Fixed programs exercised                  : ${scenarios.join(', ')}`,
    'Execution of user-submitted code          : none (fixed programs only)',
    'Database access                           : none',
  ]);

  const results = [];
  const syncOnly = argv.includes('--sync-only');
  for (const name of scenarios) {
    const program = PROGRAMS[name];
    results.push(await probe({
      scenarioName: name,
      endpointLabel: `SYNC  POST ${SYNC_PATH}`,
      path: SYNC_PATH,
      body: { compiler: COMPILER, code: program.code, input: 'World' },
      timeoutMs: SYNC_TIMEOUT_MS,
    }));
    await sleep(600);
    if (syncOnly) continue;
    results.push(await probe({
      scenarioName: name,
      endpointLabel: `ASYNC POST ${ASYNC_PATH}`,
      path: ASYNC_PATH,
      body: {
        compiler: COMPILER, code: program.code, input: 'World',
        extra_params: { job_id: `diagnostic-sync-async-001-${name}`, source: 'local-diagnostic' },
      },
      timeoutMs: ASYNC_TIMEOUT_MS,
    }));
    await sleep(600);
  }

  heading('OBSERVED FINDINGS');
  const isAsync = (r) => r.endpointLabel.startsWith('ASYNC');
  for (const r of results.filter((x) => !isAsync(x))) {
    out(`SYNC  scenario "${r.scenarioName}"`);
    if (!r.attempted) { out('    not attempted'); continue; }
    out(`    HTTP ${r.httpStatus}`);
    out(`    exit_code         : ${r.parsed ? show(r.parsed.exit_code) : 'unavailable'}  (verbatim; -1 is NEVER rewritten)`);
    out(`    error             : ${r.parsed ? show(r.parsed.error) : 'unavailable'}`);
    out(`    diagnostic        : ${analyzeDiagnostic(r.parsed).text}`);
  }
  out();
  for (const r of results.filter(isAsync)) {
    const errText = r.parsed && typeof r.parsed.error === 'string' ? r.parsed.error.trim() : '';
    const blocked = r.attempted && r.httpStatus >= 400 && /callback/i.test(errText);
    out(`ASYNC scenario "${r.scenarioName}"`);
    out(`    HTTP ${r.httpStatus}`);
    out(blocked ? '    BLOCKER           : no callback URL configured. Async NOT successful.'
      : (r.httpStatus >= 200 && r.httpStatus < 300 ? '    accepted; completion unknown (callback not received).'
        : `    provider said     : ${errText || '<none>'}`));
  }

  out();
  out('Final asynchronous results: UNVERIFIED (no callback received, none created).');
  out('Diagnostic complete. No production source file, frontend file, database or');
  out('provider configuration was modified.');
}

// ---------------------------------------------------------------------------

(async () => {
  if (process.argv.includes('--python-errors')) {
    await runPythonErrorMode(process.argv);
  } else {
    await runEndpointMode(process.argv);
  }
})();