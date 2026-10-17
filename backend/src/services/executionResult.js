// backend/src/services/executionResult.js
//
// Interprets one OnlineCompiler.io `run-code-sync` response into this
// platform's execution statuses.
//
// WHY THIS EXISTS
//
// The provider's documented response contract (https://onlinecompiler.io/docs) is:
//
//   { output, error, status: "success"|"error", exit_code, signal, time, total, memory }
//
// where `exit_code` is a real process exit code: 0 for success, 1..127 for a
// normal non-zero exit, and >128 when the process was killed by a signal
// (`exit_code - 128` is the signal number).
//
// When the provider itself cannot execute a program it does NOT use that
// contract. It answers HTTP 200 with a placeholder envelope instead:
//
//   { output: "", error: "Internal error: code execution failed",
//     status: "error", exit_code: -1, signal: null,
//     time: "0", total: "0", memory: "0" }
//
// `exit_code: -1` is outside the documented range and carries no diagnostic.
// Treating it as an ordinary non-zero exit is what made every failing
// Python / Java / TypeScript program render as "Internal error: code
// execution failed" on a page where C and C++ showed real compiler
// diagnostics - the provider only emits real `error` text for compiled
// languages, so the placeholder was the only thing available for the rest.
//
// Measured against the live provider, `exit_code: -1` is returned for:
//   - every non-zero exit of an interpreted runtime (Python, Deno/TypeScript)
//   - a Java main() that exits non-zero
//   - a compiled program killed by a signal (SIGSEGV, SIGABRT)
// while a successful run and a C/C++ compile failure both report normally.
//
// So the sentinel is not recoverable into a real diagnostic from here. This
// module's job is to STOP mislabelling it: recognise it, report it as a
// provider failure, and refuse to pass its placeholder zeros off as real
// runtime and memory measurements.

/** Statuses this platform reports. `execution_failed` is deliberately distinct. */
const EXECUTION_STATUS = {
  SUCCESS: 'success',
  COMPILE_ERROR: 'compile_error',
  RUNTIME_ERROR: 'runtime_error',
  EXECUTION_FAILED: 'execution_failed',
};

/** The provider's placeholder text. Never surfaced to a student as a diagnostic. */
const PROVIDER_INTERNAL_FAILURE = 'Internal error: code execution failed';

/** `exit_code` the provider uses for "I could not execute this". */
const PROVIDER_FAILURE_EXIT_CODE = -1;

/** The provider returns every metric as a string. */
function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}

/**
 * True when the provider answered but could not execute the program.
 *
 * `exit_code === -1` is the documented-range escape hatch the provider uses;
 * the placeholder text is accepted as a second signal so a provider that
 * changes the code but not the message is still recognised.
 */
function isProviderFailure(exitCode, errorText) {
  if (exitCode === PROVIDER_FAILURE_EXIT_CODE) return true;
  // Fallback in case the provider changes the code but not the message. It still
  // requires a failing run, so a program that merely writes this text to stderr
  // and exits 0 is reported as the program's own output, not a provider fault.
  return errorText.trim() === PROVIDER_INTERNAL_FAILURE && exitCode !== 0;
}

/**
 * True when text is empty or is the provider's own placeholder sentinel.
 *
 * Anything else the provider put in `error` was produced by the program, so it is
 * real information and is kept. This is what stops a genuine traceback from
 * being discarded.
 */
function isPlaceholderProviderError(errorText) {
  const trimmed = String(errorText || '').trim();
  return trimmed === '' || trimmed === PROVIDER_INTERNAL_FAILURE;
}

/**
 * Split a real diagnostic into "the program never ran" (a compile failure) or
 * "the program ran and then failed" (a runtime failure).
 *
 * The provider reports `time` as execution time EXCLUDING compilation, so a
 * compile failure reports `time: "0"` and no stdout, while a program that
 * actually started either produced output or consumed measurable CPU.
 */
function classifyProgramFailure({ errorText, stdout, time, signal }) {
  if (signal !== null && signal !== undefined) return EXECUTION_STATUS.RUNTIME_ERROR;
  const ranAtAll = stdout !== '' || (time !== null && time > 0);
  return ranAtAll ? EXECUTION_STATUS.RUNTIME_ERROR : EXECUTION_STATUS.COMPILE_ERROR;
}

/**
 * Normalise a raw provider response.
 *
 * @param {object} raw - the provider's JSON body
 * @returns {{
 *   status: string, success: boolean, providerFailed: boolean,
 *   output: string, error: string, exitCode: number|null, signal: number|null,
 *   time: number|null, memory: number|null, total: number|null
 * }} `time`/`memory`/`total` are null unless the provider actually measured them.
 */
function interpretExecutionResult(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};

  const stdout = pickString(body.output, body.stdout);
  const errorText = pickString(body.error, body.stderr);

  const rawExitCode = body.exit_code !== undefined ? body.exit_code : body.exitCode;
  const exitCode = rawExitCode === undefined || rawExitCode === null ? null : Number(rawExitCode);
  const signal = body.signal === undefined ? null : body.signal;

  const time = toNumber(body.time);
  const memory = toNumber(body.memory);
  const total = toNumber(body.total);

  const providerStatus = typeof body.status === 'string' ? body.status : '';

  if (isProviderFailure(exitCode, errorText)) {
    // The provider could not execute this program. `exit_code: -1` is reported
    // verbatim and the run is NOT presented as a verified Python or Java
    // exception - nothing was executed, so no exception was observed.
    //
    // But `exit_code === -1` only says the execution was declined; it does not
    // say the provider had nothing to say. If real diagnostic text came back
    // with it, that text is the only evidence available about the failure and
    // is kept rather than thrown away. The provider's own placeholder sentinel
    // is not a diagnostic and is still dropped.
    return {
      status: EXECUTION_STATUS.EXECUTION_FAILED,
      success: false,
      providerFailed: true,
      // Any stdout the provider did return is kept too.
      output: stdout,
      error: isPlaceholderProviderError(errorText) ? '' : errorText,
      exitCode,
      signal,
      // The provider zeroes these for a run that never happened; they are
      // placeholders, not measurements of anything.
      time: null,
      memory: null,
      total: null,
    };
  }

  // Success is decided by the process outcome, not by whether the program wrote
  // anything to stderr.
  //
  // The provider's contract is `exit_code: 0` for a successful run, and it is
  // reliable: measured live, a program that exits 0 while writing to stderr
  // returns `status: "success", exit_code: 0` with the stderr text in `error`.
  // Treating the mere presence of `error` text as failure mislabelled those
  // runs as runtime errors - including the very common `warnings.warn(...)`
  // case, where the program printed its real output and was still reported as
  // having failed.
  const succeeded = exitCode === 0 || (exitCode === null && providerStatus !== 'error');
  const failed = !succeeded;

  if (!failed) {
    return {
      status: EXECUTION_STATUS.SUCCESS,
      success: true,
      providerFailed: false,
      output: stdout,
      // Kept, not discarded. On a successful run this is whatever the program
      // wrote to stderr - a warning or a notice - which the student should be
      // able to see.
      error: errorText,
      exitCode,
      signal,
      time,
      memory,
      total,
    };
  }

  // Did the program actually start? A compile failure reports no output and no
  // execution time, which is how a "never ran" run is told from a "ran and
  // then failed" one.
  const ranAnything = stdout !== '' || (time !== null && time > 0) || (signal !== null && signal !== undefined);

  return {
    status: classifyProgramFailure({ errorText, stdout, time, signal }),
    success: false,
    providerFailed: false,
    output: stdout,
    error: errorText,
    exitCode,
    signal,
    // A compilation failure never starts the program, so the provider's
    // zeroed time/memory are not measurements of anything. Reporting them
    // would render as "Runtime: 0s, Memory: 0 KB" for code that never ran.
    time: ranAnything ? time : null,
    memory: ranAnything ? memory : null,
    total,
  };
}

module.exports = {
  interpretExecutionResult,
  isProviderFailure,
  isPlaceholderProviderError,
  EXECUTION_STATUS,
  PROVIDER_INTERNAL_FAILURE,
  PROVIDER_FAILURE_EXIT_CODE,
};