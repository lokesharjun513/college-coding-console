// middleware/role.test.js - Role authorization middleware tests

const express = require('express');
const request = require('supertest');

// Import real middleware
const { requireRole, requireAnyRole } = require('./role');

describe('requireRole middleware', () => {
  test('rejects requests without req.user', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      requireRole('ADMIN')(req, res, next);
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  test('rejects non-admin users from admin routes', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      req.user = { id: 'test-id', role: 'STUDENT' };
      requireRole('ADMIN')(req, res, next);
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  test('rejects non-admin users (trainer role)', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      req.user = { id: 'test-id', role: 'TRAINER' };
      requireRole('ADMIN')(req, res, next);
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  test('allows admin users through admin routes', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      req.user = { id: 'test-id', role: 'ADMIN' };
      requireRole('ADMIN')(req, res, next);
      res.json({ success: true });
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  test('allows users through when role matches', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      req.user = { id: 'test-id', role: 'TRAINER' };
      requireRole('TRAINER')(req, res, next);
      res.json({ success: true });
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

describe('requireAnyRole middleware', () => {
  test('rejects requests without req.user', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      requireAnyRole('ADMIN', 'TRAINER')(req, res, next);
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  test('rejects users without allowed roles', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      req.user = { id: 'test-id', role: 'STUDENT' };
      requireAnyRole('ADMIN', 'TRAINER')(req, res, next);
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  test('allows admin users', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      req.user = { id: 'test-id', role: 'ADMIN' };
      requireAnyRole('ADMIN', 'TRAINER')(req, res, next);
      res.json({ success: true });
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  test('allows trainer users', () => {
    const app = express();
    app.use(express.json());
    app.use('/test', (req, res, next) => {
      req.user = { id: 'test-id', role: 'TRAINER' };
      requireAnyRole('ADMIN', 'TRAINER')(req, res, next);
      res.json({ success: true });
    });

    return request(app).get('/test').then(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
