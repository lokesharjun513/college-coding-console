const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Problem = require('../../models/Problem');
const TestCase = require('../../models/TestCase');

/**
 * Middleware to verify problem existence for admin routes.
 */
async function verifyProblem(req, res, next) {
  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    return res.status(400).json({ success: false, message: 'Invalid problem id' });
  }
  const problem = await Problem.findById(problemId);
  if (!problem) {
    return res.status(404).json({ success: false, message: 'Problem not found' });
  }
  req.problem = problem;
  next();
}

/**
 * LIST TEST CASES FOR A PROBLEM (ADMIN)
 * GET /api/admin/problems/:problemId/test-cases
 */
router.get('/', requireAuth, requireRole('ADMIN'), verifyProblem, async (req, res) => {
  try {
    const testCases = await TestCase.find({ problem: req.problem._id })
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
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing test cases:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * CREATE TEST CASE (ADMIN)
 * POST /api/admin/problems/:problemId/test-cases
 */
router.post('/', requireAuth, requireRole('ADMIN'), verifyProblem, async (req, res) => {
  try {
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
      problem: req.problem._id,
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
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error creating test case:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE TEST CASE (ADMIN)
 * GET /api/admin/problems/:problemId/test-cases/:testCaseId
 */
router.get('/:testCaseId', requireAuth, requireRole('ADMIN'), verifyProblem, async (req, res) => {
  try {
    const { testCaseId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(testCaseId)) {
      return res.status(400).json({ success: false, message: 'Invalid test case id' });
    }
    const testCase = await TestCase.findOne({ _id: testCaseId, problem: req.problem._id }).select('-__v');
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
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error getting test case:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE TEST CASE (ADMIN)
 * PATCH /api/admin/problems/:problemId/test-cases/:testCaseId
 */
router.patch('/:testCaseId', requireAuth, requireRole('ADMIN'), verifyProblem, async (req, res) => {
  try {
    const { testCaseId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(testCaseId)) {
      return res.status(400).json({ success: false, message: 'Invalid test case id' });
    }
    const { input, expectedOutput, isHidden, sampleExplanation, order } = req.body;
    const updateFields = {};
    if (input !== undefined) {
      if (input === '') return res.status(400).json({ success: false, message: 'Input cannot be empty' });
      updateFields.input = input;
    }
    if (expectedOutput !== undefined) {
      if (expectedOutput === '') return res.status(400).json({ success: false, message: 'Expected output cannot be empty' });
      updateFields.expectedOutput = expectedOutput;
    }
    if (isHidden !== undefined) {
      if (typeof isHidden !== 'boolean') return res.status(400).json({ success: false, message: 'Invalid isHidden value' });
      updateFields.isHidden = isHidden;
    }
    if (sampleExplanation !== undefined) {
      if (typeof sampleExplanation !== 'string') return res.status(400).json({ success: false, message: 'Invalid sampleExplanation value' });
      updateFields.sampleExplanation = sampleExplanation.trim();
    }
    if (order !== undefined) {
      if (typeof order !== 'number') return res.status(400).json({ success: false, message: 'Invalid order value' });
      updateFields.order = order;
    }
    const updated = await TestCase.findOneAndUpdate({ _id: testCaseId, problem: req.problem._id }, updateFields, { returnDocument: 'after', runValidators: true }).select('-__v');
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }
    const data = {
      id: updated._id,
      problem: updated.problem,
      input: updated.input,
      expectedOutput: updated.expectedOutput,
      isHidden: updated.isHidden,
      sampleExplanation: updated.sampleExplanation,
      order: updated.order,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error updating test case:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE TEST CASE (ADMIN)
 * DELETE /api/admin/problems/:problemId/test-cases/:testCaseId
 */
router.delete('/:testCaseId', requireAuth, requireRole('ADMIN'), verifyProblem, async (req, res) => {
  try {
    const { testCaseId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(testCaseId)) {
      return res.status(400).json({ success: false, message: 'Invalid test case id' });
    }
    const deleted = await TestCase.findOneAndDelete({ _id: testCaseId, problem: req.problem._id });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Test case not found' });
    }
    return res.json({ success: true, data: null });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error deleting test case:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
