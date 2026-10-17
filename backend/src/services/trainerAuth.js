// Shared trainer->batch ownership guard.
// Conventions follow the existing trainer routes:
//   400 invalid id, 404 unknown batch, 403 batch owned by another trainer
//   (a batch with no assigned trainer is owned by nobody and is denied).

const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const Collection = require('../models/Collection');

/**
 * Assert the batch exists and is assigned to the trainer.
 * Returns the batch or throws an error with .status for the route's error handler.
 */
async function assertTrainerOwnsBatch(trainerId, batchId) {
  if (!mongoose.Types.ObjectId.isValid(batchId && typeof batchId === 'string' ? batchId.trim() : batchId)) {
    const err = new Error('Invalid batch id');
    err.status = 400;
    throw err;
  }
  const batchIdToUse = batchId && typeof batchId === 'string' ? batchId.trim() : batchId;
  const batch = await Batch.findById(batchIdToUse);
  if (!batch) {
    const err = new Error('Batch not found');
    err.status = 404;
    throw err;
  }
  // A batch with no assigned trainer belongs to nobody: deny every trainer.
  if (!batch.trainer || batch.trainer.toString() !== trainerId.toString()) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  return batch;
}

/**
 * Assert the problem exists, is BATCH-scoped, belongs to the URL batch,
 * and that batch belongs to the trainer.
 */
async function assertTrainerOwnsProblem(trainerId, batchId, problemId) {
  const Problem = require('../models/Problem');
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    const err = new Error('Invalid problem id');
    err.status = 400;
    throw err;
  }
  const problem = await Problem.findById(problemId).populate('batch');
  if (!problem || !problem.batch) {
    const err = new Error('Problem not found');
    err.status = 404;
    throw err;
  }
  if (batchId && problem.batch._id.toString() !== batchId.toString()) {
    const err = new Error('Problem not found');
    err.status = 404;
    throw err;
  }
  await assertTrainerOwnsBatch(trainerId, problem.batch._id);
  return { problem, batch: problem.batch };
}

/**
 * Assert the collection exists and is trainer curriculum the caller owns.
 *
 * 400 invalid id | 404 unknown | 403 GLOBAL (admin) or another trainer's.
 *
 * The scope check is what keeps Admin–Trainer isolation intact on every surface
 * that links problems into a Training: a GLOBAL collection is admin curriculum
 * and is refused even if a trainer somehow appears as its creator. This lives
 * here rather than in one route so the collection and problem routes cannot
 * drift into applying different rules.
 */
async function assertTrainerOwnsCollection(trainerId, collectionId) {
  if (!mongoose.Types.ObjectId.isValid(collectionId)) {
    const err = new Error('Invalid collection id');
    err.status = 400;
    throw err;
  }
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    const err = new Error('Collection not found');
    err.status = 404;
    throw err;
  }
  if (collection.scope !== 'BATCH') {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  if (!collection.createdBy || collection.createdBy.toString() !== trainerId.toString()) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  return collection;
}

module.exports = { assertTrainerOwnsBatch, assertTrainerOwnsProblem, assertTrainerOwnsCollection };
