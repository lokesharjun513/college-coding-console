// Trainer Problem Management routes

const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Problem = require('../../models/Problem');
const TestCase = require('../../models/TestCase');
const ProblemTopic = require('../../models/ProblemTopic');
const Topic = require('../../models/Topic');
const Collection = require('../../models/Collection');
const User = require('../../models/User');
const { mapLegacyToCompiler } = require('../../services/compilerRegistry');
const { assertTrainerOwnsBatch, assertTrainerOwnsProblem, assertTrainerOwnsCollection } = require('../../services/trainerAuth');
const { slugify, findSlugConflict, findSlugConflicts } = require('../../services/problemSlug');

// Route-level error wrapper: forwards thrown auth helpers to the JSON handler
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

/** Escape a user-supplied term so it is matched literally by RegExp. */
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const batchPayload = (batch) => ({
  id: batch._id,
  name: batch.name,
  code: batch.code,
});

const createdByPayload = (user) => user ? {
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
} : null;

// `compilers` is a Mongoose Map on a hydrated document and a plain object on a
// lean/read result. Normalise both to a plain {lang: compilerId} object.
const compilersPayload = (compilers) => {
  if (!compilers) return {};
  if (typeof compilers.entries === 'function') return Object.fromEntries(compilers.entries());
  return { ...compilers };
};

const problemPayload = (p) => ({
  id: p._id.toString(),
  title: p.title,
  slug: p.slug,
  description: p.description,
  difficulty: p.difficulty,
  constraints: p.constraints,
  inputFormat: p.inputFormat,
  outputFormat: p.outputFormat,
  examples: p.examples,
  starterCode: p.starterCode,
  allowedLanguages: p.allowedLanguages,
  // Compiler settings are part of the problem the trainer manages; omitting
  // them made every edit round-trip drop the language/compiler mapping.
  compilers: compilersPayload(p.compilers),
  practiceDate: p.practiceDate || null,
  archivedFrom: p.archivedFrom || null,
  batch: p.batch ? batchPayload(p.batch) : null,
  createdBy: createdByPayload(p.createdBy),
  status: p.status,
  scope: p.scope,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const resolveCompilers = (allowedLanguages) => {
  const compilers = new Map();
  for (const lang of allowedLanguages) {
    const compilerId = mapLegacyToCompiler(lang);
    if (!compilerId) {
      return { error: { success: false, code: 'COMPILER_NOT_SUPPORTED', message: `No compiler mapping for language: ${lang}` } };
    }
    compilers.set(lang, compilerId);
  }
  return { compilers: Object.fromEntries(compilers) };
};

// Attach Training/Day association (collectionId/topicId) to problem payloads.
// Read-only display data from ProblemTopic — ownership stays enforced elsewhere.
async function withAssociations(payloads, problems) {
  const ids = problems.map(p => p._id);
  if (ids.length === 0) return payloads;
  const links = await ProblemTopic.find({ problem: { $in: ids } }).select('problem collection topic').lean();
  const byProblem = new Map(links.map(l => [l.problem.toString(), { collectionId: l.collection.toString(), topicId: l.topic.toString() }]));
  return payloads.map((p, i) => ({ ...p, ...(byProblem.get(ids[i].toString()) || {}) }));
}

/**
 * A Trainer-owned Training is BATCH scope and belongs to exactly one batch
 * (enforced by the Collection model). Linking a problem in the batch named by
 * the route to a Training from a *different* batch of the same trainer would
 * create a curriculum association that crosses batch boundaries — the problem
 * would appear inside another batch's topic.
 *
 * Fails closed: a collection with no batch (for example a record created before
 * the scope/batch migration) is NOT treated as a match, so an unbackfilled
 * collection can never absorb problems from an unrelated batch.
 */
function collectionBelongsToBatch(collection, batchId) {
  return Boolean(collection && collection.batch) && String(collection.batch) === String(batchId);
}

/**
 * Resolve the curriculum scope of a batch problem listing into a set of allowed
 * problem ids.
 *
 * The Trainer Problems page is a three-level hierarchy — Collections → Topics →
 * Problems — so the listing endpoint has to be able to answer "only this
 * collection" and "only this topic" in the database. Doing it here (rather than
 * in the browser) is what makes the rows and `meta.total` describe the SAME
 * filtered dataset.
 *
 * Returns `{ problemIds }` where `problemIds === null` means "no curriculum
 * filter" (every problem in the batch, the historical behaviour), or
 * `{ error: { status, body } }` when the requested scope is not allowed.
 *
 * Two properties matter for correctness:
 *
 *  - Authorization. A collection is asserted through the shared
 *    `assertTrainerOwnsCollection` helper (BATCH scope + createdBy === caller)
 *    and is then required to belong to the batch in the URL. A topic id from
 *    another collection, another batch or another trainer cannot widen the
 *    result set; it is refused.
 *  - No duplicates. `ProblemTopic` allows one problem in several topics, so the
 *    scope is resolved with `distinct('problem', …)` and applied as
 *    `Problem._id ∈ ids`. A join would emit the same problem once per link; an
 *    `_id` membership filter cannot, because Problem rows are unique.
 */
async function resolveCurriculumScope(trainerId, batchId, { collectionId, topicId }) {
  const wantsCollection = collectionId !== undefined && collectionId !== null && collectionId !== '';
  const wantsTopic = topicId !== undefined && topicId !== null && topicId !== '';

  if (!wantsCollection && !wantsTopic) return { problemIds: null };

  let collection = null;

  // Assert the collection FIRST when the caller named one: that keeps the
  // answer to "this is not yours" independent of whether the topic id exists.
  if (wantsCollection) {
    try {
      collection = await assertTrainerOwnsCollection(trainerId, collectionId);
    } catch (err) {
      return { error: { status: err.status || 500, body: { success: false, message: err.message || 'Internal server error' } } };
    }
    if (!collectionBelongsToBatch(collection, batchId)) {
      return { error: { status: 400, body: { success: false, message: 'Selected collection belongs to a different batch' } } };
    }
  }

  let topic = null;
  if (wantsTopic) {
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return { error: { status: 400, body: { success: false, message: 'Invalid topic id' } } };
    }
    topic = await Topic.findById(topicId);
    if (!topic) {
      return { error: { status: 404, body: { success: false, message: 'Topic not found' } } };
    }
    if (collection && String(topic.collection) !== String(collection._id)) {
      return { error: { status: 400, body: { success: false, message: 'Selected topic does not belong to the selected collection' } } };
    }
    if (!collection) {
      // No collection named: derive it from the topic and apply the same rules.
      try {
        collection = await assertTrainerOwnsCollection(trainerId, topic.collection);
      } catch (err) {
        return { error: { status: err.status || 500, body: { success: false, message: err.message || 'Internal server error' } } };
      }
      if (!collectionBelongsToBatch(collection, batchId)) {
        return { error: { status: 400, body: { success: false, message: 'Selected topic belongs to a different batch' } } };
      }
    }
  }

  const linkFilter = topic
    ? { topic: topic._id, collection: collection._id }
    : { collection: collection._id };

  const problemIds = await ProblemTopic.distinct('problem', linkFilter);
  return { problemIds };
}

/**
 * CREATE PROBLEM
 * POST /api/trainer/batches/:batchId/problems
 * Authorization: batch.trainer === authenticated trainer
 */
router.post('/', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const {
    title,
    description,
    difficulty,
    constraints,
    inputFormat,
    outputFormat,
    examples,
    starterCode,
    allowedLanguages,
    status,
    practiceDate,
    collectionId,
    topicId,
  } = req.body;

  if (!title || !description || !difficulty) {
    return res.status(400).json({ success: false, message: 'Title, description, and difficulty are required' });
  }

  const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
  if (!allowedDifficulties.includes(difficulty)) {
    return res.status(400).json({ success: false, message: 'Invalid difficulty' });
  }

  const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
  if (status && !allowedStatus.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  // Validate collection/topic if provided
  if (collectionId && topicId) {
    if (!mongoose.Types.ObjectId.isValid(collectionId) || !mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid collection or topic id' });
    }
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    if (topic.collection.toString() !== collectionId) {
      return res.status(400).json({ success: false, message: 'Selected topic does not belong to the selected collection' });
    }
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    // Batch ownership is not enough: the problem would otherwise surface inside
    // an admin's or another trainer's curriculum.
    if (!collection.createdBy || collection.createdBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    // A Training belongs to exactly one batch. Linking a problem in this batch
    // to a Training from another of the trainer's batches would create a
    // curriculum association that crosses batch boundaries.
    if (!collectionBelongsToBatch(collection, batchId)) {
      return res.status(400).json({ success: false, message: 'Selected collection belongs to a different batch' });
    }
  } else if (collectionId || topicId) {
    return res.status(400).json({ success: false, message: 'Both collectionId and topicId must be provided together' });
  }

  let bodyCompilers = null;
  const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
  if (allowedLanguages && Array.isArray(allowedLanguages)) {
    const invalid = allowedLanguages.find(lang => !validLanguages.includes(lang));
    if (invalid === 'javascript') {
      return res.status(400).json({ success: false, code: 'UNSUPPORTED_LANGUAGE', message: 'JavaScript is not supported' });
    }
    if (invalid) {
      return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
    }
    const resolved = resolveCompilers(allowedLanguages);
    if (resolved.error) return res.status(400).json(resolved.error);
    bodyCompilers = resolved.compilers;
  }

  // Validate batchId is a valid ObjectId and normalize
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    return res.status(400).json({ success: false, message: 'Invalid batch id' });
  }
  const batchIdToUse = batchId && typeof batchId === 'string' ? batchId.trim() : batchId;

  const slug = slugify(title.trim());

  // Slugs are unique per batch (see services/problemSlug.js)
  const existingProblem = await findSlugConflict(Problem, { slug, scope: 'BATCH', batch: batchIdToUse });
  if (existingProblem) {
    return res.status(409).json({ success: false, message: 'Problem with this slug already exists in this batch' });
  }

  if (practiceDate) {
    const pd = new Date(practiceDate);
    if (isNaN(pd.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid practiceDate' });
    }
  }

  let problem;
  try {
    problem = await Problem.create({
      title: title.trim(),
      slug,
      description: description.trim(),
      difficulty,
      constraints: constraints ? constraints.trim() : undefined,
      inputFormat: inputFormat ? inputFormat.trim() : undefined,
      outputFormat: outputFormat ? outputFormat.trim() : undefined,
      examples: Array.isArray(examples) ? examples : [],
      starterCode: starterCode && typeof starterCode === 'object' ? starterCode : {},
      allowedLanguages: Array.isArray(allowedLanguages) ? allowedLanguages : [],
      compilers: bodyCompilers || {},
      // BATCH scope: visible only to students of this batch
      scope: 'BATCH',
      batch: new mongoose.Types.ObjectId(batchId),
      createdBy: req.user.id,
      status: status || 'DRAFT',
      practiceDate: practiceDate ? new Date(practiceDate) : null,
    });
  } catch (err) {
    console.error('Error creating problem:', err);
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }
    throw err;
  }

  if (collectionId && topicId) {
    await ProblemTopic.create({
      problem: problem._id,
      collection: collectionId,
      topic: topicId,
      createdBy: req.user.id,
    });
  }

  await problem.populate([
    { path: 'createdBy', select: '-passwordHash' },
    { path: 'batch', select: '-__v' }
  ]);

  const payload = problemPayload(problem);
  return res.status(201).json({ success: true, data: payload });
}));

/**
 * LIST PROBLEMS FOR A BATCH
 * GET /api/trainer/batches/:batchId/problems
 *
 * Optional query filters (all additive — omitting them returns the full list,
 * which is what the existing pages rely on):
 *   ?collectionId=<id>            only problems linked to this Training
 *   ?topicId=<id>                 only problems linked to this Day (implies its
 *                                 collection; may be combined with collectionId,
 *                                 which is then asserted to match)
 *   ?status=DRAFT|PUBLISHED|ARCHIVED
 *   ?difficulty=EASY|MEDIUM|HARD
 *   ?search=<title fragment, matched literally and case-insensitively>
 *   ?page=<1-based>&limit=<1..100>
 *
 * Every filter is applied to the query BEFORE pagination, and `meta.total` /
 * `meta.totalPages` are counted from that same filtered set, so the page of rows
 * and the pagination metadata can never disagree.
 *
 * `meta` is additive: clients that only read `data` are unaffected. `page` and
 * `limit` echo back as 1/null when paging was not requested.
 */
router.get('/', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const { status, difficulty, search, page, limit, collectionId, topicId } = req.query;
  const filter = { batch: new mongoose.Types.ObjectId(batchId) };

  if (status !== undefined && status !== '') {
    const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    filter.status = status;
  }
  if (difficulty !== undefined && difficulty !== '') {
    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    if (!allowedDifficulties.includes(difficulty)) {
      return res.status(400).json({ success: false, message: 'Invalid difficulty' });
    }
    filter.difficulty = difficulty;
  }
  if (search !== undefined && String(search).trim() !== '') {
    // Literal match: the term is user input and must never become a pattern.
    filter.title = new RegExp(escapeRegExp(String(search).trim()), 'i');
  }

  // Curriculum scope (collection / topic) is resolved against the database, not
  // in the browser, and is intersected with the batch filter above so a
  // collection can never surface a problem from another batch.
  const scope = await resolveCurriculumScope(req.user.id, batchId, { collectionId, topicId });
  if (scope.error) {
    return res.status(scope.error.status).json(scope.error.body);
  }
  if (scope.problemIds) {
    // An empty array is a legitimate answer ("this topic has no problems"), so
    // it is applied as-is rather than being treated as "no filter".
    filter._id = { $in: scope.problemIds };
  }

  const wantsPaging = page !== undefined || limit !== undefined;
  let pageNum = 1;
  let pageLimit = null;
  if (wantsPaging) {
    pageNum = Number.parseInt(page, 10);
    pageLimit = Number.parseInt(limit, 10);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return res.status(400).json({ success: false, message: 'Invalid page' });
    }
    if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
      return res.status(400).json({ success: false, message: 'Invalid limit' });
    }
  }

  // Counted from the fully filtered set, before skip/limit.
  const total = await Problem.countDocuments(filter);

  const query = Problem.find(filter)
    .populate({ path: 'createdBy', select: '-passwordHash' })
    .populate({ path: 'batch', select: '-__v' })
    .select('-__v')
    .sort({ createdAt: -1, _id: 1 });

  if (wantsPaging) query.skip((pageNum - 1) * pageLimit).limit(pageLimit);

  const problems = await query;

  const payloads = await withAssociations(problems.map(problemPayload), problems);

  const totalPages = wantsPaging ? Math.max(1, Math.ceil(total / pageLimit)) : null;

  return res.json({
    success: true,
    data: payloads,
    meta: {
      total,
      page: pageNum,
      limit: pageLimit,
      totalPages,
      hasNext: wantsPaging ? pageNum < totalPages : false,
      hasPrev: wantsPaging ? pageNum > 1 : false,
    },
  });
}));

/**
 * DOWNLOAD PROBLEM TEMPLATE (batch-scoped import format)
 * GET /api/trainer/batches/:batchId/problems/template
 * Registered before "/:problemId" so the literal path is not read as an id.
 *
 * The template is a row POST /import will actually accept as shipped. The
 * optional Training/Day ids are emitted as empty strings rather than
 * placeholder text: a placeholder like "<optional collection id>" is not a
 * valid ObjectId, so it made the template fail its own validation until the
 * trainer deleted the keys by hand. Empty means "no link", and the import
 * falls back to the batch/day the modal was opened with.
 *
 * Importing this file unchanged creates one DRAFT problem in this batch.
 */
/**
 * PROBLEM IMPORT TEMPLATE
 * GET /api/trainer/batches/:batchId/problems/template
 *
 * Emits the grouped shape the import endpoint prefers:
 *   { "topic": "Arrays", "problems": [ { ...fields... } ] }
 *
 * The topic is a NAME here, not an id: the importer resolves it against the
 * selected collection by normalised name and creates it when it is new. The
 * collection itself is never written into the file — it is chosen once in the
 * UI and sent with the import — so a file can be reused across trainings.
 *
 * The legacy per-problem array format is still accepted by the endpoint; this
 * template simply no longer teaches it.
 */
router.get('/template', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  await assertTrainerOwnsBatch(req.user.id, req.params.batchId);

  const template = JSON.stringify({
    // Day (Topic) NAME. Reused if this collection already has a Day with this
    // name, created once if not. Matching is by normalised name, so "Arrays",
    // "arrays" and "ARRAYS" are the same Day.
    topic: 'Arrays',
    problems: [
      {
        title: 'Two Sum',
        description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
        difficulty: 'EASY',
        constraints: '-10^9 <= nums[i] <= 10^9',
        inputFormat: 'An array of integers and a target integer.',
        outputFormat: 'Two integers representing the indices.',
        examples: [{ input: '4\n2 7 11 15\n9', output: '0 1', explanation: 'nums[0] + nums[1] = 2 + 7 = 9' }],
        // Starter code is a COMPLETE program, not a function signature.
        // Execution sends `code` verbatim to the runner with the test case as
        // stdin (services/OnlineCompilerExecutor.js) and compares stdout to
        // expectedOutput, so a bare `def two_sum(...)` prints nothing and fails
        // every case. Each starter below reads the same stdin shape its test
        // cases use and prints a single space-separated line.
        starterCode: {
          c: `#include <stdio.h>

int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
  static int out[2];
  for (int i = 0; i < numsSize; i++)
    for (int j = i + 1; j < numsSize; j++)
      if (nums[i] + nums[j] == target) { out[0] = i; out[1] = j; *returnSize = 2; return out; }
  *returnSize = 0;
  return out;
}

int main(void) {
  int n;
  if (scanf("%d", &n) != 1) return 0;
  int nums[10000];
  for (int i = 0; i < n; i++) scanf("%d", &nums[i]);
  int target;
  if (scanf("%d", &target) != 1) return 0;
  int size = 0;
  int* res = twoSum(nums, n, target, &size);
  for (int i = 0; i < size; i++) printf("%s%d", i ? " " : "", res[i]);
  printf("\\n");
  return 0;
}`,
          cpp: `#include <iostream>
#include <vector>
using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
  for (size_t i = 0; i < nums.size(); ++i)
    for (size_t j = i + 1; j < nums.size(); ++j)
      if (nums[i] + nums[j] == target) return {(int)i, (int)j};
  return {};
}

int main() {
  int n;
  if (!(cin >> n)) return 0;
  vector<int> nums(n);
  for (int& v : nums) cin >> v;
  int target;
  if (!(cin >> target)) return 0;
  vector<int> r = twoSum(nums, target);
  for (size_t i = 0; i < r.size(); ++i) cout << (i ? " " : "") << r[i];
  cout << "\\n";
  return 0;
}`,
          java: `import java.util.*;

public class Main {
  static int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
      if (seen.containsKey(target - nums[i])) return new int[]{seen.get(target - nums[i]), i};
      seen.put(nums[i], i);
    }
    return new int[]{};
  }

  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    if (!sc.hasNextInt()) return;
    int n = sc.nextInt();
    int[] nums = new int[n];
    for (int i = 0; i < n; i++) nums[i] = sc.nextInt();
    int target = sc.nextInt();
    int[] r = twoSum(nums, target);
    for (int i = 0; i < r.length; i++) System.out.print((i > 0 ? " " : "") + r[i]);
    System.out.println();
  }
}`,
          python: `import sys


def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []


def main():
    data = sys.stdin.read().split()
    if len(data) < 2:
        return
    n = int(data[0])
    nums = list(map(int, data[1:1 + n]))
    target = int(data[1 + n])
    print(*two_sum(nums, target))


if __name__ == "__main__":
    main()`
        },
        allowedLanguages: ['c', 'cpp', 'java', 'python'],
        // Omit `status` (or set "DRAFT") to import as a draft. `status` is
        // honoured when it passes validation: "PUBLISHED" makes the problem
        // visible to students immediately, "ARCHIVED" imports it archived.
        // The frontend import dialog warns about explicitly-published rows
        // (ProblemImportModal.jsx), so this is documented rather than silent.
        status: 'DRAFT',
        testCases: [
          { input: '4\n2 7 11 15\n9', expectedOutput: '0 1', isHidden: false, order: 0 },
          { input: '2\n3 2\n6', expectedOutput: '1 2', isHidden: true, order: 1 }
        ]
      }
    ]
  }, null, 2);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=trainer_problem_template.json');
  res.send(template);
}));

/**
 * GET SINGLE PROBLEM
 * GET /api/trainer/batches/:batchId/problems/:problemId
 */
router.get('/:problemId', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { problem, batch } = await assertTrainerOwnsProblem(req.user.id, req.params.batchId, req.params.problemId);
  await problem.populate({ path: 'createdBy', select: '-passwordHash' });
  const [payload] = await withAssociations(
    [problemPayload({ ...problem.toObject(), batch })],
    [problem]
  );
  return res.json({ success: true, data: payload });
}));

/**
 * UPDATE PROBLEM
 * PATCH /api/trainer/batches/:batchId/problems/:problemId
 */
router.patch('/:problemId', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { problem } = await assertTrainerOwnsProblem(req.user.id, req.params.batchId, req.params.problemId);

  const {
    title,
    description,
    difficulty,
    constraints,
    inputFormat,
    outputFormat,
    examples,
    starterCode,
    allowedLanguages,
    status,
    practiceDate,
    collectionId,
    topicId,
  } = req.body;

  // batch and createdBy are immutable via this endpoint (ownership already verified)

  if (difficulty) {
    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    if (!allowedDifficulties.includes(difficulty)) {
      return res.status(400).json({ success: false, message: 'Invalid difficulty' });
    }
  }

  if (status) {
    const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
  }

  if (collectionId !== undefined && topicId !== undefined) {
    if (collectionId && topicId) {
      if (!mongoose.Types.ObjectId.isValid(collectionId) || !mongoose.Types.ObjectId.isValid(topicId)) {
        return res.status(400).json({ success: false, message: 'Invalid collection or topic id' });
      }
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ success: false, message: 'Topic not found' });
      }
      if (topic.collection.toString() !== collectionId) {
        return res.status(400).json({ success: false, message: 'Selected topic does not belong to the selected collection' });
      }
      const collection = await Collection.findById(collectionId);
      if (!collection) {
        return res.status(404).json({ success: false, message: 'Collection not found' });
      }
      // Same rule as create: a trainer may only re-link its own problem into a
      // Training it owns.
      if (!collection.createdBy || collection.createdBy.toString() !== req.user.id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      // ...and that Training must belong to this problem's batch, for the same
      // cross-batch reason as create and import.
      if (!collectionBelongsToBatch(collection, req.params.batchId)) {
        return res.status(400).json({ success: false, message: 'Selected collection belongs to a different batch' });
      }
      await ProblemTopic.findOneAndUpdate(
        { problem: problem._id },
        { collection: collectionId, topic: topicId, createdBy: req.user.id },
        { upsert: true, returnDocument: 'after' }
      );
    } else {
      await ProblemTopic.findOneAndDelete({ problem: problem._id });
    }
  }

  if (allowedLanguages) {
    const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
    const invalid = allowedLanguages.find(lang => !validLanguages.includes(lang));
    if (invalid === 'javascript') {
      return res.status(400).json({ success: false, code: 'UNSUPPORTED_LANGUAGE', message: 'JavaScript is not supported' });
    }
    if (invalid) {
      return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
    }
    const resolved = resolveCompilers(allowedLanguages);
    if (resolved.error) return res.status(400).json(resolved.error);
    problem.compilers = resolved.compilers;
  }

  if (title && title.trim() !== problem.title) {
    const newSlug = slugify(title.trim());
    const existing = await findSlugConflict(Problem, {
      slug: newSlug,
      scope: 'BATCH',
      batch: problem.batch._id,
      excludeId: problem._id,
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists in this batch' });
    }
    problem.slug = newSlug;
  }

  if (title !== undefined) problem.title = title.trim();
  if (description !== undefined) problem.description = description.trim();
  if (difficulty !== undefined) problem.difficulty = difficulty;
  if (constraints !== undefined) problem.constraints = constraints.trim();
  if (inputFormat !== undefined) problem.inputFormat = inputFormat.trim();
  if (outputFormat !== undefined) problem.outputFormat = outputFormat.trim();
  if (examples !== undefined) problem.examples = Array.isArray(examples) ? examples : [];
  if (starterCode !== undefined) problem.starterCode = starterCode && typeof starterCode === 'object' ? starterCode : {};
  if (allowedLanguages !== undefined) problem.allowedLanguages = Array.isArray(allowedLanguages) ? allowedLanguages : [];
  if (status !== undefined) problem.status = status;
  if (practiceDate !== undefined) {
    const pd = new Date(practiceDate);
    if (isNaN(pd.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid practiceDate' });
    }
    problem.practiceDate = pd;
  }

  // Never allow the client to unscope the problem
  problem.scope = 'BATCH';

  try {
    await problem.save();
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }
    throw err;
  }

  await problem.populate([
    { path: 'createdBy', select: '-passwordHash' },
    { path: 'batch', select: '-__v' }
  ]);

  return res.json({ success: true, data: problemPayload(problem) });
}));

/**
 * IMPORT PROBLEMS (JSON) — batch-scoped
 * POST /api/trainer/batches/:batchId/problems/import
 * Every imported problem is forced to scope=BATCH and owned by this batch.
 *
 * Two accepted shapes:
 *
 *   1. Grouped (current):
 *        { topic: "Arrays", problems: [ {title, description, ...}, ... ] }
 *      The collection is chosen once in the UI and sent as the request-level
 *      `collectionId`; each problem is a bare object with no ids in it. `topic`
 *      is a NAME, resolved to an existing Day of that collection by normalised
 *      name (slug) or created once if absent. All rows are then linked to that
 *      one Day through ProblemTopic.
 *
 *   2. Legacy per-problem (still accepted, unchanged):
 *        { problems: [ {collectionId, topicId, problem} | problem, ... ],
 *          collectionId?, topicId? }
 *      Request-level ids are defaults for rows that carry none.
 *
 * The discriminator is the presence of `topic`: the legacy shape never sent one,
 * so this stays unambiguous and the old format keeps working unchanged.
 *
 * `batch` is NEVER read from the request body. It comes from the URL and is
 * forced onto every document below, so a crafted body cannot move a problem
 * into another batch.
 */
router.post('/import', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const body = req.body || {};
  const isGrouped = body.topic !== undefined && body.topic !== null;
  const { problems, collectionId: defaultCollectionId, topicId: defaultTopicId } = body;

  if (!Array.isArray(problems)) {
    return res.status(400).json({
      success: false,
      message: isGrouped
        ? 'Expected a "problems" array alongside the topic name'
        : 'Expected an array of problems',
    });
  }
  if (problems.length === 0) {
    return res.status(400).json({ success: false, message: 'This file contains no problems' });
  }
  if (problems.length > 100) {
    return res.status(400).json({ success: false, message: 'Maximum 100 problems per import' });
  }

  // A request-level collection with no Day — and no topic name to resolve one
  // from — is incomplete in either shape. Rejecting it up front is far clearer
  // than letting every single row fail with the same pairing error, which is
  // what this used to produce.
  if (!isGrouped && defaultCollectionId && !defaultTopicId) {
    return res.status(400).json({
      success: false,
      message: 'Select a topic, or supply both collectionId and topicId',
    });
  }

  const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
  const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
  const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
  const errors = [];
  const validProblems = [];

  // ---------------------------------------------------------------- topic
  //
  // Resolved once, before any row is validated, so a single Day is reused for
  // the whole file and two rows can never race to create it.
  let resolvedTopicId;
  let createdTopic = null;
  if (isGrouped) {
    if (typeof body.topic !== 'string' || !body.topic.trim()) {
      return res.status(400).json({ success: false, message: 'A topic name is required' });
    }
    const topicSlug = slugify(body.topic.trim());
    if (!topicSlug) {
      return res.status(400).json({ success: false, message: 'Topic name must contain at least one letter or number' });
    }
    // The collection is chosen once in the UI. It must be a real, BATCH-scoped
    // Training owned by this trainer, and it must belong to THIS batch — the
    // same rule the single-create and update routes apply, so grouped import
    // cannot reach admin curriculum or another trainer's batches.
    let collection;
    try {
      collection = await assertTrainerOwnsCollection(req.user.id, defaultCollectionId);
    } catch (err) {
      if (err && err.status === 404) {
        return res.status(400).json({ success: false, message: 'Select a training before importing' });
      }
      throw err;
    }
    if (!collectionBelongsToBatch(collection, batchId)) {
      return res.status(400).json({ success: false, message: 'Selected collection belongs to a different batch' });
    }

    // Reuse the Day if the collection already has one with this normalised
    // name; otherwise create it once. slugify matches how the collection routes
    // build topic slugs, so "Arrays", "arrays" and "ARRAYS" resolve to one Day.
    resolvedTopicId = (await Topic.findOne({ collection: collection._id, slug: topicSlug }))?._id;
    if (!resolvedTopicId) {
      try {
        const topic = await Topic.create({
          name: body.topic.trim(),
          slug: topicSlug,
          collection: collection._id,
          order: 0,
          status: 'ACTIVE',
          createdBy: req.user.id,
        });
        resolvedTopicId = topic._id;
        createdTopic = topic;
      } catch (err) {
        // The unique {collection, slug} index is the real guard against two
        // concurrent imports creating the same Day; re-read and reuse it rather
        // than failing the trainer's whole file.
        if (err && err.code === 11000) {
          const raced = await Topic.findOne({ collection: collection._id, slug: topicSlug });
          if (raced) {
            resolvedTopicId = raced._id;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
  }

  // ---------------------------------------------------------------- rows
  const entries = [];
  const slugs = [];
  for (let i = 0; i < problems.length; i++) {
    const entry = problems[i];
    let p = entry;
    let collectionId, topicId;
    if (isGrouped) {
      // Grouped rows are bare problem objects; any ids they carry are ignored so
      // a row cannot redirect itself into a different Training or Day.
      p = entry && entry.problem && typeof entry.problem === 'object' ? entry.problem : entry;
      collectionId = defaultCollectionId;
      topicId = resolvedTopicId;
    } else {
      if (entry && entry.problem && typeof entry.problem === 'object') {
        p = entry.problem;
        collectionId = entry.collectionId;
        topicId = entry.topicId;
      }
      // A row that carries no Day of its own falls back to the import-level
      // default, so selecting a Day once applies it to the whole file. A row
      // that carries only one of the two is left alone so it reports the
      // pairing error instead of having its mistake silently replaced.
      const rowHasCollection = collectionId !== undefined && collectionId !== null && collectionId !== '';
      const rowHasTopic = topicId !== undefined && topicId !== null && topicId !== '';
      if (!rowHasCollection && !rowHasTopic) {
        collectionId = defaultCollectionId;
        topicId = defaultTopicId;
      }
    }
    entries.push({ row: i + 1, p, collectionId, topicId });
    slugs.push(slugify(p.title));
  }

  // Import is batch-scoped: a slug that already exists in THIS batch is a
  // duplicate, while the same title in another batch is not (services/problemSlug.js)
  const existingProblems = await findSlugConflicts(Problem, { slugs, scope: 'BATCH', batch: batchId, select: 'slug' });
  const existingSlugSet = new Set(existingProblems.map(p => p.slug));
  // Slugs accepted from earlier rows of THIS file. Without it, two rows sharing
  // a title both passed the DB check and then collided on the unique
  // {slug, batch} index, which surfaced as an opaque 500 for the whole import
  // instead of a row-level error.
  const claimedSlugSet = new Set();

  for (const { row, p, collectionId, topicId } of entries) {
    if (!p.title || !p.description || !p.difficulty) {
      errors.push({ row, message: 'Missing required fields (title, description, or difficulty)' });
      continue;
    }
    if (!allowedDifficulties.includes(p.difficulty)) {
      errors.push({ row, field: 'difficulty', message: 'Invalid difficulty' });
      continue;
    }
    if (p.status && !allowedStatus.includes(p.status)) {
      errors.push({ row, field: 'status', message: 'Invalid status' });
      continue;
    }

    let compilers = {};
    if (p.allowedLanguages !== undefined && p.allowedLanguages !== null) {
      // A non-array is a mistake, not an instruction to have no languages.
      // Coercing it to [] created a problem with an empty language list and no
      // warning, so it is now a row error.
      if (!Array.isArray(p.allowedLanguages)) {
        errors.push({ row, field: 'allowedLanguages', message: 'allowedLanguages must be an array' });
        continue;
      }
      const invalid = p.allowedLanguages.find(l => !validLanguages.includes(l));
      if (invalid === 'javascript') {
        errors.push({ row, field: 'allowedLanguages', message: 'JavaScript is not supported' });
        continue;
      }
      if (invalid) {
        errors.push({ row, field: 'allowedLanguages', message: `Invalid language: ${invalid}` });
        continue;
      }
      const resolved = resolveCompilers(p.allowedLanguages);
      if (resolved.error) {
        errors.push({ row, field: 'allowedLanguages', message: resolved.error.message });
        continue;
      }
      compilers = resolved.compilers;
    }

    const slug = slugify(p.title);
    if (existingSlugSet.has(slug) || claimedSlugSet.has(slug)) {
      errors.push({ row, field: 'slug', message: 'Problem with this slug already exists' });
      continue;
    }

    // Optional Training/Day association (both required together, must be valid)
    if (collectionId || topicId) {
      if (!collectionId || !topicId || !mongoose.Types.ObjectId.isValid(collectionId) || !mongoose.Types.ObjectId.isValid(topicId)) {
        errors.push({ row, message: 'Both collectionId and topicId must be valid ids' });
        continue;
      }
      const topic = await Topic.findById(topicId);
      if (!topic || topic.collection.toString() !== collectionId) {
        errors.push({ row, message: 'Topic not found in the selected collection' });
        continue;
      }
      // Same ownership rule as create/update. Reported as a row error so one bad
      // association cannot reject an otherwise valid file.
      const linkCollection = await Collection.findById(collectionId).select('createdBy batch').lean();
      if (
        !linkCollection ||
        !linkCollection.createdBy ||
        linkCollection.createdBy.toString() !== req.user.id.toString()
      ) {
        errors.push({ row, message: 'Selected collection is not yours' });
        continue;
      }
      // ...and it must be the collection of THIS batch. Without this a trainer
      // assigned to two batches could point a batch's problems at the other
      // batch's curriculum.
      if (!collectionBelongsToBatch(linkCollection, batchId)) {
        errors.push({ row, message: 'Selected collection belongs to a different batch' });
        continue;
      }
    }

    // Validate inline testCases if provided
    let testCases = [];
    if (p.testCases !== undefined) {
      if (!Array.isArray(p.testCases)) {
        errors.push({ row, field: 'testCases', message: 'testCases must be an array' });
        continue;
      }
      const seenOrder = new Set();
      let tcValid = true;
      p.testCases.forEach((tc, idx) => {
        if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
          errors.push({ row, field: 'testCases', message: `Test case ${idx + 1} must be an object` });
          tcValid = false;
          return;
        }
        if (tc.input === undefined || tc.expectedOutput === undefined) {
          errors.push({ row, field: 'testCases', message: `Test case ${idx + 1} requires input and expectedOutput` });
          tcValid = false;
          return;
        }
        const order = tc.order ?? idx;
        if (seenOrder.has(order)) {
          errors.push({ row, field: 'testCases', message: `Duplicate order value: ${order}` });
          tcValid = false;
          return;
        }
        seenOrder.add(order);
      });
      if (!tcValid) continue;
      testCases = p.testCases;
    }

    // Text fields are trimmed below, so anything that is not a string would
    // throw mid-loop and 500 the entire import, losing every valid row. Reject
    // it as a row error instead.
    const nonString = ['title', 'description', 'constraints', 'inputFormat', 'outputFormat'].find(
      (field) => p[field] !== undefined && p[field] !== null && typeof p[field] !== 'string'
    );
    if (nonString) {
      errors.push({ row, field: nonString, message: `${nonString} must be a string` });
      continue;
    }

    // A title made only of punctuation slugifies to the empty string, which the
    // schema requires to be non-empty. That used to fail at insertMany and take
    // the whole import down with a 500.
    if (!slug) {
      errors.push({ row, field: 'title', message: 'Title must contain at least one letter or number' });
      continue;
    }

    // practiceDate is accepted by the single-create route; honouring it here
    // stops a re-import silently dropping the daily-practice schedule.
    if (p.practiceDate !== undefined && p.practiceDate !== null) {
      const parsed = new Date(p.practiceDate);
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ row, field: 'practiceDate', message: 'Invalid practiceDate' });
        continue;
      }
    }

    const trimmedExamples = Array.isArray(p.examples) ? p.examples : [];

    validProblems.push({
      title: p.title.trim(),
      slug,
      description: p.description.trim(),
      difficulty: p.difficulty,
      constraints: p.constraints ? p.constraints.trim() : undefined,
      inputFormat: p.inputFormat ? p.inputFormat.trim() : undefined,
      outputFormat: p.outputFormat ? p.outputFormat.trim() : undefined,
      examples: trimmedExamples,
      starterCode: p.starterCode && typeof p.starterCode === 'object' ? p.starterCode : {},
      // A non-array is a mistake, not an instruction to have no languages:
      // previously it was silently coerced to [] and the row was created with
      // a language list nobody asked for.
      allowedLanguages: Array.isArray(p.allowedLanguages) ? p.allowedLanguages : [],
      compilers,
      practiceDate: p.practiceDate ? new Date(p.practiceDate) : null,
      scope: 'BATCH',
      batch: batchId,
      createdBy: req.user.id,
      status: p.status || 'DRAFT',
      __row: row,
      __topicId: topicId,
      __testCases: testCases,
    });
    claimedSlugSet.add(slug);
  }

  // ---------------------------------------------------------------- writes
  //
  // Everything that persists runs inside `runWrites`, which uses a MongoDB
  // transaction when the deployment supports one. When it cannot (standalone
  // mongod) or when row-level errors mean we deliberately keep partial success,
  // the same writes run sequentially and any unexpected failure triggers
  // `cleanupWrites`, so a failed import never leaves orphan test cases, orphan
  // ProblemTopic rows, or a Day created by this import with nothing in it.
  //
  // Transaction support is *probed*, not trusted: `mongoose.__transactionSupport`
  // is derived from a topology property this driver no longer exposes, and a
  // real replica-set deployment (Atlas) reports false while transactions work
  // perfectly. So we attempt the transaction and remember the outcome. An
  // aborted transaction writes nothing, so falling back to the sequential path
  // after one is safe — there is no half-applied state to reconcile.
  let transactionsUsable = true;
  const isUnsupported = (err) =>
    err &&
    (err.code === 20 ||
      /transaction numbers are only allowed|replica set|transactions are not supported|does not support transactions/i
        .test(String(err.message)));

  const runWrites = async (fn) => {
    // A transaction is only used for the clean path. Rows that were already
    // rejected must stay rejected-and-imported-around: aborting everything would
    // throw away the partial-success behaviour the summary reports.
    if (errors.length === 0 && transactionsUsable) {
      try {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await fn(session);
          });
        } finally {
          await session.endSession();
        }
        return;
      } catch (err) {
        if (!isUnsupported(err)) throw err;
        // Remember for the rest of the process: probing once per import would
        // pay the failure on every single file.
        transactionsUsable = false;
        if (process.env.NODE_ENV !== 'test') {
          console.warn('MongoDB transactions unavailable; using sequential import writes');
        }
      }
    }
    await fn(null);
  };

  // Undo, newest first. Only ever touches documents this import created.
  const cleanupWrites = async () => {
    const ids = created.filter((p) => p && p._id).map((p) => p._id);
    if (ids.length > 0) {
      await ProblemTopic.deleteMany({ problem: { $in: ids } }).catch(() => {});
      await TestCase.deleteMany({ problem: { $in: ids } }).catch(() => {});
      await Problem.deleteMany({ _id: { $in: ids } }).catch(() => {});
    }
    // A Day this import created is only removed while nothing links to it, so a
    // topic that already had problems can never be deleted out from under them.
    if (createdTopic) {
      const linked = await ProblemTopic.countDocuments({ topic: createdTopic._id });
      if (linked === 0) await Topic.deleteOne({ _id: createdTopic._id }).catch(() => {});
    }
  };

  let created = [];
  let rolledBack = new Set();
  try {
    await runWrites(async (session) => {
      const opts = session ? { session } : {};
      // Mongoose refuses `create()` with a session and more than one document
      // unless `ordered` is set. Without this every grouped import carrying
      // test cases failed on a transaction-enabled deployment — and stayed
      // hidden for as long as the topology flag under-reported support.
      const createOpts = session ? { session, ordered: true } : {};
      created = validProblems.length > 0 ? await Problem.insertMany(validProblems, opts) : [];
      rolledBack = new Set();

      // Attach inline test cases.
      //
      // A test-case failure used to delete the parent problem and rethrow, which
      // answered 500 with no body — leaving the other rows already created and the
      // trainer with no way to learn they now exist. Now the offending problem is
      // rolled back, the failure becomes an ordinary row error, and the import
      // reports what actually survived.
      for (let i = 0; i < validProblems.length; i++) {
        const testCases = validProblems[i].__testCases;
        if (!testCases || testCases.length === 0) continue;
        const problemId = created[i]._id;
        try {
          await TestCase.create(
            testCases.map((tc, idx) => ({
              problem: problemId,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isHidden: tc.isHidden === true,
              sampleExplanation: tc.sampleExplanation || undefined,
              order: tc.order ?? idx,
            })),
            createOpts
          );
        } catch (tcerr) {
          await Problem.findByIdAndDelete(problemId, opts);
          if (process.env.NODE_ENV !== 'test') console.error('Error importing test cases:', tcerr);
          rolledBack.add(i);
          errors.push({
            row: validProblems[i].__row,
            field: 'testCases',
            message: 'Could not save the test cases; this problem was not imported',
          });
        }
      }

      // Link imported problems to Training/Day where requested.
      // Rolled-back problems are skipped: their document no longer exists.
      const topicIds = [
        ...new Set(
          validProblems
            .filter((v, i) => v.__topicId && !rolledBack.has(i))
            .map((v) => v.__topicId.toString())
        ),
      ];
      const topicDocs = topicIds.length > 0
        ? await Topic.find({ _id: { $in: topicIds } }).select('collection').session(session || null)
        : [];
      const topicCollectionMap = new Map(topicDocs.map(t => [t._id.toString(), t.collection.toString()]));

      for (let i = 0; i < validProblems.length; i++) {
        const v = validProblems[i];
        if (!v.__topicId || !created[i] || rolledBack.has(i)) continue;
        const link = {
          problem: created[i]._id,
          collection: topicCollectionMap.get(v.__topicId.toString()),
          topic: v.__topicId,
          createdBy: req.user.id,
        };
        try {
          await ProblemTopic.create([link], createOpts);
        } catch (linkerr) {
          // The {problem, topic} index is unique. A link that already exists
          // means this problem is already filed under that Day, which is the
          // state the trainer asked for, so it is not an error. Anything else
          // takes the problem back out rather than leaving a problem with no
          // way to reach it from the Day list.
          if (linkerr && linkerr.code === 11000) continue;
          await TestCase.deleteMany({ problem: created[i]._id }, opts).catch(() => {});
          await Problem.findByIdAndDelete(created[i]._id, opts).catch(() => {});
          if (process.env.NODE_ENV !== 'test') console.error('Error linking imported problem:', linkerr);
          rolledBack.add(i);
          errors.push({
            row: validProblems[i].__row,
            field: 'topicId',
            message: 'Could not link this problem to the topic; it was not imported',
          });
        }
      }
    });
  } catch (werr) {
    // Nothing half-written survives a failed import.
    await cleanupWrites();
    if (process.env.NODE_ENV !== 'test') console.error('Import failed, rolled back:', werr);
    throw werr;
  }

  // Grouped import that created a Day but ended up importing nothing would
  // otherwise leave an empty Day behind. Anything with links is left alone.
  if (createdTopic && created.every((p, i) => !p || rolledBack.has(i))) {
    const linked = await ProblemTopic.countDocuments({ topic: createdTopic._id });
    if (linked === 0) {
      await Topic.deleteOne({ _id: createdTopic._id });
      createdTopic = null;
    }
  }

  const createdCount = created.length - rolledBack.size;

  // `failed` counts distinct rejected rows, not error messages: one row can
  // produce several errors (three bad test cases used to report failed: 3 for
  // a single row), which made "Imported X of Y · N failed" print N > Y - X.
  const failedRows = new Set(errors.map((e) => e.row));

  return res.json({
    success: true,
    summary: {
      total: problems.length,
      created: createdCount,
      failed: failedRows.size,
    },
    // The Day the grouped import resolved, so the UI can report "created a new
    // Day" vs "reused Arrays" and select it. Undefined for the legacy format.
    topic: resolvedTopicId
      ? { id: resolvedTopicId, created: Boolean(createdTopic) }
      : undefined,
    errors: errors.length > 0 ? errors : undefined,
  });
}));

/**
 * DELETE / ARCHIVE PROBLEM
 * DELETE /api/trainer/batches/:batchId/problems/:problemId
 * Soft delete only: archiving preserves submissions, completions and practice
 * history. Nothing is hard-deleted from the trainer surface.
 */
router.delete('/:problemId', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const problemId = req.params.problemId;
  const { problem } = await assertTrainerOwnsProblem(req.user.id, req.params.batchId, problemId);

  // Remember where to restore to. Re-archiving an already-archived problem
  // must not overwrite the original provenance with 'ARCHIVED'.
  const archivedFrom = problem.status === 'ARCHIVED' ? (problem.archivedFrom || 'DRAFT') : problem.status;

  const updatedProblem = await Problem.findOneAndUpdate(
    { _id: problemId },
    { status: 'ARCHIVED', archivedFrom },
    { returnDocument: 'after' }
  );

  if (!updatedProblem) {
    return res.status(404).json({ success: false, message: 'Problem not found' });
  }

  return res.json({ success: true, data: null });
}));

/**
 * UNARCHIVE PROBLEM
 * PATCH /api/trainer/batches/:batchId/problems/:problemId/unarchive
 * Restores the status the problem held before it was archived.
 */
router.patch('/:problemId/unarchive', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { problem } = await assertTrainerOwnsProblem(req.user.id, req.params.batchId, req.params.problemId);
  if (problem.status !== 'ARCHIVED') {
    return res.status(400).json({ success: false, message: 'Problem is not archived' });
  }

  const restored = problem.archivedFrom === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
  await Problem.findByIdAndUpdate(problem._id, { status: restored, archivedFrom: null });

  await problem.populate({ path: 'createdBy', select: '-passwordHash' });
  const [payload] = await withAssociations(
    [problemPayload({ ...problem.toObject(), status: restored, archivedFrom: null })],
    [problem]
  );
  return res.json({ success: true, data: payload });
}));

// JSON error mapper for thrown helper errors
router.use((error, req, res, next) => {
  if (error && error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error('Trainer problem route error:', error);
  return res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = router;
