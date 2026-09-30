const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Submission = require('../../models/Submission');
const User = require('../../models/User');
const Problem = require('../../models/Problem');

/**
 * GET /api/admin/submissions
 * List submissions with optional filters and pagination.
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      studentId,
      problemId,
      language,
      verdict,
      createdAfter,
      createdBefore,
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const query = {};
    if (studentId) {
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid studentId' });
      }
      query.student = studentId;
    }
    if (problemId) {
      if (!mongoose.Types.ObjectId.isValid(problemId)) {
        return res.status(400).json({ success: false, message: 'Invalid problemId' });
      }
      query.problem = problemId;
    }
    if (language) {
      const allowedLanguages = ['c', 'cpp', 'java', 'python', 'javascript'];
      if (!allowedLanguages.includes(language)) {
        return res.status(400).json({ success: false, message: 'Invalid language' });
      }
      query.language = language;
    }
    if (verdict) {
      const allowedVerdicts = [
        'ACCEPTED',
        'WRONG_ANSWER',
        'COMPILATION_ERROR',
        'RUNTIME_ERROR',
        'TIME_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED',
        'EXECUTION_ERROR',
      ];
      if (!allowedVerdicts.includes(verdict)) {
        return res.status(400).json({ success: false, message: 'Invalid verdict' });
      }
      query.verdict = verdict;
    }
    if (createdAfter) {
      const afterDate = new Date(createdAfter);
      if (isNaN(afterDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid createdAfter date' });
      }
      query.createdAt = { $gte: afterDate };
    }
    if (createdBefore) {
      const beforeDate = new Date(createdBefore);
      if (isNaN(beforeDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid createdBefore date' });
      }
      query.createdAt = query.createdAt || {};
      query.createdAt.$lte = beforeDate;
    }

    const total = await Submission.countDocuments(query);
    const submissions = await Submission.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .select('student problem language verdict runtime memory createdAt updatedAt')
      .populate('student', '_id name email')
      .populate('problem', '_id title slug')
      .lean();

    const data = submissions.map(sub => ({
      id: sub._id,
      student: sub.student ? { id: sub.student._id, name: sub.student.name, email: sub.student.email } : null,
      problem: sub.problem ? { id: sub.problem._id, title: sub.problem.title, slug: sub.problem.slug } : null,
      language: sub.language,
      verdict: sub.verdict,
      runtime: sub.runtime,
      memory: sub.memory,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    }));

    const totalPages = Math.ceil(total / limitNum);
    return res.json({
      success: true,
      data,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing submissions:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/submissions/:id
 * Retrieve a single submission with full details.
 */
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid submission id' });
  }
  try {
    const submission = await Submission.findById(id)
      .populate('student', '_id name email')
      .populate('problem', '_id title slug')
      .lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    const data = {
      id: submission._id,
      student: submission.student ? { id: submission.student._id, name: submission.student.name, email: submission.student.email } : null,
      problem: submission.problem ? { id: submission.problem._id, title: submission.problem.title, slug: submission.problem.slug } : null,
      language: submission.language,
      code: submission.code,
      verdict: submission.verdict,
      testResults: submission.testResults,
      executionResult: submission.executionResult,
      runtime: submission.runtime,
      memory: submission.memory,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    };
    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error fetching submission:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/submissions/:id
 * Delete a submission (hard delete).
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid submission id' });
  }
  try {
    const result = await Submission.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error deleting submission:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
