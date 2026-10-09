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

/**
 * GET /api/student/practice/next
 * Returns the next recommended problem for Continue Practice based on deterministic ordering
 * Priority: ATTEMPTED first, then NOT_STARTED across active collections -> topics -> problems
 */
router.get('/next', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { collectionId } = req.query;
    // Optional scope: continue within one Training (collection) only

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
    const collectionFilter = { status: 'ACTIVE' };
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
