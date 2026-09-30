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

/**
 * GET /api/student/collections
 * List active collections with counts
 */
router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const collections = await Collection.find({ status: 'ACTIVE' }).lean();
    const data = await Promise.all(collections.map(async (c) => {
      const topicCount = await Topic.countDocuments({ collection: c._id, status: 'ACTIVE' });
      const problemCount = await ProblemTopic.countDocuments({ collection: c._id });
      return {
        id: c._id,
        name: c.name,
        description: c.description,
        slug: c.slug,
        status: c.status,
        topicCount,
        problemCount,
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
 * List topics for a collection
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
    const topics = await Topic.find({ collection: id, status: 'ACTIVE' }).lean();
    const data = await Promise.all(topics.map(async (t) => {
      const problemCount = await ProblemTopic.countDocuments({ topic: t._id });
      return {
        id: t._id,
        name: t.name,
        description: t.description,
        slug: t.slug,
        status: t.status,
        problemCount,
      };
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching topics for collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
