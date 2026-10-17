// backend/src/routes/trainer/collections.js
// Training (Collection) / Day (Topic) management for trainers.
//
// Ownership model
// ---------------
// Collection.createdBy / Topic.createdBy identify the owner, and it is the ONLY
// link between a trainer and a collection: the model has no batch reference and
// no sharing/visibility flag. So "may this trainer see it?" and "may this
// trainer change it?" have the same answer — it is the trainer's own.
//
// Reads are scoped to the owner, not just writes. Previously every Training in
// the system was listed to every trainer and every Training's Days were
// readable by id; a frontend filter was the only thing hiding admin-owned
// curriculum, which is not a security boundary. Now the ownership check is
// applied in the database query, and the per-collection reads enforce it too,
// so a hand-edited collection id cannot reach another trainer's or an admin's
// data. Students still read shared curriculum through /student/collections,
// which is a separate route with its own rules and is unaffected by this.
//
// Deletion is deliberately non-destructive. Archiving a Training/Day does not
// touch its topics, its ProblemTopic links or the Problems behind them, so a
// batch's curriculum and every submission/completion record stay intact.

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Collection = require('../../models/Collection');
const Batch = require('../../models/Batch');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');

const COLLECTION_STATUSES = ['ACTIVE', 'ARCHIVED'];

// Route order note: "/:collectionId/topics" and "/:collectionId" are different
// path shapes, and the two-segment literal "/:collectionId/topics" is registered
// before "/:collectionId/topics/:topicId" so the literal never becomes a topic id.

/** Escape a user-supplied term so it is matched literally by RegExp. */
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Helper to generate slug */
function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[-]+|-+$/g, '');
}

/**
 * Load a collection and assert the caller owns it.
 * 400 invalid id | 404 unknown | 403 owned by an admin or another trainer
 *
 * Imported from the shared service so this route and the problem routes cannot
 * drift into enforcing different collection rules.
 */
const { assertTrainerOwnsCollection } = require('../../services/trainerAuth');

/**
 * Load a topic inside a collection and assert the caller owns both.
 * Never leak whether a topic exists under a Training the caller does not own:
 * the collection check runs first and answers 404/403 on its own terms.
 */
async function assertTrainerOwnsTopic(trainerId, collectionId, topicId) {
  if (!mongoose.Types.ObjectId.isValid(topicId)) {
    const err = new Error('Invalid topic id');
    err.status = 400;
    throw err;
  }
  const collection = await assertTrainerOwnsCollection(trainerId, collectionId);
  const topic = await Topic.findOne({ _id: topicId, collection: collection._id });
  if (!topic) {
    const err = new Error('Topic not found');
    err.status = 404;
    throw err;
  }
  if (!topic.createdBy || topic.createdBy.toString() !== trainerId.toString()) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  return { topic, collection };
}

/**
 * LIST TRAININGS
 * GET /api/trainer/collections
 * Returns only the collections this trainer owns. Ownership is enforced in the
 * query itself — the rows are never loaded and then filtered, so admin-owned
 * and other-trainer's collections cannot leak through the response.
 * Read-safe fields only: id, name, slug, description, status, topicCount,
 * problemCount, and `owned`.
 * Query: ?status=ACTIVE|ARCHIVED&search=<name fragment>
 */
router.get('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { status, search, batchId } = req.query;
    // createdBy is the sole ownership link on this model, so scoping on it is
    // what keeps global Admin curriculum and other trainers' private
    // collections out of the response.
    const filter = { createdBy: req.user.id, scope: 'BATCH' };
    // When batchId is provided, only return collections for that batch.
    // This is used when viewing a batch-specific Problems page.
    if (batchId && mongoose.Types.ObjectId.isValid(batchId)) {
      filter.batch = batchId;
    }
    if (status) {
      if (!COLLECTION_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      filter.status = status;
    }
    if (search !== undefined && String(search).trim() !== '') {
      filter.name = new RegExp(escapeRegExp(String(search).trim()), 'i');
    }

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
        owned: Boolean(c.createdBy) && c.createdBy.toString() === req.user.id.toString(),
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
 * GET SINGLE TRAINING WITH ITS DAYS
 * GET /api/trainer/collections/:collectionId
 * Ownership enforced: a Training this trainer does not own answers 403, the same
 * as the write paths. 400 invalid id | 404 unknown | 403 owned by another user.
 */
router.get('/:collectionId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { collectionId } = req.params;
    const collection = await assertTrainerOwnsCollection(req.user.id, collectionId);

    const topics = await Topic.find({ collection: collection._id })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const data = await Promise.all(topics.map(async (t) => ({
      id: t._id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      order: t.order,
      status: t.status,
      owned: Boolean(t.createdBy) && t.createdBy.toString() === req.user.id.toString(),
      problemCount: await ProblemTopic.countDocuments({ topic: t._id }),
    })));

    return res.json({
      success: true,
      data: {
        id: collection._id,
        name: collection.name,
        slug: collection.slug,
        description: collection.description,
        status: collection.status,
        owned: Boolean(collection.createdBy) && collection.createdBy.toString() === req.user.id.toString(),
        topicCount: data.length,
        topics: data,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      },
    });
  } catch (err) {
    // assertTrainerOwnsCollection signals 400/404/403 via err.status; surface it
    // instead of collapsing every authorization outcome into a 500.
    if (err && err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Error getting trainer collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST DAYS IN A TRAINING
 * GET /api/trainer/collections/:collectionId/topics
 * Ownership enforced on the parent Training: a hand-edited collection id cannot
 * be used to read another trainer's or an admin's Days.
 * Sorted by the Topic model's `order` field (matches admin listing).
 */
router.get('/:collectionId/topics', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { collectionId } = req.params;
    const collection = await assertTrainerOwnsCollection(req.user.id, collectionId);

    const topics = await Topic.find({ collection: collection._id }).sort({ order: 1, createdAt: 1 }).lean();
    const data = await Promise.all(topics.map(async (t) => ({
      id: t._id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      order: t.order,
      status: t.status,
      owned: Boolean(t.createdBy) && t.createdBy.toString() === req.user.id.toString(),
      problemCount: await ProblemTopic.countDocuments({ topic: t._id }),
    })));
    return res.json({ success: true, data });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Error listing trainer collection topics:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * CREATE COLLECTION (Trainer)
 * POST /api/trainer/collections
 */
router.post('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { name, description, status, batchId } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (status !== undefined && !COLLECTION_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    // Trainer curriculum belongs to exactly one of the trainer's own batches.
    // Without this the collection would have no authorization meaning at all.
    if (!batchId) {
      return res.status(400).json({ success: false, message: 'batchId is required for a trainer collection' });
    }
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({ success: false, message: 'Invalid batch id' });
    }
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    // A trainer may only build curriculum for a batch assigned to them.
    if (!batch.trainer || batch.trainer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const slug = slugify(name.trim());
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Name must contain letters or numbers' });
    }
    // Collection.name is globally unique; check it up front so a clash is a
    // clean 409 instead of a duplicate-key 500.
    const nameClash = await Collection.findOne({ name: name.trim() });
    if (nameClash) {
      return res.status(409).json({ success: false, message: 'Collection with this name already exists' });
    }
    const existing = await Collection.findOne({ slug });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Collection with this slug already exists' });
    }
    const collection = await Collection.create({
      name: name.trim(),
      slug,
      description: description?.trim(),
      status: status || 'ACTIVE',
      scope: 'BATCH',
      batch: batch._id,
      createdBy: req.user.id,
    });
    return res.status(201).json({ success: true, data: collection });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Collection with this name already exists' });
    }
    console.error('Error creating trainer collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE TRAINING (rename / describe / archive / unarchive)
 * PATCH /api/trainer/collections/:collectionId
 * Ownership enforced: admin-owned and other-trainer-owned Training is refused.
 * Archiving is non-destructive — topics, links and problems are left untouched.
 */
router.patch('/:collectionId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const collection = await assertTrainerOwnsCollection(req.user.id, req.params.collectionId);
    const { name, description, status } = req.body;

    if (status !== undefined && !COLLECTION_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
      const trimmed = String(name).trim();
      const slug = slugify(trimmed);
      if (!slug) {
        return res.status(400).json({ success: false, message: 'Name must contain letters or numbers' });
      }
      if (trimmed !== collection.name) {
        const nameClash = await Collection.findOne({ name: trimmed, _id: { $ne: collection._id } });
        if (nameClash) {
          return res.status(409).json({ success: false, message: 'Collection with this name already exists' });
        }
      }
      if (slug !== collection.slug) {
        const slugClash = await Collection.findOne({ slug, _id: { $ne: collection._id } });
        if (slugClash) {
          return res.status(409).json({ success: false, message: 'Collection with this slug already exists' });
        }
      }
      collection.name = trimmed;
      collection.slug = slug;
    }

    if (description !== undefined) collection.description = description;
    if (status !== undefined) collection.status = status;

    await collection.save();
    return res.json({ success: true, data: collection });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ success: false, message: err.message });
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Collection with this name already exists' });
    }
    console.error('Error updating trainer collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * SAFE DELETE TRAINING
 * DELETE /api/trainer/collections/:collectionId
 *
 * "Delete" here means retire. A Training that still holds Days is archived
 * instead of removed (400), so its Days, ProblemTopic links, Problems and every
 * submission stay exactly where they are. Removing those rows would cascade a
 * trainer's archive action into other trainers' batch curriculum.
 */
router.delete('/:collectionId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const collection = await assertTrainerOwnsCollection(req.user.id, req.params.collectionId);

    const [topicCount, problemCount] = await Promise.all([
      Topic.countDocuments({ collection: collection._id, status: 'ACTIVE' }),
      ProblemTopic.countDocuments({ collection: collection._id }),
    ]);

    if (topicCount > 0 || problemCount > 0) {
      if (collection.status !== 'ARCHIVED') {
        collection.status = 'ARCHIVED';
        await collection.save();
        return res.json({
          success: true,
          data: { archived: true, hardDeleted: false, topicCount, problemCount },
          message: 'Training still contains days or problems and was archived instead of deleted',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a training that still contains days or problems',
      });
    }

    // Empty and owned: nothing downstream can reference it, so remove it.
    await Collection.findByIdAndDelete(collection._id);
    return res.json({ success: true, data: { archived: false, hardDeleted: true } });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Error deleting trainer collection:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * CREATE TOPIC (Day) in Collection (Training)
 * POST /api/trainer/collections/:collectionId/topics
 * Ownership enforced on the parent Training.
 */
router.post('/:collectionId/topics', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { collectionId } = req.params;
    const collection = await assertTrainerOwnsCollection(req.user.id, collectionId);

    const { name, description, order, status } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (status !== undefined && !COLLECTION_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const slug = slugify(name.trim());
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Name must contain letters or numbers' });
    }
    // Topic slug is unique per collection ({collection, slug}); report it as a
    // clean 409 rather than letting the unique index surface as a 500.
    const duplicate = await Topic.findOne({ collection: collection._id, slug });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'Topic with this slug already exists in this training' });
    }

    const topic = await Topic.create({
      name: name.trim(),
      slug,
      description: description?.trim(),
      collection: collection._id,
      order: Number.isInteger(order) ? order : 0,
      status: status || 'ACTIVE',
      createdBy: req.user.id,
    });
    return res.status(201).json({ success: true, data: topic });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ success: false, message: err.message });
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Topic with this slug already exists in this training' });
    }
    console.error('Error creating trainer topic:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE DAY (rename / reorder / describe / archive / unarchive)
 * PATCH /api/trainer/collections/:collectionId/topics/:topicId
 * Ownership enforced on both the Day and its Training.
 * Archiving does not archive the linked Problems: visibility for students is
 * driven by Problem.status, which stays under the problem owner's control.
 */
router.patch('/:collectionId/topics/:topicId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { topic } = await assertTrainerOwnsTopic(req.user.id, req.params.collectionId, req.params.topicId);
    const { name, description, order, status } = req.body;

    if (status !== undefined && !COLLECTION_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
      const trimmed = String(name).trim();
      const slug = slugify(trimmed);
      if (!slug) {
        return res.status(400).json({ success: false, message: 'Name must contain letters or numbers' });
      }
      if (slug !== topic.slug) {
        const clash = await Topic.findOne({ collection: topic.collection, slug, _id: { $ne: topic._id } });
        if (clash) {
          return res.status(409).json({ success: false, message: 'Topic with this slug already exists in this training' });
        }
      }
      topic.name = trimmed;
      topic.slug = slug;
    }

    if (description !== undefined) topic.description = description;
    if (order !== undefined) {
      if (!Number.isInteger(order) || order < 0) {
        return res.status(400).json({ success: false, message: 'Invalid order' });
      }
      topic.order = order;
    }
    if (status !== undefined) topic.status = status;

    await topic.save();
    return res.json({ success: true, data: topic });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ success: false, message: err.message });
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Topic with this slug already exists in this training' });
    }
    console.error('Error updating trainer topic:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * SAFE DELETE DAY
 * DELETE /api/trainer/collections/:collectionId/topics/:topicId
 *
 * A Day that still has Problems linked to it is archived instead of removed, so
 * the ProblemTopic links, the Problems themselves and all submission history
 * survive. Problems are never deleted from here.
 */
router.delete('/:collectionId/topics/:topicId', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { topic } = await assertTrainerOwnsTopic(req.user.id, req.params.collectionId, req.params.topicId);
    const problemCount = await ProblemTopic.countDocuments({ topic: topic._id });

    if (problemCount > 0) {
      if (topic.status !== 'ARCHIVED') {
        topic.status = 'ARCHIVED';
        await topic.save();
        return res.json({
          success: true,
          data: { archived: true, hardDeleted: false, problemCount },
          message: 'Day still has problems linked and was archived instead of deleted',
        });
      }
      return res.status(400).json({ success: false, message: 'Cannot delete a day that still has problems linked' });
    }

    await Topic.findByIdAndDelete(topic._id);
    return res.json({ success: true, data: { archived: false, hardDeleted: true } });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Error deleting trainer topic:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;