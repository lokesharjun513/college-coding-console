// backend/src/middleware/auth.security.test.js
//
// Regression tests for authentication hardening.
// These are pure middleware/route tests: the User model is mocked so no
// database connection is required.

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock the User model so these tests never touch MongoDB.
jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

const User = require('../models/User');

const PROD = 'production';
const TEST = 'test';

let originalNodeEnv;

function buildApp(middleware) {
  const app = express();
  app.use(express.json());
  app.get('/protected', middleware, (req, res) => {
    res.json({ success: true, user: req.user });
  });
  return app;
}

function signAccessToken(secret, payload, options = {}) {
  const { noExpiresIn, ...signOptions } = options;
  const base = noExpiresIn ? {} : { expiresIn: '15m' };
  return jwt.sign(payload, secret, { ...base, ...signOptions });
}

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  process.env.JWT_ACCESS_SECRET = 'a-real-test-access-secret';
  User.findById.mockReset();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('requireAuth — fail closed', () => {
  test('rejects a valid token when the user no longer exists in production', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue(null);

    // Previously this fell back to the token payload, keeping a deleted
    // account authorised for the remaining lifetime of its token.
    const token = signAccessToken('a-real-test-access-secret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'ADMIN',
    });

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  test('does not adopt the role from the token for a missing user', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue(null);

    const token = signAccessToken('a-real-test-access-secret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'ADMIN',
    });

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.user).toBeUndefined();
  });

  test('rejects a deactivated (non-ACTIVE) user in production', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', role: 'STUDENT', status: 'INACTIVE' });

    const token = signAccessToken('a-real-test-access-secret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'STUDENT',
    });

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(401);
  });

  test('still resolves the role from the database, not the token', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', role: 'TRAINER', status: 'ACTIVE' });

    // The token claims ADMIN; the database says TRAINER and must win.
    const token = signAccessToken('a-real-test-access-secret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'ADMIN',
    });

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.role).toBe('TRAINER');
  });

  test('rejects an expired token', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', role: 'STUDENT', status: 'ACTIVE' });

    // Use an explicit past `exp` rather than a negative TTL: every JWT
    // implementation must treat this as expired.
    const token = signAccessToken('a-real-test-access-secret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'STUDENT',
      exp: Math.floor(Date.now() / 1000) - 60,
    }, { noExpiresIn: true });

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(401);
  });

  test('rejects a token tampered with after signing', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', role: 'STUDENT', status: 'ACTIVE' });

    const token = signAccessToken('a-real-test-access-secret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'STUDENT',
    });
    const tampered = `${token.slice(0, -3)}xyz`;

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.statusCode).toBe(401);
  });

  test('rejects a token signed with the development fallback secret in production', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', role: 'ADMIN', status: 'ACTIVE' });

    // 'testsecret' is the well-known non-production fallback and must never
    // authenticate in production, even when a real secret is configured.
    const token = signAccessToken('testsecret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'ADMIN',
    });

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(401);
  });

  test('rejects an unsigned (alg=none) token in production', async () => {
    process.env.NODE_ENV = PROD;
    User.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', role: 'ADMIN', status: 'ACTIVE' });

    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      sub: '507f1f77bcf86cd799439011',
      role: 'ADMIN',
    })).toString('base64url');
    const unsigned = `${header}.${body}.`;

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${unsigned}`);

    expect(res.statusCode).toBe(401);
  });

  test('rejects a malformed Authorization header', async () => {
    process.env.NODE_ENV = PROD;
    const app = buildApp(require('./auth'));

    for (const header of ['', 'Bearer', 'Bearer a b', 'Basic abc']) {
      const res = await request(app)
        .get('/protected')
        .set('Authorization', header);
      expect(res.statusCode).toBe(401);
    }
  });

  test('rejects a missing Authorization header', async () => {
    process.env.NODE_ENV = PROD;
    const app = buildApp(require('./auth'));
    const res = await request(app).get('/protected');
    expect(res.statusCode).toBe(401);
  });

  test('non-production keeps the token-payload fallback for test fixtures', async () => {
    // Guards against over-tightening: the suite relies on this behaviour.
    process.env.NODE_ENV = TEST;
    User.findById.mockResolvedValue(null);

    const token = signAccessToken('testsecret', {
      sub: '507f1f77bcf86cd799439011',
      role: 'ADMIN',
    });

    const app = buildApp(require('./auth'));
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
  });
});

describe('refresh token secret configuration', () => {
  let authRouter;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_REFRESH_SECRET = undefined;
    delete process.env.JWT_REFRESH_SECRET;
  });

  function buildAuthApp() {
    // Re-require so the module reads the current environment.
    const router = require('../routes/auth').__esModule
      ? require('../routes/auth').default
      : require('../routes/auth');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', router);
    return app;
  }

  test('a refresh token signed with the fallback secret cannot be exchanged in production', async () => {
    process.env.NODE_ENV = PROD;
    process.env.JWT_ACCESS_SECRET = 'a-real-test-access-secret';
    const UserModel = require('../models/User');
    UserModel.findById = jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const forged = signAccessToken('testrefreshsecret', {
      sub: '507f1f77bcf86cd799439011',
    }, { expiresIn: '7d' });

    const app = buildAuthApp();
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: forged });

    // Missing refresh-secret configuration must fail hard, never mint a token.
    expect(res.statusCode).not.toBe(200);
    expect(res.body.token).toBeUndefined();
  });

  test('the fallback secret is explicitly refused in production', async () => {
    process.env.NODE_ENV = PROD;
    process.env.JWT_REFRESH_SECRET = 'testrefreshsecret';

    const forged = signAccessToken('testrefreshsecret', {
      sub: '507f1f77bcf86cd799439011',
    }, { expiresIn: '7d' });

    const app = buildAuthApp();
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: forged });

    expect(res.statusCode).not.toBe(200);
    expect(res.body.token).toBeUndefined();
  });
});