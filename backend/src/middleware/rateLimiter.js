// Simple in-memory rate limiter for auth routes
// Limits each IP to a max number of requests per window.
// This is a lightweight alternative to express-rate-limit to avoid adding a new dependency.

const limits = new Map(); // IP -> { count, firstRequestTimestamp }

// Configuration – adjust as needed
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // max attempts per IP per window

/**
 * Rate limiting middleware.
 * Responds with 429 Too Many Requests when limit exceeded.
 */
function rateLimiter(req, res, next) {
  // Bypass rate limiting in test environment to avoid 429 during Jest runs
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  const entry = limits.get(ip) || { count: 0, firstRequestTimestamp: now };

  // Reset count if window has passed
  if (now - entry.firstRequestTimestamp > WINDOW_MS) {
    entry.count = 0;
    entry.firstRequestTimestamp = now;
  }

  entry.count += 1;
  limits.set(ip, entry);

  if (entry.count > MAX_REQUESTS) {
    // Inform client about retry after
    const retryAfter = Math.ceil((WINDOW_MS - (now - entry.firstRequestTimestamp)) / 1000);
    res.set('Retry-After', retryAfter);
    return res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  }

  next();
}

module.exports = rateLimiter;
