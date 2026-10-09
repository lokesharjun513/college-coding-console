const express = require('express');
const mongoose = require('mongoose');
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const BatchStudent = require('../../models/BatchStudent');
const { getISTDayBounds } = require('../../services/problemAccess');

const router = express.Router();
const toId = value => value?.toString();

function progressMap(submissions) {
  const map = new Map();
  submissions.forEach((submission) => {
    const id = toId(submission.problem);
    if (submission.verdict === 'ACCEPTED') map.set(id, 'SOLVED');
    else if (!map.has(id)) map.set(id, 'ATTEMPTED');
  });
  return map;
}

function metrics(problems, submissions) {
  const ids = new Set(problems.map(problem => toId(problem._id)));
  const progress = progressMap(submissions.filter(submission => ids.has(toId(submission.problem))));
  const solved = [...progress.values()].filter(value => value === 'SOLVED').length;
  const attempted = [...progress.values()].filter(value => value === 'ATTEMPTED').length;
  const assigned = problems.length;
  return { assigned, solved, attempted, notStarted: Math.max(0, assigned - solved - attempted), completionPercentage: assigned ? Math.round((solved / assigned) * 100) : 0 };
}

function difficultyBreakdown(problems, submissions) {
  const progress = progressMap(submissions);
  const groups = new Map();
  problems.forEach((problem) => {
    const label = problem.difficulty || 'Unspecified';
    if (!groups.has(label)) groups.set(label, { label, assigned: 0, solved: 0, attempted: 0, notStarted: 0 });
    const group = groups.get(label);
    group.assigned += 1;
    const status = progress.get(toId(problem._id));
    if (status === 'SOLVED') group.solved += 1;
    else if (status === 'ATTEMPTED') group.attempted += 1;
    else group.notStarted += 1;
  });
  return [...groups.values()].map(group => ({ ...group, completionPercentage: group.assigned ? Math.round((group.solved / group.assigned) * 100) : 0 }));
}

router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const scope = String(req.query.scope || 'GLOBAL').toUpperCase();
    if (!['GLOBAL', 'BATCH'].includes(scope)) return res.status(400).json({ success: false, message: 'Scope must be GLOBAL or BATCH' });
    const enrollments = await BatchStudent.find({ student: req.user.id, status: 'ACTIVE' }).populate('batch', 'name code status trainer').lean();
    const activeBatches = enrollments.filter(item => item.batch).map(item => ({ id: item.batch._id, name: item.batch.name, code: item.batch.code, status: item.batch.status, trainer: item.batch.trainer || null }));
    let batch = null;
    if (scope === 'BATCH') {
      if (!activeBatches.length) return res.status(403).json({ success: false, message: 'You are not enrolled in an active batch.' });
      const requestedId = req.query.batchId;
      if (requestedId && !mongoose.Types.ObjectId.isValid(requestedId)) return res.status(400).json({ success: false, message: 'Invalid batch id' });
      batch = requestedId ? activeBatches.find(item => toId(item.id) === requestedId) : activeBatches.length === 1 ? activeBatches[0] : null;
      if (!batch) return res.status(403).json({ success: false, code: 'BATCH_SELECTION_REQUIRED', message: requestedId ? 'You are not enrolled in this batch.' : 'Select an active batch to view performance.', data: { activeBatches } });
    }
    const query = scope === 'GLOBAL' ? { status: 'PUBLISHED', scope: 'GLOBAL' } : (() => { const { end } = getISTDayBounds(); return { status: 'PUBLISHED', scope: 'BATCH', batch: batch.id, $or: [{ practiceDate: null }, { practiceDate: { $lt: end } }] }; })();
    const problems = await Problem.find(query).select('_id title difficulty').lean();
    const submissions = problems.length ? await Submission.find({ student: req.user.id, problem: { $in: problems.map(problem => problem._id) } }).select('problem verdict createdAt').sort({ createdAt: -1 }).lean() : [];
    const problemMap = new Map(problems.map(problem => [toId(problem._id), problem]));
    const recentActivity = submissions.slice(0, 8).map(submission => ({ id: submission._id, problemId: submission.problem, title: problemMap.get(toId(submission.problem))?.title || 'Problem', verdict: submission.verdict, createdAt: submission.createdAt }));
    return res.json({ success: true, data: { scope, batch, activeBatches, metrics: metrics(problems, submissions), breakdowns: { difficulty: difficultyBreakdown(problems, submissions) }, recentActivity } });
  } catch (error) {
    console.error('Error fetching student performance:', error);
    return res.status(500).json({ success: false, message: 'Unable to load performance data.' });
  }
});

module.exports = router;
