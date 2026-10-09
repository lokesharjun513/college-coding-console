const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const Problem = require('../src/models/Problem');
const ProblemTopic = require('../src/models/ProblemTopic');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');

async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

function generateUniqueEmail(base) {
  const suffix = uniqueSuffix();
  return `${base.replace('@', `${suffix}@`)}`;
}

beforeEach(async () => {
  await ProblemTopic.deleteMany({});
  await Problem.deleteMany({});
  await Topic.deleteMany({});
  await Collection.deleteMany({});
});

describe('Hierarchical Curriculum Lifecycle (Collection -> Topic -> Problem)', () => {
  let adminToken;

  beforeAll(async () => {
    const adminEmail = generateUniqueEmail('admin@testmail.com');
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, password);
  });

  test('1. Collection cascade archive cascades to Topics and linked Problems', async () => {
    const collection = await Collection.create({ name: 'Coll 1', slug: 'coll-1', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'Topic 1', slug: 'top-1', collection: collection._id, createdBy: new mongoose.Types.ObjectId() });
    const problem = await Problem.create({ title: 'Prob 1', slug: 'prob-1', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });

    await ProblemTopic.create({ problem: problem._id, collection: collection._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    // Archive collection
    const res = await request(app)
      .patch(`/api/admin/collections/${collection._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ARCHIVED' });

    expect(res.status).toBe(200);

    const updatedColl = await Collection.findById(collection._id);
    const updatedTopic = await Topic.findById(topic._id);
    const updatedProblem = await Problem.findById(problem._id);

    expect(updatedColl.status).toBe('ARCHIVED');
    expect(updatedTopic.status).toBe('ARCHIVED');
    expect(updatedProblem.status).toBe('ARCHIVED');
  });

  test('2. Collection cascade unarchive restores Collection, Topics, and Problems', async () => {
    const collection = await Collection.create({ name: 'Coll 2', slug: 'coll-2', status: 'ARCHIVED', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'Topic 2', slug: 'top-2', collection: collection._id, status: 'ARCHIVED', createdBy: new mongoose.Types.ObjectId() });
    const problem = await Problem.create({ title: 'Prob 2', slug: 'prob-2', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'ARCHIVED', archivedFrom: 'PUBLISHED' });

    await ProblemTopic.create({ problem: problem._id, collection: collection._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    // Unarchive collection with cascade: true
    const res = await request(app)
      .patch(`/api/admin/collections/${collection._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE', cascade: true });

    expect(res.status).toBe(200);

    const updatedColl = await Collection.findById(collection._id);
    const updatedTopic = await Topic.findById(topic._id);
    const updatedProblem = await Problem.findById(problem._id);

    expect(updatedColl.status).toBe('ACTIVE');
    expect(updatedTopic.status).toBe('ACTIVE');
    expect(updatedProblem.status).toBe('PUBLISHED');
  });

  test('3. Topic cascade archive cascades to linked Problems', async () => {
    const collection = await Collection.create({ name: 'Coll 3', slug: 'coll-3', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'Topic 3', slug: 'top-3', collection: collection._id, createdBy: new mongoose.Types.ObjectId() });
    const problem = await Problem.create({ title: 'Prob 3', slug: 'prob-3', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });

    await ProblemTopic.create({ problem: problem._id, collection: collection._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    // Archive topic
    const res = await request(app)
      .patch(`/api/admin/topics/${topic._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ARCHIVED' });

    expect(res.status).toBe(200);

    const updatedTopic = await Topic.findById(topic._id);
    const updatedProblem = await Problem.findById(problem._id);

    expect(updatedTopic.status).toBe('ARCHIVED');
    expect(updatedProblem.status).toBe('ARCHIVED');
  });

  test('4. Topic cascade unarchive restores linked Problems', async () => {
    const collection = await Collection.create({ name: 'Coll 4', slug: 'coll-4', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'Topic 4', slug: 'top-4', collection: collection._id, status: 'ARCHIVED', createdBy: new mongoose.Types.ObjectId() });
    const problem = await Problem.create({ title: 'Prob 4', slug: 'prob-4', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'ARCHIVED', archivedFrom: 'PUBLISHED' });

    await ProblemTopic.create({ problem: problem._id, collection: collection._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    // Unarchive topic with cascade: true
    const res = await request(app)
      .patch(`/api/admin/topics/${topic._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE', cascade: true });

    expect(res.status).toBe(200);

    const updatedTopic = await Topic.findById(topic._id);
    const updatedProblem = await Problem.findById(problem._id);

    expect(updatedTopic.status).toBe('ACTIVE');
    expect(updatedProblem.status).toBe('PUBLISHED');
  });

  test('5. Topic archive sets correct archivedFrom values for Problems', async () => {
    const collection = await Collection.create({ name: 'Coll 5', slug: 'coll-5', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'Topic 5', slug: 'top-5', collection: collection._id, createdBy: new mongoose.Types.ObjectId() });

    // Create problems with different initial statuses
    const draftProblem = await Problem.create({
      title: 'Draft Prob',
      slug: 'draft-prob',
      description: 'Test',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'GLOBAL',
      status: 'DRAFT'
    });

    const publishedProblem = await Problem.create({
      title: 'Published Prob',
      slug: 'published-prob',
      description: 'Test',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'GLOBAL',
      status: 'PUBLISHED'
    });

    const alreadyArchivedProblem = await Problem.create({
      title: 'Already Archived Prob',
      slug: 'already-archived-prob',
      description: 'Test',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'GLOBAL',
      status: 'ARCHIVED',
      archivedFrom: 'PUBLISHED' // Already has archivedFrom set
    });

    // Link problems to topic
    await ProblemTopic.create({
      problem: draftProblem._id,
      collection: collection._id,
      topic: topic._id,
      createdBy: new mongoose.Types.ObjectId()
    });

    await ProblemTopic.create({
      problem: publishedProblem._id,
      collection: collection._id,
      topic: topic._id,
      createdBy: new mongoose.Types.ObjectId()
    });

    await ProblemTopic.create({
      problem: alreadyArchivedProblem._id,
      collection: collection._id,
      topic: topic._id,
      createdBy: new mongoose.Types.ObjectId()
    });

    // Archive topic
    const res = await request(app)
      .patch(`/api/admin/topics/${topic._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ARCHIVED' });

    expect(res.status).toBe(200);

    const updatedTopic = await Topic.findById(topic._id);
    const updatedDraftProblem = await Problem.findById(draftProblem._id);
    const updatedPublishedProblem = await Problem.findById(publishedProblem._id);
    const updatedAlreadyArchivedProblem = await Problem.findById(alreadyArchivedProblem._id);

    // Verify topic is archived
    expect(updatedTopic.status).toBe('ARCHIVED');

    // Verify all problems are archived
    expect(updatedDraftProblem.status).toBe('ARCHIVED');
    expect(updatedPublishedProblem.status).toBe('ARCHIVED');
    expect(updatedAlreadyArchivedProblem.status).toBe('ARCHIVED');

    // Verify archivedFrom is set correctly
    expect(updatedDraftProblem.archivedFrom).toBe('DRAFT');
    expect(updatedPublishedProblem.archivedFrom).toBe('PUBLISHED');

    // Verify already archived problem's archivedFrom is unchanged
    expect(updatedAlreadyArchivedProblem.archivedFrom).toBe('PUBLISHED');
  });
});
