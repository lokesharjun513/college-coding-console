const User = require('../models/User');
const { verifyPassword } = require('../auth/authService');

/**
 * Middleware to verify the authenticated user's password for sensitive actions.
 * Assumes requireAuth middleware has run and attached req.user.
 */
async function verifyAdminPassword(req, res, next) {
  const { adminPassword } = req.body;

  if (!adminPassword) {
    return res.status(400).json({
      success: false,
      message: 'Admin password required',
      code: 'INVALID_INPUT'
    });
  }

  try {
    // Fetch user with passwordHash
    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    // Verify password
    const isMatch = await verifyPassword(adminPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin password',
        code: 'INVALID_PASSWORD'
      });
    }

    next();
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}

module.exports = verifyAdminPassword;
