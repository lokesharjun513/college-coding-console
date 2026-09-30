const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const BatchStudent = require('../../models/BatchStudent');
const TestCase = require('../../models/TestCase');
const { execute } = require('../../services/CodeExecutor');
const { getCompilerById, LEGACY_TO_COMPILER } = require('../../services/compilerRegistry');

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

// Helper to check if a student can access a problem
async function canAccessProblem(studentId, problemId) {
  const enrollments = await BatchStudent.find({ student: studentId }).select('batch');
  const batchIds = enrollments.map(e => e.batch);

  const problem = await Problem.findOne({
    _id: problemId,
    status: 'PUBLISHED',
    $or: [
      { scope: 'GLOBAL' },
      { scope: 'BATCH', batch: { $in: batchIds } }
    ]
  });

  return problem;
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
    const problemQuery = {
      status: 'PUBLISHED',
      $or: [
        { scope: 'GLOBAL' },
        { scope: 'BATCH', batch: { $in: batchIds } }
      ]
    };

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
    const upcoming = [];
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
        } else if (pd >= todayEnd) {
          upcoming.push(result);
        }
      }

      return result;
    });


    const meta = {
      enrolled,
      todayCount: today.length,
      upcomingCount: upcoming.length,
      globalCount: global.length,
      today: today.map(p => ({ id: p.id, title: p.title })),
      upcoming: upcoming.map(p => ({ id: p.id, title: p.title })),
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

    const data = {
      id: problem._id,
      title: problem.title,
      slug: problem.slug,
      description: problem.description,
      difficulty: problem.difficulty,
      topic: 'General',
      constraints: problem.constraints,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      examples: examples,
      starterCode: problem.starterCode,
      supportedLanguages: problem.allowedLanguages,
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
    const { language, code, input, compilerId } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Code is required' });
    }

    const problem = await canAccessProblem(studentId, problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found or inaccessible' });
    }

    // Resolve language if not provided but compilerId is present
    let resolvedLanguage = language;
    if (!resolvedLanguage && compilerId) {
      const entry = await getCompilerById(compilerId);
      if (entry) resolvedLanguage = entry.language;
      if (!resolvedLanguage) {
        for (const [legacy, cid] of Object.entries(LEGACY_TO_COMPILER)) {
          if (cid === compilerId) { resolvedLanguage = legacy; break; }
        }
      }
    }
    if (!resolvedLanguage) {
      return res.status(400).json({ success: false, message: 'Missing language or compilerId' });
    }
    if (!problem.allowedLanguages.includes(resolvedLanguage)) {
      return res.status(400).json({ success: false, message: 'Language not allowed' });
    }

    const result = await execute({ source: code, language: resolvedLanguage, stdin: input, compilerId });

    return res.json({
      success: true,
      data: {
        status: result.status?.description || 'Unknown',
        output: result.stdout || '',
        error: result.stderr || '',
        runtime: result.time || null,
        memory: result.memory || null
      }
    });
  } catch (error) {
    console.error('Error running code:', error);
    return res.status(500).json({ success: false, message: 'Execution error' });
  }
});

module.exports = router;
