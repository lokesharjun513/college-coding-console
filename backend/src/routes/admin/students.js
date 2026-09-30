const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const User = require('../../models/User');
const BatchStudent = require('../../models/BatchStudent');
const authService = require('../../auth/authService');
const { generatePasswordFromEmail } = authService;

const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL'];
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStudent(s) {
  if (!s.name || !s.email || !s.rollNumber || !s.department || !s.academicBatch?.startYear || !s.academicBatch?.endYear) return 'Missing required fields';
  if (!emailRegex.test(s.email.trim().toLowerCase())) return 'Invalid email format';
  if (s.academicBatch.endYear <= s.academicBatch.startYear) return 'End year must be greater than start year';
  if (!DEPARTMENTS.includes(s.department)) return 'Invalid department';
  return null;
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

    const passwordHash = await authService.hashPassword(generatePasswordFromEmail(normalizedEmail));

    const student = await User.create({
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

    res.status(201).json({ success: true, data: { id: student._id, name: student.name, email: student.email, rollNumber: student.rollNumber } });
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST STUDENTS
 * GET /api/admin/students
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const students = await User.find({ role: 'STUDENT' }).select('-passwordHash');
    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE STUDENT
 * PATCH /api/admin/students/:id
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'STUDENT' });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Validate update data
    const updateData = { ...student.toObject(), ...req.body };
    const error = validateStudent(updateData);
    if (error) return res.status(400).json({ success: false, message: error });

    if (req.body.name) student.name = req.body.name.trim();
    if (req.body.email) student.email = req.body.email.trim().toLowerCase();
    if (req.body.rollNumber) student.rollNumber = req.body.rollNumber.trim();
    if (req.body.department) student.department = req.body.department;
    if (req.body.section) student.section = req.body.section;
    if (req.body.status) student.status = req.body.status;
    if (req.body.academicBatch) student.academicBatch = req.body.academicBatch;

    await student.save();
    res.json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE STUDENT
 * DELETE /api/admin/students/:id
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'STUDENT' });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Check if enrolled in any batch
    const enrollment = await BatchStudent.findOne({ student: req.params.id });
    if (enrollment) return res.status(409).json({ success: false, message: 'Student enrolled in one or more batches and cannot be deleted' });

    await student.deleteOne();
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
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

      const passwordHash = await authService.hashPassword(generatePasswordFromEmail(normalizedEmail));
      validStudents.push({
        ...s,
        name: s.name.trim(),
        email: normalizedEmail,
        rollNumber: s.rollNumber.trim(),
        role: 'STUDENT',
        passwordHash,
        status: 'ACTIVE',
      });
    }

    if (validStudents.length > 0) await User.insertMany(validStudents);

    res.json({ success: true, created: validStudents.length, errors });
  } catch (error) {
    console.error('Error bulk uploading students:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DOWNLOAD STUDENT TEMPLATE
 * GET /api/admin/students/template
 */
router.get('/template', requireAuth, requireRole('ADMIN'), (req, res) => {
  const csvContent = 'name,email,rollNumber,department,section,academicBatchStart,academicBatchEnd\nJohn Doe,john@example.com,S001,CSE,A,2023,2027\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=student_template.csv');
  res.send(csvContent);
});

module.exports = router;
