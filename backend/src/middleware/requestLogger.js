const logger = require('../config/logger');

function requestLogger(req, res, next) {
  // Suppress request logging in test environment to keep Jest output clean
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  const isHealth = req.path === '/health' || req.originalUrl === '/api/health';
  if (isHealth && process.env.NODE_ENV === 'production') {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    if (isHealth && level === 'info') {
      return;
    }

    logger[level]('HTTP Request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id || req.user?._id || undefined,
      role: req.user?.role || undefined,
    });
  });

  next();
}

module.exports = requestLogger;
