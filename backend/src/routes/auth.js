const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authService = require('../auth/authService');
const jwt = require('jsonwebtoken');
const requireAuth = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
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
    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
    );
    return res.json({ success: true, token });
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

module.exports = router;
