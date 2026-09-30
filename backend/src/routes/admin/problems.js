const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const Problem = require('../../models/Problem');
const Collection = require('../../models/Collection');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');
const User = require('../../models/User');

/**
 * CREATE PROBLEM (ADMIN)
 * POST /api/admin/problems
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
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
      batch,
      scope = 'GLOBAL',
      collectionId,
      topicId,
    } = req.body;

    // Validate required fields
    if (!title || !description || !difficulty) {
      return res.status(400).json({ success: false, message: 'Title, description, and difficulty are required' });
    }

    // Validate difficulty enum
    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    if (!allowedDifficulties.includes(difficulty)) {
      return res.status(400).json({ success: false, message: 'Invalid difficulty' });
    }

    // Validate scope enum
    const allowedScopes = ['GLOBAL', 'BATCH'];
    if (!allowedScopes.includes(scope)) {
      return res.status(400).json({ success: false, message: 'Invalid scope' });
    }

    // Validate batch if provided for BATCH scope
    let batchId = batch;
    if (scope === 'BATCH' && batchId) {
      if (!mongoose.Types.ObjectId.isValid(batchId)) {
        return res.status(400).json({ success: false, message: 'Invalid batch id' });
      }
      const batchDoc = await Batch.findById(batchId);
      if (!batchDoc) {
        return res.status(404).json({ success: false, message: 'Batch not found' });
      }
    }

    // Validate status enum if provided
    const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Validate allowedLanguages enum if provided
    const allowedLanguageValues = ['c', 'cpp', 'java', 'python', 'javascript'];
    if (allowedLanguages && Array.isArray(allowedLanguages)) {
      const invalid = allowedLanguages.find(l => !allowedLanguageValues.includes(l));
      if (invalid) {
        return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
      }
    }

    // Validate collection/topic relationship if provided
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

    // Generate slug
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^[-]+|-+$/g, '');

    // Check duplicate slug
    const existing = await Problem.findOne({ slug });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }

    const creatorId = req.user.id;

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
      scope,
      batch: scope === 'BATCH' ? batchId : undefined,
      createdBy: creatorId,
      status: status || 'DRAFT',
    });

    // If collectionId and topicId are provided, create ProblemTopic link
    if (collectionId && topicId) {
      const ProblemTopic = require('../../models/ProblemTopic');
      await ProblemTopic.create({
        problem: problem._id,
        collection: collectionId,
        topic: topicId,
        createdBy: creatorId,
      });
    }

    await problem.populate([
      { path: 'createdBy', select: '-passwordHash' },
      { path: 'batch', select: '-__v' },
    ]);

    // Fetch collection and topic if linked
    let collectionData = null;
    let topicData = null;
    if (collectionId && topicId) {
      const ProblemTopic = require('../../models/ProblemTopic');
      const problemTopic = await ProblemTopic.findOne({ problem: problem._id });
      if (problemTopic) {
        await problemTopic.populate([
          { path: 'collection', select: '-__v' },
          { path: 'topic', select: '-__v' },
        ]);
        if (problemTopic.collection) {
          collectionData = { id: problemTopic.collection._id, name: problemTopic.collection.name };
        }
        if (problemTopic.topic) {
          topicData = { id: problemTopic.topic._id, name: problemTopic.topic.name };
        }
      }
    }

    const data = {
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
      batch: problem.batch ? { id: problem.batch._id, name: problem.batch.name, code: problem.batch.code } : null,
      collection: collectionData,
      topic: topicData,
      createdBy: {
        id: problem.createdBy._id,
        name: problem.createdBy.name,
        email: problem.createdBy.email,
        role: problem.createdBy.role,
        status: problem.createdBy.status,
      },
      status: problem.status,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
    };

    return res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error creating problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST ALL PROBLEMS (ADMIN)
 * GET /api/admin/problems
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const problems = await Problem.find()
      .populate({ path: 'createdBy', select: '-passwordHash' })
      .populate({ path: 'batch', select: '-__v' })
      .select('-__v');

    const data = problems.map(p => ({
      id: p._id,
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      status: p.status,
      batch: p.batch ? { id: p.batch._id, name: p.batch.name, code: p.batch.code } : null,
      createdBy: p.createdBy ? {
        id: p.createdBy._id,
        name: p.createdBy.name,
        email: p.createdBy.email,
        role: p.createdBy.role,
        status: p.createdBy.status,
      } : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing problems:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE PROBLEM (ADMIN)
 * GET /api/admin/problems/:problemId
 */
router.get('/:problemId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
  const { problemId } = req.params;
  if (problemId === 'template') {
    return next();
  }
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }
    const problem = await Problem.findById(problemId)
      .populate({ path: 'createdBy', select: '-passwordHash' })
      .populate({ path: 'batch', select: '-__v' })
      .select('-__v');
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    const data = {
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
      batch: problem.batch ? { id: problem.batch._id, name: problem.batch.name, code: problem.batch.code } : null,
      createdBy: problem.createdBy ? {
        id: problem.createdBy._id,
        name: problem.createdBy.name,
        email: problem.createdBy.email,
        role: problem.createdBy.role,
        status: problem.createdBy.status,
      } : null,
      status: problem.status,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
    };
    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error getting problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE PROBLEM (ADMIN)
 * PATCH /api/admin/problems/:problemId
 */
router.patch('/:problemId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { problemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }
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
      batch,
      collectionId,
      topicId,
    } = req.body;

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    // Validate enums if provided
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
    if (allowedLanguages && Array.isArray(allowedLanguages)) {
      const allowedLanguageValues = ['c', 'cpp', 'java', 'python', 'javascript'];
      const invalid = allowedLanguages.find(l => !allowedLanguageValues.includes(l));
      if (invalid) {
        return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
      }
    }
    if (batch) {
      if (!mongoose.Types.ObjectId.isValid(batch)) {
        return res.status(400).json({ success: false, message: 'Invalid batch id' });
      }
      const batchDoc = await Batch.findById(batch);
      if (!batchDoc) {
        return res.status(404).json({ success: false, message: 'Batch not found' });
      }
    }
    // Validate collection/topic relationship if provided
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

    // If title changes, regenerate slug and check duplicate
    if (title && title.trim() !== problem.title) {
      const newSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^[-]+|-+$/g, '');
      const existing = await Problem.findOne({ slug: newSlug, _id: { $ne: problemId } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
      }
      problem.slug = newSlug;
    }

    // Apply updates
    if (title !== undefined) problem.title = title.trim();
    if (description !== undefined) problem.description = description.trim();
    if (difficulty !== undefined) problem.difficulty = difficulty;
    if (constraints !== undefined) problem.constraints = constraints ? constraints.trim() : undefined;
    if (inputFormat !== undefined) problem.inputFormat = inputFormat ? inputFormat.trim() : undefined;
    if (outputFormat !== undefined) problem.outputFormat = outputFormat ? outputFormat.trim() : undefined;
    if (examples !== undefined) problem.examples = Array.isArray(examples) ? examples : [];
    if (starterCode !== undefined) problem.starterCode = starterCode && typeof starterCode === 'object' ? starterCode : {};
    if (allowedLanguages !== undefined) problem.allowedLanguages = Array.isArray(allowedLanguages) ? allowedLanguages : [];
    if (status !== undefined) problem.status = status;
    if (batch !== undefined) problem.batch = batch;

    // Update ProblemTopic link if provided
    if (collectionId !== undefined && topicId !== undefined) {
      const ProblemTopic = require('../../models/ProblemTopic');
      if (collectionId && topicId) {
        await ProblemTopic.findOneAndUpdate(
          { problem: problemId },
          { collection: collectionId, topic: topicId, createdBy: req.user.id },
          { upsert: true, new: true }
        );
      } else {
        // If they are explicitly set to null/empty, remove the link
        await ProblemTopic.findOneAndDelete({ problem: problemId });
      }
    }

    const updated = await Problem.findByIdAndUpdate(problemId, problem, { new: true })
      .populate({ path: 'createdBy', select: '-passwordHash' })
      .populate({ path: 'batch', select: '-__v' })
      .select('-__v');

    const data = {
      id: updated._id,
      title: updated.title,
      slug: updated.slug,
      description: updated.description,
      difficulty: updated.difficulty,
      constraints: updated.constraints,
      inputFormat: updated.inputFormat,
      outputFormat: updated.outputFormat,
      examples: updated.examples,
      starterCode: updated.starterCode,
      allowedLanguages: updated.allowedLanguages,
      batch: updated.batch ? { id: updated.batch._id, name: updated.batch.name, code: updated.batch.code } : null,
      createdBy: updated.createdBy ? {
        id: updated.createdBy._id,
        name: updated.createdBy.name,
        email: updated.createdBy.email,
        role: updated.createdBy.role,
        status: updated.createdBy.status,
      } : null,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
    return res.json({ success: true, data });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error updating problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE / ARCHIVE PROBLEM (ADMIN)
 * DELETE /api/admin/problems/:problemId
 */
router.delete('/:problemId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { problemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }
    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    if (problem.status === 'ARCHIVED') {
      // Hard delete permanently
      await Problem.findByIdAndDelete(problemId);
      return res.json({ success: true, data: null, hardDeleted: true });
    }
    // Soft delete by setting status to ARCHIVED
    const updated = await Problem.findByIdAndUpdate(problemId, { status: 'ARCHIVED' }, { new: true });
    return res.json({ success: true, data: null, hardDeleted: false });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error deleting problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * IMPORT PROBLEMS (JSON)
 * POST /api/admin/problems/import
 */
router.post('/import', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { problems } = req.body;

    if (!Array.isArray(problems)) {
      return res.status(400).json({
        success: false,
        message: 'Expected an array of problems',
      });
    }

    if (problems.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 problems per import',
      });
    }

    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    const allowedScopes = ['GLOBAL', 'BATCH'];
    const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    const allowedLanguageValues = ['c', 'cpp', 'java', 'python', 'javascript'];
    const errors = [];
    const validProblems = [];
    const topicLinks = [];
    function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[-]+|-+$/g, ''); }

    // Preprocess entries and collect slugs for bulk duplicate check
    const entries = [];
    const slugs = [];
    for (let i = 0; i < problems.length; i++) {
      const entry = problems[i];
      const row = i + 1;
      // Detect new format: has 'problem' key
      let p = entry;
      let collectionName = null, topicName = null;
      if (entry.problem && typeof entry.problem === 'object') {
        p = entry.problem;
        collectionName = entry.collection;
        topicName = entry.topic;
      }
      entries.push({ row, p, collectionName, topicName });
      const slug = slugify(p.title || '');
      slugs.push(slug);
    }

    // Find existing slugs in a single query
    const existingProblems = await Problem.find({ slug: { $in: slugs } }).select('slug');
    const existingSlugSet = new Set(existingProblems.map(p => p.slug));

    for (const { row, p, collectionName, topicName } of entries) {
      // Validate required fields
      if (!p.title || !p.description || !p.difficulty) {
        errors.push({ row, message: 'Missing required fields (title, description, or difficulty)' });
        continue;
      }

      if (!allowedDifficulties.includes(p.difficulty)) {
        errors.push({ row, field: 'difficulty', message: 'Invalid difficulty' });
        continue;
      }

      const scope = p.scope || 'GLOBAL';
      if (!allowedScopes.includes(scope)) {
        errors.push({ row, field: 'scope', message: 'Invalid scope' });
        continue;
      }

      if (p.status && !allowedStatus.includes(p.status)) {
        errors.push({ row, field: 'status', message: 'Invalid status' });
        continue;
      }

      if (p.allowedLanguages && Array.isArray(p.allowedLanguages)) {
        const invalid = p.allowedLanguages.find(l => !allowedLanguageValues.includes(l));
        if (invalid) {
          errors.push({ row, field: 'allowedLanguages', message: `Invalid language: ${invalid}` });
          continue;
        }
      }

      // Force GLOBAL scope if collection/topic linking present
      if (collectionName || topicName) {
        if (scope !== 'GLOBAL') {
          errors.push({ row, message: 'Problems linked to collections must have GLOBAL scope' });
          continue;
        }
      }

      const slug = slugify(p.title);
      if (existingSlugSet.has(slug)) {
        errors.push({ row, field: 'slug', message: 'Problem with this slug already exists' });
        continue;
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
        scope,
        batch: scope === 'BATCH' ? p.batch : undefined,
        createdBy: req.user.id,
        status: p.status || 'DRAFT',
        __collectionName: collectionName,
        __topicName: topicName,
      });
    }

    if (validProblems.length === 0 && errors.length > 0) {
      return res.status(200).json({
        success: true,
        summary: {
          total: problems.length,
          created: 0,
          failed: errors.length,
        },
        errors,
      });
    }

    const created = await Problem.insertMany(validProblems);

    // Handle collection/topic linking for entries that specified them
    const linkingOps = [];
    for (let i = 0; i < validProblems.length; i++) {
      const v = validProblems[i];
      if (v.__collectionName && v.__topicName) {
        // Find or create collection (reuse by slug or name)
        const colSlug = slugify(v.__collectionName);
        let collection = await Collection.findOne({ slug: colSlug });
        if (!collection) {
          // Fallback to name match (case-sensitive)
          collection = await Collection.findOne({ name: v.__collectionName.trim() });
        }
        if (!collection) {
          collection = await Collection.create({
            name: v.__collectionName.trim(),
            slug: colSlug,
            createdBy: req.user.id,
          });
        }
        // Find or create topic within collection
        const topicSlug = slugify(v.__topicName);
        let topic = await Topic.findOne({ collection: collection._id, slug: topicSlug });
        if (!topic) {
          topic = await Topic.create({
            name: v.__topicName.trim(),
            slug: topicSlug,
            collection: collection._id,
            createdBy: req.user.id,
          });
        }
        // Link problem
        const problemId = created[i]._id;
        linkingOps.push(ProblemTopic.create({
          problem: problemId,
          collection: collection._id,
          topic: topic._id,
          createdBy: req.user.id,
        }));
      }
    }
    if (linkingOps.length > 0) {
      await Promise.all(linkingOps);
    }

    res.json({
      success: true,
      summary: {
        total: problems.length,
        created: created.length,
        failed: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Error importing problems:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Problem with this slug already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * DOWNLOAD PROBLEM TEMPLATE
 * GET /api/admin/problems/template
 */
router.get('/template', requireAuth, requireRole('ADMIN'), (req, res) => {
  const template = JSON.stringify([
    {
      collection: "Arrays & Strings",
      topic: "Two Pointer",
      problem: {
        title: "Two Sum",
        description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
        difficulty: "EASY",
        constraints: "-10^9 <= nums[i] <= 10^9",
        inputFormat: "An array of integers and a target integer.",
        outputFormat: "Two integers representing the indices.",
        examples: [{
          input: "nums = [2,7,11,15], target = 9",
          output: "[0,1]",
          explanation: "nums[0] + nums[1] = 2 + 7 = 9"
        }],
        starterCode: {
          c: "int* twoSum(int* nums, int numsSize, int target, int* returnSize) {}",
          cpp: "vector<int> twoSum(vector<int>& nums, int target) {}",
          java: "int[] twoSum(int[] nums, int target) {}",
          python: "def twoSum(nums, target):",
          javascript: "function twoSum(nums, target) {}"
        },
        allowedLanguages: ["c", "cpp", "java", "python", "javascript"],
        scope: "GLOBAL",
        status: "PUBLISHED"
      }
    }
  ], null, 2);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=problem_template.json');
  res.send(template);
});

module.exports = router;
