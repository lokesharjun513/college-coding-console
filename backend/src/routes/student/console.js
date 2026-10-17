// backend/src/routes/student/console.js
const express = require('express');
const logger = require('../../config/logger');
const { consoleLimiter } = require('../../middleware/rateLimiter');
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const { execute } = require('../../services/OnlineCompilerExecutor');
const { mapLegacyToCompiler, getCompilerById } = require('../../services/compilerRegistry');
const { interpretExecutionResult, EXECUTION_STATUS } = require('../../services/executionResult');

const router = express.Router();

// Supported free-console languages (JavaScript intentionally excluded — no JS compiler available)
const SUPPORTED_LANGUAGES = ['c', 'cpp', 'java', 'python', 'typescript'];

// Display names come from the compiler registry's own table so the console UI
// never invents a label the backend does not use. `LANGUAGE_NAMES` is not
// exported by the registry, so the subset the console allows is named here and
// derived from the registry's language keys at startup would be more indirection
// than it is worth.
const LANGUAGE_LABELS = {
  python: 'Python',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  typescript: 'TypeScript',
};

// The filename the editor tab shows for each language. Purely cosmetic, but it
// travels with the language list so the UI has a single source of truth.
const LANGUAGE_FILES = {
  python: 'main.py',
  c: 'main.c',
  cpp: 'main.cpp',
  java: 'Main.java',
  typescript: 'main.ts',
};

// Shown when the provider answered but could not execute the program at all.
// The provider's own placeholder text ("Internal error: code execution failed")
// is not a diagnostic and is never forwarded to the student; the detail is
// logged server-side instead.
const PROVIDER_FAILURE_MESSAGE =
  'The code execution service could not run this program and returned no diagnostics. '
  + 'The program may have been stopped in a way the service cannot report. Please try again.';

/** Maximum source size accepted by this route. */
const MAX_CODE_CHARS = 50_000;

/**
 * Maximum standard input accepted by this route.
 *
 * The provider rejects anything over 100 KB with
 * `400 {"error":"Input exceeds maximum size of 100KB"}`. Measured live: with no
 * limit here that rejection reached the student as a 502 "service temporarily
 * unavailable", i.e. a client-side mistake reported as an outage. 100 KB is the
 * provider's own ceiling, and it is the limit the sibling route
 * (`student/problems.js`) already enforces on both code and input.
 */
const MAX_INPUT_BYTES = 100 * 1024;

/** Stable client-facing messages. No provider text is ever interpolated into these. */
const MESSAGES = {
  codeRequired: 'Missing or invalid "code" field.',
  codeTooLarge: `Code exceeds maximum length of ${MAX_CODE_CHARS.toLocaleString('en-US')} characters.`,
  inputNotString: 'Field "input" must be a string when provided.',
  inputTooLarge: 'Input exceeds the 100 KB limit.',
  upstreamRejected: 'The code execution service rejected this request.',
  rateLimited: 'The code execution service is rate limiting requests. Please wait a moment and try again.',
  unavailable: 'Code execution service is temporarily unavailable.',
  timeout: 'Code execution service timed out. Please try again.',
};

/**
 * GET /api/student/console/languages
 *
 * The languages this endpoint will actually run. Exposed so the Free Console
 * selector is driven by the server's own list instead of a copy kept in the UI:
 * a hardcoded list silently drifts, and the student gets a 400 for a language the
 * page happily offered.
 */
router.get('/languages', requireAuth, requireAnyRole('STUDENT'), (req, res) => {
  return res.json({
    success: true,
    data: SUPPORTED_LANGUAGES.map((value) => ({
      value,
      label: LANGUAGE_LABELS[value] || value,
      file: LANGUAGE_FILES[value] || 'main.txt',
    })),
  });
});

/**
 * POST /api/student/console/run
 * Execute code in sandboxed environment. Language → compiler resolution is server-side
 * via compilerRegistry; client-sent compilerId is never trusted.
 *
 * Rate limited by `consoleLimiter`, not `studentLimiter`. `consoleLimiter` exists
 * precisely for code execution (CONSOLE_RATE_LIMIT_MAX, 10/minute) and was defined
 * but never referenced, so this endpoint ran under the general student budget
 * (STUDENT_RATE_LIMIT_MAX, 30/minute) shared with every other student route. Each
 * of those runs spends one of the provider's four concurrent sync slots per API
 * key, so the stricter, purpose-built limit is the correct one here.
 */
router.post('/run', consoleLimiter, requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  // `express.json()` only populates `req.body` when the request actually carries
  // a JSON body. A request with no body, or one sent as text/plain or as a form,
  // reaches this handler with `req.body` undefined, and dereferencing it threw a
  // TypeError that surfaced as a 500 with a stack trace — a client-side input
  // problem reported as a server fault.
  const body = req.body || {};
  const code = body.code;
  const input = body.input !== undefined ? body.input : body.stdin;
  const language = body.language || 'python';

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({ success: false, status: 'invalid_request', language, code: 'UNSUPPORTED_LANGUAGE', compiler: 'onlinecompiler', exitCode: null, output: '', error: `Unsupported language: ${language}` });
  }

  // Resolve compiler server-side from the language
  let compilerId;
  try {
    compilerId = mapLegacyToCompiler(language);
    const compilerInfo = await getCompilerById(compilerId);
    if (!compilerInfo) {
      return res.status(400).json({ success: false, status: 'invalid_request', language, code: 'COMPILER_NOT_SUPPORTED', compiler: compilerId, exitCode: null, output: '', error: `No compiler available for language: ${language}` });
    }
  } catch (err) {
    logger.warn('Could not resolve compiler from registry', { language, error: err.message });
    return res.status(502).json({ success: false, status: 'compiler_unavailable', language, compiler: 'onlinecompiler', exitCode: null, output: '', error: 'Code execution service is temporarily unavailable.' });
  }

  // --- Validation ---
  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      status: 'invalid_request',
      language,
      compiler: compilerId,
      exitCode: null,
      output: '',
      error: MESSAGES.codeRequired,
    });
  }

  if (code.length > MAX_CODE_CHARS) {
    return res.status(400).json({
      success: false,
      status: 'invalid_request',
      language,
      // The compiler was already resolved above, so report it. This branch used to
      // answer the literal 'onlinecompiler' while its sibling branches reported the
      // real id, so one rejected request described the compiler differently from
      // another for the same language.
      compiler: compilerId,
      exitCode: null,
      output: '',
      error: MESSAGES.codeTooLarge,
    });
  }

  // Standard input has to be validated too. `input` is forwarded verbatim to the
  // provider, so a non-string reached the provider as-is and its rejection came
  // back as an opaque execution failure:
  //   input: {a:1}       -> provider 200 + exit_code -1 -> reported as 502 execution_failed
  //   input: 12345       -> provider 500               -> reported as 502 compiler_unavailable
  //   input: 120 KB text -> provider 400               -> reported as 502 compiler_unavailable
  // All three are client mistakes and are now rejected as such, before any
  // provider request is spent. `null` is treated as absent; `''` is preserved,
  // because an intentionally empty stdin is not the same as no stdin.
  if (input !== undefined && input !== null && typeof input !== 'string') {
    return res.status(400).json({
      success: false,
      status: 'invalid_request',
      language,
      compiler: compilerId,
      exitCode: null,
      output: '',
      error: MESSAGES.inputNotString,
    });
  }

  if (typeof input === 'string' && Buffer.byteLength(input, 'utf8') > MAX_INPUT_BYTES) {
    return res.status(400).json({
      success: false,
      status: 'invalid_request',
      language,
      compiler: compilerId,
      exitCode: null,
      output: '',
      error: MESSAGES.inputTooLarge,
    });
  }

  const start = Date.now();
  logger.info('Free console execution requested', {
    event: 'console.execution.requested',
    userId: req.user?.id,
    language,
    codeLength: code.length,
  });

  try {
    const result = await execute({ source: code, language, stdin: input, compilerId });
    const durationMs = Date.now() - start;

    // The provider's own envelope is interpreted in one place. It reports a
    // placeholder (`exit_code: -1`, empty error, zeroed metrics) when it cannot
    // execute a program, which is NOT the same thing as a program that failed.
    const interpreted = interpretExecutionResult(result);

    logger.info('Free console execution completed', {
      event: 'console.execution.completed',
      userId: req.user?.id,
      language,
      compiler: compilerId,
      status: interpreted.status,
      exitCode: interpreted.exitCode,
      durationMs,
    });

    if (interpreted.providerFailed) {
      // Genuine provider/infrastructure failure: nothing about this run can be
      // attributed to the program, so it is a 5xx and never a compile error.
      logger.error('Provider could not execute the program', {
        event: 'console.execution.provider_failed',
        userId: req.user?.id,
        language,
        compiler: compilerId,
        exitCode: interpreted.exitCode,
        signal: interpreted.signal,
        upstreamStatus: result?.status,
        durationMs,
      });

      return res.status(502).json({
        success: false,
        status: EXECUTION_STATUS.EXECUTION_FAILED,
        language,
        compiler: compilerId,
        exitCode: interpreted.exitCode,
        // `-1` is preserved exactly as the provider reported it. It is NOT the
        // exit code 1 and is not translated into one.
        signal: interpreted.signal,
        output: interpreted.output,
        // A genuine diagnostic is shown in preference to the generic message.
        // `interpretExecutionResult` drops the provider's placeholder sentinel
        // and keeps anything real, so this only substitutes the honest fallback
        // when the provider genuinely said nothing about the failure.
        error: interpreted.error || PROVIDER_FAILURE_MESSAGE,
      });
    }

    return res.status(200).json({
      success: interpreted.success,
      status: interpreted.status,
      language,
      compiler: compilerId,
      exitCode: interpreted.exitCode,
      // Passed through unchanged, including `null`. The provider documents
      // `signal` and it was being dropped from this response while the sibling
      // route (student/problems.js) already forwarded it, so a killed process was
      // indistinguishable from a plain non-zero exit here.
      signal: interpreted.signal,
      output: interpreted.output,
      error: interpreted.error || null,
      stdout: interpreted.output,
      stderr: interpreted.error || '',
      compile_output: interpreted.status === EXECUTION_STATUS.COMPILE_ERROR ? interpreted.error : '',
      // Reported only when the executor actually measured them. Previously a
      // missing measurement was replaced with "0.02" / "1024", which the UI then
      // rendered as a real runtime and a real memory figure.
      ...(interpreted.time !== null ? { time: String(interpreted.time) } : {}),
      ...(interpreted.total !== null ? { total: String(interpreted.total) } : {}),
      ...(interpreted.memory !== null ? { memory: String(interpreted.memory) } : {}),
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const upstreamStatus = Number.isInteger(err?.upstreamStatus) ? err.upstreamStatus : null;

    logger.error('Free console execution exception', {
      event: 'console.execution.exception',
      userId: req.user?.id,
      language,
      message: err.message,
      upstreamStatus,
      durationMs,
    });

    if (err.code === 'ONLINE_COMPILER_TIMEOUT') {
      return res.status(408).json({
        success: false,
        status: 'timeout',
        language,
        compiler: compilerId,
        exitCode: null,
        signal: null,
        output: '',
        error: MESSAGES.timeout,
      });
    }

    // A local timeout is only ever reported as a timeout when this process is the
    // thing that gave up (ONLINE_COMPILER_TIMEOUT above). A provider timeout comes
    // back as an ordinary 200 body and is judged on its own evidence in
    // executionResult.js, never assumed here.
    const isTimeout = typeof err.message === 'string' && err.message.includes('timed out');

    // The provider's status decides the story the student is told. Previously every
    // non-timeout failure collapsed into one 502 "temporarily unavailable", so a
    // request the provider actively rejected — 400 "Unsupported or missing
    // compiler", 400 "Input exceeds maximum size of 100KB" — and a request the
    // provider rate-limited were both reported as an outage.
    //
    // Only the upstream *status code* is used. The upstream body is never returned,
    // so no provider text and no credential can reach the client through it.
    let httpStatus = 502;
    let status = 'compiler_unavailable';
    let error = MESSAGES.unavailable;

    if (isTimeout) {
      httpStatus = 408;
      status = 'timeout';
      error = MESSAGES.timeout;
    } else if (upstreamStatus === 429) {
      httpStatus = 429;
      status = 'rate_limited';
      error = MESSAGES.rateLimited;
    } else if (upstreamStatus !== null && upstreamStatus >= 400 && upstreamStatus < 500) {
      // 401/403/404 are the provider refusing OUR credential, which is a service
      // fault, not a rejected student request. Only genuine request-shape
      // rejections are reported back to the client as such.
      const isCredentialFault = upstreamStatus === 401 || upstreamStatus === 403 || upstreamStatus === 404;
      if (!isCredentialFault) {
        httpStatus = 400;
        status = 'invalid_request';
        error = MESSAGES.upstreamRejected;
      }
    }

    if (httpStatus === 429 && Number.isFinite(Number(err?.retryAfter))) {
      const retryAfter = Math.max(1, Math.ceil(Number(err.retryAfter)));
      res.set('Retry-After', retryAfter);
    }

    return res.status(httpStatus).json({
      success: false,
      status,
      language,
      compiler: compilerId,
      exitCode: null,
      signal: null,
      output: '',
      error,
    });
  }
});

module.exports = router;
