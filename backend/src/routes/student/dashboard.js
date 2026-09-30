const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const User = require('../../models/User');
const BatchStudent = require('../../models/BatchStudent');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');

router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // 1. Batch info
    const enrollment = await BatchStudent.findOne({ student: studentId }).populate('batch');
    const batch = enrollment ? {
      id: enrollment.batch._id,
      name: enrollment.batch.name,
      code: enrollment.batch.code,
      status: enrollment.batch.status,
    } : null;

    // 2. Problems
    const batchId = enrollment ? enrollment.batch._id : null;
    const problemQuery = batchId ?
        { $or: [{ scope: 'GLOBAL', status: 'PUBLISHED' }, { batch: batchId, status: 'PUBLISHED' }] } :
        { scope: 'GLOBAL', status: 'PUBLISHED' };

    const problems = await Problem.find(problemQuery).select('_id');
    const problemIds = problems.map(p => p._id);
    const totalProblems = problemIds.length;

    // 3. Submissions & Metrics
    const submissions = await Submission.find({ student: studentId }).populate('problem');
    const attemptedProblemIds = new Set();
    const solvedProblemIds = new Set();

    submissions.forEach(sub => {
      if (sub.problem) {
        attemptedProblemIds.add(sub.problem._id.toString());
        if (sub.verdict === 'ACCEPTED') solvedProblemIds.add(sub.problem._id.toString());
      }
    });

    const attemptedProblems = attemptedProblemIds.size;
    const solvedProblems = solvedProblemIds.size;
    const accuracy = attemptedProblems > 0 ? Math.round((solvedProblems / attemptedProblems) * 100) : 0;

    // 4. Recent submissions
    const recentSubmissions = submissions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map(sub => ({
        id: sub._id,
        problem: sub.problem ? sub.problem.title : 'Deleted Problem',
        verdict: sub.verdict,
        createdAt: sub.createdAt
      }));

    return res.json({
      success: true,
      data: {
        student: {
          id: student._id,
          name: student.name,
          email: student.email,
          rollNumber: student.rollNumber,
          department: student.department,
          section: student.section,
          academicBatch: student.academicBatch
        },
        batch,
        metrics: {
          totalProblems,
          attemptedProblems,
          solvedProblems,
          accuracy
        },
        recentSubmissions
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
