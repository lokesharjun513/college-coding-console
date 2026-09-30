// backend/src/routes/admin/topics.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Topic = require('../../models/Topic');
const Collection = require('../../models/Collection');
const ProblemTopic = require('../../models/ProblemTopic');
const Problem = require('../../models/Problem');

// Helper to generate slug
function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[-]+|-+$/g, '');
}

/**
 * LIST PROBLEMS IN TOPIC
 * GET /api/admin/topics/:topicId/problems
 */
router.get('/:topicId/problems', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid topic id' });
    }
    const { page = 1, limit = 50 } = req.query;
    const topic = await Topic.findById(topicId).lean();
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    const links = await ProblemTopic.find({ topic: topicId })
      .sort({ order: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('problem')
      .lean();
    const total = await ProblemTopic.countDocuments({ topic: topicId });
    return res.json({ success: true, data: links, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Error listing topic problems:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LINK PROBLEMS TO TOPIC
 * PUT /api/admin/topics/:topicId/problems
 */
router.put('/:topicId/problems', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid topic id' });
    }
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    const { problems } = req.body;
    if (!Array.isArray(problems)) {
      return res.status(400).json({ success: false, message: 'problems must be an array' });
    }
    // Validate all problems first
    const validatedProblems = [];
    for (const item of problems) {
      if (!mongoose.Types.ObjectId.isValid(item.problemId)) {
        return res.status(400).json({ success: false, message: `Invalid problemId: ${item.problemId}` });
      }
      const problem = await Problem.findById(item.problemId);
      if (!problem) {
        return res.status(404).json({ success: false, message: `Problem not found: ${item.problemId}` });
      }
      if (problem.scope !== 'GLOBAL') {
        return res.status(400).json({ success: false, message: `Only GLOBAL problems can be linked. Problem ${item.problemId} is ${problem.scope}` });
      }
      validatedProblems.push({ problem: problem._id, order: item.order ?? 0 });
    }
    // Check for duplicate links before deleting existing ones
    const problemIds = validatedProblems.map(vp => vp.problem);
    const existingLinks = await ProblemTopic.find({ topic: topicId, problem: { $in: problemIds } });
    if (existingLinks.length > 0) {
      return res.status(409).json({ success: false, message: 'Duplicate problem link detected' });
    }
    // Remove existing links
    await ProblemTopic.deleteMany({ topic: topicId });
    // Insert new links
    const links = validatedProblems.map((vp, idx) => ({
      problem: vp.problem,
      collection: topic.collection,
      topic: topicId,
      order: vp.order || idx,
      createdBy: req.user.id,
    }));
    await ProblemTopic.insertMany(links);
    // Fetch full linked problems
    const populated = await ProblemTopic.find({ topic: topicId })
      .sort({ order: 1 })
      .populate('problem')
      .lean();
    return res.json({ success: true, data: populated });
  } catch (err) {
    console.error('Error linking problems:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate problem link detected' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET TOPIC DETAIL
 * GET /api/admin/topics/:topicId
 */
router.get('/:topicId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid topic id' });
    }
    const topic = await Topic.findById(topicId).lean();
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    const collection = await Collection.findById(topic.collection).lean();
    return res.json({ success: true, data: { ...topic, collection } });
  } catch (err) {
    console.error('Error getting topic:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE TOPIC
 * PATCH /api/admin/topics/:topicId
 */
router.patch('/:topicId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid topic id' });
    }
    const { name, description, order, status } = req.body;
    const update = {};
    if (name) {
      update.name = name.trim();
      update.slug = slugify(name);
    }
    if (description !== undefined) update.description = description?.trim();
    if (order !== undefined) update.order = order;
    if (status) update.status = status;
    const topic = await Topic.findByIdAndUpdate(topicId, update, { new: true }).lean();
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    return res.json({ success: true, data: topic });
  } catch (err) {
    console.error('Error updating topic:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE TOPIC
 * DELETE /api/admin/topics/:topicId
 */
router.delete('/:topicId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ success: false, message: 'Invalid topic id' });
    }
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    if (topic.status === 'ARCHIVED') {
      // Hard delete permanently (remove problem links)
      await ProblemTopic.deleteMany({ topic: topicId });
      await Topic.findByIdAndDelete(topicId);
      return res.json({ success: true, data: null, hardDeleted: true });
    }
    // Remove associated problem links first
    await ProblemTopic.deleteMany({ topic: topicId });
    // Soft delete topic
    const updated = await Topic.findByIdAndUpdate(topicId, { status: 'ARCHIVED' }, { new: true }).lean();
    return res.json({ success: true, data: null, hardDeleted: false });
  } catch (err) {
    console.error('Error deleting topic:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
