const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'testsecret');
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'User inactive',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    // Attach minimal info to request
    req.user = { id: user._id, role: user.role };
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
