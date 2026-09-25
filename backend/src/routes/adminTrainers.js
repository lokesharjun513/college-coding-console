const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const User = require('../models/User');
const authService = require('../auth/authService');

/**
 * CREATE TRAINER
 * POST /api/admin/trainers
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    // Validate email format (basic)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Validate password strength (basic)
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    // Check for duplicate email
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await authService.hashPassword(password);

    // Create trainer with role TRAINER and status ACTIVE
    const trainer = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: 'TRAINER',
      status: 'ACTIVE',
    });

    // Return safe response (exclude passwordHash)
    res.status(201).json({
      success: true,
      data: {
        id: trainer._id,
        name: trainer.name,
        email: trainer.email,
        role: trainer.role,
        status: trainer.status,
      },
    });
  } catch (error) {
    console.error('Error creating trainer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * LIST TRAINERS
 * GET /api/admin/trainers
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const trainers = await User.find({ role: 'TRAINER' }).select('-passwordHash');

    res.json({
      success: true,
      data: trainers.map(trainer => ({
        id: trainer._id,
        name: trainer.name,
        email: trainer.email,
        role: trainer.role,
        status: trainer.status,
      })),
    });
  } catch (error) {
    console.error('Error listing trainers:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * GET SINGLE TRAINER
 * GET /api/admin/trainers/:id
 */
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const trainer = await User.findOne({
      _id: req.params.id,
      role: 'TRAINER',
    }).select('-passwordHash');

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: trainer._id,
        name: trainer.name,
        email: trainer.email,
        role: trainer.role,
        status: trainer.status,
      },
    });
  } catch (error) {
    console.error('Error getting trainer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * UPDATE TRAINER
 * PATCH /api/admin/trainers/:id
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, status } = req.body;

    // Find trainer by id and ensure role is TRAINER
    const trainer = await User.findOne({
      _id: req.params.id,
      role: 'TRAINER',
    });

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    // Update fields if provided
    if (name !== undefined) {
      if (name.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Name cannot be empty',
        });
      }
      trainer.name = name.trim();
    }

    if (email !== undefined) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
      }

      // Check for duplicate email (excluding current trainer)
      const existingUser = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: trainer._id },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists',
        });
      }

      trainer.email = email.toLowerCase().trim();
    }

    if (status !== undefined) {
      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        return res.status(400).json({
          success: false,
          message: 'Status must be either ACTIVE or INACTIVE',
        });
      }
      trainer.status = status;
    }

    // Save the updated trainer
    await trainer.save();

    res.json({
      success: true,
      data: {
        id: trainer._id,
        name: trainer.name,
        email: trainer.email,
        role: trainer.role,
        status: trainer.status,
      },
    });
  } catch (error) {
    console.error('Error updating trainer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * DELETE TRAINER
 * DELETE /api/admin/trainers/:id
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const trainer = await User.findOneAndDelete({
      _id: req.params.id,
      role: 'TRAINER',
    });

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    res.json({
      success: true,
      message: 'Trainer deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting trainer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

module.exports = router;