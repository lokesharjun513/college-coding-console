// Production-safe in-memory rate limiters
// Note: In-memory store is suitable for single-container/development deployments.
// For multi-replica horizontal scaling, a distributed store (e.g., Redis) should be used.

const logger = require('../config/logger');

function createRateLimiter({ windowMs, max, message }) {
  const limits = new Map(); // IP -> { count, firstRequestTimestamp }

  return function (req, res, next) {
    // Bypass rate limiting in test environment unless explicitly enabled
    if (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true') {
      return next();
    }

    // Skip health checks
    if (req.path === '/health' || req.originalUrl === '/api/health') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = limits.get(ip);

    if (!entry || (now - entry.firstRequestTimestamp > windowMs)) {
      entry = { count: 0, firstRequestTimestamp: now };
    }

    entry.count += 1;
    limits.set(ip, entry);

    if (entry.count > max) {
      const retryAfter = Math.ceil((windowMs - (now - entry.firstRequestTimestamp)) / 1000);
      res.set('Retry-After', retryAfter > 0 ? retryAfter : 1);

      if (process.env.NODE_ENV !== 'test') {
        logger.warn('Rate limit exceeded', {
        event: 'rate_limit.exceeded',
        requestId: req.requestId,
        path: req.originalUrl || req.url,
        method: req.method,
        retryAfter,
      });
    }

      return res.status(429).json({
        success: false,
        message: message || 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    next();
  };
}

const globalWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
const globalMax = parseInt(process.env.RATE_LIMIT_MAX, 10) || 300;

const authWindowMs = 15 * 60 * 1000;
const authMax = parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20;

const submissionWindowMs = 60 * 1000; // 1 minute
const submissionMax = parseInt(process.env.SUBMISSION_RATE_LIMIT_MAX, 10) || 10;

const studentWindowMs = 60 * 1000; // 1 minute
const studentMax = parseInt(process.env.STUDENT_RATE_LIMIT_MAX, 10) || 30;

const consoleWindowMs = 60 * 1000; // 1 minute per user
const consoleMax = parseInt(process.env.CONSOLE_RATE_LIMIT_MAX, 10) || 10;

const globalLimiter = createRateLimiter({
  windowMs: globalWindowMs,
  max: globalMax,
  message: 'Too many requests. Please try again later.',
});

const authLimiter = createRateLimiter({
  windowMs: authWindowMs,
  max: authMax,
  message: 'Too many login attempts. Please try again later.',
});

const submissionLimiter = createRateLimiter({
  windowMs: submissionWindowMs,
  max: submissionMax,
  message: 'Too many submissions. Please wait before submitting again.',
});

const studentLimiter = createRateLimiter({
  windowMs: studentWindowMs,
  max: studentMax,
  message: 'Too many student requests. Please try again later.',
});

const consoleLimiter = createRateLimiter({
  windowMs: consoleWindowMs,
  max: consoleMax,
  message: 'Too many code executions. Please wait before running again.',
});

module.exports = {
  rateLimiter: authLimiter,
  globalLimiter,
  authLimiter,
  submissionLimiter,
  studentLimiter,
  consoleLimiter,
  createRateLimiter,
};
