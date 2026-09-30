// backend/src/services/CodeExecutor.js
// Service to communicate with Judge0 code execution API

const logger = require('../config/logger');

// Map our language names to Judge0 language IDs
const LANGUAGE_ID_MAP = {
  c: 50,
  cpp: 54,
  java: 62,
  python: 71,
  javascript: 63,
};

/**
 * Execute code against Judge0.
 * @param {Object} options
 * @param {string} options.source - Source code to execute
 * @param {string} options.language - Language name (c, cpp, java, python, javascript)
 * @param {string} [options.stdin] - Input to feed to program
 * @returns {Object} Judge0 submission result
 */
async function execute({ source, language, stdin }) {
  const languageId = LANGUAGE_ID_MAP[language];
  if (languageId === undefined) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const endpoint = process.env.JUDGE0_ENDPOINT;
  if (!endpoint) {
    throw new Error('JUDGE0_ENDPOINT environment variable not set');
  }

  const payload = {
    source_code: source,
    language_id: languageId,
    stdin: stdin || '',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const start = Date.now();
  logger.info('Judge0 execution requested', {
    event: 'judge0.execution.requested',
    language,
  });

  try {
    const response = await fetch(`${endpoint}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.JUDGE0_API_KEY ? { 'X-RapidAPI-Key': process.env.JUDGE0_API_KEY } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      logger.error('Judge0 upstream error', {
        event: 'judge0.execution.error',
        statusCode: response.status,
        durationMs,
      });
      throw new Error(`Judge0 error ${response.status}: ${text}`);
    }

    const result = await response.json();
    logger.info('Judge0 execution completed', {
      event: 'judge0.execution.completed',
      language,
      durationMs,
      status: result.status?.description || 'Unknown',
    });

    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - start;
    if (err.name === 'AbortError') {
      logger.error('Judge0 execution timed out', {
        event: 'judge0.execution.timeout',
        language,
        durationMs,
      });
      throw new Error('Judge0 execution request timed out after 10000ms');
    }
    logger.error('Judge0 execution exception', {
      event: 'judge0.execution.exception',
      language,
      durationMs,
      message: err.message,
    });
    throw err;
  }
}

module.exports = { execute };
