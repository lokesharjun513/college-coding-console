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
const Batch = require('../../models/Batch');
const { canStudentAccessProblem, visibleProblemQuery } = require('../../services/problemAccess');

const toId = (value) => (value === null || value === undefined ? null : value.toString());

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

// Escape a user-supplied search term before it reaches RegExp.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const STATUSES = ['NOT_STARTED', 'ATTEMPTED', 'SOLVED'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Student progress for one problem, derived from this student's own submission
 * records. `SOLVED` wins over `ATTEMPTED`, which wins over `NOT_STARTED`, so a
 * problem with one accepted submission among many failures is Solved, and
 * repeated submissions never inflate the unique solved count.
 */
function buildProgressMap(submissions) {
  const map = new Map();
  for (const submission of submissions) {
    const id = toId(submission.problem);
    if (!id) continue;
    const current = map.get(id) || { attempts: 0, solved: false, latestVerdict: null, lastAttemptAt: null };
    current.attempts += 1;
    if (submission.verdict === 'ACCEPTED') current.solved = true;
    // Submissions arrive newest-first, so the first one seen is the latest.
    if (!current.latestVerdict) current.latestVerdict = submission.verdict;
    if (!current.lastAttemptAt) current.lastAttemptAt = submission.createdAt;
    map.set(id, current);
  }
  return map;
}

const statusOf = (entry) => (entry.solved ? 'SOLVED' : entry.attempts > 0 ? 'ATTEMPTED' : 'NOT_STARTED');

/**
 * True when a problem's practiceDate falls inside the current IST day. Uses the
 * same boundary helper as the availability rule, so a problem can never be
 * hidden from the student yet still be labelled as today's work.
 */
function isTodayPracticeDate(practiceDate) {
  if (!practiceDate) return false;
  const { start, end } = getISTDayBounds();
  const date = new Date(practiceDate);
  return date >= start && date < end;
}

// GET /api/student/problems - List all visible problems with student's progress
router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get active batches the student is enrolled in
    const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' }).select('batch');
    const batchIds = enrollments.map(e => e.batch);
    const enrolled = enrollments.length > 0;

    // ── BATCH scope: trainer-assigned problems for the student's own batch ──
    const requestedScope = String(req.query.scope || '').toUpperCase();
    if (requestedScope && !['GLOBAL', 'BATCH'].includes(requestedScope)) {
      return res.status(400).json({ success: false, message: 'Scope must be GLOBAL or BATCH' });
    }

    if (requestedScope === 'BATCH') {
      return await listAssignedProblems({ req, res, studentId, batchIds, enrolled });
    }
    if (requestedScope === 'GLOBAL') {
      return await listGlobalProblems({ req, res, studentId, batchIds });
    }

    // ── Combined listing (unchanged behaviour) ──
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
      scope: 'ALL',
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

/**
 * GET /api/student/problems?scope=BATCH
 *
 * Trainer-assigned problems for the batches THIS student is actively enrolled
 * in. The batch set comes only from the student's own BatchStudent records, so
 * a `batchId` supplied by the client is validated against that set rather than
 * trusted: requesting a batch the student is not a member of is a 403 and can
 * never widen the result set.
 */
async function listAssignedProblems({ req, res, studentId, batchIds, enrolled }) {
  // An unenrolled student has no assigned problems; this is not an error.
  if (!enrolled || batchIds.length === 0) {
    return res.json({
      success: true,
      data: [],
      meta: {
        scope: 'BATCH',
        enrolled: false,
        batches: [],
        counts: { total: 0, solved: 0, attempted: 0, notStarted: 0 },
        completionPercentage: 0,
        todayCount: 0,
        difficulties: [],
        topics: [],
        pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
      },
    });
  }

  // ── batch selection: membership is re-verified against the student's own set ──
  const requestedBatchId = req.query.batchId;
  let selectedBatchIds = batchIds;
  if (requestedBatchId) {
    if (!mongoose.Types.ObjectId.isValid(requestedBatchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }
    if (!batchIds.some((id) => String(id) === String(requestedBatchId))) {
      return res.status(403).json({ success: false, message: 'You are not enrolled in this batch.' });
    }
    selectedBatchIds = [requestedBatchId];
  }

  // Batch metadata for the overview card (trainer name only, never account data).
  const batchDocs = await Batch.find({ _id: { $in: selectedBatchIds }, status: { $ne: 'INACTIVE' } })
    .populate({ path: 'trainer', select: 'name' })
    .lean();

  const problems = await Problem.find(visibleProblemQuery(selectedBatchIds, new Date(), { scope: 'BATCH' }))
    .populate({ path: 'batch', select: 'name code status' })
    .sort({ createdAt: -1 })
    .lean();

  const problemIds = problems.map((p) => p._id);

  // One query for every progress signal — no per-problem lookups.
  const submissions = problemIds.length
    ? await Submission.find({ student: studentId, problem: { $in: problemIds } })
        .select('problem verdict createdAt')
        .sort({ createdAt: -1 })
        .lean()
    : [];
  const progressMap = buildProgressMap(submissions);

  // One query for topic names via the junction table. A problem can be linked to
  // several topics; the first link by id order is shown as its topic.
  const topicLinks = problemIds.length
    ? await ProblemTopic.find({ problem: { $in: problemIds } })
        .sort({ _id: 1 })
        .populate('topic', 'name')
        .lean()
    : [];
  const topicByProblem = new Map();
  for (const link of topicLinks) {
    const name = link.topic?.name;
    if (name && !topicByProblem.has(toId(link.problem))) topicByProblem.set(toId(link.problem), name);
  }

  const rows = problems.map((p) => {
    const id = toId(p._id);
    const progress = progressMap.get(id) || { attempts: 0, solved: false, latestVerdict: null, lastAttemptAt: null };
    return {
      id: p._id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      difficulty: p.difficulty,
      scope: p.scope,
      status: p.status,
      // Scheduled for today under the platform's existing IST day boundary, so
      // the "today's work" panel and the availability rule agree.
      isToday: isTodayPracticeDate(p.practiceDate),
      topic: topicByProblem.get(id) || null,
      batch: p.batch ? { id: p.batch._id, name: p.batch.name, code: p.batch.code } : null,
      progress: statusOf(progress),
      attempts: progress.attempts,
      latestVerdict: progress.latestVerdict,
      lastAttemptAt: progress.lastAttemptAt,
    };
  });

  // Every count below is "how many DISTINCT problems", so the row set is keyed by
  // id first. A single `Problem.find` cannot return the same document twice, but
  // the invariant is stated here rather than assumed, because every aggregate in
  // this response — overview totals, per-batch totals, today's work — is a count
  // over `rows`, and one duplicate row would inflate all of them.
  const uniqueRows = [];
  const seenProblemIds = new Set();
  for (const row of rows) {
    const key = toId(row.id);
    if (!key || seenProblemIds.has(key)) continue;
    seenProblemIds.add(key);
    uniqueRows.push(row);
  }

  // Overview counts are computed over EVERY assigned problem, not the filtered
  // or paginated slice, so the header never jumps while filtering.
  const overview = { total: uniqueRows.length, solved: 0, attempted: 0, notStarted: 0 };
  const perBatch = new Map(batchDocs.map((b) => [toId(b._id), { assigned: 0, solved: 0 }]));
  for (const row of uniqueRows) {
    if (row.progress === 'SOLVED') overview.solved += 1;
    else if (row.progress === 'ATTEMPTED') overview.attempted += 1;
    else overview.notStarted += 1;

    const bucket = perBatch.get(toId(row.batch?.id));
    if (bucket) {
      bucket.assigned += 1;
      if (row.progress === 'SOLVED') bucket.solved += 1;
    }
  }

  const batches = batchDocs.map((b) => {
    const counts = perBatch.get(toId(b._id)) || { assigned: 0, solved: 0 };
    return {
      id: b._id,
      name: b.name,
      code: b.code,
      status: b.status,
      trainerName: b.trainer ? b.trainer.name : null,
      startDate: b.startDate || null,
      assigned: counts.assigned,
      solved: counts.solved,
    };
  });

  // ── filtering ──
  const search = String(req.query.search || '').trim();
  const difficulty = String(req.query.difficulty || '').toUpperCase();
  const status = String(req.query.status || '').toUpperCase();
  const topic = String(req.query.topic || '').trim();

  if (difficulty && !DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ success: false, message: 'Difficulty must be EASY, MEDIUM or HARD' });
  }
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be NOT_STARTED, ATTEMPTED or SOLVED' });
  }

  // Filter options come from the assigned set itself, never hard-coded, so a
  // topic the student cannot see is a client error rather than a page that
  // silently reports "no matches".
  const availableTopics = [...new Set(uniqueRows.map((row) => row.topic).filter(Boolean))].sort();
  if (topic && !availableTopics.includes(topic)) {
    return res.status(400).json({ success: false, message: 'Unknown topic' });
  }

  // Today's work is resolved over the WHOLE assigned set, not the page being
  // returned, so the panel cannot empty out just because today's problems sit
  // on page 2 or were excluded by an active filter.
  const today = [];
  for (const row of uniqueRows) {
    if (!row.isToday) continue;
    today.push({
      id: toId(row.id),
      title: row.title,
      difficulty: row.difficulty,
      topic: row.topic,
      progress: row.progress,
    });
  }

  const searchFilter = search ? new RegExp(escapeRegex(search), 'i') : null;
  const filtered = uniqueRows.filter((row) => {
    if (searchFilter && !searchFilter.test(row.title || '')) return false;
    if (difficulty && row.difficulty !== difficulty) return false;
    if (status && row.progress !== status) return false;
    if (topic && row.topic !== topic) return false;
    return true;
  });

  // ── pagination ──
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const requestedPage = parseInt(req.query.page, 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, Math.max(totalPages, 1)) : 1;
  const start = (page - 1) * pageSize;

  return res.json({
    success: true,
    data: filtered.slice(start, start + pageSize),
    meta: {
      scope: 'BATCH',
      enrolled: true,
      batches,
      counts: overview,
      completionPercentage: overview.total ? Math.round((overview.solved / overview.total) * 100) : 0,
      // Today's work is counted over the whole assigned set, not the current
      // page, so the panel does not empty out while paginating.
      today,
      todayCount: today.length,
      // Filter options come from the assigned set itself, never hard-coded.
      difficulties: DIFFICULTIES.filter((d) => uniqueRows.some((row) => row.difficulty === d)),
      topics: availableTopics,
      pagination: { page, pageSize, total, totalPages },
    },
  });
}

/**
 * GET /api/student/problems?scope=GLOBAL
 *
 * The global problem library behind /student/practice.
 *
 * `scope=GLOBAL` used to be accepted by validation and then fall through to the
 * combined listing, which returns the student's enrolled BATCH problems too — so
 * a caller asking for the global library silently received trainer assignments.
 * This branch answers the request instead, and the scope is enforced by the
 * query itself (`scope: 'GLOBAL'`), so a batch-only problem cannot appear here
 * no matter what the client sends. No batch membership is required: GLOBAL
 * problems are platform curriculum and are visible to every authenticated
 * student, which is exactly the rule `canStudentAccessProblem` applies to the
 * detail, run and submit routes.
 *
 * Publication and archive rules come from the shared helper, so an unpublished
 * or archived problem is invisible here for the same reason it is unreachable
 * through the coding workflow.
 */
async function listGlobalProblems({ req, res, studentId, batchIds }) {
  const problems = await Problem.find(visibleProblemQuery(batchIds, new Date(), { scope: 'GLOBAL' }))
    .select('_id title slug description difficulty scope status createdAt')
    .sort({ createdAt: -1, _id: 1 })
    .lean();

  const problemIds = problems.map((p) => p._id);

  // One submissions query for every progress signal — no per-problem lookups.
  const submissions = problemIds.length
    ? await Submission.find({ student: studentId, problem: { $in: problemIds } })
        .select('problem verdict createdAt')
        .sort({ createdAt: -1 })
        .lean()
    : [];
  const progressMap = buildProgressMap(submissions);

  // One junction query resolves topic AND collection names. A problem may be
  // linked to several topics; the first link by id order is shown, and the
  // others stay available as `additionalTopics` so nothing is silently dropped.
  const topicLinks = problemIds.length
    ? await ProblemTopic.find({ problem: { $in: problemIds } })
        .sort({ _id: 1 })
        .populate({ path: 'topic', select: 'name collection' })
        .populate({ path: 'collection', select: 'name' })
        .lean()
    : [];
  const linksByProblem = new Map();
  for (const link of topicLinks) {
    const key = toId(link.problem);
    if (!linksByProblem.has(key)) linksByProblem.set(key, []);
    linksByProblem.get(key).push({
      topic: link.topic?.name || null,
      collection: link.collection?.name || null,
    });
  }

  // A single Problem.find cannot return the same document twice, but every
  // aggregate below counts rows, so uniqueness is stated rather than assumed.
  const uniqueProblems = [];
  const seen = new Set();
  for (const problem of problems) {
    const key = toId(problem._id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueProblems.push(problem);
  }

  const rows = uniqueProblems.map((p) => {
    const id = toId(p._id);
    const progress = progressMap.get(id) || { attempts: 0, solved: false, latestVerdict: null, lastAttemptAt: null };
    const links = linksByProblem.get(id) || [];
    const primary = links[0] || { topic: null, collection: null };
    return {
      id: p._id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      difficulty: p.difficulty,
      scope: p.scope,
      status: p.status,
      topic: primary.topic,
      collection: primary.collection,
      additionalTopics: links.slice(1).map((link) => link.topic).filter(Boolean),
      progress: statusOf(progress),
      attempts: progress.attempts,
      latestVerdict: progress.latestVerdict,
      lastAttemptAt: progress.lastAttemptAt,
    };
  });

  // Overview is computed over the whole library, so the header never jumps while
  // the student filters or pages through it.
  const overview = { total: rows.length, solved: 0, attempted: 0, notStarted: 0 };
  for (const row of rows) {
    if (row.progress === 'SOLVED') overview.solved += 1;
    else if (row.progress === 'ATTEMPTED') overview.attempted += 1;
    else overview.notStarted += 1;
  }

  const search = String(req.query.search || '').trim();
  const difficulty = String(req.query.difficulty || '').toUpperCase();
  const status = String(req.query.status || '').toUpperCase();
  const topic = String(req.query.topic || '').trim();

  if (difficulty && !DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ success: false, message: 'Difficulty must be EASY, MEDIUM or HARD' });
  }
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be NOT_STARTED, ATTEMPTED or SOLVED' });
  }

  const availableTopics = [...new Set(rows.map((row) => row.topic).filter(Boolean))].sort();
  if (topic && !availableTopics.includes(topic)) {
    return res.status(400).json({ success: false, message: 'Unknown topic' });
  }

  const searchFilter = search ? new RegExp(escapeRegex(search), 'i') : null;
  const filtered = rows.filter((row) => {
    if (searchFilter && !searchFilter.test(`${row.title || ''} ${row.description || ''}`)) return false;
    if (difficulty && row.difficulty !== difficulty) return false;
    if (status && row.progress !== status) return false;
    if (topic && row.topic !== topic) return false;
    return true;
  });

  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const requestedPage = parseInt(req.query.page, 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, Math.max(totalPages, 1))
    : 1;
  const start = (page - 1) * pageSize;

  return res.json({
    success: true,
    data: filtered.slice(start, start + pageSize),
    meta: {
      scope: 'GLOBAL',
      counts: overview,
      completionPercentage: overview.total ? Math.round((overview.solved / overview.total) * 100) : 0,
      difficulties: DIFFICULTIES.filter((d) => rows.some((row) => row.difficulty === d)),
      topics: availableTopics,
      pagination: { page, pageSize, total, totalPages },
    },
  });
}

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
