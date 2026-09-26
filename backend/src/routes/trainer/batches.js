// Trainer Batch Management routes

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const BatchStudent = require('../../models/BatchStudent');

/**
 * LIST TRAINER'S BATCHES
 * GET /api/trainer/batches
 */
router.get('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const batches = await Batch.find({ trainer: req.user.id })
      .populate({ path: 'trainer', select: '-passwordHash' })
      .select('-__v');

    const studentCounts = await BatchStudent.aggregate([
      {
        $group: {
          _id: '$batch',
          count: { $sum: 1 }
        }
      }
    ]);

    const countMap = {};
    studentCounts.forEach(item => {
      countMap[item._id.toString()] = item.count;
    });

    const data = batches.map(b => ({
      id: b._id,
      name: b.name,
      code: b.code,
      description: b.description,
      status: b.status,
      startDate: b.startDate,
      endDate: b.endDate,
      trainer: {
        id: b.trainer._id,
        name: b.trainer.name,
        email: b.trainer.email,
        role: b.trainer.role,
        status: b.trainer.status,
      },
      studentCount: countMap[b._id.toString()] || 0,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing trainer batches:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE TRAINER BATCH
 * GET /api/trainer/batches/:id
 */
router.get('/:id', requireAuth, requireRole('TRAINER'), async (req, res) => {   try {
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

     const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString(); if (trainerId !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const studentCount = await BatchStudent.countDocuments({ batch: id });

    const data = {
      id: batch._id,
      name: batch.name,
      code: batch.code,
      description: batch.description,
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      trainer: {
        id: batch.trainer._id,
        name: batch.trainer.name,
        email: batch.trainer.email,
        role: batch.trainer.role,
        status: batch.trainer.status,
      },
      studentCount,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting trainer batch:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST STUDENTS IN TRAINER'S BATCH
 * GET /api/trainer/batches/:batchId/students
 */
router.get('/:batchId/students', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }

    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

     const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString(); if (trainerId !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const enrollments = await BatchStudent.find({ batch: batchId })
      .populate({ path: 'student', select: '-passwordHash' })
      .select('-__v');

    const data = enrollments.map(e => ({
      id: e._id,
      student: {
        id: e.student._id,
        name: e.student.name,
        email: e.student.email,
        role: e.student.role,
        status: e.student.status,
      },
      status: e.status,
      enrolledAt: e.enrolledAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing batch students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE STUDENT ENROLLMENT IN TRAINER'S BATCH
 * GET /api/trainer/batches/:batchId/students/:studentId
 */
router.get('/:batchId/students/:studentId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId, studentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(batchId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch or student id' });
    }

    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

     const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString(); if (trainerId !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const enrollment = await BatchStudent.findOne({ batch: batchId, student: studentId })
      .populate({ path: 'student', select: '-passwordHash' })
      .select('-__v');

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    const data = {
      id: enrollment._id,
      student: {
        id: enrollment.student._id,
        name: enrollment.student.name,
        email: enrollment.student.email,
        role: enrollment.student.role,
        status: enrollment.student.status,
      },
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      createdAt: enrollment.createdAt,
      updatedAt: enrollment.updatedAt,
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting enrollment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
