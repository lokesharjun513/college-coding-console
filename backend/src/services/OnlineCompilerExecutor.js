// backend/src/services/OnlineCompilerExecutor.js
const logger = require('../config/logger');
const { compilerKeyManager } = require('./CompilerKeyManager');

const { mapLegacyToCompiler } = require('./compilerRegistry');

/**
 * Client-side budget for one provider request, used when
 * ONLINE_COMPILER_TIMEOUT_MS is not set.
 *
 * It is deliberately larger than the provider's own 30s sandbox limit: the
 * provider can only answer once compilation AND execution have finished, so a
 * client budget equal to that limit aborts first and throws away a legitimate
 * provider response. A run measured inside the limit was answered at ~31.5s.
 */
const DEFAULT_EXECUTION_TIMEOUT_MS = 45_000;

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

  // The provider's sandbox caps a single execution at 30s, but it can only
  // answer AFTER compilation and after execution finishes. Java alone costs
  // ~1.7s to compile, and a run measured inside that 30s execution limit was
  // still answered at ~31.5s. A 30s client abort therefore fired FIRST and
  // discarded a real provider response, reporting a client timeout instead.
  // ONLINE_COMPILER_TIMEOUT_MS overrides the default when set.
  const timeoutMs = Number(process.env.ONLINE_COMPILER_TIMEOUT_MS) || DEFAULT_EXECUTION_TIMEOUT_MS;
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
      // Drain the body so the socket can be released. The text itself is never
      // kept: it is provider output and may echo back request material.
      await response.text().catch(() => '');
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

      // The upstream body is logged, never attached to the error: it is provider
      // output and may echo request material. `upstreamStatus` is a bare integer
      // and carries no provider text, so the caller can still tell a rejected
      // request (4xx) apart from an unavailable service (5xx) without ever
      // forwarding the provider's words to a client.
      const error = new Error(`OnlineCompiler error ${response.status}`);
      error.code = 'ONLINE_COMPILER_UPSTREAM';
      error.upstreamStatus = response.status;
      error.retryAfter = response.headers.get('retry-after');
      throw error;
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

module.exports = { execute, DEFAULT_EXECUTION_TIMEOUT_MS };
