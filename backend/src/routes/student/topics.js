// backend/src/routes/student/topics.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Topic = require('../../models/Topic');
const Collection = require('../../models/Collection');
const ProblemTopic = require('../../models/ProblemTopic');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const BatchStudent = require('../../models/BatchStudent');
const { visibleProblemQuery } = require('../../services/problemAccess');

/**
 * GET /api/student/topics/:topicId
 * Get topic detail with collection info
 */
router.get('/:topicId', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid topic id' });
    }
    const topic = await Topic.findById(topicId).populate('collection', 'name slug description').lean();
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    const studentId = req.user.id;
    const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' }).select('batch').lean();
    const links = await ProblemTopic.find({ topic: topicId }).select('problem').lean();
    const problemCount = await Problem.countDocuments({
      _id: { $in: links.map(link => link.problem) },
      ...visibleProblemQuery(enrollments.map(enrollment => enrollment.batch)),
    });
    const data = {
      id: topic._id,
      name: topic.name,
      description: topic.description,
      slug: topic.slug,
      status: topic.status,
      problemCount,
      collection: topic.collection ? {
        id: topic.collection._id,
        name: topic.collection.name,
        slug: topic.collection.slug,
        description: topic.collection.description,
      } : null,
    };
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching topic:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/student/topics/:topicId/problems
 * List problems belonging to the requested topic, visible to the student
 */
router.get('/:topicId/problems', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid topic id' });
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const { page = 1, limit = 50 } = req.query;
    const studentId = req.user.id;

    // Get student's enrolled batch IDs
    const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' }).select('batch');
    const batchIds = enrollments.map(e => e.batch);

    // Student's solved (ACCEPTED) and attempted problem IDs for authoritative progress
    const [submissions] = await Promise.all([
      Submission.find({ student: studentId }).select('problem verdict').lean(),
    ]);
    const solvedIds = new Set(
      submissions.filter(s => s.verdict === 'ACCEPTED').map(s => s.problem.toString())
    );
    const attemptedIds = new Set(submissions.map(s => s.problem.toString()));

    // Find problem-topic links for this topic
    const links = await ProblemTopic.find({ topic: topicId })
      .populate('problem')
      .lean();

    // Optional scope filter (GLOBAL) for the Practice discovery view.
    // When absent, existing behavior (GLOBAL + enrolled BATCH) is preserved for Batch training.
    const scopeFilter = req.query.scope === 'GLOBAL';

    // Filter to problems visible to student and published
    const visibleProblems = links
      .filter(link => link.problem && link.problem.status === 'PUBLISHED')
      .filter(link => {
        if (scopeFilter) {
          // GLOBAL-only mode: never show BATCH problems
          return link.problem.scope === 'GLOBAL';
        }
        // GLOBAL scope is visible to all
        if (link.problem.scope === 'GLOBAL') return true;
        // BATCH scope requires enrollment in that batch
        if (link.problem.scope === 'BATCH' && batchIds.some(b => b.toString() === link.problem.batch?.toString())) {
          return true;
        }
        return false;
      })
      .map(link => link.problem);

    // Apply pagination
    const total = visibleProblems.length;
    const paginatedProblems = visibleProblems
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice((page - 1) * limit, page * limit);

    const data = paginatedProblems.map(p => {
      const pid = p._id.toString();
      const progress = solvedIds.has(pid) ? 'SOLVED' : attemptedIds.has(pid) ? 'ATTEMPTED' : 'NOT_STARTED';
      return {
        id: p._id,
        title: p.title,
        slug: p.slug,
        difficulty: p.difficulty,
        status: p.status,
        progress,
      };
    });

    return res.json({ success: true, data, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Error fetching topic problems:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
