// Trainer Problem Management routes

const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const Problem = require('../../models/Problem');
const User = require('../../models/User');

/**
 * CREATE PROBLEM
 * POST /api/trainer/batches/:batchId/problems
 */
router.post('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    // Extract batchId from params
    const { batchId } = req.params;

    // Validate batchId
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }

    // Verify batch exists and belongs to the authenticated trainer
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    if (batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Extract problem data from request body
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
    } = req.body;

    // Validate required fields
    if (!title || !description || !difficulty) {
      return res.status(400).json({ success: false, message: 'Title, description, and difficulty are required' });
    }

    // Validate difficulty
    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    if (!allowedDifficulties.includes(difficulty)) {
      return res.status(400).json({ success: false, message: 'Invalid difficulty' });
    }

    // Validate status if provided
    const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Validate allowedLanguages if provided
    const allowedLanguageValues = ['c', 'cpp', 'java', 'python', 'javascript'];
    if (allowedLanguages && Array.isArray(allowedLanguages)) {
      const invalid = allowedLanguages.find(lang => !allowedLanguageValues.includes(lang));
      if (invalid) {
        return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
      }
    }

    // Generate slug from title (basic implementation)
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check for duplicate slug (optional: we could also handle duplicate key error)
    const existingProblem = await Problem.findOne({ slug });
    if (existingProblem) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }

    // Create problem
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
      batch: batchId,
      createdBy: req.user.id,
      status: status || 'DRAFT',
    });

    // Populate createdBy and batch for response (without sensitive fields)
    await problem.populate([
      { path: 'createdBy', select: '-passwordHash' },
      { path: 'batch', select: '-__v' }
    ]);

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
      batch: problem.batch ? {
        id: problem.batch._id,
        name: problem.batch.name,
        code: problem.batch.code,
      } : null,
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

    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creating problem:', error);
    if (error.code === 11000) {
      // Duplicate slug
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST PROBLEMS FOR A BATCH
 * GET /api/trainer/batches/:batchId/problems
 */
router.get('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    // Extract batchId from params
    const { batchId } = req.params;

    // Validate batchId
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }

    // Verify batch exists and belongs to the authenticated trainer
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    if (batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Find problems for this batch
    const problems = await Problem.find({ batch: batchId })
      .populate({ path: 'createdBy', select: '-passwordHash' })
      .populate({ path: 'batch', select: '-__v' })
      .select('-__v');

    const data = problems.map(p => ({
      id: p._id,
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      status: p.status,
      createdBy: {
        id: p.createdBy._id,
        name: p.createdBy.name,
        email: p.createdBy.email,
      },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing problems:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE PROBLEM
 * GET /api/trainer/batches/:batchId/problems/:problemId
 */
router.get('/:problemId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const problemId = req.params.problemId;

    // Validate problemId
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }

    // Find the problem and populate batch
    const problem = await Problem.findOne({ _id: problemId }).populate('batch');
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    // Verify batch exists and belongs to the authenticated trainer
    if (!problem.batch) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    // Ensure the problem belongs to the batch specified in the URL
    if (problem.batch._id.toString() !== req.params.batchId) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    const batchId = problem.batch._id.toString();
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    if (batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Populate for response
    await problem.populate({ path: 'createdBy', select: '-passwordHash' });

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
      batch: {
        id: problem.batch._id,
        name: problem.batch.name,
        code: problem.batch.code,
      },
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

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting problem:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE PROBLEM
 * PATCH /api/trainer/batches/:batchId/problems/:problemId
 */
router.patch('/:problemId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const problemId = req.params.problemId;

    // Validate problemId
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }

    // Find the problem and ensure it belongs to the batch
    const problem = await Problem.findOne({ _id: problemId }).populate('batch');
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    // Verify batch exists
    if (!problem.batch) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    // Ensure the problem belongs to the batch specified in the URL
    if (problem.batch._id.toString() !== req.params.batchId) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    // Extract batchId from problem's batch
    const batchId = problem.batch._id.toString();

    // Verify batch exists and belongs to the authenticated trainer
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    if (batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Extract update fields
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
    } = req.body;

    // Prevent changing batch or createdBy via this endpoint
    // (We already verified batch ownership, and we won't update batch or createdBy)

    // Validate difficulty if provided
    if (difficulty) {
      const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
      if (!allowedDifficulties.includes(difficulty)) {
        return res.status(400).json({ success: false, message: 'Invalid difficulty' });
      }
    }

    // Validate status if provided
    if (status) {
      const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
    }

    // Validate allowedLanguages if provided
    if (allowedLanguages) {
      const allowedLanguageValues = ['c', 'cpp', 'java', 'python', 'javascript'];
      const invalid = allowedLanguages.find(lang => !allowedLanguageValues.includes(lang));
      if (invalid) {
        return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
      }
    }

    // If title is being changed, regenerate slug and check for duplicates
    if (title && title.trim() !== problem.title) {
      const newSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const existing = await Problem.findOne({ slug: newSlug, _id: { $ne: problemId } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
      }
      problem.slug = newSlug;
    }

    // Update fields if provided
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

    const updatedProblem = await Problem.findOneAndUpdate(
      { _id: problemId },
      {
        title: problem.title,
        description: problem.description,
        difficulty: problem.difficulty,
        constraints: problem.constraints,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        examples: problem.examples,
        starterCode: problem.starterCode,
        allowedLanguages: problem.allowedLanguages,
        status: problem.status,
      },
      { new: true }
    );

    if (!updatedProblem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    await updatedProblem.populate([
      { path: 'createdBy', select: '-passwordHash' },
      { path: 'batch', select: '-__v' }
    ]);

    const data = {
      id: updatedProblem._id,
      title: updatedProblem.title,
      slug: updatedProblem.slug,
      description: updatedProblem.description,
      difficulty: updatedProblem.difficulty,
      constraints: updatedProblem.constraints,
      inputFormat: updatedProblem.inputFormat,
      outputFormat: updatedProblem.outputFormat,
      examples: updatedProblem.examples,
      starterCode: updatedProblem.starterCode,
      allowedLanguages: updatedProblem.allowedLanguages,
      batch: {
        id: updatedProblem.batch._id,
        name: updatedProblem.batch.name,
        code: updatedProblem.batch.code,
      },
      createdBy: {
        id: updatedProblem.createdBy._id,
        name: updatedProblem.createdBy.name,
        email: updatedProblem.createdBy.email,
        role: updatedProblem.createdBy.role,
        status: updatedProblem.createdBy.status,
      },
      status: updatedProblem.status,
      createdAt: updatedProblem.createdAt,
      updatedAt: updatedProblem.updatedAt,
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating problem:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE / ARCHIVE PROBLEM
 * DELETE /api/trainer/batches/:batchId/problems/:problemId
 */
router.delete('/:problemId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const problemId = req.params.problemId;

    // Validate problemId
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }

    // Find the problem and populate batch
    const problem = await Problem.findOne({ _id: problemId }).populate('batch');
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    // Verify batch exists and belongs to the authenticated trainer
    if (!problem.batch) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    // Ensure the problem belongs to the batch specified in the URL
    if (problem.batch._id.toString() !== req.params.batchId) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    const batchId = problem.batch._id.toString();
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    if (batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Instead of hard delete, we archive the problem (set status to ARCHIVED)
    const updatedProblem = await Problem.findOneAndUpdate(
      { _id: problemId },
      { status: 'ARCHIVED' },
      { new: true }
    );

    if (!updatedProblem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    return res.json({ success: true, data: null });
  } catch (error) {
    console.error('Error deleting problem:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;