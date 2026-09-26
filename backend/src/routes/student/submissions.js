// backend/src/routes/student/submissions.js
// Student code submission endpoint

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const Submission = require('../../models/Submission');
const Problem = require('../../models/Problem');
const TestCase = require('../../models/TestCase');
const { execute } = require('../../services/CodeExecutor');

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

router.post('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  const { problemId, code, language } = req.body;
  if (!problemId || !code || !language) {
    return res.status(400).json({ success: false, message: 'Missing fields', code: 'INVALID_INPUT' });
  }

  // Find problem and verify it exists
  const problem = await Problem.findById(problemId);
  if (!problem) {
    return res.status(404).json({ success: false, message: 'Problem not found', code: 'NOT_FOUND' });
  }

  // Verify language is allowed for the problem
  if (!problem.allowedLanguages.includes(language)) {
    return res.status(400).json({ success: false, message: 'Language not allowed', code: 'INVALID_INPUT' });
  }

  // Load test cases (both visible and hidden)
  const testCases = await TestCase.find({ problem: problemId }).sort({ order: 1 });

  const testResults = [];
  let overallVerdict = 'ACCEPTED';
  let lastExecResult = {};

  for (const tc of testCases) {
    try {
      const execResult = await execute({ source: code, language, stdin: tc.input });
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

module.exports = router;
