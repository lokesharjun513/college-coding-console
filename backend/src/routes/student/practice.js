// backend/src/routes/student/practice.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const Collection = require('../../models/Collection');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const BatchStudent = require('../../models/BatchStudent');
const mongoose = require('mongoose');

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const STATUSES = ['NOT_STARTED', 'ATTEMPTED', 'SOLVED'];

/** Escape a user-supplied search term so it is matched literally by RegExp. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toId = (value) => (value === null || value === undefined ? null : value.toString());

const emptyLibraryMeta = () => ({
  scope: 'GLOBAL',
  filtering: false,
  counts: { collections: 0, topics: 0, problems: 0, solved: 0, attempted: 0, notStarted: 0 },
  completionPercentage: 0,
  difficulties: [],
  topics: [],
});

/**
 * GET /api/student/practice/library
 *
 * The whole Practice tree in ONE response: Collection → Topic → Problems.
 *
 * Why one endpoint rather than the three the page used to chain
 * (`/collections` → `/collections/:id/topics` → `/topics/:id/problems`):
 *
 *  - The drill-down was N+1. It fetched every collection the student could see
 *    — which includes their own trainer's BATCH curriculum — and then issued one
 *    more request per collection to list its topics, and one more per topic for
 *    its problems. Expanding an accordion should not be a network round trip, and
 *    search across a tree cannot be done at all from per-collection slices.
 *  - Scope. Both the curriculum and the PROBLEMS are filtered to GLOBAL here. A
 *    global collection can legitimately link a trainer's BATCH problem (a shared
 *    day reused by a batch), and those must never appear on the Practice page.
 *
 * Publication rules are the same ones the coding workflow enforces
 * (`services/problemAccess` + `status: 'PUBLISHED'`), so a problem that cannot
 * be opened cannot be listed.
 *
 * Relationships are read from the real junction table: a problem linked to
 * several topics appears in each of them, and a collection's problem count is
 * the number of DISTINCT problems across its displayed topics, so a problem
 * reached through two topics is counted once.
 *
 * Query: ?search=<title/description fragment>&difficulty=EASY|MEDIUM|HARD
 *        &status=NOT_STARTED|ATTEMPTED|SOLVED&topic=<topic name>
 *
 * Four queries total — collections, topics, links (with the problem populated),
 * and this student's submissions. No per-collection or per-topic lookups.
 */
router.get('/library', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const search = String(req.query.search || '').trim();
    const difficulty = String(req.query.difficulty || '').toUpperCase();
    const status = String(req.query.status || '').toUpperCase();
    const topicFilter = String(req.query.topic || '').trim();

    if (difficulty && !DIFFICULTIES.includes(difficulty)) {
      return res.status(400).json({ success: false, message: 'Difficulty must be EASY, MEDIUM or HARD' });
    }
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be NOT_STARTED, ATTEMPTED or SOLVED' });
    }

    const filtering = Boolean(search || difficulty || status || topicFilter);

    // 1. Global curriculum only. `scope: null` matches documents written before
    //    the field existed, which are all admin GLOBAL curriculum.
    const collections = await Collection.find({ status: 'ACTIVE', scope: { $in: ['GLOBAL', null] } })
      .select('_id name description slug')
      .sort({ createdAt: 1 })
      .lean();

    if (collections.length === 0) {
      return res.json({ success: true, data: [], meta: emptyLibraryMeta() });
    }

    const collectionIds = collections.map((c) => c._id);

    // 2. Active topics of those collections, in one query.
    const topics = await Topic.find({ collection: { $in: collectionIds }, status: 'ACTIVE' })
      .select('_id name description collection order')
      .sort({ order: 1, createdAt: 1 })
      .lean();

    // 3. Links with the problem populated. A link whose problem document was
    //    deleted, or whose problem is unpublished / batch-scoped, is dropped
    //    here rather than producing a row with undefined fields.
    const links = topics.length
      ? await ProblemTopic.find({ topic: { $in: topics.map((t) => t._id) } })
          .populate({ path: 'problem', select: '_id title slug description difficulty scope status createdAt' })
          .lean()
      : [];

    const usableLinks = links.filter((link) => {
      const problem = link.problem;
      if (!problem) return false;
      if (problem.status !== 'PUBLISHED') return false;
      return problem.scope === 'GLOBAL';
    });

    // 4. Progress for exactly the problems on screen, from this student's own
    //    submissions. One accepted submission makes a problem Solved regardless
    //    of how many failures precede it, so repeated accepts cannot inflate the
    //    unique solved counts.
    const problemIds = [...new Set(usableLinks.map((link) => toId(link.problem._id)))];
    const submissions = problemIds.length
      ? await Submission.find({ student: studentId, problem: { $in: problemIds } })
          .select('problem verdict')
          .lean()
      : [];
    const solvedIds = new Set(
      submissions.filter((s) => s.verdict === 'ACCEPTED').map((s) => toId(s.problem)),
    );
    const attemptedIds = new Set(submissions.map((s) => toId(s.problem)));

// Topic options come from the library itself, so a topic the student cannot
    // see is a client error rather than a silently empty page.
    const availableTopics = [...new Set(topics.map((t) => t.name))].sort();
    if (topicFilter && !availableTopics.includes(topicFilter)) {
      return res.status(400).json({ success: false, message: 'Unknown topic' });
    }

    const searchFilter = search ? new RegExp(escapeRegex(search), 'i') : null;
    const matchesFilters = (problem) => {
      if (searchFilter && !searchFilter.test(`${problem.title || ''} ${problem.description || ''}`)) return false;
      if (difficulty && problem.difficulty !== difficulty) return false;
      if (status) {
        const id = toId(problem._id);
        const progress = solvedIds.has(id) ? 'SOLVED' : attemptedIds.has(id) ? 'ATTEMPTED' : 'NOT_STARTED';
        if (progress !== status) return false;
      }
      return true;
    };

    // 5. Build the tree. `uniqueInCollection` counts each problem once per
    //    collection even when it is reached through two of its topics; the
    //    per-topic list is de-duplicated too (ProblemTopic already forbids a
    //    duplicate problem+topic link, the guard makes the invariant explicit).
    const topicsByCollection = new Map();
    for (const topic of topics) {
      const key = toId(topic.collection);
      if (!topicsByCollection.has(key)) topicsByCollection.set(key, []);
      topicsByCollection.get(key).push(topic);
    }

    const problemsByTopic = new Map();
    for (const link of usableLinks) {
      const topicKey = toId(link.topic);
      if (!problemsByTopic.has(topicKey)) problemsByTopic.set(topicKey, []);
      problemsByTopic.get(topicKey).push(link.problem);
    }

    const seenTopicProblems = new Set();
    const allProblems = [];
    const data = [];

    for (const collection of collections) {
      const collectionKey = toId(collection._id);
      const collectionTopics = topicsByCollection.get(collectionKey) || [];
      const uniqueProblemsInCollection = new Set();
      const topicPayloads = [];

      for (const topic of collectionTopics) {
        const topicKey = toId(topic._id);
        // A topic outside the requested one contributes nothing at all.
        if (topicFilter && topic.name !== topicFilter) continue;
        const topicProblems = problemsByTopic.get(topicKey) || [];

        const uniqueProblems = [];
        for (const problem of topicProblems) {
          const pairKey = `${topicKey}:${toId(problem._id)}`;
          if (seenTopicProblems.has(pairKey)) continue;
          seenTopicProblems.add(pairKey);

          if (filtering && !matchesFilters(problem)) continue;
          uniqueProblems.push(problem);
          uniqueProblemsInCollection.add(toId(problem._id));
          allProblems.push(problem);
        }

        // An empty topic is meaningful: it tells the student a day exists but has
        // nothing published yet. While filtering, it is only noise.
        if (uniqueProblems.length === 0 && filtering) continue;

        topicPayloads.push({
          id: topic._id,
          name: topic.name,
          description: topic.description || null,
          problemCount: uniqueProblems.length,
          problems: uniqueProblems.map((problem) => {
            const id = toId(problem._id);
            const progress = solvedIds.has(id) ? 'SOLVED' : attemptedIds.has(id) ? 'ATTEMPTED' : 'NOT_STARTED';
            return {
              id: problem._id,
              title: problem.title,
              slug: problem.slug,
              description: problem.description || null,
              difficulty: problem.difficulty || null,
              progress,
            };
          }),
        });
      }

      if (topicPayloads.length === 0 && filtering) continue;

      data.push({
        id: collection._id,
        name: collection.name,
        description: collection.description || null,
        slug: collection.slug,
        // Counts describe exactly what is displayed, so the header and the rows
        // can never disagree.
        topicCount: topicPayloads.length,
        problemCount: uniqueProblemsInCollection.size,
        topics: topicPayloads,
      });
    }

    const displayedProblemIds = new Set(allProblems.map((p) => toId(p._id)));
    const solved = [...displayedProblemIds].filter((id) => solvedIds.has(id)).length;
    const attempted = [...displayedProblemIds].filter((id) => !solvedIds.has(id) && attemptedIds.has(id)).length;
    const notStarted = displayedProblemIds.size - solved - attempted;

    return res.json({
      success: true,
      data,
      meta: {
        scope: 'GLOBAL',
        filtering,
        counts: {
          collections: data.length,
          topics: data.reduce((sum, c) => sum + c.topicCount, 0),
          // Unique across the WHOLE library, not the sum of per-collection
          // counts: the same problem can sit in two collections.
          problems: displayedProblemIds.size,
          solved,
          attempted,
          notStarted,
        },
        completionPercentage: displayedProblemIds.size
          ? Math.round((solved / displayedProblemIds.size) * 100)
          : 0,
        difficulties: DIFFICULTIES.filter((d) => allProblems.some((p) => p.difficulty === d)),
        topics: [...new Set(data.flatMap((c) => c.topics.map((t) => t.name)))].sort(),
      },
    });
  } catch (error) {
    console.error('Error fetching practice library:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/student/practice/next
 * Returns the next recommended problem for Continue Practice based on deterministic ordering
 * Priority: ATTEMPTED first, then NOT_STARTED across active collections -> topics -> problems
 */
router.get('/next', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { collectionId } = req.query;
    // Optional scope. `GLOBAL` restricts the answer to platform curriculum, which
    // is what the /student/practice library needs: without it a GLOBAL
    // collection that happens to link a trainer's BATCH problem would hand the
    // student a batch assignment from the Practice page. `BATCH` is the inverse
    // and is what the batch training flow asks for.
    const scope = String(req.query.scope || '').toUpperCase();
    if (scope && !['GLOBAL', 'BATCH'].includes(scope)) {
      return res.status(400).json({ success: false, message: 'Scope must be GLOBAL or BATCH' });
    }

    // 1. Get student's solved & attempted problem IDs
    const submissions = await Submission.find({ student: studentId }).select('problem verdict').lean();
    const solvedSet = new Set();
    const attemptedSet = new Set();

    submissions.forEach(s => {
      if (!s.problem) return;
      const pid = s.problem.toString();
      if (s.verdict === 'ACCEPTED') {
        solvedSet.add(pid);
      } else {
        attemptedSet.add(pid);
      }
    });

    // 2. Get student's active batch IDs for visibility
    const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' }).select('batch').lean();
    const batchIds = enrollments.map(e => e.batch);

    // 3. Get active collections sorted by createdAt or default
    const collectionFilter = {
      // `null` also matches pre-migration documents, which are GLOBAL curriculum.
      $or: [
        { scope: { $in: ['GLOBAL', null] } },
        { scope: 'BATCH', batch: { $in: batchIds } },
      ],
    };
    if (collectionId && mongoose.Types.ObjectId.isValid(collectionId)) {
      collectionFilter._id = collectionId;
    }
    const collections = await Collection.find(collectionFilter).sort({ createdAt: 1 }).lean();

    let candidateAttempted = null;
    let candidateNotStarted = null;

    for (const collection of collections) {
      const topics = await Topic.find({ collection: collection._id, status: 'ACTIVE' }).sort({ createdAt: 1 }).lean();

      for (const topic of topics) {
        const links = await ProblemTopic.find({ topic: topic._id }).sort({ order: 1, createdAt: 1 }).populate('problem').lean();

        for (const link of links) {
          const problem = link.problem;
          if (!problem || problem.status !== 'PUBLISHED') continue;

          // Scope is applied to the PROBLEM, not just the curriculum around it.
          // A GLOBAL collection can link a BATCH problem (a trainer reusing a
          // shared day), and vice versa.
          if (scope === 'GLOBAL' && problem.scope !== 'GLOBAL') continue;
          if (scope === 'BATCH' && problem.scope !== 'BATCH') continue;

          // Check visibility: include BATCH scoped problems only if student belongs to the batch
          if (problem.scope === 'BATCH') {
            // Ensure the problem belongs to a batch the student is enrolled in
            if (!problem.batch) continue;
            const problemBatchId = problem.batch.toString();
            const isInStudentBatch = batchIds.some(b => b.toString() === problemBatchId);
            if (!isInStudentBatch) continue;
          }

          const problemIdStr = problem._id.toString();
          if (solvedSet.has(problemIdStr)) continue; // Already solved

          const problemMeta = {
            collectionId: collection._id,
            collectionName: collection.name,
            topicId: topic._id,
            topicName: topic.name,
            problemId: problem._id,
            problemTitle: problem.title,
            // Echoed back so a caller can assert the scope it asked for was the
            // scope it got.
            scope: problem.scope,
            status: attemptedSet.has(problemIdStr) ? 'ATTEMPTED' : 'NOT_STARTED',
          };

          if (attemptedSet.has(problemIdStr)) {
            if (!candidateAttempted) {
              candidateAttempted = problemMeta;
            }
          } else {
            if (!candidateNotStarted) {
              candidateNotStarted = problemMeta;
            }
          }

          // If we found an attempted candidate, we can return immediately (highest priority)
          if (candidateAttempted) break;
        }
        if (candidateAttempted) break;
      }
      if (candidateAttempted) break;
    }

    const nextProblem = candidateAttempted || candidateNotStarted || null;
    return res.json({ success: true, data: nextProblem });
  } catch (err) {
    console.error('Error fetching next practice problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
