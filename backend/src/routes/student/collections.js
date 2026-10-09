// backend/src/routes/student/collections.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Collection = require('../../models/Collection');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const BatchStudent = require('../../models/BatchStudent');
const { visibleProblemQuery } = require('../../services/problemAccess');

// Build a set of problem IDs the student has SOLVED (verdict ACCEPTED)
async function getSolvedProblemIds(studentId) {
  const submissions = await Submission.find({ student: studentId, verdict: 'ACCEPTED' }).select('problem').lean();
  return new Set(submissions.map(s => s.problem.toString()));
}

// Build the student's active batch IDs (visibility for BATCH-scoped problems)
async function getActiveBatchIds(studentId) {
  const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' }).select('batch').lean();
  return enrollments.map(e => e.batch);
}

// Filter problem IDs to only those visible to the student (GLOBAL or enrolled BATCH, PUBLISHED)
async function filterVisibleProblemIds(problemIds, batchIds, scope = null) {
  if (problemIds.length === 0) return [];
  const problems = await Problem.find({
    _id: { $in: problemIds },
    ...visibleProblemQuery(batchIds, new Date(), { scope }),
  }).select('_id').lean();
  return problems.map(p => p._id);
}

// Authoritative Training/Day status derived from assigned vs solved counts.
// Zero-problem entities are NO_PROBLEMS — never COMPLETED just because 0 === 0.
function deriveProgress(total, completed) {
  const status = total === 0
    ? 'NO_PROBLEMS'
    : completed >= total
      ? 'COMPLETED'
      : completed > 0
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';
  const progressPercentage = total === 0 ? 0 : Math.round((completed / total) * 10000) / 100;
  return { status, progressPercentage };
}

/**
 * GET /api/student/collections/training
 * Authoritative Daily Training progress for the student's batch-scoped problems.
 * Single response with Training (collection) -> Days (topics) -> Problems, all totals
 * computed server-side (never from lazily loaded frontend data).
 */
router.get('/training', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const solvedIds = await getSolvedProblemIds(studentId);
    const batchIds = await getActiveBatchIds(studentId);

    const collections = await Collection.find({ status: 'ACTIVE' }).sort({ createdAt: 1 }).lean();

    // Fetch everything needed in bulk — no per-entity N+1 loops
    const topics = await Topic.find({ status: 'ACTIVE' }).lean();
    const links = await ProblemTopic.find({}).lean();
    const allLinkedIds = links.map(l => l.problem);
    const visibleIds = new Set((await filterVisibleProblemIds(allLinkedIds, batchIds)).map(String));

    // Group topic links by collection, problem links by topic
    const topicsByCollection = new Map();
    for (const t of topics) {
      if (!topicsByCollection.has(t.collection.toString())) topicsByCollection.set(t.collection.toString(), []);
      topicsByCollection.get(t.collection.toString()).push(t);
    }
    const linksByTopic = new Map();
    for (const l of links) {
      const key = l.topic.toString();
      if (!linksByTopic.has(key)) linksByTopic.set(key, []);
      linksByTopic.get(key).push(l);
    }

    const data = collections.map((c) => {
      const collectionTopics = topicsByCollection.get(c._id.toString()) || [];
      let totalProblems = 0;
      let solvedProblems = 0;
      let daysCounted = 0;
      let daysCompleted = 0;

      const days = collectionTopics.map((t) => {
        const dayLinks = linksByTopic.get(t._id.toString()) || [];
        const dayProblems = dayLinks
          .map(l => l.problem)
          .filter(pid => visibleIds.has(pid.toString()));
        const daySolved = dayProblems.filter(pid => solvedIds.has(pid.toString())).length;
        const dayTotal = dayProblems.length;
        const { status, progressPercentage } = deriveProgress(dayTotal, daySolved);
        if (dayTotal > 0) {
          daysCounted += 1;
          if (status === 'COMPLETED') daysCompleted += 1;
        }
        totalProblems += dayTotal;
        solvedProblems += daySolved;

        return {
          id: t._id,
          name: t.name,
          description: t.description,
          totalProblems: dayTotal,
          solvedProblems: daySolved,
          progressPercentage,
          status,
        };
      });

      const { status, progressPercentage } = deriveProgress(totalProblems, solvedProblems);
      return {
        id: c._id,
        name: c.name,
        description: c.description,
        slug: c.slug,
        topicCount: collectionTopics.length,
        days,
        totalProblems,
        solvedProblems,
        progressPercentage,
        status,
        daysCounted,
        daysCompleted,
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching student training progress:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/student/collections
 * List active collections with counts and the student's solved progress
 */
router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const collections = await Collection.find({ status: 'ACTIVE' }).lean();

    const solvedIds = await getSolvedProblemIds(studentId);
    const batchIds = await getActiveBatchIds(studentId);

    const data = await Promise.all(collections.map(async (c) => {
      const topicCount = await Topic.countDocuments({ collection: c._id, status: 'ACTIVE' });
      const links = await ProblemTopic.find({ collection: c._id }).select('problem').lean();
      const problemIds = links.map(l => l.problem);
      const visibleIds = await filterVisibleProblemIds(problemIds, batchIds, 'GLOBAL');
      const completedProblemCount = visibleIds.filter(id => solvedIds.has(id.toString())).length;
      const { status, progressPercentage } = deriveProgress(visibleIds.length, completedProblemCount);
      return {
        id: c._id,
        name: c.name,
        description: c.description,
        slug: c.slug,
        status: c.status,
        topicCount,
        problemCount: visibleIds.length,
        completedProblemCount,
        progressPercentage,
        trainingStatus: status,
      };
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching student collections:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/student/collections/:id/topics
 * List topics for a collection with the student's solved progress per topic
 */
router.get('/:id/topics', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid collection id' });
    }
    const collection = await Collection.findById(id);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }

    const studentId = req.user.id;
    const solvedIds = await getSolvedProblemIds(studentId);
    const batchIds = await getActiveBatchIds(studentId);

    const topics = await Topic.find({ collection: id, status: 'ACTIVE' }).lean();
    const data = await Promise.all(topics.map(async (t) => {
      const links = await ProblemTopic.find({ topic: t._id }).select('problem').lean();
      const problemIds = links.map(l => l.problem);
      const visibleIds = await filterVisibleProblemIds(problemIds, batchIds, 'GLOBAL');
      const completedProblemCount = visibleIds.filter(pid => solvedIds.has(pid.toString())).length;
      const { status, progressPercentage } = deriveProgress(visibleIds.length, completedProblemCount);
      return {
        id: t._id,
        name: t.name,
        description: t.description,
        slug: t.slug,
        status: t.status,
        problemCount: visibleIds.length,
        completedProblemCount,
        progressPercentage,
        dayStatus: status,
      };
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching topics for collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
