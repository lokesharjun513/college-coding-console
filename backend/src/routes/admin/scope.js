// backend/src/routes/admin/scope.js
// Shared scope guard for Admin curriculum routes.
//
// Admin manages GLOBAL curriculum only. A Trainer-owned BATCH collection — and
// anything hanging off it — belongs to the trainer assigned to that batch, so
// admin routes refuse it rather than treating the ADMIN role as a superset.
//
// The test is `scope`, not "was it created by an admin": a GLOBAL collection is
// exactly the curriculum an admin may manage, and BATCH is exactly what they
// may not.
'use strict';

const Collection = require('../../models/Collection');
const Topic = require('../../models/Topic');

const denied = { status: 403, message: 'Access denied' };
const missing = { status: 404, message: 'Collection not found' };
const badId = { status: 400, message: 'Invalid collection id' };
const noTopic = { status: 404, message: 'Topic not found' };
const badTopicId = { status: 400, message: 'Invalid topic id' };

// Documents written before `scope` existed have no value for it. They are all
// admin curriculum, and Mongoose's default only applies to NEW documents, so
// they must be matched explicitly or GLOBAL curriculum would disappear from the
// admin workspace the moment this code deploys and before any migration runs.
const GLOBAL_MATCH = { scope: { $in: ['GLOBAL', null] } };

/** null when the collection is admin-manageable GLOBAL curriculum, otherwise a {status, message}. */
async function adminCollectionError(collectionId) {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(collectionId)) return badId;
  const collection = await Collection.findById(collectionId).lean();
  if (!collection) return missing;
  if (collection.scope && collection.scope !== 'GLOBAL') return denied;
  return null;
}

/**
 * Load a topic for an admin route and refuse it when its parent collection is
 * not GLOBAL. Returns { topic, error } so each route can answer with its own
 * response shape instead of relying on an err.status convention these handlers
 * do not implement.
 */
async function loadAdminTopic(topicId) {
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(topicId)) return { topic: null, error: badTopicId };
  const topic = await Topic.findById(topicId);
  if (!topic) return { topic: null, error: noTopic };
  const error = await adminCollectionError(topic.collection);
  if (error) return { topic: null, error };
  return { topic, error: null };
}

module.exports = { adminCollectionError, loadAdminTopic, GLOBAL_MATCH };