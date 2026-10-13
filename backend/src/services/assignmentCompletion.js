// backend/src/services/assignmentCompletion.js
//
// Assignment completion recording for open-ended practice.
//
// A completion is keyed strictly by (assignment, student). The same problem
// assigned to two different batches yields two independent assignments, and
// completing one never completes the other.
//
// INVARIANTS ENFORCED HERE
// -------------------------
//  1. A completion is only ever derived from a PERSISTED Submission document.
//     The problem is read back from that submission rather than trusted from
//     the caller, so a caller cannot point a completion at an unrelated
//     problem.
//  2. The submission's verdict must be ACCEPTED. Non-accepted verdicts never
//     complete an assignment.
//  3. The submission must belong to the authenticated student.
//  4. Assignments must be ACTIVE, not deleted, already available
//     (availableFrom null or <= now), and in a batch where the student holds
//     an ACTIVE BatchStudent enrollment.
//  5. Idempotent: re-processing the same accepted submission never creates a
//     second row and never overwrites the originally recorded
//     acceptedSubmission / completedAt.
//  6. TestCase documents are never read here, so hidden expected outputs
//     cannot leak.
//
// CALLER CONTRACT
// --------------
// Call only after the submission has been persisted and the final verdict is
// known. Completion recording is secondary: a failure here must never change
// the submission's verdict or its HTTP response.

const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const AssignmentCompletion = require('../models/AssignmentCompletion');
const BatchStudent = require('../models/BatchStudent');
const Submission = require('../models/Submission');

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);

/** Reason codes returned when nothing is recorded. */
const SKIP_REASONS = {
  SUBMISSION_NOT_FOUND: 'SUBMISSION_NOT_FOUND',
  SUBMISSION_NOT_ACCEPTED: 'SUBMISSION_NOT_ACCEPTED',
  SUBMISSION_STUDENT_MISMATCH: 'SUBMISSION_STUDENT_MISMATCH',
  PROBLEM_MISMATCH: 'PROBLEM_MISMATCH',
  NO_ENROLLMENT: 'NO_ENROLLMENT',
  NO_COMPLETABLE_ASSIGNMENTS: 'NO_COMPLETABLE_ASSIGNMENTS',
};

/**
 * Batches the student is actively enrolled in.
 * Identity convention: BatchStudent.student is the authenticated User ID.
 */
async function getActiveEnrolledBatchIds(studentId) {
  const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' })
    .select('batch')
    .lean();
  return enrollments.map((e) => e.batch);
}

/**
 * Assignments a student may currently act on for a problem: ACTIVE, not
 * deleted, already available, and in a batch the student is enrolled in.
 */
async function findCompletableAssignments({ studentId, problemId, now = new Date() }) {
  const batchIds = await getActiveEnrolledBatchIds(studentId);
  if (batchIds.length === 0) return [];

  return Assignment.find({
    problem: problemId,
    batch: { $in: batchIds },
    status: 'ACTIVE',
    deleted: false,
    $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }],
  }).select('_id').lean();
}

/**
 * Record an accepted solution as the completion of every applicable assignment.
 *
 * @param {object}  args
 * @param {string}  args.studentId      Authenticated User ID (req.user.id).
 * @param {string}  args.submissionId   Persisted Submission _id.
 * @param {string} [args.problemId]     Optional cross-check; when supplied it
 *                                      must match the submission's problem.
 * @param {Date}   [args.now]           Injectable clock for tests.
 * @returns {Promise<{recorded: object[], skipped: object[], matched: number,
 *                    reason: (string|null), submission: object|null}>}
 */
async function recordAssignmentCompletion({ studentId, submissionId, problemId, now = new Date() }) {
  if (!isValidId(studentId) || !isValidId(submissionId)) {
    const err = new Error('studentId and submissionId must be valid ids');
    err.status = 400;
    throw err;
  }
  if (problemId !== undefined && problemId !== null && !isValidId(problemId)) {
    const err = new Error('problemId must be a valid id when provided');
    err.status = 400;
    throw err;
  }

  const empty = { recorded: [], skipped: [], matched: 0, reason: null, submission: null };

  // 1. The completion must be backed by a real, persisted submission.
  const submission = await Submission.findById(submissionId)
    .select('student problem verdict')
    .lean();
  if (!submission) {
    return { ...empty, reason: SKIP_REASONS.SUBMISSION_NOT_FOUND };
  }

  // 2. Only an accepted submission can satisfy an assignment.
  if (submission.verdict !== 'ACCEPTED') {
    return { ...empty, reason: SKIP_REASONS.SUBMISSION_NOT_ACCEPTED, submission };
  }

  // 3. A student can only complete their own work.
  if (submission.student.toString() !== studentId.toString()) {
    return { ...empty, reason: SKIP_REASONS.SUBMISSION_STUDENT_MISMATCH, submission };
  }

  // 4. The problem comes from the submission; an explicit cross-check must agree.
  const submissionProblemId = submission.problem.toString();
  if (problemId && problemId.toString() !== submissionProblemId) {
    return { ...empty, reason: SKIP_REASONS.PROBLEM_MISMATCH, submission };
  }

  const batchIds = await getActiveEnrolledBatchIds(studentId);
  if (batchIds.length === 0) {
    return { ...empty, reason: SKIP_REASONS.NO_ENROLLMENT, submission };
  }

  const assignments = await findCompletableAssignments({
    studentId,
    problemId: submissionProblemId,
    now,
  });
  if (assignments.length === 0) {
    return { ...empty, reason: SKIP_REASONS.NO_COMPLETABLE_ASSIGNMENTS, submission };
  }

  const recorded = [];
  const skipped = [];

  for (const assignment of assignments) {
    try {
      // $setOnInsert keeps re-processing idempotent: the first accepted
      // submission stays the recorded one.
      const completion = await AssignmentCompletion.findOneAndUpdate(
        { assignment: assignment._id, student: submission.student },
        {
          $setOnInsert: {
            assignment: assignment._id,
            student: submission.student,
            verdict: submission.verdict,
            acceptedSubmission: submission._id,
            completedAt: now,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      ).lean();
      recorded.push(completion);
    } catch (error) {
      // 11000 = a concurrent writer inserted the same (assignment, student) pair.
      if (error && error.code === 11000) {
        skipped.push(assignment._id);
        continue;
      }
      throw error;
    }
  }

  return {
    recorded,
    skipped,
    matched: assignments.length,
    reason: null,
    submission,
  };
}

/**
 * Map of assignmentId (string) -> completion document, for a single student.
 * Used by the student assignment routes to attach completion status.
 */
async function getCompletionMap(studentId, assignmentIds) {
  const ids = (assignmentIds || []).filter(isValidId);
  const map = new Map();
  if (ids.length === 0) return map;

  const completions = await AssignmentCompletion.find({
    student: studentId,
    assignment: { $in: ids },
  })
    .select('assignment verdict completedAt')
    .lean();

  for (const completion of completions) {
    map.set(completion.assignment.toString(), completion);
  }
  return map;
}

module.exports = {
  SKIP_REASONS,
  findCompletableAssignments,
  getActiveEnrolledBatchIds,
  getCompletionMap,
  recordAssignmentCompletion,
};