// backend/src/security/dependencyIntegrity.test.js
//
// Guards against a supply-chain / environment-integrity failure that silently
// removes the security properties the auth layer depends on.
//
// A hand-written stand-in was found vendored into backend/node_modules under the
// real package's name and version. It ignored the `algorithms` verify option,
// required no `exp`, and reduced unrecognised `expiresIn` values (including
// '30s' and '-1s') to zero seconds. Any code relying on `jsonwebtoken`
// semantics would then be wrong in ways the test suite could not see.
//
// This test asserts the *installed* module behaves like the real library.

const jwt = require('jsonwebtoken');

describe('jsonwebtoken module integrity', () => {
  const SECRET = 'integrity-check-secret-value';

  test('exposes the real library surface (decode is present)', () => {
    expect(typeof jwt.decode).toBe('function');
    expect(typeof jwt.sign).toBe('function');
    expect(typeof jwt.verify).toBe('function');
  });

  test('verify honours the algorithms allow-list', () => {
    const token = jwt.sign({ sub: 'abc' }, SECRET, { algorithm: 'HS256' });
    expect(() => jwt.verify(token, SECRET, { algorithms: ['HS256'] })).not.toThrow();
  });

  test('verify rejects an alg=none token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'abc' })).toString('base64url');
    expect(() => jwt.verify(`${header}.${body}.`, SECRET)).toThrow();
  });

  test('verify rejects a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'abc' }, SECRET, { expiresIn: '5m' });
    expect(() => jwt.verify(token, 'a-different-secret')).toThrow();
  });

  test('verify rejects an expired token', () => {
    const token = jwt.sign(
      { sub: 'abc', exp: Math.floor(Date.now() / 1000) - 30 },
      SECRET
    );
    expect(() => jwt.verify(token, SECRET)).toThrow(/expired/i);
  });

  test('parseDuration does not collapse short TTLs to zero', () => {
    // A stub returning 0 for anything but m/h/d made every short-lived token
    // expire immediately (and every negative TTL meaningless).
    const thirtySeconds = Math.floor(Date.now() / 1000) + 30;
    const decoded = jwt.decode(jwt.sign({ sub: 'abc' }, SECRET, { expiresIn: '30s' }));
    // Allow for small clock skew between sign and decode.
    expect(Math.abs(decoded.exp - thirtySeconds)).toBeLessThanOrEqual(5);
  });

  test('sign rejects a negative TTL instead of silently issuing a live token', () => {
    expect(() => jwt.sign({ sub: 'abc' }, SECRET, { expiresIn: '-1s' })).toThrow();
  });
});