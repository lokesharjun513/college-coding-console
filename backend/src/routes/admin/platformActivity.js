const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const User = require('../../models/User');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');

/**
 * GET /admin/platform-activity
 * Returns platform activity metrics and trends for the selected range
 *
 * Timezone: UTC (all date boundaries calculated in UTC for consistency)
 *
 * Metric semantics:
 * - Students/Users/Problems: cumulative total count
 * - Submissions: count within selected period
 * - All change percentages: current period activity vs previous equivalent period
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const range = req.query.range || '7d';
    const rangeInDays = { '7d': 7, '30d': 30, '90d': 90 }[range];

    // Date boundaries in UTC (using midnight UTC for consistency)
    const now = new Date();
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const startDate = new Date(endDate.getTime() - rangeInDays * 24 * 60 * 60 * 1000);
    startDate.setUTCHours(0, 0, 0, 0);

    const startDatePrev = new Date(startDate.getTime() - rangeInDays * 24 * 60 * 60 * 1000);
    const endDatePrev = new Date(startDate.getTime() - 1);

    // Trend window: matches selected range
    // 7d: daily for 7 days
    // 30d: daily for 30 days
    // 90d: weekly for 90 days (13 weeks)
    const isWeekly = range === '90d';
    const trendDaySeconds = isWeekly ? 7 * 24 * 60 * 60 : 1;
    const trendDays = rangeInDays;

    const trendEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const trendStart = new Date(trendEnd.getTime() - trendDays * 24 * 60 * 60 * 1000);
    trendStart.setUTCHours(0, 0, 0, 0);

    // Generate date labels for trend chart
    const getDateLabels = () => {
      const labels = [];
      const step = isWeekly ? 7 : 1;
      for (let i = trendDays - 1; i >= 0; i -= step) {
        const date = new Date(trendStart.getTime() + i * 24 * 60 * 60 * 1000);
        labels.push(date.toISOString().split('T')[0]);
      }
      return labels.reverse();
    };
    const dateLabels = getDateLabels();

    // Initialize trend arrays with zeros
    const initTrendArray = () => Array(dateLabels.length).fill(0);

    // Helper to fill trend data into arrays
    const fillTrend = (results) => {
      const trend = initTrendArray();
      results.forEach((result) => {
        const dayIndex = dateLabels.indexOf(result._id);
        if (dayIndex >= 0) {
          trend[dayIndex] = result.count;
        }
      });
      return trend;
    };

    // Fetch trends for each metric
    const [studentTrend, problemTrend, userTrend, submissionTrend] = await Promise.all([
      // Students: new student registrations per day
      User.aggregate([
        { $match: { role: 'STUDENT', createdAt: { $gte: trendStart, $lte: trendEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).then(fillTrend),

      // Problems: new problems created per day
      Problem.aggregate([
        { $match: { createdAt: { $gte: trendStart, $lte: trendEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).then(fillTrend),

      // Users: new user registrations per day (all roles)
      User.aggregate([
        { $match: { createdAt: { $gte: trendStart, $lte: trendEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).then(fillTrend),

      // Submissions: submissions per day
      Submission.aggregate([
        { $match: { createdAt: { $gte: trendStart, $lte: trendEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).then(fillTrend)
    ]);

    // Fetch metric values and change percentages
    // For cumulative metrics, change compares NEW registrations in current period vs previous period
    const [
      // Current totals
      totalStudents,
      totalProblems,
      totalUsers,
      // New registrations in current period (for change calculation)
      newStudents,
      newProblems,
      newUsers,
      // New registrations in previous period
      newStudentsPrev,
      newProblemsPrev,
      newUsersPrev,
      // Submissions (period-based metric)
      submissionCount,
      submissionCountPrev
    ] = await Promise.all([
      // Current totals
      User.countDocuments({ role: 'STUDENT' }),
      Problem.countDocuments({}),
      User.countDocuments({}),

      // New registrations in current period
      User.countDocuments({ role: 'STUDENT', createdAt: { $gte: startDate, $lte: endDate } }),
      Problem.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),

      // New registrations in previous period
      User.countDocuments({ role: 'STUDENT', createdAt: { $gte: startDatePrev, $lte: endDatePrev } }),
      Problem.countDocuments({ createdAt: { $gte: startDatePrev, $lte: endDatePrev } }),
      User.countDocuments({ createdAt: { $gte: startDatePrev, $lte: endDatePrev } }),

      // Submissions
      Submission.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      Submission.countDocuments({ createdAt: { $gte: startDatePrev, $lte: endDatePrev } })
    ]);

    // Calculate change percentages
    const calculateChangePercent = (current, previous) => {
      if (previous === 0) {
        return current === 0 ? 0 : null;
      }
      return ((current - previous) / previous) * 100;
    };

    const studentsChange = calculateChangePercent(newStudents, newStudentsPrev);
    const submissionsChange = calculateChangePercent(submissionCount, submissionCountPrev);
    const problemsChange = calculateChangePercent(newProblems, newProblemsPrev);
    const usersChange = calculateChangePercent(newUsers, newUsersPrev);

    const metrics = {
      students: {
        value: totalStudents,
        changePercent: studentsChange === null ? null : Number(studentsChange.toFixed(0))
      },
      submissions: {
        value: submissionCount,
        changePercent: submissionsChange === null ? null : Number(submissionsChange.toFixed(0))
      },
      problems: {
        value: totalProblems,
        changePercent: problemsChange === null ? null : Number(problemsChange.toFixed(0))
      },
      users: {
        value: totalUsers,
        changePercent: usersChange === null ? null : Number(usersChange.toFixed(0))
      }
    };

    res.json({
      success: true,
      range,
      metrics,
      trends: {
        students: studentTrend,
        submissions: submissionTrend,
        problems: problemTrend,
        users: userTrend
      }
    });
  } catch (err) {
    console.error('Error fetching platform activity:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
