/**
 * Leaderboard Service
 * Shared scoring and ranking logic for global and batch leaderboards.
 * 
 * Scoring Rules:
 * - Only ACCEPTED submissions count
 * - Multiple ACCEPTED submissions for the same problem count as 1
 * - Only published GLOBAL problems count for global scope
 * - Only published BATCH problems count for batch scope
 * - Only ACTIVE students are included
 * - Scores are calculated dynamically (not persisted)
 * 
 * Ranking:
 * 1. completionPercentage DESC
 * 2. solved DESC
 * 3. student name ASC (localeCompare)
 */

const User = require('../models/User');
const Batch = require('../models/Batch');
const BatchStudent = require('../models/BatchStudent');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const { getISTDayBounds } = require('./problemAccess');

/**
 * Convert a value to string ID for map keys
 */
function idOf(value) {
  return value?.toString();
}

/**
 * Compare two leaderboard rows for sorting
 */
function compareRows(a, b) {
  // Primary: completion percentage descending
  if (b.completionPercentage !== a.completionPercentage) {
    return b.completionPercentage - a.completionPercentage;
  }
  // Secondary: solved count descending
  if (b.solved !== a.solved) {
    return b.solved - a.solved;
  }
  // Tertiary: name ascending (case-insensitive)
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Assign ranks to sorted leaderboard rows
 */
function rankRows(rows, currentUserId) {
  return rows
    .sort(compareRows)
    .map((row, index) => ({
      rank: index + 1,
      isCurrentUser: row.studentId === idOf(currentUserId),
      ...row,
    }));
}

/**
 * Get global leaderboard data (all active students, all published global problems)
 * 
 * @param {Object} options - Query options
 * @param {number} options.limit - Max results to return (default: 100)
 * @param {number} options.offset - Skip this many results (default: 0)
 * @param {string} options.search - Filter by student name (case-insensitive substring)
 * @param {string} options.currentUserId - Optional current user ID to find their rank
 * @returns {Promise<Object>} Leaderboard data
 */
async function getGlobalLeaderboard({ limit = 100, offset = 0, search = '', currentUserId = null } = {}) {
  // Step 1: Get all active students
  const studentQuery = { role: 'STUDENT', status: 'ACTIVE' };
  if (search) {
    studentQuery.name = { $regex: search, $options: 'i' };
  }

  const students = await User.find(studentQuery).select('_id name').lean();
  const studentIds = students.map(s => s._id);

  // Step 2: Get all published GLOBAL problems
  const problems = await Problem.find({
    scope: 'GLOBAL',
    status: 'PUBLISHED',
  }).select('_id').lean();
  const problemIds = problems.map(p => p._id);
  const assigned = problemIds.length;

  // Step 3: Get accepted submissions (only student and problem fields, no code)
  // Only if we have both students and problems
  const accepted = (problemIds.length > 0 && studentIds.length > 0)
    ? await Submission.find({
        student: { $in: studentIds },
        problem: { $in: problemIds },
        verdict: 'ACCEPTED',
      }).select('student problem').lean()
    : [];

  // Step 4: Deduplicate by student/problem (Set ensures each problem counts once per student)
  const solvedByStudent = new Map();
  accepted.forEach((submission) => {
    const studentId = idOf(submission.student);
    const problemId = idOf(submission.problem);
    if (!solvedByStudent.has(studentId)) {
      solvedByStudent.set(studentId, new Set());
    }
    solvedByStudent.get(studentId).add(problemId);
  });

  // Step 5: Build leaderboard rows
  const rows = students.map((student) => {
    const solved = solvedByStudent.get(idOf(student._id))?.size || 0;
    const completionPercentage = assigned > 0
      ? Math.round((solved / assigned) * 10000) / 100
      : 0;

    return {
      studentId: idOf(student._id),
      name: student.name || 'Unnamed student',
      solved,
      assigned,
      completionPercentage,
    };
  });

  // Step 6: Rank and paginate
  const totalStudents = students.length;
  const leaderboard = rankRows(rows, currentUserId);

  // Apply pagination
  const paginatedLeaderboard = leaderboard.slice(offset, offset + limit);

  // Find current user rank if needed (before pagination)
  let currentUserRank = null;
  if (currentUserId && leaderboard.length > 0) {
    const current = leaderboard.find(row => row.isCurrentUser);
    currentUserRank = current?.rank || null;
  }

  return {
    scope: 'GLOBAL',
    batch: null,
    metrics: { assignedProblems: assigned, eligibleStudents: totalStudents },
    currentUserRank,
    leaderboard: paginatedLeaderboard,
    totalCount: leaderboard.length,
  };
}

/**
 * Get batch leaderboard data
 * 
 * @param {string} batchId - Batch ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Max results (default: 100)
 * @param {number} options.offset - Skip results (default: 0)
 * @param {string} options.search - Filter by student name
 * @param {string} options.currentUserId - Current user ID for rank finding
 * @returns {Promise<Object>} Leaderboard data
 */
async function getBatchLeaderboard(batchId, { limit = 100, offset = 0, search = '', currentUserId = null } = {}) {
  if (!batchId) {
    throw new Error('batchId is required for batch leaderboard');
  }
  
  // Step 1: Get batch info
  const batch = await Batch.findById(batchId).select('_id name code status').lean();
  if (!batch) {
    throw new Error('Batch not found');
  }
  
  // Step 2: Get active students enrolled in batch
  const enrollments = await BatchStudent.find({
    batch: batchId,
    status: 'ACTIVE',
  }).select('student').lean();
  const studentIds = enrollments.map(e => e.student);
  
  if (studentIds.length === 0) {
    return {
      scope: 'BATCH',
      batch: null,
      activeBatches: [],
      metrics: { assignedProblems: 0, eligibleStudents: 0 },
      currentUserRank: null,
      leaderboard: [],
      totalCount: 0,
    };
  }
  
  // Get active batches for current user (for frontend UI)
  const activeEnrollments = await BatchStudent.find({
    student: { $in: studentIds },
    status: 'ACTIVE',
  }).populate('batch', 'name code status').lean();
  const activeBatches = activeEnrollments
    .filter(item => item.batch && item.batch.status === 'ACTIVE')
    .map(item => ({
      id: item.batch._id,
      name: item.batch.name,
      code: item.batch.code,
      status: item.batch.status,
    }));
  
  // Step 3: Get published batch problems
  const { end } = getISTDayBounds();
  const problems = await Problem.find({
    scope: 'BATCH',
    batch: batchId,
    status: 'PUBLISHED',
    $or: [
      { practiceDate: null },
      { practiceDate: { $lt: end } },
    ],
  }).select('_id').lean();
  const problemIds = problems.map(p => p._id);
  
  const assigned = problemIds.length;
  
  // Step 4: Get accepted submissions
  const accepted = problemIds.length && studentIds.length
    ? await Submission.find({
        student: { $in: studentIds },
        problem: { $in: problemIds },
        verdict: 'ACCEPTED',
      }).select('student problem').lean()
    : [];
  
  // Step 5: Deduplicate
  const solvedByStudent = new Map();
  accepted.forEach((submission) => {
    const studentId = idOf(submission.student);
    const problemId = idOf(submission.problem);
    if (!solvedByStudent.has(studentId)) {
      solvedByStudent.set(studentId, new Set());
    }
    solvedByStudent.get(studentId).add(problemId);
  });
  
  // Step 6: Build rows
  const students = await User.find({
    _id: { $in: studentIds },
    role: 'STUDENT',
    status: 'ACTIVE',
  }).select('_id name').lean();
  
  const rows = students.map((student) => {
    const solved = solvedByStudent.get(idOf(student._id))?.size || 0;
    const completionPercentage = assigned > 0 
      ? Math.round((solved / assigned) * 10000) / 100 
      : 0;
    
    return {
      studentId: idOf(student._id),
      name: student.name || 'Unnamed student',
      solved,
      assigned,
      completionPercentage,
    };
  });
  
  // Step 7: Rank and paginate
  const totalStudents = students.length;
  const leaderboard = rankRows(rows, currentUserId);
  const paginatedLeaderboard = leaderboard.slice(offset, offset + limit);
  
  let currentUserRank = null;
  if (currentUserId && leaderboard.length > 0) {
    const current = leaderboard.find(row => row.isCurrentUser);
    currentUserRank = current?.rank || null;
  }
  
  return {
    scope: 'BATCH',
    batch: {
      id: batch._id,
      name: batch.name,
      code: batch.code,
      status: batch.status,
    },
    activeBatches,
    metrics: { assignedProblems: assigned, eligibleStudents: totalStudents },
    currentUserRank,
    leaderboard: paginatedLeaderboard,
    totalCount: leaderboard.length,
  };
}

module.exports = {
  getGlobalLeaderboard,
  getBatchLeaderboard,
  compareRows,
  rankRows,
  idOf,
};
