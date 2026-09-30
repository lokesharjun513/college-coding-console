const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Batch = require('../../models/Batch');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');

/**
 * GET /api/admin/reports/overview
 * Returns aggregated platform metrics
 */
router.get('/overview', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const [
      totalUsers,
      totalActiveUsers,
      totalTrainers,
      totalStudents,
      totalBatches,
      activeBatches,
      totalProblems,
      publishedProblems,
      totalSubmissions,
      acceptedSubmissions,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'ACTIVE' }),
      User.countDocuments({ role: 'TRAINER' }),
      User.countDocuments({ role: 'STUDENT' }),
      Batch.countDocuments(),
      Batch.countDocuments({ status: 'ACTIVE' }),
      Problem.countDocuments(),
      Problem.countDocuments({ status: 'PUBLISHED' }),
      Submission.countDocuments(),
      Submission.countDocuments({ verdict: 'ACCEPTED' }),
    ]);

    const data = {
      totalUsers,
      totalActiveUsers,
      totalTrainers,
      totalStudents,
      totalBatches,
      activeBatches,
      totalProblems,
      publishedProblems,
      totalSubmissions,
      acceptedSubmissions,
    };
    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error fetching reports:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
