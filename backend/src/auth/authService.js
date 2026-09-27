const argon2 = require('argon2');

/**
 * Hash a plaintext password using Argon2id.
 * @param {string} password - Plaintext password.
 * @returns {Promise<string>} - The hashed password.
 */
async function hashPassword(password) {
  // Argon2id provides resistance against side‑channel attacks.
  const options = { type: argon2.argon2id };
  if (process.env.NODE_ENV === 'test') {
    // Reduce cost for test environment to speed up hashing
    options.timeCost = 2;
    options.memoryCost = 64 * 1024; // 64 MB
    options.parallelism = 1;
  }
  return await argon2.hash(password, options);
}

/**
 * Verify a plaintext password against a stored Argon2 hash.
 * @param {string} password - Plaintext password to verify.
 * @param {string} hash - Stored Argon2 hash.
 * @returns {Promise<boolean>} - True if the password matches the hash.
 */
async function verifyPassword(password, hash) {
  return await argon2.verify(hash, password);
}

module.exports = { hashPassword, verifyPassword };
