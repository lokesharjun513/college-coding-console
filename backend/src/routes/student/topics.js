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
    const problemCount = await ProblemTopic.countDocuments({ topic: topicId });
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
 * List published GLOBAL problems
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
    const problems = await Problem.find({ scope: 'GLOBAL', status: 'PUBLISHED' })
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-__v')
      .lean();
    const total = await Problem.countDocuments({ scope: 'GLOBAL', status: 'PUBLISHED' });
    const data = problems.map(p => ({
      id: p._id,
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      status: p.status,
    }));
    return res.json({ success: true, data, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Error fetching topic problems:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
