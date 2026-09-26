// backend/src/services/CodeExecutor.js
// Service to communicate with Judge0 code execution API

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

  const response = await fetch(`${endpoint}/submissions?base64_encoded=false&wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Judge0 error ${response.status}: ${text}`);
  }

  const result = await response.json();
  return result;
}

module.exports = { execute };
