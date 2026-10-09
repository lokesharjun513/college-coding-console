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
const { assertTrainerOwnsBatch, assertTrainerOwnsProblem } = require('../../services/trainerAuth');

// Route-level error wrapper: forwards thrown auth helpers to the JSON handler
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

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

const problemPayload = (p) => ({
  id: p._id,
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

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const existingProblem = await Problem.findOne({ slug });
  if (existingProblem) {
    return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
  }

  if (practiceDate) {
    const pd = new Date(practiceDate);
    if (isNaN(pd.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid practiceDate' });
    }
  }

  const problem = await Problem.create({
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
    batch: batchId,
    createdBy: req.user.id,
    status: status || 'DRAFT',
    practiceDate: practiceDate ? new Date(practiceDate) : null,
  });

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

  return res.status(201).json({ success: true, data: problemPayload(problem) });
}));

/**
 * LIST PROBLEMS FOR A BATCH
 * GET /api/trainer/batches/:batchId/problems
 */
router.get('/', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const problems = await Problem.find({ batch: batchId })
    .populate({ path: 'createdBy', select: '-passwordHash' })
    .populate({ path: 'batch', select: '-__v' })
    .select('-__v');

  const payloads = await withAssociations(problems.map(problemPayload), problems);

  return res.json({ success: true, data: payloads });
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
    const newSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const existing = await Problem.findOne({ slug: newSlug, _id: { $ne: problem._id } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
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

  await problem.save();

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
 */
router.post('/import', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const { batchId } = req.params;
  await assertTrainerOwnsBatch(req.user.id, batchId);

  const { problems } = req.body;
  if (!Array.isArray(problems)) {
    return res.status(400).json({ success: false, message: 'Expected an array of problems' });
  }
  if (problems.length > 100) {
    return res.status(400).json({ success: false, message: 'Maximum 100 problems per import' });
  }

  const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
  const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
  const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
  const errors = [];
  const validProblems = [];
  const topicLinks = [];
  const slugify = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const entries = [];
  const slugs = [];
  for (let i = 0; i < problems.length; i++) {
    const entry = problems[i];
    let p = entry;
    let collectionId = null, topicId = null;
    if (entry.problem && typeof entry.problem === 'object') {
      p = entry.problem;
      collectionId = entry.collectionId;
      topicId = entry.topicId;
    }
    entries.push({ row: i + 1, p, collectionId, topicId });
    slugs.push(slugify(p.title));
  }

  const existingProblems = await Problem.find({ slug: { $in: slugs } }).select('slug');
  const existingSlugSet = new Set(existingProblems.map(p => p.slug));

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
    if (p.allowedLanguages && Array.isArray(p.allowedLanguages)) {
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
    if (existingSlugSet.has(slug)) {
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

    validProblems.push({
      title: p.title.trim(),
      slug,
      description: p.description.trim(),
      difficulty: p.difficulty,
      constraints: p.constraints ? p.constraints.trim() : undefined,
      inputFormat: p.inputFormat ? p.inputFormat.trim() : undefined,
      outputFormat: p.outputFormat ? p.outputFormat.trim() : undefined,
      examples: Array.isArray(p.examples) ? p.examples : [],
      starterCode: p.starterCode && typeof p.starterCode === 'object' ? p.starterCode : {},
      allowedLanguages: Array.isArray(p.allowedLanguages) ? p.allowedLanguages : [],
      compilers,
      scope: 'BATCH',
      batch: batchId,
      createdBy: req.user.id,
      status: p.status || 'DRAFT',
      __topicId: topicId,
      __testCases: testCases,
    });
  }

  const created = validProblems.length > 0 ? await Problem.insertMany(validProblems) : [];

  // Attach inline test cases; roll back the problem if creation fails
  for (let i = 0; i < validProblems.length; i++) {
    const testCases = validProblems[i].__testCases;
    if (!testCases || testCases.length === 0) continue;
    const problemId = created[i]._id;
    try {
      await TestCase.create(testCases.map((tc, idx) => ({
        problem: problemId,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isHidden: tc.isHidden === true,
        sampleExplanation: tc.sampleExplanation || undefined,
        order: tc.order ?? idx,
      })));
    } catch (tcerr) {
      await Problem.findByIdAndDelete(problemId);
      if (process.env.NODE_ENV !== 'test') console.error('Error importing test cases:', tcerr);
      throw tcerr;
    }
  }

  // Link imported problems to Training/Day where requested
  const topicIds = [...new Set(validProblems.filter(v => v.__topicId).map(v => v.__topicId.toString()))];
  const topicDocs = topicIds.length > 0 ? await Topic.find({ _id: { $in: topicIds } }).select('collection') : [];
  const topicCollectionMap = new Map(topicDocs.map(t => [t._id.toString(), t.collection.toString()]));
  for (let i = 0; i < validProblems.length; i++) {
    const v = validProblems[i];
    if (!v.__topicId || !created[i]) continue;
    await ProblemTopic.create({
      problem: created[i]._id,
      collection: topicCollectionMap.get(v.__topicId.toString()),
      topic: v.__topicId,
      createdBy: req.user.id,
    });
  }

  return res.json({
    success: true,
    summary: {
      total: problems.length,
      created: created.length,
      failed: errors.length,
    },
    errors: errors.length > 0 ? errors : undefined,
  });
}));

/**
 * DOWNLOAD PROBLEM TEMPLATE (batch-scoped import format)
 * GET /api/trainer/batches/:batchId/problems/template
 */
router.get('/template', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  await assertTrainerOwnsBatch(req.user.id, req.params.batchId);

  const template = JSON.stringify([
    {
      topicId: '<optional topic (Day) id>',
      problem: {
        title: 'Two Sum',
        description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
        difficulty: 'EASY',
        constraints: '-10^9 <= nums[i] <= 10^9',
        inputFormat: 'An array of integers and a target integer.',
        outputFormat: 'Two integers representing the indices.',
        examples: [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] = 2 + 7 = 9' }],
        starterCode: {
          c: 'int* twoSum(int* nums, int numsSize, int target, int* returnSize) {}',
          cpp: 'vector<int> twoSum(vector<int>& nums, int target) {}',
          java: 'int[] twoSum(int[] nums, int target) {}',
          python: 'def twoSum(nums, target):'
        },
        allowedLanguages: ['c', 'cpp', 'java', 'python'],
        status: 'PUBLISHED',
        testCases: [
          { input: '2 7 11 15\n9', expectedOutput: '0 1', isHidden: false, order: 0 },
          { input: '3 2 4\n6', expectedOutput: '1 2', isHidden: true, order: 1 }
        ]
      }
    }
  ], null, 2);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=trainer_problem_template.json');
  res.send(template);
}));

/**
 * DELETE / ARCHIVE PROBLEM
 * DELETE /api/trainer/batches/:batchId/problems/:problemId
 */
router.delete('/:problemId', requireAuth, requireRole('TRAINER'), handle(async (req, res) => {
  const problemId = req.params.problemId;
  await assertTrainerOwnsProblem(req.user.id, req.params.batchId, problemId);

  // Soft delete: archive (preserves references from submissions/practice)
  const updatedProblem = await Problem.findOneAndUpdate(
    { _id: problemId },
    { status: 'ARCHIVED' },
    { returnDocument: 'after' }
  );

  if (!updatedProblem) {
    return res.status(404).json({ success: false, message: 'Problem not found' });
  }

  return res.json({ success: true, data: null });
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
