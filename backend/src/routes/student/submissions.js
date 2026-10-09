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
const { execute } = require('../../services/OnlineCompilerExecutor');
const { getCompilerById } = require('../../services/compilerRegistry');
const { canStudentAccessProblem } = require('../../services/problemAccess');
const { mapResultToVerdict } = require('../../services/verdictMapper');

router.post('/', submissionLimiter, requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  const { problemId, code, language } = req.body;

  if (!problemId || !code || !language) {
    return res.status(400).json({ success: false, message: 'Missing fields', code: 'INVALID_INPUT' });
  }

  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    return res.status(400).json({ success: false, message: 'Invalid problem id', code: 'INVALID_PROBLEM_ID' });
  }

  // Find problem and verify GLOBAL/BATCH access
  const problem = await Problem.findOne({ _id: problemId, status: 'PUBLISHED' });
  if (!problem || !(await canStudentAccessProblem(req.user.id, problem))) {
    return res.status(404).json({ success: false, message: 'Problem not found or inaccessible', code: 'NOT_FOUND' });
  }

  if (!problem.allowedLanguages.includes(language)) {
    return res.status(400).json({ success: false, message: 'Language not supported for this problem' });
  }

  const compilerId = problem.compilers?.get(language);
  if (!compilerId) {
    return res.status(400).json({ success: false, code: 'COMPILER_NOT_CONFIGURED', message: `Compiler not configured for ${language}` });
  }
  const compilerInfo = await getCompilerById(compilerId);
  if (!compilerInfo) {
    return res.status(400).json({ success: false, code: 'COMPILER_NOT_SUPPORTED', message: 'The compiler is no longer available.' });
  }

  // Load test cases (both visible and hidden)
  const testCases = await TestCase.find({ problem: problemId }).sort({ order: 1 });
  if (testCases.length === 0) {
    return res.status(400).json({
      success: false,
      code: 'NO_TEST_CASES_CONFIGURED',
      message: 'This problem does not have any test cases configured.',
    });
  }

  const testResults = [];
  let overallVerdict = 'ACCEPTED';
  let lastExecResult = {};

  for (const tc of testCases) {
    try {
      const execResult = await execute({ source: code, language, stdin: tc.input, compilerId });
      lastExecResult = execResult;

      // Check Judge0 status first - if not accepted, map to verdict directly
      const judgeVerdict = mapResultToVerdict(execResult);
      if (judgeVerdict !== 'ACCEPTED') {
        overallVerdict = judgeVerdict;
        // Normalize OnlineCompiler output/error to stdout/stderr
        testResults.push({
          testCase: tc._id,
          passed: false,
          output: execResult.output || execResult.stdout || '',
          error: execResult.error || execResult.stderr || ''
        });
        break; // Stop on fatal execution error
      }

      // Only compare output if execution was successful
      const output = (execResult.output || execResult.stdout || '').trim();
      const expected = (tc.expectedOutput || '').trim();
      const passed = output === expected;
      testResults.push({ testCase: tc._id, passed, output, error: execResult.error || execResult.stderr || '' });
      if (!passed) {
        overallVerdict = 'WRONG_ANSWER';
      }
    } catch (err) {
      // Map error to a verdict
      let verdict = 'EXECUTION_ERROR';
      let errorMessage = err.message;

      if (err.code === 'ONLINE_COMPILER_TIMEOUT') {
        verdict = 'TIME_LIMIT_EXCEEDED';
        errorMessage = err.message; // 'Code execution service timed out. Please try again.'
      } else if (err.message.includes('Compilation')) {
        verdict = 'COMPILATION_ERROR';
      } else if (err.message.includes('Time limit')) {
        verdict = 'TIME_LIMIT_EXCEEDED';
      } else if (err.message.includes('Memory limit')) {
        verdict = 'MEMORY_LIMIT_EXCEEDED';
      }

      overallVerdict = verdict;
      testResults.push({ testCase: tc._id, passed: false, output: '', error: errorMessage });
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
    // Ensure user ID is valid ObjectId before querying
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(401).json({ success: false, message: 'Invalid user session' });
    }

    const submissions = await Submission.find({ student: req.user.id })
      .sort({ createdAt: -1 })
      .select('-code -executionResult -testResults')
      .lean();

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
