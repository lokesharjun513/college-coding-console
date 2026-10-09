// backend/src/routes/student/console.js
const express = require('express');
const logger = require('../../config/logger');
const { studentLimiter } = require('../../middleware/rateLimiter');
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const { execute } = require('../../services/OnlineCompilerExecutor');
const { mapLegacyToCompiler, getCompilerById } = require('../../services/compilerRegistry');

const router = express.Router();

// Supported free-console languages (JavaScript intentionally excluded — no JS compiler available)
const SUPPORTED_LANGUAGES = ['c', 'cpp', 'java', 'python', 'typescript'];

/**
 * POST /api/student/console/run
 * Execute code in sandboxed environment. Language → compiler resolution is server-side
 * via compilerRegistry; client-sent compilerId is never trusted.
 */
router.post('/run', studentLimiter, requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  const code = req.body.code;
  const input = req.body.input !== undefined ? req.body.input : req.body.stdin;
  const language = req.body.language || 'python';

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
      error: 'Missing or invalid "code" field.',
    });
  }

  if (code.length > 50_000) {
    return res.status(400).json({
      success: false,
      status: 'invalid_request',
      language,
      compiler: 'onlinecompiler',
      exitCode: null,
      output: '',
      error: 'Code exceeds maximum length of 50,000 characters.',
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

    const rawOutput = result.stdout || result.output || '';
    const rawError = result.stderr || result.error || '';
    const exitCode = result.exitCode !== undefined ? result.exitCode : (result.exit_code !== undefined ? result.exit_code : (rawError ? 1 : 0));

    let status = 'success';
    let success = true;

    if (rawError && (rawError.includes('error:') || rawError.includes('Error') || exitCode !== 0)) {
      status = 'compile_error';
      success = false;
    }

    logger.info('Free console execution completed', {
      event: 'console.execution.completed',
      userId: req.user?.id,
      language,
      status,
      durationMs,
    });

    return res.status(200).json({
      success,
      status,
      language,
      compiler: 'onlinecompiler',
      exitCode,
      output: rawOutput,
      error: rawError || null,
      stdout: rawOutput,
      stderr: rawError || '',
      compile_output: status === 'compile_error' ? rawError : '',
      time: String(result.time || '0.02'),
      memory: String(result.memory || '1024'),
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error('Free console execution exception', {
      event: 'console.execution.exception',
      userId: req.user?.id,
      language,
      message: err.message,
      durationMs,
    });

    if (err.code === 'ONLINE_COMPILER_TIMEOUT') {
      return res.status(408).json({
        success: false,
        status: 'timeout',
        language,
        compiler: 'onlinecompiler',
        exitCode: null,
        output: '',
        error: 'Code execution service timed out. Please try again.',
      });
    }

    const isTimeout = err.message && err.message.includes('timed out');
    return res.status(isTimeout ? 408 : 502).json({
      success: false,
      status: isTimeout ? 'timeout' : 'compiler_unavailable',
      language,
      compiler: 'onlinecompiler',
      exitCode: null,
      output: '',
      error: isTimeout ? 'Execution timed out.' : (err.message || 'Code execution service is temporarily unavailable.'),
    });
  }
});

module.exports = router;
