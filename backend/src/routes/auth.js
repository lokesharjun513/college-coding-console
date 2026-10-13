const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authService = require('../auth/authService');
const jwt = require('jsonwebtoken');
const requireAuth = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

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
 * Refresh tokens MUST NOT silently fall back to a fixed value in production:
 * the secret would be identical in every deployment, so anyone could mint a
 * refresh token for an arbitrary active user and exchange it for an access
 * token. Missing configuration is a hard failure instead.
 */
function getJwtRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_REFRESH_SECRET is required in production');
    }
    // Development / test fallback
    return 'testrefreshsecret';
  }
  if (process.env.NODE_ENV === 'production' && secret === 'testrefreshsecret') {
    throw new Error('JWT_REFRESH_SECRET must not use the development fallback value');
  }
  return secret;
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', rateLimiter, async (req, res) => {
  const { email, password } = req.body;
  // Basic validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password required',
      code: 'INVALID_INPUT',
    });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email format',
      code: 'INVALID_INPUT',
    });
  }
  try {
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      // Do not reveal whether the email exists
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    const passwordValid = await authService.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
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
    const secret = getJwtSecret();
    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      secret,
      { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
    );
    const refreshToken = jwt.sign(
      { sub: user._id.toString() },
      getJwtRefreshSecret(),
      { expiresIn: process.env.REFRESH_TOKEN_TTL || '7d' }
    );
    return res.json({ success: true, token, refreshToken });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
});

/**
 * GET /api/auth/me
 * Returns the authenticated user's safe information.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    // Return only safe fields
    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    console.error('Me endpoint error', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
router.post('/refresh', rateLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh token required' });
  }

  try {
    const payload = jwt.verify(refreshToken, getJwtRefreshSecret(), { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      getJwtSecret(),
      { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
    );
    return res.json({ success: true, token });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;

