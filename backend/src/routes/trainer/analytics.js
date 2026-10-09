// backend/src/routes/trainer/analytics.js
// Authoritative trainer analytics: KPIs + leaderboard for owned batches.
// Solved = distinct (student, problem) pair with Submission.verdict === 'ACCEPTED'.
// Progress semantics mirror the student side exactly (NO_PROBLEMS / NOT_STARTED /
// IN_PROGRESS / COMPLETED) so trainer analytics can never disagree with student views.
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const BatchStudent = require('../../models/BatchStudent');
const Problem = require('../../models/Problem');
const ProblemTopic = require('../../models/ProblemTopic');
const Topic = require('../../models/Topic');
const Submission = require('../../models/Submission');
const User = require('../../models/User');
const { assertTrainerOwnsBatch } = require('../../services/trainerAuth');

// Same authoritative semantics as student/collections.js deriveProgress
function deriveProgress(total, completed) {
  const status = total === 0
    ? 'NO_PROBLEMS'
    : completed >= total
      ? 'COMPLETED'
      : completed > 0
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';
  const progressPercentage = total === 0 ? 0 : Math.round((completed / total) * 10000) / 100;
  return { status, progressPercentage };
}

// Deterministic leaderboard order: completion % DESC, solved DESC, name ASC
function compareLeaderboard(a, b) {
  if (b.completionPercentage !== a.completionPercentage) return b.completionPercentage - a.completionPercentage;
  if (b.solvedProblems !== a.solvedProblems) return b.solvedProblems - a.solvedProblems;
  return a.name.localeCompare(b.name);
}

/**
 * GET /api/trainer/analytics
 * Query: batchId (required), collectionId?, topicId?, status?
 *
 * Scope: BATCH-scoped PUBLISHED problems of the owned batch, intersected with
 * ProblemTopic links (collectionId/topicId filters). Students see exactly these
 * problems, so analytics match what students experience.
 *
 * Solved metric = solved ASSIGNMENTS (student+problem instances), matching the
 * completion-rate denominator (student+problem assignments).
 */
router.get('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { batchId, collectionId, topicId, status } = req.query;
    if (!batchId) {
      return res.status(400).json({ success: false, message: 'batchId is required' });
    }
    await assertTrainerOwnsBatch(req.user.id, batchId);

    // 1. Active students of the batch only
    const enrollments = await BatchStudent.find({ batch: batchId, status: 'ACTIVE' }).select('student').lean();
    const studentIds = enrollments.map(e => e.student);

    // 2. Assigned problems: batch-scoped + PUBLISHED, narrowed by Training/Day links
    let problems = await Problem.find({ batch: batchId, status: 'PUBLISHED' }).select('_id').lean();
    let problemIds = problems.map(p => p._id.toString());

    let dayProblems = new Map(); // topicId -> Set(problemId) for Days with assigned problems
    if (collectionId || topicId) {
      const topicFilter = {};
      if (collectionId) topicFilter.collection = collectionId;
      if (topicId) topicFilter._id = topicId;
      const topics = await Topic.find(topicFilter).select('_id').lean();
      const topicIdSet = new Set(topics.map(t => t._id.toString()));
      const links = await ProblemTopic.find({ topic: { $in: [...topicIdSet] }, problem: { $in: problemIds } })
        .select('problem topic').lean();
      const scoped = new Set(links.map(l => l.problem.toString()));
      // ProblemTopic links that fall outside the selected Training/Day scope
      const allLinks = await ProblemTopic.find({ problem: { $in: problemIds } }).select('problem topic').lean();
      dayProblems = new Map();
      for (const l of allLinks) {
        const pid = l.problem.toString();
        if (!scoped.has(pid)) continue;
        const tid = l.topic.toString();
        if (!dayProblems.has(tid)) dayProblems.set(tid, new Set());
        dayProblems.get(tid).add(pid);
      }
      problemIds = problemIds.filter(pid => scoped.has(pid));
    } else {
      // No Training/Day filter: every link of a scoped problem defines a Day
      const allLinks = await ProblemTopic.find({ problem: { $in: problemIds } }).select('problem topic').lean();
      for (const l of allLinks) {
        const tid = l.topic.toString();
        if (!dayProblems.has(tid)) dayProblems.set(tid, new Set());
        dayProblems.get(tid).add(l.problem.toString());
      }
    }

    // 3. One bulk query for accepted submissions of these students/problems — no N+1
    let accepted = [];
    if (studentIds.length > 0 && problemIds.length > 0) {
      accepted = await Submission.find({
        student: { $in: studentIds },
        problem: { $in: problemIds },
        verdict: 'ACCEPTED',
      }).select('student problem').lean();
    }

    // Distinct (student, problem) solved pairs — duplicate ACCEPTED counts once
    const solvedPairs = new Set(accepted.map(s => `${s.student.toString()}:${s.problem.toString()}`));

    // 4. Students with names
    const users = await User.find({ _id: { $in: studentIds } }).select('name').lean();
    const nameById = new Map(users.map(u => [u._id.toString(), u.name]));

    // 5. Per-student metrics
    const assignedCount = problemIds.length;
    const totalDays = dayProblems.size;
    const rows = studentIds.map(sid => {
      const sidStr = sid.toString();
      let solved = 0;
      for (const pid of problemIds) {
        if (solvedPairs.has(`${sidStr}:${pid}`)) solved += 1;
      }
      // A Day is completed for a student when every problem assigned to it is solved
      const daysCompleted = [...dayProblems.values()].filter(pids =>
        pids.size > 0 && [...pids].every(pid => solvedPairs.has(`${sidStr}:${pid}`))
      ).length;
      const { status: studentStatus, progressPercentage } = deriveProgress(assignedCount, solved);
      return {
        studentId: sidStr,
        name: nameById.get(sidStr) || 'Unknown',
        solvedProblems: solved,
        assignedProblems: assignedCount,
        completionPercentage: progressPercentage,
        daysCompleted,
        totalDays,
        status: studentStatus,
      };
    });

    // Status filter applies to the row's scoped status. NO_PROBLEMS rows
    // (zero assigned problems in scope) only appear under "All".
    let leaderboard = rows;
    if (status && status !== 'ALL') {
      leaderboard = rows.filter(r => r.status === status);
    }
    leaderboard = leaderboard.sort(compareLeaderboard).map((r, i) => ({ rank: i + 1, ...r }));

    // 6. KPIs — solved assignments (student+problem instances) / total assignments
    const solvedAssignments = solvedPairs.size;

    const data = {
      filters: { batchId, collectionId: collectionId || null, topicId: topicId || null, status: status || 'ALL' },
      kpis: {
        activeStudents: studentIds.length,
        assignedProblems: assignedCount,
        solvedAssignments: solvedAssignments,
        completionRate: deriveProgress(assignedCount * studentIds.length, solvedAssignments).progressPercentage,
      },
      leaderboard,
    };
    return res.json({ success: true, data });
  } catch (error) {
    if (error && error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error fetching trainer analytics:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/trainer/analytics/student/:studentId
 * Returns per-student training progress (Day and Problem breakdown) for a selected student.
 * Validates trainer ownership of the batch and supports optional collection/topic filters.
 */
router.get('/student/:studentId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { batchId, collectionId, topicId } = req.query;

    if (!batchId) {
      return res.status(400).json({ success: false, message: 'batchId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student id' });
    }

    await assertTrainerOwnsBatch(req.user.id, batchId);

    // Verify student exists and is a STUDENT
    const student = await User.findById(studentId);
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Verify student is enrolled in the batch
    const enrollment = await BatchStudent.findOne({
      student: studentId,
      batch: batchId,
      status: 'ACTIVE',
    });
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Load assigned problems (PUBLISHED, BATCH scope for this batch)
    let problems = await Problem.find({ batch: batchId, status: 'PUBLISHED' }).lean();
    let problemIds = problems.map(p => p._id.toString());

    // Apply collection/topic filters if provided
    if (collectionId || topicId) {
      const topicFilter = {};
      if (collectionId) topicFilter.collection = collectionId;
      if (topicId) topicFilter._id = topicId;
      const topics = await Topic.find(topicFilter).select('_id').lean();
      const topicIds = new Set(topics.map(t => t._id.toString()));

      const links = await ProblemTopic.find({
        topic: { $in: [...topicIds] },
        problem: { $in: problemIds },
      }).select('problem topic').lean();

      problemIds = [...new Set(links.map(l => l.problem.toString()))];
    }

    // Load solved problems for this student
    const submissions = await Submission.find({
      student: studentId,
      problem: { $in: problemIds },
      verdict: 'ACCEPTED',
    }).select('problem').lean();
    const solvedProblemIds = new Set(submissions.map(s => s.problem.toString()));

    // Build day/Topic breakdown
    const topicsWithProblems = await ProblemTopic.find({
      problem: { $in: problemIds },
    }).select('problem topic').lean();

    const topicIds = [...new Set(topicsWithProblems.map(l => l.topic.toString()))];
    const topicsList = await Topic.find({ _id: { $in: topicIds } }).lean();
    const topicByName = new Map(topicsList.map(t => [t._id.toString(), t]));

    // Group problems by topic
    const problemsByTopic = new Map();
    for (const link of topicsWithProblems) {
      const tid = link.topic.toString();
      const pid = link.problem.toString();
      if (!problemsByTopic.has(tid)) problemsByTopic.set(tid, []);
      if (!problemsByTopic.get(tid).includes(pid)) problemsByTopic.get(tid).push(pid);
    }

    // Compute day-by-day progress
    const days = [];
    for (const [tid, pids] of problemsByTopic) {
      const topic = topicByName.get(tid);
      const total = pids.length;
      const solved = pids.filter(pid => solvedProblemIds.has(pid)).length;
      const { status, progressPercentage } = deriveProgress(total, solved);
      days.push({
        topicId: tid,
        name: topic ? topic.name : 'Unknown',
        total,
        solved,
        percentage: progressPercentage,
        status,
      });
    }

    // Compute per-problem status
    // Load all submissions to detect ATTEMPTED
    const allSubmissions = await Submission.find({
      student: studentId,
      problem: { $in: problemIds },
    }).select('problem verdict').lean();
    const attemptedProblemIds = new Set(allSubmissions.map(s => s.problem.toString()));

    const problemsDetail = [];
    for (const pid of problemIds) {
      const problem = problems.find(p => p._id.toString() === pid);
      const status = solvedProblemIds.has(pid)
        ? 'SOLVED'
        : attemptedProblemIds.has(pid)
        ? 'ATTEMPTED'
        : 'NOT_STARTED';

      // Find topic for this problem
      const link = topicsWithProblems.find(l => l.problem.toString() === pid);
      const topic = link ? topicByName.get(link.topic.toString()) : null;

      problemsDetail.push({
        problemId: pid,
        title: problem ? problem.title : 'Unknown',
        difficulty: problem ? problem.difficulty : null,
        topicId: link ? link.topic.toString() : null,
        topicName: topic ? topic.name : null,
        status,
      });
    }

    // Overall progress
    const totalProblems = problemIds.length;
    const totalSolved = solvedProblemIds.size;
    const overall = deriveProgress(totalProblems, totalSolved);

    const data = {
      overall: {
        total: totalProblems,
        solved: totalSolved,
        percentage: overall.progressPercentage,
        status: overall.status,
      },
      days,
      problems: problemsDetail,
    };

    return res.json({ success: true, data });
  } catch (error) {
    if (error && error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Error fetching student analytics:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
