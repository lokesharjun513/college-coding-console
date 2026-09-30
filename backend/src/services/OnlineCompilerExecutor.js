// backend/src/services/OnlineCompilerExecutor.js
const logger = require('../config/logger');

const { getCompilerById, mapLegacyToCompiler } = require('./compilerRegistry');
// Note: we will resolve compiler ID dynamically based on language or direct compilerId.
const COMPILER_MAP = {
  c: 'gcc-15',
  cpp: 'g++-15',
  java: 'openjdk-21',
  python: 'python-3.11',
  javascript: 'nodejs-20',
};

/**
 * Execute code against OnlineCompiler API for Free Console.
 * @param {Object} options
 * @param {string} options.source - Source code to execute
 * @param {string} options.language - Language name (c, cpp, java, python, javascript)
 * @param {string} [options.stdin] - Input to feed to program
 * @returns {Object} OnlineCompiler execution result normalized
 */
async function execute({ source, language, stdin, compilerId }) {
  // Resolve compiler: prefer explicit compilerId, fall back to legacy language mapping
  let compiler = compilerId;
  if (!compiler) {
    // Try direct lookup from registry (modern compiler IDs like python-3.14)
    try {
      const entry = await getCompilerById(language);
      if (entry) {
        compiler = entry.id;
      }
    } catch (_) {}
    // Fall back to legacy mapping if not found
    if (!compiler) {
      compiler = mapLegacyToCompiler(language) || COMPILER_MAP[language];
    }
  }
  if (!compiler) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const baseUrl = process.env.ONLINE_COMPILER_URL || 'https://api.onlinecompiler.io';
  const apiKey = process.env.ONLINE_COMPILER_API_KEY;

  const compilerUrl = `${baseUrl.replace(/\/+$/, '')}/api/run-code-sync/`;

  const payload = {
    compiler,
    code: source,
    input: stdin || '',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const start = Date.now();
  logger.info('OnlineCompiler execution requested', {
    event: 'onlinecompiler.execution.requested',
    language,
    compiler,
  });

  try {
    const response = await fetch(compilerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      logger.error('OnlineCompiler upstream error', {
        event: 'onlinecompiler.execution.error',
        statusCode: response.status,
        durationMs,
      });
      throw new Error(`OnlineCompiler error ${response.status}: ${text}`);
    }

    const result = await response.json();
    logger.info('OnlineCompiler execution completed', {
      event: 'onlinecompiler.execution.completed',
      language,
      durationMs,
    });

    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - start;
    if (err.name === 'AbortError') {
      logger.error('OnlineCompiler execution timed out', {
        event: 'onlinecompiler.execution.timeout',
        language,
        durationMs,
      });
      throw new Error('OnlineCompiler execution request timed out after 15000ms');
    }
    logger.error('OnlineCompiler execution exception', {
      event: 'onlinecompiler.execution.exception',
      language,
      durationMs,
      message: err.message,
    });
    throw err;
  }
}

module.exports = { execute };
