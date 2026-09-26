// Trainer Test Case Management routes

const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Problem = require('../../models/Problem');
const Batch = require('../../models/Batch');
const TestCase = require('../../models/TestCase');

/**
 * Middleware to verify problem ownership for the authenticated trainer.
 */
async function verifyProblemOwnership(req, res, next) {
  try {
    const { problemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }

    const problem = await Problem.findById(problemId).populate('batch');
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    if (!problem.batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const batch = await Batch.findById(problem.batch._id);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    if (batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    req.problem = problem;
    next();
  } catch (error) {
    console.error('Error verifying problem ownership:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

/**
 * CREATE TEST CASE
 * POST /api/trainer/problems/:problemId/test-cases
 */
router.post('/', requireAuth, requireRole('TRAINER'), verifyProblemOwnership, async (req, res) => {
  try {
    const { problemId } = req.params;
    const { input, expectedOutput, isHidden, sampleExplanation, order } = req.body;

    if (input === undefined || expectedOutput === undefined || input === '' || expectedOutput === '') {
      return res.status(400).json({ success: false, message: 'Input and expectedOutput are required' });
    }

    if (isHidden !== undefined && typeof isHidden !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid isHidden value' });
    }

    if (order !== undefined && typeof order !== 'number') {
      return res.status(400).json({ success: false, message: 'Invalid order value' });
    }

    if (sampleExplanation !== undefined && typeof sampleExplanation !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid sampleExplanation value' });
    }

    const testCase = await TestCase.create({
      problem: problemId,
      input,
      expectedOutput,
      isHidden: isHidden !== undefined ? isHidden : false,
      sampleExplanation: sampleExplanation !== undefined ? sampleExplanation.trim() : '',
      order: order !== undefined ? order : 0,
    });

    const data = {
      id: testCase._id,
      problem: testCase.problem,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isHidden: testCase.isHidden,
      sampleExplanation: testCase.sampleExplanation,
      order: testCase.order,
      createdAt: testCase.createdAt,
      updatedAt: testCase.updatedAt,
    };

    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creating test case:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST TEST CASES FOR A PROBLEM
 * GET /api/trainer/problems/:problemId/test-cases
 */
router.get('/', requireAuth, requireRole('TRAINER'), verifyProblemOwnership, async (req, res) => {
  try {
    const { problemId } = req.params;

    const testCases = await TestCase.find({ problem: problemId })
      .sort({ order: 1, createdAt: 1 })
      .select('-__v');

    const data = testCases.map(tc => ({
      id: tc._id,
      problem: tc.problem,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      isHidden: tc.isHidden,
      sampleExplanation: tc.sampleExplanation,
      order: tc.order,
      createdAt: tc.createdAt,
      updatedAt: tc.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing test cases:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE TEST CASE
 * GET /api/trainer/problems/:problemId/test-cases/:testCaseId
 */
router.get('/:testCaseId', requireAuth, requireRole('TRAINER'), verifyProblemOwnership, async (req, res) => {
  try {
    const { problemId, testCaseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(testCaseId)) {
      return res.status(400).json({ success: false, message: 'Invalid test case id' });
    }

    const testCase = await TestCase.findOne({ _id: testCaseId, problem: problemId }).select('-__v');
    if (!testCase) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }

    const data = {
      id: testCase._id,
      problem: testCase.problem,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isHidden: testCase.isHidden,
      sampleExplanation: testCase.sampleExplanation,
      order: testCase.order,
      createdAt: testCase.createdAt,
      updatedAt: testCase.updatedAt,
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting test case:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE TEST CASE
 * PATCH /api/trainer/problems/:problemId/test-cases/:testCaseId
 */
router.patch('/:testCaseId', requireAuth, requireRole('TRAINER'), verifyProblemOwnership, async (req, res) => {
  try {
    const { problemId, testCaseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(testCaseId)) {
      return res.status(400).json({ success: false, message: 'Invalid test case id' });
    }

    const { input, expectedOutput, isHidden, sampleExplanation, order } = req.body;

    if (input !== undefined && input === '') {
      return res.status(400).json({ success: false, message: 'Input cannot be empty' });
    }

    if (expectedOutput !== undefined && expectedOutput === '') {
      return res.status(400).json({ success: false, message: 'Expected output cannot be empty' });
    }

    if (isHidden !== undefined && typeof isHidden !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid isHidden value' });
    }

    if (order !== undefined && typeof order !== 'number') {
      return res.status(400).json({ success: false, message: 'Invalid order value' });
    }

    if (sampleExplanation !== undefined && typeof sampleExplanation !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid sampleExplanation value' });
    }

    const updateFields = {};
    if (input !== undefined) updateFields.input = input;
    if (expectedOutput !== undefined) updateFields.expectedOutput = expectedOutput;
    if (isHidden !== undefined) updateFields.isHidden = isHidden;
    if (sampleExplanation !== undefined) updateFields.sampleExplanation = sampleExplanation.trim();
    if (order !== undefined) updateFields.order = order;

    const updatedTestCase = await TestCase.findOneAndUpdate(
      { _id: testCaseId, problem: problemId },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!updatedTestCase) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }

    const data = {
      id: updatedTestCase._id,
      problem: updatedTestCase.problem,
      input: updatedTestCase.input,
      expectedOutput: updatedTestCase.expectedOutput,
      isHidden: updatedTestCase.isHidden,
      sampleExplanation: updatedTestCase.sampleExplanation,
      order: updatedTestCase.order,
      createdAt: updatedTestCase.createdAt,
      updatedAt: updatedTestCase.updatedAt,
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating test case:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE TEST CASE
 * DELETE /api/trainer/problems/:problemId/test-cases/:testCaseId
 */
router.delete('/:testCaseId', requireAuth, requireRole('TRAINER'), verifyProblemOwnership, async (req, res) => {
  try {
    const { problemId, testCaseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(testCaseId)) {
      return res.status(400).json({ success: false, message: 'Invalid test case id' });
    }

    const deletedTestCase = await TestCase.findOneAndDelete({ _id: testCaseId, problem: problemId });
    if (!deletedTestCase) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }

    return res.json({ success: true, data: null });
  } catch (error) {
    console.error('Error deleting test case:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
