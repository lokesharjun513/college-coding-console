// backend/src/services/problemAccess.js
// Single authoritative check for student problem access:
// GLOBAL → every authenticated student; BATCH → only students enrolled in that batch.

const BatchStudent = require('../models/BatchStudent');

// Daily practice dates are interpreted using the application's existing IST convention.
function getISTDayBounds(now = new Date()) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();
  const start = new Date(Date.UTC(year, month, day) - istOffset);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function isDailyPracticeDateVisible(practiceDate, now = new Date()) {
  if (!practiceDate) return true; // Preserve legacy batch problems without a date.
  return new Date(practiceDate) < getISTDayBounds(now).end;
}

function visibleProblemQuery(batchIds = [], now = new Date(), options = {}) {
  const { end } = getISTDayBounds(now);
  const baseQuery = { status: 'PUBLISHED' };

  if (options.scope === 'GLOBAL') {
    return { ...baseQuery, scope: 'GLOBAL' };
  }

  return {
    ...baseQuery,
    $or: [
      { scope: 'GLOBAL' },
      {
        scope: 'BATCH',
        batch: { $in: batchIds },
        $or: [{ practiceDate: null }, { practiceDate: { $lt: end } }],
      },
    ],
  };
}

async function canStudentAccessProblem(studentId, problem) {
  if (!problem) return false;
  if (problem.scope === 'GLOBAL') return true;
  if (problem.scope === 'BATCH') {
    if (!isDailyPracticeDateVisible(problem.practiceDate)) return false;
    if (!problem.batch) return false;
    const enrollment = await BatchStudent.findOne({
      student: studentId,
      batch: problem.batch,
      status: 'ACTIVE',
    });
    return Boolean(enrollment);
  }
  return false;
}

module.exports = {
  canStudentAccessProblem,
  getISTDayBounds,
  isDailyPracticeDateVisible,
  visibleProblemQuery,
};
