// backend/src/services/OnlineCompilerExecutor.js
const logger = require('../config/logger');
const { compilerKeyManager } = require('./CompilerKeyManager');

const { mapLegacyToCompiler } = require('./compilerRegistry');

/**
 * Execute code against OnlineCompiler API for Free Console.
 * @param {Object} options
 * @param {string} options.source - Source code to execute
 * @param {string} options.language - Language name (c, cpp, java, python, typescript)
 * @param {string} [options.stdin] - Input to feed to program
 * @param {string} [options.compilerId] - Explicit compiler id; resolved from language via registry when omitted
 * @returns {Object} OnlineCompiler execution result normalized
 */
async function execute({ source, language, stdin, compilerId }) {
  // Single source of truth: language → compiler via the registry
  const compiler = compilerId || mapLegacyToCompiler(language);
  if (!compiler) {
    throw new Error(`Unsupported language: ${language}`);
  }

  // Reserve a request against an available compiler key
  const key = await compilerKeyManager.reserveRequest();
  if (!key) {
    throw new Error('No compiler API keys available. All keys have reached their request limits.');
  }

  const baseUrl = process.env.ONLINE_COMPILER_URL || 'https://api.onlinecompiler.io';
  const apiKey = await compilerKeyManager.getDecryptedKey(key.keyIndex);

  if (!apiKey) {
    throw new Error(`API key for compiler key ${key.keyIndex} not found`);
  }

  const compilerUrl = `${baseUrl.replace(/\/+$/, '')}/api/run-code-sync/`;

  const payload = {
    compiler,
    code: source,
    input: stdin || '',
  };

  const timeoutMs = Number(process.env.ONLINE_COMPILER_TIMEOUT_MS) || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  logger.info('OnlineCompiler execution requested', {
    event: 'onlinecompiler.execution.requested',
    language,
    compiler,
    keyIndex: key.keyIndex
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
        keyIndex: key.keyIndex
      });

      // Handle rate limit responses (429) by marking key as exhausted
      if (response.status === 429) {
        await compilerKeyManager.updateLimit(key.keyIndex, key.currentRequestCount);
      }

      throw new Error(`OnlineCompiler error ${response.status}: ${text}`);
    }

    const result = await response.json();
    logger.info('OnlineCompiler execution completed', {
      event: 'onlinecompiler.execution.completed',
      language,
      durationMs,
      keyIndex: key.keyIndex
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
        keyIndex: key.keyIndex
      });
      const error = new Error('Code execution service timed out. Please try again.');
      error.code = 'ONLINE_COMPILER_TIMEOUT';
      error.status = 408;
      throw error;
    }
    logger.error('OnlineCompiler execution exception', {
      event: 'onlinecompiler.execution.exception',
      language,
      durationMs,
      message: err.message,
      keyIndex: key.keyIndex
    });
    throw err;
  }
}

module.exports = { execute };
