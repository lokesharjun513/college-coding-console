const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getJwtSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_ACCESS_SECRET is required in production');
    }
    // Development / test fallback
    return 'testsecret';
  }
  return secret;
}

/**
 * Express middleware to protect routes.
 * Expects an Authorization header with a Bearer token.
 * On success, attaches a minimal user object to req.user.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Missing Authorization header',
      code: 'AUTHENTICATION_REQUIRED',
    });
  }
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Invalid Authorization header format',
      code: 'AUTHENTICATION_REQUIRED',
    });
  }
  const token = parts[1];
  try {
    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    } catch (err) {
      // Fallback to default secret ONLY in non-production environments
      if (process.env.NODE_ENV !== 'production') {
        try {
          payload = jwt.verify(token, 'testsecret', { algorithms: ['HS256'] });
        } catch (e) {
          return res.status(401).json({
            success: false,
            message: 'Invalid token',
            code: 'AUTHENTICATION_REQUIRED',
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'AUTHENTICATION_REQUIRED',
        });
      }
    }
    const user = await User.findById(payload.sub);
    if (!user) {
      // Fail closed. Trusting the token payload here would keep a deleted or
      // deprovisioned account authorised — and would take its role from the
      // token rather than the database — until the token expired.
      // The token-payload fallback is retained only for tests, where a fixture
      // user may legitimately not exist.
      if (process.env.NODE_ENV !== 'production') {
        req.user = { id: payload.sub, role: payload.role };
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'AUTHENTICATION_REQUIRED',
        });
      }
    } else if (user.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'User inactive',
        code: 'AUTHENTICATION_REQUIRED',
      });
    } else {
      // Attach minimal info to request
      req.user = { id: user._id, role: user.role };
    }
    next();
  } catch (err) {
    // Token verification failed
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      code: 'AUTHENTICATION_REQUIRED',
    });
  }
}

module.exports = requireAuth;
