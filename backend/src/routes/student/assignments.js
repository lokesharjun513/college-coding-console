// Student Assignment routes (open-ended practice, no deadlines)
//
// GET /api/student/assignments
// GET /api/student/assignments/:assignmentId
//
// Rules implemented here:
//   - requireAuth + requireAnyRole('STUDENT'); the student identity comes from
//     the verified token only, never from the body or a query parameter
//   - only ACTIVE, non-deleted assignments in batches where the student has an
//     ACTIVE enrollment
//   - assignments whose availableFrom is still in the future are not listed
//   - only safe problem fields are populated; TestCase documents are never
//     queried, so hidden expected outputs cannot leak
//   - completion status comes from AssignmentCompletion for THIS student and
//     THIS assignment, and is deliberately kept separate from global problem
//     submission history
//   - one card per (batch, problem). A problem may hold several Assignment rows
//     because `availableFrom` is part of its identity, but that is scheduling,
//     not extra work: the student sees it once. Collapsing happens at read time
//     and never touches a stored record. See services/assignmentCompletion.js
//     collapseByProblem.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const Assignment = require('../../models/Assignment');
const {
  collapseByProblem,
  findCompletionsForAssignments,
  getActiveEnrolledBatchIds,
  getCompletionMap,
} = require('../../services/assignmentCompletion');

// Explicit allow-list. `examples` is the authored sample data on the Problem
// document, NOT TestCase data, so hidden expected outputs are never included.
const STUDENT_PROBLEM_FIELDS = [
  'title',
  'slug',
  'description',
  'difficulty',
  'constraints',
  'inputFormat',
  'outputFormat',
  'examples',
  'starterCode',
  'allowedLanguages',
  'scope',
  'status',
  'practiceDate',
].join(' ');

const problemPayload = (problem) => (problem ? {
  id: problem._id,
  title: problem.title,
  slug: problem.slug,
  description: problem.description,
  difficulty: problem.difficulty,
  constraints: problem.constraints,
  inputFormat: problem.inputFormat,
  outputFormat: problem.outputFormat,
  examples: problem.examples,
  starterCode: problem.starterCode,
  allowedLanguages: problem.allowedLanguages,
  scope: problem.scope,
  status: problem.status,
  practiceDate: problem.practiceDate || null,
} : null);

const assignmentPayload = (assignment, completion) => ({
  id: assignment._id,
  title: assignment.title || (assignment.problem ? assignment.problem.title : null),
  problem: problemPayload(assignment.problem),
  batch: assignment.batch
    ? { id: assignment.batch._id || assignment.batch, name: assignment.batch.name, code: assignment.batch.code }
    : null,
  availableFrom: assignment.availableFrom || null,
  status: assignment.status,
  // Assignment-scoped completion, never derived from global submission history.
  completed: Boolean(completion),
  completion: completion ? {
    verdict: completion.verdict,
    completedAt: completion.completedAt,
  } : null,
  createdAt: assignment.createdAt,
});

/** Base visibility filter shared by the list and detail endpoints. */
function visibleFilter(batchIds, now) {
  return {
    batch: { $in: batchIds },
    status: 'ACTIVE',
    deleted: false,
    $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }],
  };
}

/**
 * LIST THE STUDENT'S ASSIGNMENTS
 * GET /api/student/assignments
 */
router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(401).json({ success: false, message: 'Invalid user session' });
    }

    const batchIds = await getActiveEnrolledBatchIds(studentId);
    if (batchIds.length === 0) {
      return res.json({ success: true, data: [], meta: { enrolled: false, activeBatches: 0, total: 0, completed: 0, pending: 0 } });
    }

    const assignments = await Assignment.find(visibleFilter(batchIds, new Date()))
      .populate({ path: 'problem', select: STUDENT_PROBLEM_FIELDS })
      .populate({ path: 'batch', select: 'name code' })
      .sort({ availableFrom: 1, createdAt: 1 })
      .lean();

    // visibleFilter has already dropped future-dated rows, so scheduling in
    // advance can never reveal a problem early.
    const completions = await findCompletionsForAssignments(assignments.map((a) => a._id));
    const collapsed = collapseByProblem(assignments, completions);

    const data = collapsed.map(({ assignment, completion }) =>
      assignmentPayload(assignment, completion)
    );

    const completed = collapsed.filter((item) => Boolean(item.completion)).length;

    return res.json({
      success: true,
      data,
      meta: {
        enrolled: true,
        activeBatches: batchIds.length,
        total: data.length,
        completed,
        pending: data.length - completed,
      },
    });
  } catch (error) {
    console.error('Error listing student assignments:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET A SINGLE ASSIGNMENT
 * GET /api/student/assignments/:assignmentId
 *
 * An assignment outside the student's active enrollments is reported as 404 so
 * the endpoint cannot be used to probe other batches' assignments.
 */
router.get('/:assignmentId', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { assignmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(401).json({ success: false, message: 'Invalid user session' });
    }
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid assignment id' });
    }

    const batchIds = await getActiveEnrolledBatchIds(studentId);
    const assignment = batchIds.length > 0
      ? await Assignment.findOne({ ...visibleFilter(batchIds, new Date()), _id: assignmentId })
        .populate({ path: 'problem', select: STUDENT_PROBLEM_FIELDS })
        .populate({ path: 'batch', select: 'name code' })
        .lean()
      : null;

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Report the PROBLEM's state, not just this row's. A student who bookmarks
    // a non-canonical duplicate must not see "not completed" while the feed
    // shows the same problem as completed. Any eligible sibling row counts.
    const siblings = await Assignment.find({
      batch: assignment.batch._id,
      problem: assignment.problem._id,
      status: 'ACTIVE',
      deleted: false,
      $or: [{ availableFrom: null }, { availableFrom: { $lte: new Date() } }],
    })
      .select('_id')
      .lean();

    const completionMap = await getCompletionMap(studentId, siblings.map((s) => s._id));
    const completion = siblings.length > 0
      ? completionMap.values().next().value ?? null
      : null;

    return res.json({
      success: true,
      data: assignmentPayload(assignment, completion),
    });
  } catch (error) {
    console.error('Error fetching student assignment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;