const request = require('supertest');
process.env.ENABLE_RATE_LIMIT_IN_TESTS = 'true';
const { createRateLimiter } = require('../src/middleware/rateLimiter');

describe('Rate Limiter Middleware', () => {
  test('Rate limiter blocks requests exceeding max and returns 429 with correct format', async () => {
    const strictLimiter = createRateLimiter({
      windowMs: 60 * 1000,
      max: 2,
      message: 'Too many requests. Please try again later.',
    });

    const testApp = require('express')();
    testApp.use(strictLimiter);
    testApp.get('/test', (req, res) => res.json({ success: true }));

    // Request 1 & 2 should succeed
    const res1 = await request(testApp).get('/test');
    expect(res1.status).toBe(200);

    const res2 = await request(testApp).get('/test');
    expect(res2.status).toBe(200);

    // Request 3 should be rate limited (429)
    const res3 = await request(testApp).get('/test');
    expect(res3.status).toBe(429);
    expect(res3.body).toEqual({
      success: false,
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
    expect(res3.headers['retry-after']).toBeDefined();
  });

  test('Health endpoint is excluded from rate limiting', async () => {
    const strictLimiter = createRateLimiter({
      windowMs: 60 * 1000,
      max: 1,
      message: 'Too many requests',
    });

    const testApp = require('express')();
    testApp.use(strictLimiter);
    testApp.get('/api/health', (req, res) => res.json({ success: true, message: 'API is healthy' }));

    const res1 = await request(testApp).get('/api/health');
    expect(res1.status).toBe(200);
    const res2 = await request(testApp).get('/api/health');
    expect(res2.status).toBe(200);
  });
});
