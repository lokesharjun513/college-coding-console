// Trainer Assignment Management routes (open-ended practice, no deadlines)
//
// POST   /api/trainer/batches/:batchId/assignments
// GET    /api/trainer/batches/:batchId/assignments
// GET    /api/trainer/batches/:batchId/assignments/:assignmentId
// PATCH  /api/trainer/batches/:batchId/assignments/:assignmentId
// DELETE /api/trainer/batches/:batchId/assignments/:assignmentId
//
// Authorization rules implemented here:
//   - requireAuth + requireRole('TRAINER')
//   - the batch must exist and be assigned to the authenticated trainer
//     (assertTrainerOwnsBatch); a batch with no trainer belongs to nobody
//   - only GLOBAL problems, or the trainer's own BATCH problems in this very
//     batch, may be assigned - another trainer's private problem is refused
//   - only PUBLISHED problems may be assigned, because students can only open
//     published problems
//   - `trainer`, `problem` and `batch` are server-owned and never taken from
//     the request body
//   - hidden test cases are never read or returned

const express = require('express');
const router = express.Router({ mergeParams: true });
const mongoose = require('mongoose');

const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const Assignment = require('../../models/Assignment');
const AssignmentCompletion = require('../../models/AssignmentCompletion');
const BatchStudent = require('../../models/BatchStudent');
const Problem = require('../../models/Problem');
const { assertTrainerOwnsBatch } = require('../../services/trainerAuth');

const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const ASSIGNMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'];
const DUPLICATE_KEY = 11000;

// Light problem summary. No description/starter code here: the trainer reads
// those from the batch problem endpoints, and test cases are never included.
const PROBLEM_FIELDS = 'title slug difficulty scope status practiceDate';

const problemPayload = (problem) => (problem ? {
  id: problem._id,
  title: problem.title,
  slug: problem.slug,
  difficulty: problem.difficulty,
  scope: problem.scope,
  status: problem.status,
} : null);

const assignmentPayload = (assignment, extra = {}) => ({
  id: assignment._id,
  problem: problemPayload(assignment.problem),
  batch: assignment.batch,
  title: assignment.title || null,
  availableFrom: assignment.availableFrom || null,
  status: assignment.status,
  deleted: assignment.deleted,
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt,
  ...extra,
});

/** Parse an optional ISO date. Returns { ok, value } — never throws. */
function parseOptionalDate(input) {
  if (input === undefined || input === null || input === '') return { ok: true, value: null };
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return { ok: false, value: null };
  return { ok: true, value: parsed };
}

/**
 * Decide whether `trainerId` may assign `problem` to `batchId`.
 * Throws { status } errors, following services/trainerAuth.js conventions.
 */
function assertProblemAssignable(trainerId, batchId, problem) {
  if (!problem) {
    const err = new Error('Problem not found');
    err.status = 404;
    throw err;
  }

  // Students can only open published problems, so an unpublished problem
  // would create an assignment that can never be started.
  if (problem.status !== 'PUBLISHED') {
    const err = new Error('Only published problems can be assigned');
    err.status = 400;
    throw err;
  }

  if (problem.scope === 'GLOBAL') return;

  if (problem.scope === 'BATCH') {
    // Another trainer's private problem.
    if (!problem.createdBy || problem.createdBy.toString() !== trainerId.toString()) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
    // Own problem, but scoped to a different batch.
    if (!problem.batch || problem.batch.toString() !== batchId.toString()) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
    return;
  }

  const err = new Error('Unsupported problem scope');
  err.status = 400;
  throw err;
}

/** The assignment as it would be stored, used for the duplicate pre-check. */
function duplicateQuery({ batchId, problemId, availableFrom, excludeAssignmentId }) {
  const query = {
    batch: batchId,
    problem: problemId,
    availableFrom: availableFrom === null ? null : availableFrom,
    deleted: false,
  };
  if (excludeAssignmentId) query._id = { $ne: excludeAssignmentId };
  return query;
}

/** Load an assignment owned by this trainer inside this batch, or throw 404. */
async function loadOwnedAssignment(trainerId, batchId, assignmentId) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    const err = new Error('Invalid assignment id');
    err.status = 400;
    throw err;
  }
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    batch: batchId,
    trainer: trainerId,
    deleted: false,
  });
  if (!assignment) {
    const err = new Error('Assignment not found');
    err.status = 404;
    throw err;
  }
  return assignment;
}

/**
 * CREATE ASSIGNMENT
 * POST /api/trainer/batches/:batchId/assignments
 */
router.post('/', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const { problemId, title, availableFrom, status } = req.body;

  if (!problemId) {
    return res.status(400).json({ success: false, message: 'problemId is required' });
  }
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    return res.status(400).json({ success: false, message: 'Invalid problem id' });
  }
  if (title !== undefined && title !== null && typeof title !== 'string') {
    return res.status(400).json({ success: false, message: 'title must be a string' });
  }
  if (status !== undefined && !ASSIGNMENT_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const parsedDate = parseOptionalDate(availableFrom);
  if (!parsedDate.ok) {
    return res.status(400).json({ success: false, message: 'Invalid availableFrom' });
  }

  const problem = await Problem.findById(problemId);
  assertProblemAssignable(req.user.id, batchId, problem);

  const existing = await Assignment.findOne(duplicateQuery({
    batchId,
    problemId,
    availableFrom: parsedDate.value,
  }));
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'This problem is already assigned to this batch for that availableFrom',
      code: 'DUPLICATE_ASSIGNMENT',
    });
  }

  let assignment;
  try {
    assignment = await Assignment.create({
      problem: problemId,
      batch: batchId,
      // Server-owned: a client-supplied `trainer` is ignored.
      trainer: req.user.id,
      title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
      availableFrom: parsedDate.value,
      status: status || 'ACTIVE',
    });
  } catch (error) {
    if (error && error.code === DUPLICATE_KEY) {
      return res.status(409).json({
        success: false,
        message: 'This problem is already assigned to this batch for that availableFrom',
        code: 'DUPLICATE_ASSIGNMENT',
      });
    }
    throw error;
  }

  await assignment.populate({ path: 'problem', select: PROBLEM_FIELDS });
  return res.status(201).json({ success: true, data: assignmentPayload(assignment) });
}));

/**
 * LIST ASSIGNMENTS FOR A BATCH
 * GET /api/trainer/batches/:batchId/assignments?includeDeleted=true
 */
router.get('/', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const includeDeleted = req.query.includeDeleted === 'true';
  const filter = { batch: batchId, trainer: req.user.id };
  if (!includeDeleted) filter.deleted = false;

  const assignments = await Assignment.find(filter)
    .populate({ path: 'problem', select: PROBLEM_FIELDS })
    .sort({ createdAt: -1 })
    .lean();

  // Trainer monitoring: how many students completed vs are still pending.
  const assignmentIds = assignments.map((a) => a._id);
  const enrolledStudents = assignmentIds.length > 0
    ? await BatchStudent.countDocuments({ batch: batchId, status: 'ACTIVE' })
    : 0;

  const completionCounts = assignmentIds.length > 0
    ? await AssignmentCompletion.aggregate([
      { $match: { assignment: { $in: assignmentIds } } },
      { $group: { _id: '$assignment', completed: { $sum: 1 } } },
    ])
    : [];
  const completedByAssignment = new Map(
    completionCounts.map((row) => [row._id.toString(), row.completed])
  );

  const data = assignments.map((assignment) => {
    const completed = completedByAssignment.get(assignment._id.toString()) || 0;
    return assignmentPayload(assignment, {
      monitoring: {
        enrolledStudents,
        completed,
        pending: Math.max(enrolledStudents - completed, 0),
      },
    });
  });

  return res.json({ success: true, data });
}));

/**
 * LIST PROBLEMS THAT CAN BE ASSIGNED TO THIS BATCH
 * GET /api/trainer/batches/:batchId/assignments/problems
 *
 * Registered before "/:assignmentId" so the literal path is not read as an id.
 * Mirrors assertProblemAssignable exactly: PUBLISHED problems that are either
 * GLOBAL, or BATCH-scoped to this batch AND created by this trainer.
 */
router.get('/problems', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const problems = await Problem.find({
    status: 'PUBLISHED',
    $or: [
      { scope: 'GLOBAL' },
      { scope: 'BATCH', batch: batchId, createdBy: req.user.id },
    ],
  })
    .select(PROBLEM_FIELDS)
    .sort({ title: 1 })
    .lean();

  return res.json({ success: true, data: problems.map(problemPayload) });
}));

/**
 * GET SINGLE ASSIGNMENT
 * GET /api/trainer/batches/:batchId/assignments/:assignmentId
 */
router.get('/:assignmentId', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId, assignmentId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);
  const assignment = await loadOwnedAssignment(req.user.id, batchId, assignmentId);
  await assignment.populate({ path: 'problem', select: PROBLEM_FIELDS });

  const enrolledStudents = await BatchStudent.countDocuments({ batch: batchId, status: 'ACTIVE' });
  const completed = await AssignmentCompletion.countDocuments({ assignment: assignment._id });

  return res.json({
    success: true,
    data: assignmentPayload(assignment, {
      monitoring: {
        enrolledStudents,
        completed,
        pending: Math.max(enrolledStudents - completed, 0),
      },
    }),
  });
}));

/**
 * UPDATE ASSIGNMENT
 * PATCH /api/trainer/batches/:batchId/assignments/:assignmentId
 *
 * Mutable: title, availableFrom, status.
 * Immutable (silently ignored, never taken from the body): problem, batch,
 * trainer, deleted.
 */
router.patch('/:assignmentId', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId, assignmentId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);
  const assignment = await loadOwnedAssignment(req.user.id, batchId, assignmentId);

  const { title, availableFrom, status } = req.body;

  if (title !== undefined) {
    if (title !== null && typeof title !== 'string') {
      return res.status(400).json({ success: false, message: 'title must be a string' });
    }
    assignment.title = typeof title === 'string' && title.trim() ? title.trim() : undefined;
  }

  if (status !== undefined) {
    if (!ASSIGNMENT_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    assignment.status = status;
  }

  if (availableFrom !== undefined) {
    const parsedDate = parseOptionalDate(availableFrom);
    if (!parsedDate.ok) {
      return res.status(400).json({ success: false, message: 'Invalid availableFrom' });
    }
    assignment.availableFrom = parsedDate.value;

    const clash = await Assignment.findOne(duplicateQuery({
      batchId,
      problemId: assignment.problem.toString(),
      availableFrom: parsedDate.value,
      excludeAssignmentId: assignment._id,
    }));
    if (clash) {
      return res.status(409).json({
        success: false,
        message: 'Another assignment already uses this problem for that availableFrom',
        code: 'DUPLICATE_ASSIGNMENT',
      });
    }
  }

  try {
    await assignment.save();
  } catch (error) {
    if (error && error.code === DUPLICATE_KEY) {
      return res.status(409).json({
        success: false,
        message: 'Another assignment already uses this problem for that availableFrom',
        code: 'DUPLICATE_ASSIGNMENT',
      });
    }
    throw error;
  }

  await assignment.populate({ path: 'problem', select: PROBLEM_FIELDS });
  return res.json({ success: true, data: assignmentPayload(assignment) });
}));

/**
 * SOFT DELETE ASSIGNMENT
 * DELETE /api/trainer/batches/:batchId/assignments/:assignmentId
 *
 * Soft delete only: the row is retained (and existing completions stay valid),
 * and the partial unique index frees the (batch, problem, availableFrom) slot.
 */
router.delete('/:assignmentId', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId, assignmentId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);
  await loadOwnedAssignment(req.user.id, batchId, assignmentId);

  const updated = await Assignment.findOneAndUpdate(
    { _id: assignmentId, batch: batchId, trainer: req.user.id, deleted: false },
    { $set: { deleted: true } },
    { returnDocument: 'after' }
  );
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Assignment not found' });
  }

  await updated.populate({ path: 'problem', select: PROBLEM_FIELDS });
  return res.json({ success: true, data: assignmentPayload(updated) });
}));

// JSON error mapper for thrown helper errors
router.use((error, req, res, next) => {
  if (error && error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (error && error.code === DUPLICATE_KEY) {
    return res.status(409).json({ success: false, message: 'Assignment already exists' });
  }
  console.error('Trainer assignment route error:', error);
  return res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = router;