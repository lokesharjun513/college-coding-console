// backend/src/auth/authService.password.test.js
//
// Regression tests for the weak-default-credential fix.
//
// New accounts previously received a password derived from the email address
// (`localpart@domain` -> `localpart`). Student and trainer email addresses are
// visible to every admin in the platform, so any of them could sign in as a
// newly created user.

const {
  generateStrongPassword,
  hashPassword,
  verifyPassword,
  generatePasswordFromEmail,
} = require('./authService');

describe('generateStrongPassword', () => {
  test('is not derived from the email address', () => {
    const email = 'asha.rao@college.edu';
    const localPart = email.split('@')[0];
    for (let i = 0; i < 50; i += 1) {
      expect(generateStrongPassword()).not.toBe(localPart);
    }
  });

  test('produces a different value each call', () => {
    const values = new Set();
    for (let i = 0; i < 100; i += 1) values.add(generateStrongPassword());
    // Collisions across 100 draws would indicate a broken random source.
    expect(values.size).toBeGreaterThanOrEqual(95);
  });

  test('meets a minimum length of 12 characters', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(generateStrongPassword().length).toBeGreaterThanOrEqual(12);
    }
  });

  test('always contains a letter, a digit and a special character', () => {
    for (let i = 0; i < 25; i += 1) {
      const pw = generateStrongPassword();
      expect(pw).toMatch(/[A-Za-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });

  test('excludes visually ambiguous characters', () => {
    for (let i = 0; i < 25; i += 1) {
      const pw = generateStrongPassword();
      expect(pw).not.toMatch(/[O0lI1]/);
    }
  });

  test('generated password successfully authenticates', async () => {
    const password = generateStrongPassword();
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword(`${password}x`, hash)).resolves.toBe(false);
  });
});

describe('verifyPassword hardening', () => {
  test('returns false instead of throwing for a missing hash', async () => {
    await expect(verifyPassword('anything', undefined)).resolves.toBe(false);
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
  });

  test('returns false for an empty password', async () => {
    const hash = await hashPassword('SomePassword123!');
    await expect(verifyPassword('', hash)).resolves.toBe(false);
    await expect(verifyPassword(undefined, hash)).resolves.toBe(false);
  });
});

describe('generatePasswordFromEmail (deprecated)', () => {
  test('is retained for backwards compatibility but is predictable', () => {
    // Kept exported so existing imports do not break. It must not be used for
    // credentials — see the deprecation note on the function.
    expect(generatePasswordFromEmail('someone@college.edu')).toBe('someone');
  });
});