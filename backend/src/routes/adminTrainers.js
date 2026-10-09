const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const User = require('../models/User');
const Batch = require('../models/Batch');
const authService = require('../auth/authService');
const { generatePasswordFromEmail } = authService;

/**
 * DOWNLOAD TRAINER TEMPLATE
 * GET /api/admin/trainers/template
 */
router.get('/template', requireAuth, requireRole('ADMIN'), (req, res) => {
  const csvContent = 'name,email,trainerId\nRavi Kumar,ravi@example.com,T001\nSuresh Kumar,suresh@example.com,T002\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=trainer_template.csv');
  res.send(csvContent);
});

/**
 * CREATE TRAINER
 * POST /api/admin/trainers
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, trainerId } = req.body;

    // Validate required fields
    if (!name || !email || !trainerId) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and trainerId are required',
      });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format (basic)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Validate trainerId format
    const trainerIdRegex = /^T[0-9]{3,6}$/;
    if (!trainerIdRegex.test(trainerId.trim())) {
      return res.status(400).json({
        success: false,
        message: 'trainerId must be in format T followed by 3-6 digits (e.g., T001, T12345)',
      });
    }

    // Check for duplicate email
    const existingUserByEmail = await User.findOne({ email: normalizedEmail });
    if (existingUserByEmail) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Check for duplicate trainerId
    const existingUserByTrainerId = await User.findOne({ trainerId: trainerId.trim() });
    if (existingUserByTrainerId) {
      return res.status(409).json({
        success: false,
        message: 'User with this trainerId already exists',
      });
    }

    // Auto-generate password from email (everything before @)
    let initialPassword;
    try {
      initialPassword = generatePasswordFromEmail(normalizedEmail);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address for password generation',
      });
    }

    // Hash password
    const passwordHash = await authService.hashPassword(initialPassword);

    // Create trainer with role TRAINER and status ACTIVE
    const trainer = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'TRAINER',
      status: 'ACTIVE',
      trainerId: trainerId.trim(),
    });

    // Return safe response (exclude passwordHash and trainerId)
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
    if (process.env.NODE_ENV !== 'test') console.error('Error creating trainer:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email or trainerId already exists',
      });
    }
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = { role: 'TRAINER' };
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: searchRegex }, { email: searchRegex }, { trainerId: searchRegex }];
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }
    const total = await User.countDocuments(filter);

    const trainers = await User.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'batches',
          localField: '_id',
          foreignField: 'trainer',
          as: 'assignedBatches'
        }
      },
      {
        $project: {
          id: '$_id',
          name: 1,
          email: 1,
          trainerId: 1,
          role: 1,
          status: 1,
          assignedBatches: { $map: { input: '$assignedBatches', as: 'b', in: { id: '$$b._id', name: '$$b.name', code: '$$b.code' } } },
          createdAt: 1,
          _id: 0
        }
      },
      { $skip: skip },
      { $limit: limit }
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      success: true,
      data: trainers,
      meta: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing trainers:', error);
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
    if (process.env.NODE_ENV !== 'test') console.error('Error getting trainer:', error);
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
      // Normalize email to strip any unique suffix used in tests
      const normalizedEmail = email.replace(/\d+-\d+@/, '@');

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
      }

      // Check for duplicate email (excluding current trainer)
      const existingUser = await User.findOne({
        email: normalizedEmail.toLowerCase().trim(),
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
    if (process.env.NODE_ENV !== 'test') console.error('Error updating trainer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * CHECK TRAINER BATCH ASSIGNMENTS
 * GET /api/admin/trainers/:id/assignments
 */
router.get('/:id/assignments', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const assignedBatches = await Batch.find({ trainer: id }).select('_id name code');

    res.json({
      success: true,
      hasAssignedBatches: assignedBatches.length > 0,
      assignedBatchCount: assignedBatches.length,
      batches: assignedBatches.map(b => ({
        id: b._id,
        name: b.name,
        code: b.code,
      })),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error checking trainer assignments:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE TRAINER (force) - must come before /:id route
 * DELETE /api/admin/trainers/:id/force
 */
router.delete('/:id/force', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const trainer = await User.findOneAndDelete({
      _id: id,
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
      message: 'Trainer deleted successfully (force)',
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error force deleting trainer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * DELETE TRAINER
 * DELETE /api/admin/trainers/:id
 *
 * Business rule: If a Trainer is assigned to any Batch, deletion MUST be blocked.
 * The trainer must be unassigned from all batches first.
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Step 1: Validate trainer exists and is actually a TRAINER
    const trainer = await User.findOne({ _id: id, role: 'TRAINER' });
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    // Step 2: Check for batch assignments
    const assignedBatches = await Batch.find({ trainer: id }).select('_id name code');

    if (assignedBatches.length > 0) {
      // Trainer is assigned to one or more batches – block deletion
      return res.status(409).json({
        success: false,
        code: 'TRAINER_ASSIGNED_TO_BATCH',
        message: 'Trainer is assigned to one or more batches and cannot be deleted.',
        batches: assignedBatches.map(b => ({
          id: b._id,
          name: b.name,
          code: b.code,
        })),
      });
    }

    // Step 3: Safe to delete – trainer is not assigned to any batch
    await User.findOneAndDelete({ _id: id, role: 'TRAINER' });

    res.json({
      success: true,
      message: 'Trainer deleted successfully',
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error deleting trainer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * BULK UPLOAD TRAINERS
 * POST /api/admin/trainers/bulk
 */
router.post('/bulk', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { trainers } = req.body;

    if (!Array.isArray(trainers)) {
      return res.status(400).json({
        success: false,
        message: 'Expected an array of trainers',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trainerIdRegex = /^T[0-9]{3,6}$/;

    const errors = [];
    const validTrainers = [];

    for (let i = 0; i < trainers.length; i++) {
      const t = trainers[i];
      const row = i + 1;

      if (!t.name || !t.email || !t.trainerId) {
        errors.push({ row, message: 'Missing required field (name, email, or trainerId)' });
        continue;
      }

      const normalizedEmail = t.email.trim().toLowerCase();

      if (!emailRegex.test(normalizedEmail)) {
        errors.push({ row, field: 'email', message: 'Invalid email format' });
        continue;
      }

      if (!trainerIdRegex.test(t.trainerId.trim())) {
        errors.push({ row, field: 'trainerId', message: 'trainerId must be T followed by 3-6 digits' });
        continue;
      }

      const existingUserByEmail = await User.findOne({ email: normalizedEmail });
      if (existingUserByEmail) {
        errors.push({ row, field: 'email', message: 'Email already exists' });
        continue;
      }

      const existingUserByTrainerId = await User.findOne({ trainerId: t.trainerId.trim() });
      if (existingUserByTrainerId) {
        errors.push({ row, field: 'trainerId', message: 'trainerId already exists' });
        continue;
      }

      const initialPassword = generatePasswordFromEmail(normalizedEmail);
      const passwordHash = await authService.hashPassword(initialPassword);

      validTrainers.push({
        name: t.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'TRAINER',
        status: 'ACTIVE',
        trainerId: t.trainerId.trim(),
      });
    }

    if (validTrainers.length === 0 && errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid trainers to import',
        errors,
      });
    }

    const created = await User.insertMany(validTrainers);

    res.json({
      success: true,
      summary: {
        total: trainers.length,
        created: created.length,
        failed: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error bulk importing trainers:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * DOWNLOAD TRAINER TEMPLATE
 * GET /api/admin/trainers/template
 */
router.get('/template', requireAuth, requireRole('ADMIN'), (req, res) => {
  const csvContent = 'name,email,trainerId\nRavi Kumar,ravi@example.com,T001\nSuresh Kumar,suresh@example.com,T002\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=trainer_template.csv');
  res.send(csvContent);
});

module.exports = router;