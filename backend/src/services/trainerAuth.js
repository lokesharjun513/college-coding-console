// Shared trainer->batch ownership guard.
// Conventions follow the existing trainer routes:
//   404 unknown batch, 403 batch assigned to another trainer.

const mongoose = require('mongoose');
const Batch = require('../models/Batch');

/**
 * Assert the batch exists and is assigned to the trainer.
 * Returns the batch or throws an error with .status for the route's error handler.
 */
async function assertTrainerOwnsBatch(trainerId, batchId) {
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    const err = new Error('Invalid batch id');
    err.status = 400;
    throw err;
  }
  const batch = await Batch.findById(batchId);
  if (!batch) {
    const err = new Error('Batch not found');
    err.status = 404;
    throw err;
  }
  if (batch.trainer && batch.trainer.toString() !== trainerId.toString()) {
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

module.exports = { assertTrainerOwnsBatch, assertTrainerOwnsProblem };
