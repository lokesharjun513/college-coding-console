// Admin Batch Students (Enrollment) routes

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const User = require('../../models/User');
const BatchStudent = require('../../models/BatchStudent');

/**
 * ENROLL STUDENT
 * POST /api/admin/batches/:batchId/students
 */
router.post('/:batchId/students', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const { studentId } = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student id' });
    }

    // Verify batch exists and is ACTIVE
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    if (batch.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Batch not active' });
    }

    // Verify student exists, role STUDENT, status ACTIVE
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (student.role !== 'STUDENT') {
      return res.status(400).json({ success: false, message: 'User is not a student' });
    }
    if (student.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Student not active' });
    }

    // Create enrollment
    const enrollment = await BatchStudent.create({
      batch: batchId,
      student: studentId,
    });

    // Populate safe student fields
    await enrollment.populate({ path: 'student', select: '-passwordHash' });

    const data = {
      id: enrollment._id,
      batch: enrollment.batch,
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
    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error enrolling student:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Student already enrolled in this batch' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST STUDENTS IN BATCH
 * GET /api/admin/batches/:batchId/students
 */
router.get('/:batchId/students', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { batchId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
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
 * GET SINGLE ENROLLMENT
 * GET /api/admin/batches/:batchId/students/:studentId
 */
router.get('/:batchId/students/:studentId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { batchId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(batchId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch or student id' });
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

/**
 * UPDATE ENROLLMENT STATUS
 * PATCH /api/admin/batches/:batchId/students/:studentId
 */
router.patch('/:batchId/students/:studentId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { batchId, studentId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(batchId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch or student id' });
    }
    const allowedStatus = ['ACTIVE', 'INACTIVE'];
    if (!status || !allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const enrollment = await BatchStudent.findOne({ batch: batchId, student: studentId });
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    enrollment.status = status;
    await enrollment.save();
    await enrollment.populate({ path: 'student', select: '-passwordHash' });
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
    console.error('Error updating enrollment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE ENROLLMENT
 * DELETE /api/admin/batches/:batchId/students/:studentId
 */
router.delete('/:batchId/students/:studentId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { batchId, studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(batchId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch or student id' });
    }
    const result = await BatchStudent.findOneAndDelete({ batch: batchId, student: studentId });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    return res.json({ success: true, data: null });
  } catch (error) {
    console.error('Error deleting enrollment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
