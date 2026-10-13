// Admin Batch Students (Enrollment) routes

const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const User = require('../../models/User');
const Student = require('../../models/Student');
const BatchStudent = require('../../models/BatchStudent');

/**
 * Resolve a client-supplied student identifier to the linked User _id.
 *
 * The enrollment selector is populated from GET /api/admin/students, which
 * returns Student documents carrying BOTH `studentId` (Student._id) and
 * `userId` (User._id). BatchStudent.student, authentication and submissions all
 * key off the User id, so a Student document id must be mapped through
 * Student.userId rather than stored directly.
 *
 * Accepts either id, so existing clients keep working.
 */
async function resolveEnrollmentUserId(id) {
  const user = await User.findById(id);
  if (user) return user;
  const student = await Student.findById(id).select('userId').lean();
  return student?.userId ?? null;
}

/**
 * Shared shape for the `student` block of every enrollment response, so the
 * enrolled table, the single-enrollment view and the create response can never
 * disagree. Populated from the linked User document.
 */
function enrolledStudentPayload(user) {
  if (!user) return null;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    rollNumber: user.rollNumber || null,
    department: user.department || null,
    section: user.section || null,
    academicBatch: user.academicBatch || null,
  };
}

function enrollmentPayload(enrollment) {
  return {
    id: enrollment._id,
    batch: enrollment.batch,
    student: enrolledStudentPayload(enrollment.student),
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt,
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.updatedAt,
  };
}

/**
 * ENROLL STUDENT
 * POST /api/admin/batches/:batchId/students
 */
router.post('/students', requireAuth, requireRole('ADMIN'), async (req, res) => {
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

    // Verify student exists, role STUDENT, status ACTIVE.
    // `studentId` may be either the User id or the Student profile id.
    const resolvedUserId = await resolveEnrollmentUserId(studentId);
    if (!resolvedUserId) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const student = await User.findById(resolvedUserId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (student.role !== 'STUDENT') {
      return res.status(400).json({ success: false, message: 'User is not a student' });
    }
    if (student.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Student not active' });
    }

    // Create enrollment — always keyed by the linked User id.
    const enrollment = await BatchStudent.create({
      batch: batchId,
      student: resolvedUserId,
    });

    // Populate safe student fields
    await enrollment.populate({ path: 'student', select: '-passwordHash' });

    return res.status(201).json({ success: true, data: enrollmentPayload(enrollment) });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error enrolling student:', error);
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
router.get('/students', requireAuth, requireRole('ADMIN'), async (req, res) => {
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
    return res.json({ success: true, data: enrollments.map(enrollmentPayload) });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing batch students:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE ENROLLMENT
 * GET /api/admin/batches/:batchId/students/:studentId
 */
router.get('/students/:studentId', requireAuth, requireRole('ADMIN'), async (req, res) => {
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
    return res.json({ success: true, data: enrollmentPayload(enrollment) });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error getting enrollment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE ENROLLMENT STATUS
 * PATCH /api/admin/batches/:batchId/students/:studentId
 */
router.patch('/students/:studentId', requireAuth, requireRole('ADMIN'), async (req, res) => {
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
    return res.json({ success: true, data: enrollmentPayload(enrollment) });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error updating enrollment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE ENROLLMENT
 * DELETE /api/admin/batches/:batchId/students/:studentId
 */
router.delete('/students/:studentId', requireAuth, requireRole('ADMIN'), async (req, res) => {
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
    if (process.env.NODE_ENV !== 'test') console.error('Error deleting enrollment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
