const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const Submission = require('../../models/Submission');

router.use(requireAuth);
router.use(requireRole('ADMIN'));

/**
 * GET /api/admin/system/health
 */
router.get('/health', async (req, res) => {
  try {
    // API status
    const apiStatus = {
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    };

    // Database health
    let dbStatus = 'disconnected';
    let dbLatencyMs = 0;
    const readyState = mongoose.connection.readyState;
    if (readyState === 1) {
      dbStatus = 'healthy';
      try {
        const start = Date.now();
        await Promise.race([
          mongoose.connection.db.admin().ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        dbLatencyMs = Date.now() - start;
      } catch (err) {
        dbStatus = 'degraded';
      }
    } else if (readyState === 2 || readyState === 3) {
      dbStatus = 'degraded';
    } else {
      dbStatus = 'unavailable';
    }

    const database = {
      status: dbStatus,
      latencyMs: dbLatencyMs
    };

    // Execution Engine (Judge0) health
    let execStatus = 'unavailable';
    let execLatencyMs = 0;
    const endpoint = process.env.JUDGE0_ENDPOINT;
    if (endpoint) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const startTime = Date.now();
      try {
        const response = await fetch(`${endpoint}/languages`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        execLatencyMs = Date.now() - startTime;
        if (response.ok) {
          execStatus = 'healthy';
        } else {
          execStatus = 'degraded';
        }
      } catch (err) {
        clearTimeout(timeoutId);
        execLatencyMs = Date.now() - startTime;
        execStatus = 'unavailable';
      }
    }

    const executionEngine = {
      status: execStatus,
      latencyMs: execLatencyMs
    };

    // Memory usage
    const mem = process.memoryUsage();
    const memory = {
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024))
    };

    return res.json({
      success: true,
      data: {
        api: apiStatus,
        database,
        executionEngine,
        memory,
        checkedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error in system health:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/system/metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalSubmissions,
      submissionsToday,
      acceptedSubmissions,
      verdictCounts,
      runtimeAgg,
      memoryAgg,
      recentFailuresRaw
    ] = await Promise.all([
      Submission.countDocuments(),
      Submission.countDocuments({ createdAt: { $gte: startOfToday } }),
      Submission.countDocuments({ verdict: 'ACCEPTED' }),
      Submission.aggregate([
        { $group: { _id: '$verdict', count: { $sum: 1 } } }
      ]),
      Submission.aggregate([
        { $match: { runtime: { $ne: null, $exists: true } } },
        { $group: { _id: null, avgRuntime: { $avg: '$runtime' } } }
      ]),
      Submission.aggregate([
        { $match: { memory: { $ne: null, $exists: true } } },
        { $group: { _id: null, avgMemory: { $avg: '$memory' } } }
      ]),
      Submission.find({ verdict: { $ne: 'ACCEPTED' } })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('student', '_id name email')
        .populate('problem', '_id title')
        .select('student problem language verdict runtime memory createdAt')
        .lean()
    ]);

    const failedSubmissions = totalSubmissions - acceptedSubmissions;
    const successRate = totalSubmissions > 0
      ? Number(((acceptedSubmissions / totalSubmissions) * 100).toFixed(1))
      : 0;

    const averageRuntimeMs = runtimeAgg.length > 0 && runtimeAgg[0].avgRuntime != null
      ? Number(runtimeAgg[0].avgRuntime.toFixed(2))
      : 0;

    const averageMemoryKb = memoryAgg.length > 0 && memoryAgg[0].avgMemory != null
      ? Number(memoryAgg[0].avgMemory.toFixed(2))
      : 0;

    const knownVerdicts = [
      'ACCEPTED',
      'WRONG_ANSWER',
      'COMPILATION_ERROR',
      'RUNTIME_ERROR',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
      'EXECUTION_ERROR'
    ];

    const verdictBreakdown = {};
    knownVerdicts.forEach(v => { verdictBreakdown[v] = 0; });
    verdictCounts.forEach(item => {
      if (item._id && verdictBreakdown.hasOwnProperty(item._id)) {
        verdictBreakdown[item._id] = item.count;
      }
    });

    const recentFailures = recentFailuresRaw.map(sub => ({
      id: sub._id,
      student: sub.student ? { id: sub.student._id, name: sub.student.name, email: sub.student.email } : null,
      problem: sub.problem ? { id: sub.problem._id, title: sub.problem.title } : null,
      language: sub.language,
      verdict: sub.verdict,
      runtime: sub.runtime,
      memory: sub.memory,
      createdAt: sub.createdAt
    }));

    return res.json({
      success: true,
      data: {
        totalSubmissions,
        submissionsToday,
        acceptedSubmissions,
        failedSubmissions,
        successRate,
        averageRuntimeMs,
        averageMemoryKb,
        verdictBreakdown,
        recentFailures
      }
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error in system metrics:', err);
    return res.status(500).json({ success: false, message: 'Failed to load system metrics' });
  }
});

module.exports = router;
