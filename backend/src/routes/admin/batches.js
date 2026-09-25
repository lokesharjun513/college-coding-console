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

    // Validate required fields
    if (!name || !code || !trainer) {
      return res.status(400).json({ success: false, message: 'Name, code, and trainer are required' });
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

    // Verify trainer exists and is TRAINER
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

    // Create batch
    const batch = await Batch.create({
      name: name.trim(),
      code: code.trim(),
      description,
      trainer,
      status: status || 'ACTIVE',
      startDate,
      endDate,
    });

    // Populate trainer safe fields
    await batch.populate({ path: 'trainer', select: '-passwordHash' });

    const data = {
      id: batch._id,
      name: batch.name,
      code: batch.code,
      description: batch.description,
      trainer: {
        id: batch.trainer._id,
        name: batch.trainer.name,
        email: batch.trainer.email,
        role: batch.trainer.role,
        status: batch.trainer.status,
      },
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creating batch:', error);
    if (error.code === 11000) {
      // duplicate key
      return res.status(409).json({ success: false, message: 'Batch code already exists' });
    }
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
      trainer: {
        id: b.trainer._id,
        name: b.trainer.name,
        email: b.trainer.email,
        role: b.trainer.role,
        status: b.trainer.status,
      },
      status: b.status,
      startDate: b.startDate,
      endDate: b.endDate,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing batches:', error);
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
      trainer: {
        id: batch.trainer._id,
        name: batch.trainer.name,
        email: batch.trainer.email,
        role: batch.trainer.role,
        status: batch.trainer.status,
      },
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting batch:', error);
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

    // Validate trainer if changed
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
      trainer: {
        id: batch.trainer._id,
        name: batch.trainer.name,
        email: batch.trainer.email,
        role: batch.trainer.role,
        status: batch.trainer.status,
      },
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating batch:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Batch code already exists' });
    }
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
    const batch = await Batch.findByIdAndDelete(id);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
