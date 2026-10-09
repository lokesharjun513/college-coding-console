const express = require('express');
const mongoose = require('mongoose');
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const User = require('../../models/User');
const Batch = require('../../models/Batch');
const BatchStudent = require('../../models/BatchStudent');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const { getISTDayBounds } = require('../../services/problemAccess');

const router = express.Router();

function idOf(value) {
  return value?.toString();
}

function compareRows(a, b) {
  if (b.completionPercentage !== a.completionPercentage) return b.completionPercentage - a.completionPercentage;
  if (b.solved !== a.solved) return b.solved - a.solved;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function rankRows(rows, currentUserId) {
  return rows.sort(compareRows).map((row, index) => ({
    rank: index + 1,
    isCurrentUser: row.studentId === idOf(currentUserId),
    ...row,
  }));
}

router.get('/', requireAuth, requireRole('STUDENT'), async (req, res) => {
  try {
    const scope = String(req.query.scope || 'GLOBAL').toUpperCase();
    if (!['GLOBAL', 'BATCH'].includes(scope)) {
      return res.status(400).json({ success: false, message: 'Scope must be GLOBAL or BATCH' });
    }

    let batch = null;
    let studentIds;
    const activeEnrollments = await BatchStudent.find({ student: req.user.id, status: 'ACTIVE' })
      .populate('batch', 'name code status')
      .lean();
    const activeBatches = activeEnrollments.filter(item => item.batch).map(item => ({
      id: item.batch._id,
      name: item.batch.name,
      code: item.batch.code,
      status: item.batch.status,
    }));
    if (scope === 'BATCH') {
      const batchId = req.query.batchId;
      if (!batchId || !mongoose.Types.ObjectId.isValid(batchId)) {
        return res.status(400).json({ success: false, message: 'A valid batchId is required for batch leaderboard.' });
      }
      const membership = await BatchStudent.findOne({ student: req.user.id, batch: batchId, status: 'ACTIVE' }).lean();
      if (!membership) return res.status(403).json({ success: false, message: 'You are not enrolled in this batch.' });
      batch = await Batch.findById(batchId).select('_id name code status').lean();
      if (!batch) return res.status(404).json({ success: false, message: 'Batch not found.' });
      const enrollments = await BatchStudent.find({ batch: batchId, status: 'ACTIVE' }).select('student').lean();
      studentIds = enrollments.map(enrollment => enrollment.student);
    } else {
      const students = await User.find({ role: 'STUDENT', status: 'ACTIVE' }).select('_id').lean();
      studentIds = students.map(student => student._id);
    }

    const { end } = getISTDayBounds();
    const problemQuery = scope === 'GLOBAL'
      ? { scope: 'GLOBAL', status: 'PUBLISHED' }
      : { scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', $or: [{ practiceDate: null }, { practiceDate: { $lt: end } }] };
    const problems = await Problem.find(problemQuery).select('_id').lean();
    const problemIds = problems.map(problem => problem._id);

    const accepted = studentIds.length && problemIds.length
      ? await Submission.find({ student: { $in: studentIds }, problem: { $in: problemIds }, verdict: 'ACCEPTED' }).select('student problem').lean()
      : [];
    const solvedByStudent = new Map();
    accepted.forEach((submission) => {
      const studentId = idOf(submission.student);
      const problemId = idOf(submission.problem);
      if (!solvedByStudent.has(studentId)) solvedByStudent.set(studentId, new Set());
      solvedByStudent.get(studentId).add(problemId);
    });

    const students = studentIds.length
      ? await User.find({ _id: { $in: studentIds }, role: 'STUDENT', status: 'ACTIVE' }).select('_id name').lean()
      : [];
    const assigned = problemIds.length;
    const rows = students.map((student) => {
      const solved = solvedByStudent.get(idOf(student._id))?.size || 0;
      return {
        studentId: idOf(student._id),
        name: student.name || 'Unnamed student',
        solved,
        assigned,
        completionPercentage: assigned ? Math.round((solved / assigned) * 10000) / 100 : 0,
      };
    });
    const leaderboard = rankRows(rows, req.user.id);
    const current = leaderboard.find(row => row.isCurrentUser);

    return res.json({
      success: true,
      data: {
        scope,
        batch: batch ? { id: batch._id, name: batch.name, code: batch.code, status: batch.status } : null,
        activeBatches,
        metrics: { assignedProblems: assigned, eligibleStudents: leaderboard.length },
        currentUserRank: current?.rank || null,
        leaderboard,
      },
    });
  } catch (error) {
    console.error('Error fetching student leaderboard:', error);
    return res.status(500).json({ success: false, message: 'Unable to load leaderboard.' });
  }
});

module.exports = router;
