const bcrypt = require('bcryptjs');

/**
 * Hash a plaintext password using bcrypt.
 * @param {string} password - Plaintext password.
 * @returns {Promise<string>} - The hashed password.
 */
async function hashPassword(password) {
  // Use bcrypt with a reasonable salt rounds.
  const saltRounds = process.env.NODE_ENV === 'test' ? 1 : 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * @param {string} password - Plaintext password to verify.
 * @param {string} hash - Stored bcrypt hash.
 * @returns {Promise<boolean>} - True if the password matches the hash.
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate initial password from email address.
 * Extracts everything before "@" symbol.
 * @param {string} email - Email address.
 * @returns {string} - Generated password (part before @).
 */
function generatePasswordFromEmail(email) {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    throw new Error('Invalid email address');
  }
  return email.substring(0, atIndex);
}

module.exports = { hashPassword, verifyPassword, generatePasswordFromEmail };
