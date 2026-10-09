// backend/src/routes/trainer/collections.js
// Read-only Training (Collection) / Day (Topic) metadata for trainers.
// Collections/Topics are shared training metadata (students read them via
// /student/collections) — trainers get the same read access without any
// ADMIN privileges. Writes stay on /admin/collections.
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Collection = require('../../models/Collection');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');

/**
 * LIST TRAININGS
 * GET /api/trainer/collections
 * Read-safe fields only: id, name, slug, description, status, topicCount, problemCount
 */
router.get('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const collections = await Collection.find(filter).sort({ createdAt: 1 }).lean();
    const data = await Promise.all(collections.map(async (c) => {
      const [topicCount, problemCount] = await Promise.all([
        Topic.countDocuments({ collection: c._id }),
        ProblemTopic.countDocuments({ collection: c._id }),
      ]);
      return {
        id: c._id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        status: c.status,
        topicCount,
        problemCount,
      };
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error listing trainer collections:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST DAYS IN A TRAINING
 * GET /api/trainer/collections/:collectionId/topics
 * Sorted by the Topic model's `order` field (matches admin listing).
 */
router.get('/:collectionId/topics', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { collectionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(collectionId)) {
      return res.status(400).json({ success: false, message: 'Invalid collection id' });
    }
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    const topics = await Topic.find({ collection: collectionId }).sort({ order: 1, createdAt: 1 }).lean();
    const data = await Promise.all(topics.map(async (t) => ({
      id: t._id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      order: t.order,
      status: t.status,
      problemCount: await ProblemTopic.countDocuments({ topic: t._id }),
    })));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error listing trainer collection topics:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
