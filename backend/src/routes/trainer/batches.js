// Trainer Batch Management routes

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const BatchStudent = require('../../models/BatchStudent');
const User = require('../../models/User');

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

    if (!batch.trainer) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) {

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

    if (!batch.trainer) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) {

      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const enrollments = await BatchStudent.find({ batch: batchId })
      .populate({ path: 'student', select: '-passwordHash' })
      .select('-__v');

    const data = enrollments.map(e => ({
      id: e._id,
      student: e.student ? {
        id: e.student._id,
        name: e.student.name,
        email: e.student.email,
        role: e.student.role,
        status: e.student.status,
      } : null,
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

    if (!batch.trainer) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) {

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

/**
 * GET AVAILABLE STUDENTS FOR A BATCH
 * GET /api/trainer/batches/:batchId/students/available
 */
router.get('/:batchId/students/available', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const { search } = req.query;

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }

    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Find already enrolled student IDs
    const existingEnrollments = await BatchStudent.find({ batch: batchId }).select('student');
    const enrolledStudentIds = existingEnrollments.map(e => e.student);

    // Build query for available students
    const query = {
      role: 'STUDENT',
      status: 'ACTIVE',
      _id: { $nin: enrolledStudentIds },
    };

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { rollNumber: searchRegex },
      ];
    }

    const students = await User.find(query)
      .select('name email rollNumber role status createdAt updatedAt')
      .limit(50);

    const data = students.map(s => ({
      id: s._id,
      name: s.name,
      email: s.email,
      rollNumber: s.rollNumber,
      role: s.role,
      status: s.status,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing available students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * BULK UNENROLL STUDENTS FROM BATCH
 * DELETE /api/trainer/batches/:batchId/students
 */
router.delete('/:batchId/students', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const { studentIds, studentId } = req.body;

    const idsToRemove = studentIds && Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);
    if (idsToRemove.length === 0) {
      return res.status(400).json({ success: false, message: 'No students provided for removal' });
    }

    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await BatchStudent.deleteMany({
      batch: batchId,
      student: { $in: idsToRemove },
    });

    return res.json({ success: true, data: null, message: 'Students removed successfully' });
  } catch (error) {
    console.error('Error bulk unenrolling students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/trainer/batches/:batchId/students
	router.post('/:batchId/students', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const { studentId, studentIds } = req.body;

    const idsToEnroll = studentIds && Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);
    if (idsToEnroll.length === 0) return res.status(400).json({ success: false, message: 'No students provided' });

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) return res.status(403).json({ success: false, message: 'Access denied' });

    // Validate students exist and are students
    const students = await User.find({ _id: { $in: idsToEnroll }, role: 'STUDENT', status: 'ACTIVE' });
    if (students.length !== idsToEnroll.length) return res.status(400).json({ success: false, message: 'Some students not found or invalid' });

    const enrollments = idsToEnroll.map(id => ({ batch: batchId, student: id }));

    // Bulk insert with error handling for duplicates
    try {
      await BatchStudent.insertMany(enrollments, { ordered: false });
    } catch (err) {
      if (err.code !== 11000) throw err;
      // For duplicates, we just continue (or return partial success)
    }

    return res.status(201).json({ success: true, message: 'Students enrolled successfully' });
  } catch (error) {
    console.error('Error enrolling students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/trainer/batches/:batchId/students/:studentId
router.patch('/:batchId/students/:studentId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId, studentId } = req.params;
    const { status } = req.body;

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) return res.status(403).json({ success: false, message: 'Access denied' });

    const enrollment = await BatchStudent.findOne({ batch: batchId, student: studentId });
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    enrollment.status = status;
    await enrollment.save();
    return res.json({ success: true, data: enrollment });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/trainer/batches/:batchId/students/:studentId
router.delete('/:batchId/students/:studentId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId, studentId } = req.params;

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) return res.status(403).json({ success: false, message: 'Access denied' });

    const result = await BatchStudent.findOneAndDelete({ batch: batchId, student: studentId });
    if (!result) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    return res.json({ success: true, data: null });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/trainer/batches/:batchId/students/available
router.get('/:batchId/students/available', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const { search } = req.query;

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) return res.status(403).json({ success: false, message: 'Access denied' });

    // Get already enrolled student IDs
    const enrolled = await BatchStudent.find({ batch: batchId }).select('student');
    const enrolledIds = enrolled.map(e => e.student);

    // Build query: active students not already enrolled
    const query = { role: 'STUDENT', status: 'ACTIVE', _id: { $nin: enrolledIds } };

    // Search by name, email, or rollNumber
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { rollNumber: searchRegex },
      ];
    }

    const students = await User.find(query)
      .select('name email rollNumber')
      .sort({ name: 1 })
      .limit(100);

    return res.json({
      success: true,
      data: students.map(s => ({
        id: s._id,
        name: s.name,
        email: s.email,
        rollNumber: s.rollNumber || null,
      })),
    });
  } catch (error) {
    console.error('Error fetching available students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/trainer/batches/:batchId/students
router.delete('/:batchId/students', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No students provided' });
    }

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    const trainerId = batch.trainer._id ? batch.trainer._id.toString() : batch.trainer.toString();
    if (trainerId !== req.user.id.toString()) return res.status(403).json({ success: false, message: 'Access denied' });

    const result = await BatchStudent.deleteMany({ batch: batchId, student: { $in: studentIds } });

    return res.json({
      success: true,
      data: { deleted: result.deletedCount },
    });
  } catch (error) {
    console.error('Error bulk unenrolling students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
