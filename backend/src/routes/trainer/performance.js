// backend/src/routes/trainer/performance.js
const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const BatchStudent = require('../../models/BatchStudent');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const User = require('../../models/User');

/**
 * GET /api/trainer/performance/batch/:batchId
 * Returns aggregated performance metrics for a batch.
 */
router.get('/batch/:batchId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    // Ensure trainer owns the batch
    if (batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const totalStudents = await BatchStudent.countDocuments({ batch: batchId });
    const activeStudents = await BatchStudent.countDocuments({ batch: batchId, status: 'ACTIVE' });
    const problems = await Problem.find({ batch: batchId }).select('_id');
    const problemIds = problems.map(p => p._id);
    const totalProblems = problemIds.length;
    const submissions = await Submission.find({ problem: { $in: problemIds } });
    const totalSubmissions = submissions.length;
    const solvedProblemIds = new Set();
    submissions.forEach(s => {
      if (s.verdict === 'ACCEPTED') solvedProblemIds.add(s.problem.toString());
    });
    const solvedProblems = solvedProblemIds.size;
    const progress = totalProblems > 0 ? Math.round((solvedProblems / totalProblems) * 100) : 0;
    const data = {
      batchId,
      totalStudents,
      activeStudents,
      totalProblems,
      totalSubmissions,
      solvedProblems,
      progress,
    };
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching batch performance:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/trainer/performance/student/:studentId
 * Returns performance metrics for a student within an optional batch.
 */
router.get('/student/:studentId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { batchId } = req.query; // optional filter by batch
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student id' });
    }
    const student = await User.findById(studentId);
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    // Verify trainer has access to the student via a common batch
    const batchFilter = batchId ? { batch: batchId } : {};
    const enrollment = await BatchStudent.findOne({ student: studentId, ...batchFilter }).populate('batch');
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    // Ensure the batch belongs to this trainer
    if (enrollment.batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const problemFilter = batchId ? { batch: batchId } : {};
    const problems = await Problem.find(problemFilter).select('_id');
    const problemIds = problems.map(p => p._id);
    const submissions = await Submission.find({ student: studentId, problem: { $in: problemIds } });
    const attemptedProblems = new Set();
    const solvedProblems = new Set();
    submissions.forEach(s => {
      attemptedProblems.add(s.problem.toString());
      if (s.verdict === 'ACCEPTED') solvedProblems.add(s.problem.toString());
    });
    const data = {
      studentId,
      name: student.name,
      email: student.email,
      attemptedCount: attemptedProblems.size,
      solvedCount: solvedProblems.size,
      totalSubmissions: submissions.length,
    };
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching student performance:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/trainer/performance/problem/:problemId
 * Returns performance metrics for a problem.
 */
router.get('/problem/:problemId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { problemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }
    const problem = await Problem.findById(problemId).populate('batch');
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    // Ensure trainer owns the batch of the problem
    if (problem.batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const submissions = await Submission.find({ problem: problemId });
    const totalSubmissions = submissions.length;
    const solvedCount = submissions.filter(s => s.verdict === 'ACCEPTED').length;
    const studentMap = {};
    submissions.forEach(s => {
      const sid = s.student.toString();
      if (!studentMap[sid]) studentMap[sid] = { attempts: 0, solved: false };
      studentMap[sid].attempts += 1;
      if (s.verdict === 'ACCEPTED') studentMap[sid].solved = true;
    });
    const studentProgress = Object.entries(studentMap).map(([id, info]) => ({ id, ...info }));
    const data = {
      problemId,
      totalSubmissions,
      solvedCount,
      studentProgress,
    };
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching problem performance:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;