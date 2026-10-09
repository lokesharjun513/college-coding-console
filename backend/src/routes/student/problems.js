const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const BatchStudent = require('../../models/BatchStudent');
const TestCase = require('../../models/TestCase');
const { execute } = require('../../services/OnlineCompilerExecutor');
const { getCompilerById } = require('../../services/compilerRegistry');
const { mapResultToVerdict } = require('../../services/verdictMapper');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');
const { canStudentAccessProblem, visibleProblemQuery } = require('../../services/problemAccess');

// Helper to get start and end of today in IST (Asia/Kolkata)
function getISTDayBounds() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST offset from UTC in ms (5h30m)
  const istNow = new Date(now.getTime() + istOffset);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();
  // Midnight of the IST day in UTC
  const start = new Date(Date.UTC(year, month, day) - istOffset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Load a PUBLISHED problem and apply the authoritative GLOBAL/BATCH access check
async function canAccessProblem(studentId, problemId) {
  const problem = await Problem.findOne({ _id: problemId, status: 'PUBLISHED' });
  if (!problem) return null;
  const allowed = await canStudentAccessProblem(studentId, problem);
  return allowed ? problem : null;
}

// GET /api/student/problems - List all visible problems with student's progress
router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get active batches the student is enrolled in
    const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' }).select('batch');
    const batchIds = enrollments.map(e => e.batch);
    const enrolled = enrollments.length > 0;

    // Build query for visible problems (GLOBAL or in enrolled batches)
    const problemQuery = visibleProblemQuery(batchIds);

    const problems = await Problem.find(problemQuery).populate('batch', 'name code').lean();

    // Get all submissions for this student to calculate progress
    const submissions = await Submission.find({ student: studentId }).select('problem verdict').lean();

    // Map problem progress
    const solvedProblemIds = new Set(
      submissions
        .filter(s => s.verdict === 'ACCEPTED')
        .map(s => s.problem.toString())
    );
    const attemptedProblemIds = new Set(
      submissions.map(s => s.problem.toString())
    );

    // Get IST day boundaries
    const { start: todayStart, end: todayEnd } = getISTDayBounds();

    const today = [];
    const global = [];

    const data = problems.map(p => {
      let progress = 'NOT_STARTED';
      const pid = p._id.toString();
      if (solvedProblemIds.has(pid)) {
        progress = 'SOLVED';
      } else if (attemptedProblemIds.has(pid)) {
        progress = 'ATTEMPTED';
      }

      const result = {
        id: p._id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        difficulty: p.difficulty,
        scope: p.scope,
        batch: p.batch ? {
          id: p.batch._id,
          name: p.batch.name,
          code: p.batch.code
        } : null,
        status: p.status,
        progress: progress
      };

      // Categorize for meta
      if (p.scope === 'GLOBAL') {
        global.push(result);
      } else if (p.scope === 'BATCH' && p.practiceDate) {
        const pd = new Date(p.practiceDate);
        if (pd >= todayStart && pd < todayEnd) {
          today.push(result);
        }
      }

      return result;
    });


    const meta = {
      enrolled,
      todayCount: today.length,
      upcomingCount: 0,
      globalCount: global.length,
      today: today.map(p => ({ id: p.id, title: p.title })),
      upcoming: [],
      global: global.map(p => ({ id: p.id, title: p.title }))
    };

    return res.json({ success: true, data, meta });
  } catch (error) {
    console.error('Error fetching problems:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/student/problems/:problemId - Get single problem detail with safe examples
router.get('/:problemId', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { problemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }

    const problem = await canAccessProblem(studentId, problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found or inaccessible' });
    }

    // Get test cases for examples (only public/non-hidden)
    const testCases = await TestCase.find({ problem: problemId, isHidden: false }).sort({ order: 1 });
    const examples = testCases.map(tc => ({
      input: tc.input,
      output: tc.expectedOutput,
      explanation: tc.sampleExplanation
    }));

    // Get submission status
    const submission = await Submission.findOne({ student: studentId, problem: problemId });
    let progress = 'NOT_STARTED';
    if (submission) {
      progress = submission.verdict === 'ACCEPTED' ? 'SOLVED' : 'ATTEMPTED';
    }

    // Resolve topic name via the ProblemTopic junction
    const link = await ProblemTopic.findOne({ problem: problemId }).populate('topic', 'name');
    const topicName = link?.topic?.name || null;

    const data = {
      id: problem._id,
      title: problem.title,
      slug: problem.slug,
      description: problem.description,
      difficulty: problem.difficulty,
      topic: topicName,
      constraints: problem.constraints,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      examples: examples,
      starterCode: problem.starterCode,
      allowedLanguages: problem.allowedLanguages,
      scope: problem.scope,
      batch: problem.batch ? { id: problem.batch._id, name: problem.batch.name } : null,
      practiceDate: problem.practiceDate,
      progress
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching problem detail:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/student/problems/:problemId/run - Run code without storing submission
router.post('/:problemId/run', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { problemId } = req.params;
    const { language, code, input } = req.body;

    if (!language || !code) {
      return res.status(400).json({ success: false, message: 'Language and code are required' });
    }

    // Validate code and input size (max 100 KB each)
    const MAX_SIZE_KB = 100;
    const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;
    if (Buffer.byteLength(code, 'utf8') > MAX_SIZE_BYTES) {
      return res.status(400).json({ success: false, message: `Code size exceeds ${MAX_SIZE_KB} KB limit` });
    }
    if (input && Buffer.byteLength(input, 'utf8') > MAX_SIZE_BYTES) {
      return res.status(400).json({ success: false, message: `Input size exceeds ${MAX_SIZE_KB} KB limit` });
    }

    // Validate problemId format
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }
    const problem = await canAccessProblem(studentId, problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found or inaccessible' });
    }

    // Problem configuration is authoritative — client language/compilerId never overrides it.
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

    const result = await execute({ source: code, language, stdin: input, compilerId });

    // Normalize OnlineCompiler response: provider returns 'output'/'error', not 'stdout'/'stderr'
    // Also preserve all execution metadata for frontend
    return res.json({
      success: true,
      data: {
        status: result.status || 'success',
        output: result.output || result.stdout || '',
        error: result.error || result.stderr || '',
        exit_code: result.exit_code,
        signal: result.signal,
        time: result.time,
        total: result.total,
        memory: result.memory,
      }
    });
  } catch (error) {
    console.error('Error running code:', error);
    // Handle specific errors from OnlineCompilerExecutor
    if (error.code === 'ONLINE_COMPILER_TIMEOUT') {
      return res.status(408).json({ success: false, message: 'Code execution service timed out. Please try again.' });
    }
    if (error.message.includes('OnlineCompiler error')) {
      // Extract status code if possible, but return generic message
      return res.status(500).json({ success: false, message: 'Code execution service is temporarily unavailable' });
    }
    return res.status(500).json({ success: false, message: 'Execution error' });
  }
});

// POST /api/student/problems/:problemId/run-tests
// Run student code against VISIBLE (non-hidden) test cases without storing a submission.
router.post('/:problemId/run-tests', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { problemId } = req.params;
    const { language, code } = req.body;

    if (!language || !code) {
      return res.status(400).json({ success: false, message: 'Language and code are required' });
    }

    // Validate code size (max 100 KB)
    const MAX_SIZE_KB = 100;
    const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;
    if (Buffer.byteLength(code, 'utf8') > MAX_SIZE_BYTES) {
      return res.status(400).json({ success: false, message: `Code size exceeds ${MAX_SIZE_KB} KB limit` });
    }

    // Validate problemId format
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }
    const problem = await canAccessProblem(studentId, problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found or inaccessible' });
    }

    // Problem configuration is authoritative — client language/compilerId never overrides it.
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

    // Visible test cases only — hidden cases are not exposed on Run
    const testCases = await TestCase.find({ problem: problemId, isHidden: false }).sort({ order: 1 });

    const results = [];
    let fatalVerdict = null;

    for (const tc of testCases) {
      // Validate input size for each test case (max 100 KB)
      if (tc.input && Buffer.byteLength(tc.input, 'utf8') > MAX_SIZE_BYTES) {
        return res.status(400).json({ success: false, message: `Test case input size exceeds ${MAX_SIZE_KB} KB limit` });
      }

      try {
        const execResult = await execute({ source: code, language, stdin: tc.input, compilerId });
        const judgeVerdict = mapResultToVerdict(execResult);
        // Normalize provider response: 'output'/'error' not 'stdout'/'stderr'
        if (judgeVerdict !== 'ACCEPTED') {
          // Fatal execution error — stop, record the failure, do not expose expected outputs
          fatalVerdict = judgeVerdict;
          results.push({ index: results.length, passed: false, output: execResult.output || execResult.stdout || '', error: execResult.error || execResult.stderr || execResult.compile_output || '' });
          break;
        }
        const output = (execResult.output || execResult.stdout || '').trim();
        const expected = (tc.expectedOutput || '').trim();
        results.push({ index: results.length, passed: output === expected, output, error: execResult.error || execResult.stderr || '' });
      } catch (err) {
        const msg = err.message || 'Execution error';
        // Handle specific errors from OnlineCompilerExecutor
        if (err.code === 'ONLINE_COMPILER_TIMEOUT') {
          fatalVerdict = 'TIME_LIMIT_EXCEEDED';
        } else if (msg.includes('OnlineCompiler error')) {
          // Generic service error
          fatalVerdict = 'EXECUTION_ERROR';
        } else {
          fatalVerdict = msg.includes('Compilation') ? 'COMPILATION_ERROR'
            : msg.includes('Time limit') ? 'TIME_LIMIT_EXCEEDED'
            : msg.includes('Memory limit') ? 'MEMORY_LIMIT_EXCEEDED'
            : 'EXECUTION_ERROR';
        }
        results.push({ index: results.length, passed: false, output: '', error: msg });
        break;
      }
    }

    return res.json({
      success: true,
      data: {
        status: fatalVerdict || 'FINISHED',
        total: testCases.length,
        passed: results.filter(r => r.passed).length,
        results
      }
    });
  } catch (error) {
    console.error('Error running code against test cases:', error);
    // Handle specific errors from OnlineCompilerExecutor
    if (error.code === 'ONLINE_COMPILER_TIMEOUT') {
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
    if (error.message.includes('OnlineCompiler error')) {
      // Extract status code if possible, but return generic message
      return res.status(500).json({ success: false, message: 'Code execution service is temporarily unavailable' });
    }
    return res.status(500).json({ success: false, message: 'Execution error' });
  }
});

module.exports = router;
