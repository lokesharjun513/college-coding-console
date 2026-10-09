// Admin User Management routes

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const User = require('../../models/User');
const authService = require('../../auth/authService');

/**
 * VALIDATE EMAIL FORMAT
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * CREATE USER
 * POST /api/admin/users
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role, status } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required',
      });
    }

    // Validate name
    if (name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Name cannot be empty',
      });
    }

    // Validate email
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    // Validate role - only TRAINER and STUDENT allowed
    const allowedRoles = ['TRAINER', 'STUDENT'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either TRAINER or STUDENT',
      });
    }

    // Validate status
    const allowedStatus = ['ACTIVE', 'INACTIVE'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either ACTIVE or INACTIVE',
      });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Check for duplicate email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await authService.hashPassword(password);

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      status: status || 'ACTIVE',
    });

    // Return safe response (exclude passwordHash)
    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * LIST USERS
 * GET /api/admin/users
 * Supports pagination: ?page=1&limit=10&search=&role=&status=
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { search, role, status, page = '1', limit = '20' } = req.query;

    const query = {};

    // Add search filter (searches name and email)
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
      ];
    }

    // Add role filter
    if (role) {
      query.role = role;
    }

    // Add status filter
    if (status) {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination metadata
    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select('-passwordHash -__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      data: users.map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing users:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * GET SINGLE USER
 * GET /api/admin/users/:id
 */
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id',
      });
    }

    const user = await User.findById(id)
      .select('-passwordHash')
      .select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * UPDATE USER
 * PATCH /api/admin/users/:id
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id',
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Protect ADMIN accounts from modification
    if (user.role === 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Administrator accounts are protected.',
      });
    }

    const { name, email, role, status } = req.body;

    // Validate fields
    if (name !== undefined) {
      if (name.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Name cannot be empty',
        });
      }
      user.name = name.trim();
    }

    if (email !== undefined) {
      if (!validateEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
      }
      const normalizedEmail = email.trim().toLowerCase();
      // Check for duplicate email (excluding current user)
      const existingUser = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists',
        });
      }
      user.email = normalizedEmail;
    }

    if (role !== undefined) {
      const allowedRoles = ['TRAINER', 'STUDENT'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Role must be either TRAINER or STUDENT',
        });
      }
      user.role = role;
    }

    if (status !== undefined) {
      const allowedStatus = ['ACTIVE', 'INACTIVE'];
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be either ACTIVE or INACTIVE',
        });
      }
      user.status = status;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * DELETE USER
 * DELETE /api/admin/users/:id
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id',
      });
    }

    // Fetch user before deletion
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent admin from deleting their own account
    if (id === req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete your own account.',
      });
    }

    // Prevent deletion of ADMIN accounts
    if (user.role === 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Administrator accounts are protected.',
      });
    }

    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      data: null,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

module.exports = router;
