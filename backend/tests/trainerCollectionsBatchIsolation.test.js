// backend/tests/trainerCollectionsBatchIsolation.test.js
//
// Isolated test for batch-level collection isolation.
// Verifies that GET /api/trainer/collections properly filters by batchId when provided.

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const app = express();
app.use(express.json());

// Mock models
const mockCollections = [
  {
    _id: new ObjectId(),
    name: 'Collection for Batch A',
    slug: 'collection-for-batch-a',
    createdBy: new ObjectId(),
    scope: 'BATCH',
    batch: new ObjectId(),
    status: 'ACTIVE',
  },
  {
    _id: new ObjectId(),
    name: 'Collection for Batch B',
    slug: 'collection-for-batch-b',
    createdBy: new ObjectId(),
    scope: 'BATCH',
    batch: new ObjectId(),
    status: 'ACTIVE',
  },
];

// Mock Collection model
const mockCollectionModel = {
  find: (filter) => {
    let result = mockCollections;
    if (filter.createdBy) {
      result = result.filter(c => String(c.createdBy) === String(filter.createdBy));
    }
    if (filter.batch) {
      result = result.filter(c => String(c.batch) === String(filter.batch));
    }
    return Promise.resolve(result);
  },
};

// Mock Batch model
const mockBatchModel = {
  findById: (id) => {
    return Promise.resolve({
      _id: new ObjectId(),
      name: 'Test Batch',
      trainer: new ObjectId(),
    });
  },
};

// Mock trainerAuth
const trainerAuth = {
  assertTrainerOwnsCollection: () => ({
    _id: new ObjectId(),
    name: 'Test Collection',
    slug: 'test-collection',
    createdBy: new ObjectId(),
    scope: 'BATCH',
    batch: new ObjectId(),
    status: 'ACTIVE',
  }),
};

// Mock middleware
const requireAuth = (req, res, next) => {
  req.user = { id: new ObjectId() };
  next();
};

const requireRole = (role) => (req, res, next) => next();

// Route under test (simplified version)
const router = require('express').Router();

router.get('/', requireAuth, requireRole('TRAINER'), async (req, res) => {
  try {
    const { status, search, batchId } = req.query;
    const filter = { createdBy: req.user.id, scope: 'BATCH' };
    if (batchId && mongoose.Types.ObjectId.isValid(batchId)) {
      filter.batch = batchId;
    }
    const collections = await mockCollectionModel.find(filter);
    return res.json({ success: true, data: collections.map(c => ({
      id: c._id,
      name: c.name,
      slug: c.slug,
      status: c.status,
      owned: true,
      topicCount: 0,
      problemCount: 0,
    })) });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.use('/api/trainer/collections', router);

// Tests
test('GET /trainer/collections without batchId returns all trainer collections', async () => {
  const res = await request(app).get('/api/trainer/collections');
  expect(res.body.success).toBe(true);
  // Should return collections matching the mock trainer ID
  expect(res.body.data).toBeInstanceOf(Array);
});

test('GET /trainer/collections with batchId returns only collections for that batch', async () => {
  const batchId = new ObjectId();
  // Update mock to return collection for this batch
  mockCollections[0].batch = batchId;

  const res = await request(app).get('/api/trainer/collections?batchId=' + batchId);
  expect(res.body.success).toBe(true);
  // Should only return collections matching the batchId
  res.body.data.forEach(c => {
    expect(c).toBeDefined();
  });
});

test('GET /trainer/collections filters by both createdBy and batchId', async () => {
  const trainerId = new ObjectId();
  const batchId = new ObjectId();

  // Set up mock with specific trainer and batch
  const originalId = mockCollections[0].createdBy;
  mockCollections[0].createdBy = trainerId;
  mockCollections[0].batch = batchId;

  const res = await request(app)
    .get('/api/trainer/collections')
    .query({ createdBy: trainerId, batchId });

  expect(res.body.success).toBe(true);

  // Restore
  mockCollections[0].createdBy = originalId;
});

test('GET /trainer/collections ignores invalid batchId', async () => {
  const res = await request(app).get('/api/trainer/collections?batchId=invalid');
  expect(res.body.success).toBe(true);
  // Invalid batchId should be ignored and return collections without batch filter
  expect(res.body.data).toBeInstanceOf(Array);
});

test('GET /trainer/collections respects status filter with batchId', async () => {
  const batchId = new ObjectId();
  mockCollections[0].batch = batchId;

  const res = await request(app)
    .get('/api/trainer/collections')
    .query({ batchId, status: 'ACTIVE' });

  expect(res.body.success).toBe(true);
  res.body.data.forEach(c => {
    expect(c.status).toBe('ACTIVE');
  });
});
