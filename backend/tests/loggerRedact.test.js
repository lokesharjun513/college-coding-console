// backend/tests/loggerRedact.test.js
// Test that logger redaction does not redact HTTP status codes

const logger = require('../src/config/logger');

test('logger.redact preserves statusCode field', () => {
  const input = { statusCode: 200, userId: 'user123', token: 'secret' };
  const redacted = logger.redact(input);
  // statusCode should remain unchanged
  expect(redacted.statusCode).toBe(200);
  // token should be redacted because it contains 'token' which matches a sensitive key
  expect(redacted.token).toBe('[REDACTED]');
});
