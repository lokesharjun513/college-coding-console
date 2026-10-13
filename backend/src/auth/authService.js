const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Hash a plaintext password using bcrypt.
 * @param {string} password - Plaintext password.
 * @returns {Promise<string>} - The hashed password.
 */
async function hashPassword(password) {
  // Use bcrypt with a reasonable salt rounds.
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * @param {string} password - Plaintext password to verify.
 * @param {string} hash - Stored bcrypt hash.
 * @returns {Promise<boolean>} - True if the password matches the hash.
 */
async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return await bcrypt.compare(password, hash);
}

// Excludes visually ambiguous characters (0/O, 1/l/I) so a generated password
// can be read aloud or copied from a screen without ambiguity.
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const PASSWORD_SPECIALS = '!@#$%^&*';

/**
 * Generate a cryptographically random initial password for a new account.
 *
 * Passwords must never be derived from public data such as the email address:
 * student and trainer emails are visible to every admin in the platform, so an
 * email-derived default would let anyone who knows an address sign in.
 *
 * @param {number} [length=14] - Number of characters.
 * @returns {string} - A random password containing letters, digits and specials.
 */
function generateStrongPassword(length = 14) {
  const size = Math.max(12, length);
  const alphabet = UPPERCASE + LOWERCASE + DIGITS + PASSWORD_SPECIALS;

  // Guarantee one character from each class so the result always satisfies a
  // basic complexity policy, then fill the rest from the full alphabet.
  const required = [
    UPPERCASE[0],
    LOWERCASE[0],
    DIGITS[0],
    PASSWORD_SPECIALS[0],
  ];

  const chars = [...required];
  for (let i = required.length; i < size; i += 1) {
    chars.push(alphabet[crypto.randomInt(0, alphabet.length)]);
  }

  // Fisher-Yates with a CSPRNG so the guaranteed characters are not pinned to
  // fixed positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * Generate initial password from email address.
 * Extracts everything before "@" symbol.
 *
 * @deprecated Do not use for credentials — an email address is public data,
 * so the resulting password is predictable. Use `generateStrongPassword()`.
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

module.exports = {
  hashPassword,
  verifyPassword,
  generatePasswordFromEmail,
  generateStrongPassword,
};
