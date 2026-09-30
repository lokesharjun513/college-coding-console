const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  let reqId = req.headers['x-request-id'];

  // Validate incoming X-Request-ID: string, 1 to 64 chars, alphanumeric + hyphens/underscores
  if (typeof reqId === 'string' && reqId.length > 0 && reqId.length <= 64 && /^[a-zA-Z0-9\-_]+$/.test(reqId)) {
    req.requestId = reqId;
  } else {
    req.requestId = crypto.randomUUID();
  }

  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = requestIdMiddleware;
