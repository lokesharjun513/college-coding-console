// Admin Batch Management routes

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const Batch = require('../../models/Batch');
const User = require('../../models/User');
const mongoose = require('mongoose');

/**
 * CREATE BATCH
 * POST /api/admin/batches
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, code, description, trainer, status, startDate, endDate } = req.body;

    // Validate required fields (trainer is now optional)
    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required' });
    }

    // Validate status
    const allowedStatus = ['ACTIVE', 'INACTIVE', 'COMPLETED'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Validate dates
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ success: false, message: 'endDate cannot be before startDate' });
    }

    // Verify trainer if provided
    let trainerUser = null;
    if (trainer) {
      if (!mongoose.Types.ObjectId.isValid(trainer)) {
        return res.status(400).json({ success: false, message: 'Invalid trainer id' });
      }
      trainerUser = await User.findById(trainer);
      if (!trainerUser) {
        return res.status(400).json({ success: false, message: 'Trainer not found' });
      }
      if (trainerUser.role !== 'TRAINER') {
        return res.status(400).json({ success: false, message: 'User is not a trainer' });
      }
    }

    // Create batch
    const batchData = {
      name: name.trim(),
      code: code.trim(),
      description,
      trainer: trainer || undefined,
      status: status || 'ACTIVE',
      startDate,
      endDate,
    };

    const batch = await Batch.create(batchData);

    const data = {
      id: batch._id,
      name: batch.name,
      code: batch.code,
      description: batch.description,
      trainer: trainerUser ? {
        id: trainerUser._id,
        name: trainerUser.name,
        email: trainerUser.email,
        role: trainerUser.role,
        status: trainerUser.status,
      } : null,
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };

    res.status(201).json({ success: true, data });
  } catch (error) {
    if (error && error.code == 11000) {
      // duplicate key
      return res.status(409).json({ success: false, message: 'Batch code already exists' });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error creating batch:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST BATCHES
 * GET /api/admin/batches
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const batches = await Batch.find()
      .populate({ path: 'trainer', select: '-passwordHash' })
      .select('-__v');
    const data = batches.map(b => ({
      id: b._id,
      name: b.name,
      code: b.code,
      description: b.description,
      trainer: b.trainer ? {
        id: b.trainer._id,
        name: b.trainer.name,
        email: b.trainer.email,
        role: b.trainer.role,
        status: b.trainer.status,
      } : null,
      status: b.status,
      startDate: b.startDate,
      endDate: b.endDate,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
    res.json({ success: true, data });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing batches:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE BATCH
 * GET /api/admin/batches/:id
 */
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }
    const batch = await Batch.findById(id)
      .populate({ path: 'trainer', select: '-passwordHash' })
      .select('-__v');
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    const data = {
      id: batch._id,
      name: batch.name,
      code: batch.code,
      description: batch.description,
      trainer: batch.trainer ? {
        id: batch.trainer._id,
        name: batch.trainer.name,
        email: batch.trainer.email,
        role: batch.trainer.role,
        status: batch.trainer.status,
      } : null,
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
    res.json({ success: true, data });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error getting batch:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE BATCH
 * PATCH /api/admin/batches/:id
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }
    const { name, code, description, trainer, status, startDate, endDate } = req.body;

    // Find batch
    const batch = await Batch.findById(id);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    // Validate status if provided
    const allowedStatus = ['ACTIVE', 'INACTIVE', 'COMPLETED'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Validate dates
    const newStart = startDate ? new Date(startDate) : batch.startDate;
    const newEnd = endDate ? new Date(endDate) : batch.endDate;
    if (newStart && newEnd && newEnd < newStart) {
      return res.status(400).json({ success: false, message: 'endDate cannot be before startDate' });
    }

    // Validate trainer if changed (including removal)
    if (Object.prototype.hasOwnProperty.call(req.body, 'trainer')) {
      // Trainer field is present in request (could be null/empty to remove)
      if (trainer) {
        if (!mongoose.Types.ObjectId.isValid(trainer)) {
          return res.status(400).json({ success: false, message: 'Invalid trainer id' });
        }
        const trainerUser = await User.findById(trainer);
        if (!trainerUser) {
          return res.status(400).json({ success: false, message: 'Trainer not found' });
        }
        if (trainerUser.role !== 'TRAINER') {
          return res.status(400).json({ success: false, message: 'User is not a trainer' });
        }
        batch.trainer = trainer;
      } else {
        // Remove trainer assignment
        batch.trainer = undefined;
      }
    }

    // Apply other fields
    if (name !== undefined) batch.name = name.trim();
    if (code !== undefined) batch.code = code.trim();
    if (description !== undefined) batch.description = description;
    if (status !== undefined) batch.status = status;
    if (startDate !== undefined) batch.startDate = startDate;
    if (endDate !== undefined) batch.endDate = endDate;

    await batch.save();

    await batch.populate({ path: 'trainer', select: '-passwordHash' });
    const data = {
      id: batch._id,
      name: batch.name,
      code: batch.code,
      description: batch.description,
      trainer: batch.trainer ? {
        id: batch.trainer._id,
        name: batch.trainer.name,
        email: batch.trainer.email,
        role: batch.trainer.role,
        status: batch.trainer.status,
      } : null,
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
    res.json({ success: true, data });
  } catch (error) {
    if (error && error.code == 11000) {
      return res.status(409).json({ success: false, message: 'Batch code already exists' });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error updating batch:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE BATCH
 * DELETE /api/admin/batches/:id
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }

    const batch = await Batch.findById(id).populate({ path: 'trainer', select: '-passwordHash' });
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    // Check if batch is assigned to a trainer
    if (batch.trainer) {
      // Return trainer info so frontend can show confirmation dialog
      return res.json({
        success: true,
        hasTrainer: true,
        trainer: {
          id: batch.trainer._id,
          name: batch.trainer.name,
          email: batch.trainer.email,
        },
        message: 'Batch is assigned to a trainer. Confirm removal and deletion.'
      });
    }

    // Delete batch without trainer assignment
    await Batch.findByIdAndDelete(id);
    res.json({ success: true, data: null });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error deleting batch:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
