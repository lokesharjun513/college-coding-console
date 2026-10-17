// Tests for services/executionResult.js.
//
// Every provider envelope below was captured live from
// https://api.onlinecompiler.io/api/run-code-sync/ with `python-3.14`,
// `openjdk-25` and `gcc-15`. The strings are not invented, because the bugs
// these pin down are about how the real payloads are read.
//
// Covered:
//   1. a successful run that also writes to stderr stays a SUCCESS
//   2. a Python syntax error and a Python runtime exception that the provider
//      DID answer with a real traceback keep that traceback
//   3. the provider's `-1` placeholder is still a provider execution failure,
//      never a verified Python exception, and its text is still suppressed
//   4. a Java compile diagnostic returned by the provider is surfaced verbatim
//   5. C/C++ compiler diagnostics are unchanged, including suppressed metrics
//   6. placeholder metrics are never presented as measurements

const {
  interpretExecutionResult,
  isPlaceholderProviderError,
  EXECUTION_STATUS,
  PROVIDER_INTERNAL_FAILURE,
} = require('../src/services/executionResult');

/** Live: `print(10 / 0)` on python-3.14. */
const providerPythonDivZero = {
  output: '', error: PROVIDER_INTERNAL_FAILURE, status: 'error',
  exit_code: -1, signal: null, time: '0', total: '0', memory: '0',
};

/** Live: `print ("Hello World'` on python-3.14. */
const providerPythonSyntaxError = {
  output: '', error: PROVIDER_INTERNAL_FAILURE, status: 'error',
  exit_code: -1, signal: null, time: '0', total: '0', memory: '0',
};

/** Live: openjdk-25 missing semicolon. */
const providerJavaCompileError = {
  output: '', error: PROVIDER_INTERNAL_FAILURE, status: 'error',
  exit_code: -1, signal: null, time: '0', total: '0', memory: '0',
};

/** Live: gcc-15 missing semicolon, with the real compiler text. */
const providerCCompileError = {
  output: '',
  error: '3:29: error: expected \';\' before \'return\'\n    3 |     printf("Hello from C\\n")\n      |                             ^\n',
  status: 'error',
  exit_code: 1,
  signal: null,
  time: '0.0000',
  total: '0.0730',
  memory: '0',
};

/** Live: a Python program that exits 0 but writes to stderr. */
const providerPythonStderrOnSuccess = {
  output: 'stdout message\n',
  error: 'stderr message\n',
  status: 'success',
  exit_code: 0,
  signal: null,
  time: '0.0976',
  memory: '15140',
  total: '0.1561',
};

/** Live: `warnings.warn(...)` - a very common success that writes to stderr. */
const providerPythonWarning = {
  output: 'value = 42\n',
  error: '/sandbox/code.py:2: UserWarning: deprecated API\n  warnings.warn("deprecated API")\n',
  status: 'success',
  exit_code: 0,
  signal: null,
  time: '0.0850',
  memory: '14900',
  total: '0.1400',
};

/** A genuine Python traceback, shaped exactly as CPython emits it. */
const PYTHON_TRACEBACK_SYNTAX = [
  'Traceback (most recent call last):',
  '  File "<student>", line 1',
  "    print ('Hello World'",
  '          ^',
  "SyntaxError: '(' was never closed",
].join('\n');

const PYTHON_TRACEBACK_RUNTIME = [
  'Traceback (most recent call last):',
  '  File "<student>", line 1, in <module>',
  '    print(10 / 0)',
  '    ~~~~~~~~~~~^~~~~~~~~',
  'ZeroDivisionError: division by zero',
].join('\n');

// ---------------------------------------------------------------- 1
describe('a successful run that writes to stderr', () => {
  test('is reported as a success, not a runtime error', () => {
    // Regression: `failed` used to be `Boolean(errorText) || exitCode !== 0`,
    // so any stderr text forced a failure. A program that exited 0 and printed
    // its real output was shown to the student as `runtime_error` /
    // `success: false`.
    const r = interpretExecutionResult(providerPythonStderrOnSuccess);

    expect(r.status).toBe(EXECUTION_STATUS.SUCCESS);
    expect(r.success).toBe(true);
    expect(r.providerFailed).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(r.output).toBe('stdout message\n');
  });

  test('the stderr text is preserved rather than discarded', () => {
    const r = interpretExecutionResult(providerPythonStderrOnSuccess);
    expect(r.error).toBe('stderr message\n');
  });

  test('a warning emitted by warnings.warn() is still a success', () => {
    const r = interpretExecutionResult(providerPythonWarning);

    expect(r.status).toBe(EXECUTION_STATUS.SUCCESS);
    expect(r.success).toBe(true);
    expect(r.output).toBe('value = 42\n');
    // The warning is real information about the program and is kept.
    expect(r.error).toContain('UserWarning');
    // Real measurements, because the program really ran.
    expect(r.time).toBe(0.085);
    expect(r.memory).toBe(14900);
  });

  test('a success with no output and no stderr is still a success', () => {
    const r = interpretExecutionResult({ output: '', error: '', status: 'success', exit_code: 0, signal: null, time: '0.04', total: '0.07', memory: '14000' });
    expect(r.status).toBe(EXECUTION_STATUS.SUCCESS);
    expect(r.success).toBe(true);
    expect(r.output).toBe('');
  });

  test('a payload with no exit_code and no stderr is still a success', () => {
    // Guards the change against regressing the sparse payload shape.
    const r = interpretExecutionResult({ output: 'ok', error: '', status: 'success' });
    expect(r.status).toBe(EXECUTION_STATUS.SUCCESS);
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------- 2
describe('a genuine Python traceback is not discarded', () => {
  // `exit_code: -1` means the execution was declined. It does not mean the
  // provider had nothing to say, so real text that arrives alongside it is the
  // only evidence available and must survive.
  const withTraceback = (traceback) => ({
    output: '',
    error: traceback,
    status: 'error',
    exit_code: -1,
    signal: null,
    time: '0', total: '0', memory: '0',
  });

  test('a Python syntax traceback survives exit_code -1, verbatim', () => {
    const r = interpretExecutionResult(withTraceback(PYTHON_TRACEBACK_SYNTAX));

    expect(r.providerFailed).toBe(true);
    expect(r.error).toBe(PYTHON_TRACEBACK_SYNTAX);
    // Line number from the traceback, never invented.
    expect(r.error).toContain('line 1');
    expect(r.error).toContain("SyntaxError: '(' was never closed");
    // `-1` is still reported as the provider sent it.
    expect(r.exitCode).toBe(-1);
    expect(r.signal).toBeNull();
  });

  test('a Python runtime traceback survives exit_code -1, verbatim', () => {
    const r = interpretExecutionResult(withTraceback(PYTHON_TRACEBACK_RUNTIME));

    expect(r.providerFailed).toBe(true);
    expect(r.error).toBe(PYTHON_TRACEBACK_RUNTIME);
    expect(r.error).toContain('ZeroDivisionError: division by zero');
    expect(r.exitCode).toBe(-1);
  });

  test('a Java compile diagnostic is surfaced verbatim', () => {
    const javac = 'Main.java:4: error: \';\' expected\n        System.out.println("hello")\n                             ^\n';
    const r = interpretExecutionResult({
      output: '', error: javac, status: 'error', exit_code: -1, signal: null, time: '0', total: '0', memory: '0',
    });

    expect(r.error).toBe(javac);
    expect(r.error).toContain("Main.java:4: error: ';' expected");
    expect(r.exitCode).toBe(-1);
  });
});

// ---------------------------------------------------------------- 3
describe('the provider placeholder is still not a Python exception', () => {
  test('a Python syntax error with the placeholder stays a provider failure', () => {
    const r = interpretExecutionResult(providerPythonSyntaxError);

    expect(r.status).toBe(EXECUTION_STATUS.EXECUTION_FAILED);
    expect(r.success).toBe(false);
    expect(r.providerFailed).toBe(true);
    expect(r.exitCode).toBe(-1);
    expect(r.signal).toBeNull();
    // The sentinel is not a diagnostic and must never be shown as one.
    expect(r.error).toBe('');
  });

  test('a Python runtime exception with the placeholder stays a provider failure', () => {
    const r = interpretExecutionResult(providerPythonDivZero);

    expect(r.status).toBe(EXECUTION_STATUS.EXECUTION_FAILED);
    expect(r.providerFailed).toBe(true);
    expect(r.exitCode).toBe(-1);
    expect(r.error).toBe('');
    // No ZeroDivisionError is invented.
    expect(r.error).not.toMatch(/ZeroDivisionError/);
  });

  test('the Java placeholder behaves the same way', () => {
    const r = interpretExecutionResult(providerJavaCompileError);

    expect(r.status).toBe(EXECUTION_STATUS.EXECUTION_FAILED);
    expect(r.providerFailed).toBe(true);
    expect(r.error).toBe('');
    expect(r.error).not.toMatch(/javac|Main\.java|Exception in thread/);
  });

  test('isPlaceholderProviderError recognises only the sentinel and empty text', () => {
    expect(isPlaceholderProviderError('')).toBe(true);
    expect(isPlaceholderProviderError('   ')).toBe(true);
    expect(isPlaceholderProviderError(undefined)).toBe(true);
    expect(isPlaceholderProviderError(PROVIDER_INTERNAL_FAILURE)).toBe(true);
    expect(isPlaceholderProviderError(`  ${PROVIDER_INTERNAL_FAILURE} `)).toBe(true);

    expect(isPlaceholderProviderError(PYTHON_TRACEBACK_SYNTAX)).toBe(false);
    expect(isPlaceholderProviderError('2:28: error: expected \';\' before \'return\'')).toBe(false);
    expect(isPlaceholderProviderError('a warning')).toBe(false);
  });
});

// ---------------------------------------------------------------- 4
describe('C/C++ compiler diagnostics are unchanged', () => {
  test('a gcc compile diagnostic is a 200-style compile_error, verbatim', () => {
    const r = interpretExecutionResult(providerCCompileError);

    expect(r.status).toBe(EXECUTION_STATUS.COMPILE_ERROR);
    expect(r.success).toBe(false);
    expect(r.providerFailed).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.signal).toBeNull();
    // Byte-for-byte what the compiler sent, including the caret.
    expect(r.error).toBe(providerCCompileError.error);
    expect(r.error).toContain("error: expected ';' before 'return'");
  });

  test('placeholder metrics for a run that never started are suppressed', () => {
    const r = interpretExecutionResult(providerCCompileError);

    // time "0.0000" and memory "0" describe compilation that failed, not a
    // measurement of any execution.
    expect(r.time).toBeNull();
    expect(r.memory).toBeNull();
    // `total` does include compile time and is still reported.
    expect(r.total).toBe(0.073);
  });

  test('a gcc runtime failure with real output is a runtime_error', () => {
    const r = interpretExecutionResult({
      output: 'before\n', error: 'boom', status: 'error', exit_code: 1, signal: null,
      time: '0.0410', total: '0.0900', memory: '14100',
    });

    expect(r.status).toBe(EXECUTION_STATUS.RUNTIME_ERROR);
    expect(r.output).toBe('before\n');
    expect(r.error).toBe('boom');
    expect(r.time).toBe(0.041);
    expect(r.memory).toBe(14100);
  });

  test('a successful C run is a success', () => {
    const r = interpretExecutionResult({
      output: 'Hello from C\n', error: '', status: 'success', exit_code: 0, signal: null,
      time: '0.0228', total: '0.1922', memory: '3344',
    });

    expect(r.status).toBe(EXECUTION_STATUS.SUCCESS);
    expect(r.success).toBe(true);
    expect(r.output).toBe('Hello from C\n');
    expect(r.time).toBe(0.0228);
    expect(r.memory).toBe(3344);
  });
});

// ---------------------------------------------------------------- 5
describe('signals are preserved', () => {
  test('a real signal is kept on a failed run', () => {
    const r = interpretExecutionResult({
      output: '', error: 'Segmentation fault', status: 'error', exit_code: 139, signal: 11,
      time: '0.01', total: '0.05', memory: '14000',
    });

    expect(r.exitCode).toBe(139);
    expect(r.signal).toBe(11);
    expect(r.status).toBe(EXECUTION_STATUS.RUNTIME_ERROR);
  });

  test('signal null is reported as null, not dropped', () => {
    const r = interpretExecutionResult({
      output: 'ok', error: '', status: 'success', exit_code: 0, signal: null,
      time: '0.01', total: '0.02', memory: '100',
    });

    expect(r.signal).toBeNull();
  });
});