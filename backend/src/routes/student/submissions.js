// backend/src/routes/student/submissions.js
// Student code submission endpoint

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const { submissionLimiter } = require('../../middleware/rateLimiter');
const Submission = require('../../models/Submission');
const Problem = require('../../models/Problem');
const TestCase = require('../../models/TestCase');
const mongoose = require('mongoose');
const { execute } = require('../../services/CodeExecutor');
const { getCompilerById, LEGACY_TO_COMPILER } = require('../../services/compilerRegistry');

// Helper to map Judge0 status IDs to our verdicts
function mapJudgeStatusToVerdict(status) {
  // Judge0 status IDs: 3=Accepted, 4=Compilation Error, 5=Runtime Error, 6=Time Limit Exceeded, 7=Memory Limit Exceeded, 11=Internal Error
  switch (status.id) {
    case 3:
      return 'ACCEPTED';
    case 4:
      return 'COMPILATION_ERROR';
    case 5:
      return 'RUNTIME_ERROR';
    case 6:
      return 'TIME_LIMIT_EXCEEDED';
    case 7:
      return 'MEMORY_LIMIT_EXCEEDED';
    default:
      return 'EXECUTION_ERROR';
  }
}

router.post('/', submissionLimiter, requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  const { problemId, code, language, compilerId } = req.body;
  if (!problemId || !code) {
    return res.status(400).json({ success: false, message: 'Missing fields', code: 'INVALID_INPUT' });
  }

  // Resolve language: prefer explicit compilerId, fall back to legacy language key
  let resolvedLanguage = language;
  if (!resolvedLanguage && compilerId) {
    // Find the legacy language that maps to this compilerId
    const entry = await getCompilerById(compilerId);
    if (entry) {
      resolvedLanguage = entry.language;
    }
    // Also check LEGACY_TO_COMPILER
    if (!resolvedLanguage) {
      for (const [legacy, cid] of Object.entries(LEGACY_TO_COMPILER)) {
        if (cid === compilerId) {
          resolvedLanguage = legacy;
          break;
        }
      }
    }
  }

  if (!resolvedLanguage) {
    return res.status(400).json({ success: false, message: 'Missing language or compilerId', code: 'INVALID_INPUT' });
  }

  // Find problem and verify it exists
  const problem = await Problem.findById(problemId);
  if (!problem) {
    return res.status(404).json({ success: false, message: 'Problem not found', code: 'NOT_FOUND' });
  }

  // Verify language is allowed for the problem
  if (!problem.allowedLanguages.includes(resolvedLanguage)) {
    return res.status(400).json({ success: false, message: 'Language not allowed', code: 'INVALID_INPUT' });
  }

  // Load test cases (both visible and hidden)
  const testCases = await TestCase.find({ problem: problemId }).sort({ order: 1 });

  const testResults = [];
  let overallVerdict = 'ACCEPTED';
  let lastExecResult = {};

  for (const tc of testCases) {
    try {
      const execResult = await execute({ source: code, language: resolvedLanguage, stdin: tc.input, compilerId });
      lastExecResult = execResult;


      // Check Judge0 status first - if not accepted, map to verdict directly
      const judgeVerdict = mapJudgeStatusToVerdict(execResult.status);
      if (judgeVerdict !== 'ACCEPTED') {
        overallVerdict = judgeVerdict;
        testResults.push({
          testCase: tc._id,
          passed: false,
          output: execResult.stdout || '',
          error: execResult.stderr || ''
        });
        break; // Stop on fatal execution error
      }

      // Only compare output if Judge0 says Accepted
      const output = (execResult.stdout || '').trim();
      const expected = (tc.expectedOutput || '').trim();
      const passed = output === expected;
      testResults.push({ testCase: tc._id, passed, output, error: execResult.stderr || '' });
      if (!passed) {
        overallVerdict = 'WRONG_ANSWER';
      }
    } catch (err) {
      // Map error to a verdict
      const verdict = err.message.includes('Compilation') ? 'COMPILATION_ERROR' :
        err.message.includes('Time limit') ? 'TIME_LIMIT_EXCEEDED' :
        err.message.includes('Memory limit') ? 'MEMORY_LIMIT_EXCEEDED' :
        'EXECUTION_ERROR';
      overallVerdict = verdict;
      testResults.push({ testCase: tc._id, passed: false, output: '', error: err.message });
      // Stop further execution on fatal error
      break;
    }
  }

  // Persist submission
  const submission = await Submission.create({
    student: req.user.id,
    problem: problemId,
    code,
    language,
    testResults,
    verdict: overallVerdict,
    executionResult: lastExecResult,
    runtime: lastExecResult.time || null,
    memory: lastExecResult.memory || null,
  });

  // Prepare response – do not expose hidden test case inputs/expected outputs
  const publicResults = testResults.map(tr => ({
    testCase: tr.testCase,
    passed: tr.passed,
    output: tr.output,
    error: tr.error,
  }));

  return res.status(201).json({
    success: true,
    data: {
      id: submission._id,
      verdict: overallVerdict,
      testResults: publicResults,
    },
  });
});

// GET /api/student/submissions - List all submissions for the authenticated student
router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user.id })
      .sort({ createdAt: -1 })
      .select('-code -executionResult -testResults');

    const data = submissions.map(sub => ({
      id: sub._id,
      problem: sub.problem,
      language: sub.language,
      verdict: sub.verdict,
      createdAt: sub.createdAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing submissions:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/student/submissions/:id - Get a specific submission
router.get('/:id', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid submission ID', code: 'INVALID_INPUT' });
  }

  try {
    const submission = await Submission.findOne({ _id: id, student: req.user.id })
      .select('-code -executionResult');

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found', code: 'NOT_FOUND' });
    }

    const data = {
      id: submission._id,
      problem: submission.problem,
      language: submission.language,
      verdict: submission.verdict,
      testResults: submission.testResults,
      createdAt: submission.createdAt,
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
