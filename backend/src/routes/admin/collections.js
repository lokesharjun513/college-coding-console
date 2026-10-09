// backend/src/routes/admin/collections.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Collection = require('../../models/Collection');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');
const Problem = require('../../models/Problem');
const TestCase = require('../../models/TestCase');
const Submission = require('../../models/Submission');

// Helper to generate slug
function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[-]+|-+$/g, '');
}

/**
 * CREATE COLLECTION
 * POST /api/admin/collections
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, description, status } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const slug = slugify(name);
    // Check duplicate slug
    const existing = await Collection.findOne({ slug });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Collection with this slug already exists' });
    }
    const collection = await Collection.create({
      name: name.trim(),
      slug,
      description: description?.trim(),
      status: status || 'ACTIVE',
      createdBy: req.user.id,
    });
    return res.status(201).json({ success: true, data: collection });
  } catch (err) {
    console.error('Error creating collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST COLLECTIONS
 * GET /api/admin/collections
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status } = req.query;
    const filter = {};
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    if (status) {
      filter.status = status;
    }
    // Use aggregation to include topicCount and problemCount per collection
    const limitInt = parseInt(limit);
    const pageInt = parseInt(page);
    const collectionsAgg = await Collection.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: (pageInt - 1) * limitInt },
      { $limit: limitInt },
      {
        $lookup: {
          from: 'topics',
          localField: '_id',
          foreignField: 'collection',
          as: 'topics'
        }
      },
      {
        $lookup: {
          from: 'problemtopics',
          localField: '_id',
          foreignField: 'collection',
          as: 'problemLinks'
        }
      },
      {
        $addFields: {
          topicCount: { $size: '$topics' },
          // compute distinct problem IDs from problemLinks
          problemIds: {
            $map: {
              input: '$problemLinks',
              as: 'pl',
              in: '$$pl.problem'
            }
          }
        }
      },
      {
        $addFields: {
          problemCount: { $size: { $setUnion: ['$problemIds'] } }
        }
      },
      { $project: { topics: 0, problemLinks: 0, problemIds: 0 } }
    ]);
    const total = await Collection.countDocuments(filter);
    // Ensure IDs are strings for client consistency
    const collections = collectionsAgg.map(col => ({
      ...col,
      _id: col._id.toString(),
      id: col._id.toString()
    }));
    return res.json({ success: true, data: collections, meta: { total, page: pageInt, limit: limitInt } });
  } catch (err) {
    console.error('Error listing collections:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET COLLECTION DETAIL
 * GET /api/admin/collections/:id
 */
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid collection id' });
    }
    const collection = await Collection.findById(id).lean();
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    // topics count
    const topics = await Topic.find({ collection: id }).lean();
    const topicCount = topics.length;
    // problem count via distinct ProblemTopic.problem
    const problemIds = await ProblemTopic.distinct('problem', { collection: id });
    const problemCount = problemIds.length;
    const data = { ...collection, topics, topicCount, problemCount };
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error getting collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE COLLECTION
 * PATCH /api/admin/collections/:id
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('Invalid collection id');
    }
    const { name, description, status, cascade } = req.body;
    const update = {};
    if (name) {
      update.name = name.trim();
      update.slug = slugify(name);
    }
    if (description !== undefined) update.description = description?.trim();
    if (status) update.status = status;

    // Fetch existing collection to determine status change
    const oldCollection = await Collection.findById(id).session(session);
    if (!oldCollection) {
      throw new Error('Collection not found');
    }
    const oldStatus = oldCollection.status;

    // Apply updates within transaction
    let collection;
    await session.withTransaction(async () => {
      collection = await Collection.findByIdAndUpdate(id, update, { new: true, session }).lean();
      if (!collection) {
        throw new Error('Collection not found');
      }

      // If status is being changed to ARCHIVED, cascade archive to topics and problems
      if (status === 'ARCHIVED' && oldStatus !== 'ARCHIVED') {
        // Archive all topics in this collection
        await Topic.updateMany({ collection: id }, { status: 'ARCHIVED' }, { session });
        // Archive all problems linked to topics in this collection
        const topicIds = await Topic.distinct('_id', { collection: id }, { session });
        if (topicIds.length > 0) {
          const problemIds = await ProblemTopic.distinct('problem', { topic: { $in: topicIds } }, { session });
          if (problemIds.length > 0) {
            const problemsToArchive = await Problem.find({ _id: { $in: problemIds } }, { _id: 1, status: 1 }, { session });
            await Promise.all(problemsToArchive.map(p =>
              Problem.updateOne(
                { _id: p._id },
                { $set: { status: 'ARCHIVED', ...(p.status !== 'ARCHIVED' ? { archivedFrom: p.status } : {}) } },
                { session }
              )
            ));
          }
        }
      }

      // If status is being changed to ACTIVE and cascade is true, cascade unarchive
      if (status === 'ACTIVE' && oldStatus !== 'ACTIVE' && cascade === true) {
        // Unarchive all topics in this collection
        await Topic.updateMany({ collection: id }, { status: 'ACTIVE' }, { session });
        // Unarchive all problems linked to topics in this collection: restore their status from archivedFrom
        const topicIds = await Topic.distinct('_id', { collection: id }, { session });
        if (topicIds.length > 0) {
          const problemIds = await ProblemTopic.distinct('problem', { topic: { $in: topicIds } }, { session });
          if (problemIds.length > 0) {
            // Restore status from archivedFrom and clear archivedFrom
            const problemsToRestore = await Problem.find({ _id: { $in: problemIds } }, { _id: 1, archivedFrom: 1 }, { session });
            await Promise.all(problemsToRestore.map(p =>
              Problem.updateOne(
                { _id: p._id },
                { $set: { status: p.archivedFrom || 'DRAFT', archivedFrom: null } },
                { session }
              )
            ));
          }
        }
      }
    });

    await session.endSession();
    return res.json({ success: true, data: collection });
  } catch (err) {
    if (session) await session.endSession();
    console.error('Error updating collection:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

/**
 * DELETE COLLECTION (soft delete)
 * DELETE /api/admin/collections/:id
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid collection id' });
    }
    const collection = await Collection.findById(id);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    if (collection.status === 'ARCHIVED') {
      // Hard delete permanently with transaction if supported
      if (mongoose.__transactionSupport) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            // 1. Find all topics in this collection
            const topics = await Topic.find({ collection: id }, { _id: 1 }, { session });
            const topicIds = topics.map(t => t._id);

            // 2. Find all problems linked to topics in this collection
            if (topicIds.length > 0) {
              const problemIds = await ProblemTopic.distinct('problem', { topic: { $in: topicIds } }, { session });

              // 3. Delete Submissions for these problems
              if (problemIds.length > 0) {
                await Submission.deleteMany({ problem: { $in: problemIds } }, { session });
                // 4. Delete TestCases for these problems
                await TestCase.deleteMany({ problem: { $in: problemIds } }, { session });
              }

              // 5. Delete all ProblemTopic records for problems linked to this collection
              await ProblemTopic.deleteMany({ collection: id }, { session });

              // 6. Delete Problems
              if (problemIds.length > 0) {
                await Problem.deleteMany({ _id: { $in: problemIds } }, { session });
              }
            }

            // 7. Delete all Topics in this collection
            await Topic.deleteMany({ collection: id }, { session });

            // 8. Delete Collection
            await Collection.findByIdAndDelete(id, { session });
          });
          await session.endSession();
          return res.json({ success: true, data: null, hardDeleted: true });
        } catch (error) {
          await session.endSession();
          throw error;
        }
      } else {
        // Fallback: sequential deletes (not atomic)
        const topics = await Topic.find({ collection: id }, { _id: 1 });
        const topicIds = topics.map(t => t._id);

        if (topicIds.length > 0) {
          const problemIds = await ProblemTopic.distinct('problem', { topic: { $in: topicIds } });

          // Delete Submissions
          if (problemIds.length > 0) {
            await Submission.deleteMany({ problem: { $in: problemIds } });
            await TestCase.deleteMany({ problem: { $in: problemIds } });
          }

          await ProblemTopic.deleteMany({ collection: id });

          if (problemIds.length > 0) {
            await Problem.deleteMany({ _id: { $in: problemIds } });
          }
        }

        await Topic.deleteMany({ collection: id });
        await Collection.findByIdAndDelete(id);

        return res.json({ success: true, data: null, hardDeleted: true });
      }
    }
    // Prevent deletion if topics exist (only when not archived)
    const topicCount = await Topic.countDocuments({ collection: id });
    if (topicCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete collection with existing topics' });
    }
    // Soft delete collection by setting status only
    const updated = await Collection.findByIdAndUpdate(id, { status: 'ARCHIVED' }, { new: true }).lean();
    return res.json({ success: true, data: null, hardDeleted: false });
  } catch (err) {
    console.error('Error deleting collection:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

/**
 * CREATE TOPIC IN COLLECTION
 * POST /api/admin/collections/:collectionId/topics
 */
router.post('/:collectionId/topics', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { collectionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(collectionId)) {
      return res.status(400).json({ success: false, message: 'Invalid collection id' });
    }
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const slug = slugify(name);
    // Check duplicate slug within this collection
    const existing = await Topic.findOne({ collection: collectionId, slug });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Topic with this name already exists in this collection' });
    }
    const topic = await Topic.create({
      name: name.trim(),
      slug,
      description: description?.trim(),
      collection: collectionId,
      createdBy: req.user.id,
    });
    return res.status(201).json({ success: true, data: topic });
  } catch (err) {
    console.error('Error creating topic:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Topic with this name already exists in this collection' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST TOPICS IN COLLECTION
 * GET /api/admin/collections/:collectionId/topics
 */
router.get('/:collectionId/topics', requireAuth, requireRole('ADMIN'), async (req, res) => {
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
    const topicCounts = await Promise.all(topics.map(async (topic) => {
      const problemCount = await ProblemTopic.countDocuments({ topic: topic._id });
      return { ...topic, problemCount };
    }));
    return res.json({ success: true, data: topicCounts });
  } catch (err) {
    console.error('Error listing topics:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
