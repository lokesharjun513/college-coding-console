const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Batch = require('../../models/Batch');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const BatchStudent = require('../../models/BatchStudent');

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
    const response = { success: true, data };
    console.log('[API DEBUG] reports overview response:', response);
    return res.json(response);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error fetching reports:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/reports/submissions
 * Returns date-filtered submission statistics
 */
router.get('/submissions', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const range = req.query.range || '7d';
    const rangeInDays = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[range] || 7;

    // Date boundaries in UTC
    const now = new Date();
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const startDate = new Date(endDate.getTime() - rangeInDays * 24 * 60 * 60 * 1000);
    startDate.setUTCHours(0, 0, 0, 0);

    // Get submission statistics for the date range
    const [
      totalSubmissions,
      acceptedSubmissions,
      submissionTrend,
      languageStats,
      verdictStats
    ] = await Promise.all([
      Submission.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      Submission.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        verdict: 'ACCEPTED'
      }),
      // Daily submission trend
      Submission.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
            accepted: {
              $sum: { $cond: [{ $eq: ['$verdict', 'ACCEPTED'] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Language distribution
      Submission.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: '$language',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      // Verdict distribution
      Submission.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: '$verdict',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);

    // Calculate acceptance rate
    const acceptanceRate = totalSubmissions > 0
      ? (acceptedSubmissions / totalSubmissions) * 100
      : 0;

    const data = {
      range,
      totalSubmissions,
      acceptedSubmissions,
      acceptanceRate: Number(acceptanceRate.toFixed(2)),
      submissionTrend,
      languageStats,
      verdictStats
    };

    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error fetching submission reports:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/reports/batches
 * Returns batch-wise enrollment and submission statistics
 */
router.get('/batches', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const range = req.query.range || '30d';
    const rangeInDays = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[range] || 30;

    // Date boundaries in UTC
    const now = new Date();
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const startDate = new Date(endDate.getTime() - rangeInDays * 24 * 60 * 60 * 1000);
    startDate.setUTCHours(0, 0, 0, 0);

    // Get batch statistics with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get batches with enrollment and submission counts
    const batches = await Batch.aggregate([
      {
        $lookup: {
          from: 'batchstudents',
          localField: '_id',
          foreignField: 'batch',
          as: 'enrollments'
        }
      },
      {
        $lookup: {
          from: 'submissions',
          let: { batchId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  and: [
                    { $gte: ['$createdAt', startDate] },
                    { $lte: ['$createdAt', endDate] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: '$problem',
                count: { $sum: 1 },
                accepted: {
                  $sum: { $cond: [{ $eq: ['$verdict', 'ACCEPTED'] }, 1, 0] }
                }
              }
            }
          ],
          as: 'submissionStats'
        }
      },
      {
        $addFields: {
          totalStudents: { $size: '$enrollments' },
          activeStudents: {
            $size: {
              $filter: {
                input: '$enrollments',
                as: 'enrollment',
                cond: { $eq: ['$$enrollment.status', 'ACTIVE'] }
              }
            }
          },
          totalSubmissions: { $sum: '$submissionStats.count' },
          acceptedSubmissions: { $sum: '$submissionStats.accepted' }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          status: 1,
          startDate: 1,
          endDate: 1,
          totalStudents: 1,
          activeStudents: 1,
          totalSubmissions: 1,
          acceptedSubmissions: 1
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Get total count for pagination
    const totalBatches = await Batch.countDocuments();

    const data = {
      range,
      batches,
      pagination: {
        page,
        limit,
        total: totalBatches,
        pages: Math.ceil(totalBatches / limit)
      }
    };

    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error fetching batch reports:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/reports/students
 * Returns student performance summaries
 */
router.get('/students', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const range = req.query.range || '30d';
    const rangeInDays = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[range] || 30;

    // Date boundaries in UTC
    const now = new Date();
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const startDate = new Date(endDate.getTime() - rangeInDays * 24 * 60 * 60 * 1000);
    startDate.setUTCHours(0, 0, 0, 0);

    // Get student performance with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get students with performance stats
    const students = await User.aggregate([
      { $match: { role: 'STUDENT' } },
      {
        $lookup: {
          from: 'submissions',
          let: { studentId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  and: [
                    { $eq: ['$student', '$$studentId'] },
                    { $gte: ['$createdAt', startDate] },
                    { $lte: ['$createdAt', endDate] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: '$student',
                totalSubmissions: { $sum: 1 },
                acceptedSubmissions: {
                  $sum: { $cond: [{ $eq: ['$verdict', 'ACCEPTED'] }, 1, 0] }
                },
                problemsSolved: { $addToSet: '$problem' },
                languagesUsed: { $addToSet: '$language' },
                avgRuntime: { $avg: '$runtime' }
              }
            }
          ],
          as: 'submissions'
        }
      },
      {
        $addFields: {
          totalSubmissions: { $arrayElemAt: ['$submissions.totalSubmissions', 0] },
          acceptedSubmissions: { $arrayElemAt: ['$submissions.acceptedSubmissions', 0] },
          problemsSolved: { $size: { $arrayElemAt: ['$submissions.problemsSolved', 0] } },
          languagesUsed: { $size: { $arrayElemAt: ['$submissions.languagesUsed', 0] } },
          acceptanceRate: {
            $cond: [
              { $gt: [{ $arrayElemAt: ['$submissions.totalSubmissions', 0] }, 0] },
              {
                $multiply: [
                  { $divide: [
                    { $arrayElemAt: ['$submissions.acceptedSubmissions', 0] },
                    { $arrayElemAt: ['$submissions.totalSubmissions', 0] }
                  ]},
                  100
                ]
              },
              0
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          department: 1,
          totalSubmissions: 1,
          acceptedSubmissions: 1,
          problemsSolved: 1,
          languagesUsed: 1,
          acceptanceRate: { $round: ['$acceptanceRate', 2] }
        }
      },
      { $sort: { problemsSolved: -1, totalSubmissions: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Get total count for pagination
    const totalStudents = await User.countDocuments({ role: 'STUDENT' });

    const data = {
      range,
      students,
      pagination: {
        page,
        limit,
        total: totalStudents,
        pages: Math.ceil(totalStudents / limit)
      }
    };

    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error fetching student reports:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/reports/problems
 * Returns problem-wise submission and acceptance statistics
 */
router.get('/problems', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const range = req.query.range || '30d';
    const rangeInDays = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[range] || 30;

    // Date boundaries in UTC
    const now = new Date();
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const startDate = new Date(endDate.getTime() - rangeInDays * 24 * 60 * 60 * 1000);
    startDate.setUTCHours(0, 0, 0, 0);

    // Get problem statistics with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get problems with submission stats
    const problems = await Problem.aggregate([
      {
        $lookup: {
          from: 'submissions',
          let: { problemId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  and: [
                    { $eq: ['$problem', '$$problemId'] },
                    { $gte: ['$createdAt', startDate] },
                    { $lte: ['$createdAt', endDate] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: '$problem',
                totalSubmissions: { $sum: 1 },
                acceptedSubmissions: {
                  $sum: { $cond: [{ $eq: ['$verdict', 'ACCEPTED'] }, 1, 0] }
                },
                avgRuntime: { $avg: '$runtime' },
                languageDistribution: {
                  $push: '$language'
                }
              }
            }
          ],
          as: 'submissions'
        }
      },
      {
        $addFields: {
          totalSubmissions: { $arrayElemAt: ['$submissions.totalSubmissions', 0] },
          acceptedSubmissions: { $arrayElemAt: ['$submissions.acceptedSubmissions', 0] },
          acceptanceRate: {
            $cond: [
              { $gt: [{ $arrayElemAt: ['$submissions.totalSubmissions', 0] }, 0] },
              {
                $multiply: [
                  { $divide: [
                    { $arrayElemAt: ['$submissions.acceptedSubmissions', 0] },
                    { $arrayElemAt: ['$submissions.totalSubmissions', 0] }
                  ]},
                  100
                ]
              },
              0
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          slug: 1,
          difficulty: 1,
          status: 1,
          totalSubmissions: 1,
          acceptedSubmissions: 1,
          acceptanceRate: { $round: ['$acceptanceRate', 2] },
          avgRuntime: { $round: [{ $arrayElemAt: ['$submissions.avgRuntime', 0] }, 2] }
        }
      },
      { $sort: { totalSubmissions: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Get total count for pagination
    const totalProblems = await Problem.countDocuments();

    const data = {
      range,
      problems,
      pagination: {
        page,
        limit,
        total: totalProblems,
        pages: Math.ceil(totalProblems / limit)
      }
    };

    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error fetching problem reports:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
