// Trainer Students (global) routes
// GET /api/trainer/students - lists all students enrolled in trainer's batches

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const BatchStudent = require('../../models/BatchStudent');
const User = require('../../models/User');

/**
 * GET /api/trainer/students
 * Returns all student enrollments across trainer's batches.
 */
router.get('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    // Find batches owned by trainer
    const batches = await Batch.find({ trainer: req.user.id }).select('_id');
    const batchIds = batches.map(b => b._id);

    if (batchIds.length === 0) {
      // No batches means no students
      return res.json({ success: true, data: [] });
    }

    // Fetch enrollments in those batches
    const enrollments = await BatchStudent.find({ batch: { $in: batchIds } })
      .populate({ path: 'student', select: 'name email role status' })
      .populate({ path: 'batch', select: 'name code' })
      .select('-__v');

    // Map to response shape
    const data = enrollments.map(e => ({
      id: e._id,
      student: {
        id: e.student._id,
        name: e.student.name,
        email: e.student.email,
        role: e.student.role,
        status: e.student.status,
      },
      batch: {
        id: e.batch._id,
        name: e.batch.name,
        code: e.batch.code,
      },
      status: e.status,
      enrolledAt: e.enrolledAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching trainer students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
