const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const User = require('../../models/User');
const Student = require('../../models/Student');
const BatchStudent = require('../../models/BatchStudent');
const authService = require('../../auth/authService');
const { buildStudentPayload, isValidAcademicBatch } = require('../../utils/academicBatch');

const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL'];
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ['ACTIVE', 'INACTIVE'];

/**
 * Validate a student payload.
 * `requireYears` is true on create (years are part of the intake form) and false
 * on partial updates, so a legacy student with missing years can still be
 * renamed or have their status changed.
 */
function validateStudent(s, { requireYears = true } = {}) {
  if (!s.name || !s.email || !s.rollNumber || !s.department) return 'Missing required fields';

  const startYear = s.academicBatch?.startYear;
  const endYear = s.academicBatch?.endYear;
  if (requireYears && (!startYear || !endYear)) return 'Missing required fields';
  // Only enforce the range when both years are actually supplied.
  if (startYear && endYear && !isValidAcademicBatch(startYear, endYear)) {
    return 'End year must be greater than start year';
  }

  if (!emailRegex.test(s.email.trim().toLowerCase())) return 'Invalid email format';
  if (!DEPARTMENTS.includes(s.department)) return 'Invalid department';
  return null;
}

/** Load the Student document referenced by a Student id or a linked User id. */
async function findStudentByIdOrUserId(id) {
  const byStudentId = await Student.findById(id);
  if (byStudentId) return byStudentId;
  return Student.findOne({ userId: id });
}

/**
 * CREATE STUDENT
 * POST /api/admin/students
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const error = validateStudent(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const normalizedEmail = req.body.email.trim().toLowerCase();
    const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { rollNumber: req.body.rollNumber.trim() }] });
    if (existing) return res.status(409).json({ success: false, message: 'Email or Roll Number already exists' });

    // Credentials must not be derived from public data (the email address).
    // A random initial password is returned once so an admin can distribute it.
    const initialPassword = authService.generateStrongPassword();
    const passwordHash = await authService.hashPassword(initialPassword);

    // Create authentication record (User)
    const user = await User.create({
      name: req.body.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      rollNumber: req.body.rollNumber.trim(),
      department: req.body.department,
      section: req.body.section,
      academicBatch: req.body.academicBatch,
    });

    // Create dedicated Student profile linked to the User
    const student = await Student.create({
      userId: user._id,
      name: user.name,
      email: user.email,
      rollNumber: user.rollNumber,
      startYear: req.body.academicBatch?.startYear,
      endYear: req.body.academicBatch?.endYear,
      department: user.department,
      section: user.section,
    });

    res.status(201).json({
      success: true,
      data: {
        ...buildStudentPayload(student, user),
        // `id` mirrors the User id so legacy callers keep working.
        id: user._id,
        userId: user._id,
        // Shown once at creation time only; never returned by any read route.
        initialPassword,
      },
    });
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST STUDENTS
 * GET /api/admin/students
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (_, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });

    // Join the linked User documents in one query so the response can expose
    // `status` and `userId`. Status lives on User only (single source of truth:
    // requireAuth and batch enrollment both key off it).
    const userIds = students.map((s) => s.userId).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).select('status academicBatch');
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    const data = students.map((student) => buildStudentPayload(student, userById.get(student.userId?.toString())));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Student route error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE STUDENT
 * PATCH /api/admin/students/:id
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const student = await findStudentByIdOrUserId(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    if (req.body.status !== undefined && !STATUSES.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Merge incoming years with the stored ones so a partial year update is
    // validated against the real range rather than skipping the check.
    const incoming = req.body.academicBatch || {};
    const mergedYears = {
      startYear: incoming.startYear ?? student.startYear,
      endYear: incoming.endYear ?? student.endYear,
    };

    // Prepare combined data for validation (User fields are mirrored in Student)
    const updateData = {
      name: req.body.name ?? student.name,
      email: req.body.email ?? student.email,
      rollNumber: req.body.rollNumber ?? student.rollNumber,
      department: req.body.department ?? student.department,
      section: req.body.section ?? student.section,
      academicBatch: mergedYears,
    };
    // Partial updates: years stay optional so a legacy record without them can
    // still be updated.
    const error = validateStudent(updateData, { requireYears: false });
    if (error) return res.status(400).json({ success: false, message: error });

    // Update only the fields that actually changed. Using updateOne instead of
    // document.save() means a legacy record with missing required years can
    // still be updated; validateStudent above covers the changed fields, and
    // the unique indexes still reject duplicate email / roll number.
    const changed = {};
    if (req.body.name) { student.name = req.body.name.trim(); changed.name = student.name; }
    if (req.body.email) { student.email = req.body.email.trim().toLowerCase(); changed.email = student.email; }
    if (req.body.rollNumber) { student.rollNumber = req.body.rollNumber.trim(); changed.rollNumber = student.rollNumber; }
    if (req.body.department) { student.department = req.body.department; changed.department = student.department; }
    if (req.body.section !== undefined) { student.section = req.body.section; changed.section = student.section; }
    if (incoming.startYear !== undefined) { student.startYear = mergedYears.startYear; changed.startYear = mergedYears.startYear; }
    if (incoming.endYear !== undefined) { student.endYear = mergedYears.endYear; changed.endYear = mergedYears.endYear; }

    if (Object.keys(changed).length > 0) {
      await Student.updateOne({ _id: student._id }, { $set: changed });
    }

    // Sync corresponding User fields, including status.
    const user = await User.findById(student.userId);
    if (user) {
      if (req.body.name) user.name = req.body.name.trim();
      if (req.body.email) user.email = req.body.email.trim().toLowerCase();
      if (req.body.rollNumber) user.rollNumber = req.body.rollNumber.trim();
      if (req.body.department) user.department = req.body.department;
      if (req.body.section !== undefined) user.section = req.body.section;
      if (incoming.startYear !== undefined || incoming.endYear !== undefined) {
        user.academicBatch = mergedYears;
      }
      // Status is owned by User; Student mirrors it only through this join.
      if (req.body.status !== undefined) user.status = req.body.status;
      await user.save();
    }

    res.json({ success: true, data: buildStudentPayload(student, user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email or Roll Number already exists' });
    }
    console.error('Student route error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE STUDENT
 * DELETE /api/admin/students/:id
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    // Delete Student profile and linked User account
    const student = await findStudentByIdOrUserId(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Check if enrolled in any batch (using the linked User id)
    const enrollment = await BatchStudent.findOne({ student: student.userId });
    if (enrollment) return res.status(409).json({ success: false, message: 'Student enrolled in one or more batches and cannot be deleted' });

    // Delete User account first
    await User.deleteOne({ _id: student.userId });
    // Then delete Student profile
    await student.deleteOne();
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Student route error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * BULK UPLOAD STUDENTS
 * POST /api/admin/students/bulk
 */
router.post('/bulk', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0 || students.length > 500) return res.status(400).json({ success: false, message: 'Invalid data or limit exceeded (max 500)' });

    const errors = [];
    const validStudents = [];
    const generatedCredentials = [];

    for (const [index, s] of students.entries()) {
      const error = validateStudent(s);
      if (error) {
        errors.push({ row: index + 1, error });
        continue;
      }

      const normalizedEmail = s.email.trim().toLowerCase();
      const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { rollNumber: s.rollNumber.trim() }] });
      if (existing) {
        errors.push({ row: index + 1, error: 'Email or Roll Number already exists' });
        continue;
      }

      try {
        // Credentials must not be derived from public data (the email address).
        const initialPassword = authService.generateStrongPassword();
        const passwordHash = await authService.hashPassword(initialPassword);
        generatedCredentials.push({ email: normalizedEmail, initialPassword });
        // Create authentication record (User)
        const user = await User.create({
          name: s.name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          rollNumber: s.rollNumber.trim(),
          department: s.department,
          section: s.section,
          academicBatch: s.academicBatch,
        });

        // Create dedicated Student profile linked to the User
        const student = await Student.create({
          userId: user._id,
          name: user.name,
          email: user.email,
          rollNumber: user.rollNumber,
          startYear: s.academicBatch?.startYear,
          endYear: s.academicBatch?.endYear,
          department: user.department,
          section: user.section,
        });

        validStudents.push({
          ...buildStudentPayload(student, user),
          id: user._id,
          userId: user._id,
        });
      } catch (err) {
        errors.push({ row: index + 1, error: 'Failed to create student record' });
      }
    }

    res.json({
      success: true,
      created: validStudents.length,
      errors,
      // Returned once, immediately after creation, so the initial passwords can
      // be distributed. Never persisted in plaintext, never returned on read.
      credentials: generatedCredentials,
    });
  } catch (error) {
    console.error('Error bulk uploading students:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DOWNLOAD STUDENT TEMPLATE
 * GET /api/admin/students/template
 */
router.get('/template', requireAuth, requireRole('ADMIN'), (_, res) => {
  const csvContent = 'name,email,rollNumber,department,section,academicBatchStart,academicBatchEnd\nJohn Doe,john@example.com,S001,CSE,A,2023,2027\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=student_template.csv');
  res.send(csvContent);
});

module.exports = router;
