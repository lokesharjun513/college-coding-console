// backend/tests/studentCollections.test.js
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const Problem = require('../src/models/Problem');
const BatchStudent = require('../src/models/BatchStudent');
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
  await Topic.deleteMany({});
  await Collection.deleteMany({});
  await Problem.deleteMany({});
});

describe('Student Collections API', () => {
  let studentToken, unauthToken;

  beforeAll(async () => {
    const studentEmail = generateUniqueEmail('student@testmail.com');
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    studentToken = await loginAndGetToken(studentEmail, password);

    // Token for unauthorized request (no user)
    unauthToken = null;
  });

  // 1. authenticated STUDENT can list Collections
  test('authenticated STUDENT can list Collections', async () => {
    const col = await Collection.create({ name: 'Active Collection', slug: 'active', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get('/api/student/collections')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Active Collection');
  });

  // 2. unauthenticated request rejected
  test('unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/student/collections');
    expect(res.status).toBe(401);
  });

  // 4. active Collections are visible
  test('active Collections are visible', async () => {
    await Collection.create({ name: 'Active', slug: 'active', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get('/api/student/collections')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('ACTIVE');
  });

  // 5. archived Collections are hidden
  test('archived Collections are hidden', async () => {
    await Collection.create({ name: 'Archived', slug: 'archived', status: 'ARCHIVED', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get('/api/student/collections')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.body.data.length).toBe(0);
  });

  // 7. Student can retrieve Collection Topics
  test('Student can retrieve Collection Topics', async () => {
    const col = await Collection.create({ name: 'Topics Collection', slug: 'topics', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });
    await Topic.create({ name: 'Topic 1', slug: 'topic-1', collection: col._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/student/collections/${col._id}/topics`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  // 8. Student can retrieve Topic Problems
  test('Student can retrieve Topic Problems', async () => {
    const col = await Collection.create({ name: 'Problem Collection', slug: 'problem', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'Problem Topic', slug: 'problem-topic', collection: col._id, createdBy: new mongoose.Types.ObjectId() });
    const problem = await Problem.create({ title: 'Published Global', slug: 'pub-global', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });

    await ProblemTopic.create({ problem: problem._id, collection: col._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/student/topics/${topic._id}/problems`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Published Global');
  });

  // 9. only PUBLISHED GLOBAL Problems appear
  test('only PUBLISHED GLOBAL Problems appear', async () => {
    const col = await Collection.create({ name: 'Filter Collection', slug: 'filter', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'Filter Topic', slug: 'filter-topic', collection: col._id, createdBy: new mongoose.Types.ObjectId() });

    const published = await Problem.create({ title: 'Published Global', slug: 'pub-global', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });
    await ProblemTopic.create({ problem: published._id, collection: col._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    const archived = await Problem.create({ title: 'Archived', slug: 'archived', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'ARCHIVED' });
    await ProblemTopic.create({ problem: archived._id, collection: col._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    const batch = await Problem.create({ title: 'Batch Problem', slug: 'batch', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', status: 'PUBLISHED' });
    await ProblemTopic.create({ problem: batch._id, collection: col._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/student/topics/${topic._id}/problems`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Published Global');
  });

  // 10. BATCH Problems never appear in Global Practice
  test('BATCH Problems never appear', async () => {
    const col = await Collection.create({ name: 'No Batch', slug: 'no-batch', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });
    const topic = await Topic.create({ name: 'No Batch Topic', slug: 'nb-topic', collection: col._id, createdBy: new mongoose.Types.ObjectId() });
    const batch = await Problem.create({ title: 'Batch Only', slug: 'batch-only', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', status: 'PUBLISHED' });
    await ProblemTopic.create({ problem: batch._id, collection: col._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/student/topics/${topic._id}/problems`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.body.data.length).toBe(0);
  });

  // 12. existing GET /api/student/problems still works
  test('existing GET /api/student/problems still works', async () => {
    await Problem.create({ title: 'Existing Test', slug: 'existing', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });

    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  // Regression: compiler configuration must NOT affect visibility (GLOBAL/BATCH access rules)
  describe('visibility is compiler-independent', () => {
    let col, topic;
    beforeEach(async () => {
      col = await Collection.create({ name: 'Regression Collection', slug: 'regression', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });
      topic = await Topic.create({ name: 'Regression Topic', slug: 'regression-topic', collection: col._id, createdBy: new mongoose.Types.ObjectId() });
    });

    async function linkProblem(overrides = {}) {
      const unique = uniqueSuffix();
      const problem = await Problem.create({
        title: `Regression ${unique}`,
        slug: `regression-${unique}`,
        description: 'Test',
        difficulty: 'EASY',
        createdBy: new mongoose.Types.ObjectId(),
        scope: 'GLOBAL',
        status: 'PUBLISHED',
        ...overrides,
      });
      await ProblemTopic.create({ problem: problem._id, collection: col._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });
      return problem;
    }

    test('Published GLOBAL problem with valid compiler is visible', async () => {
      await linkProblem({ compiler: 'gcc-15' });
      const res = await request(app).get(`/api/student/topics/${topic._id}/problems`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.data.length).toBe(1);
    });

    test('Published GLOBAL problem without compiler is still visible', async () => {
      await linkProblem({ compiler: null });
      const res = await request(app).get(`/api/student/topics/${topic._id}/problems`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.data.length).toBe(1);
    });

    test('Published BATCH problem with matching enrollment is visible', async () => {
      const problem = await linkProblem({ scope: 'BATCH', batch: new mongoose.Types.ObjectId() });
      const student = await User.findOne({ role: 'STUDENT' });
      await BatchStudent.create({ batch: problem.batch, student: student._id, status: 'ACTIVE' });
      // Fresh token not needed; enrollment is read per-request
      const res = await request(app).get(`/api/student/topics/${topic._id}/problems`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.data.length).toBe(1);
    });

    test('Published BATCH problem with different batch enrollment is hidden', async () => {
      await linkProblem({ scope: 'BATCH', batch: new mongoose.Types.ObjectId() });
      const otherBatch = new mongoose.Types.ObjectId();
      const student = await User.findOne({ role: 'STUDENT' });
      await BatchStudent.create({ batch: otherBatch, student: student._id, status: 'ACTIVE' });
      const res = await request(app).get(`/api/student/topics/${topic._id}/problems`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.data.length).toBe(0);
    });

    test('DRAFT GLOBAL problem is hidden', async () => {
      await linkProblem({ status: 'DRAFT' });
      const res = await request(app).get(`/api/student/topics/${topic._id}/problems`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.data.length).toBe(0);
    });

    test('ARCHIVED GLOBAL problem is hidden', async () => {
      await linkProblem({ status: 'ARCHIVED' });
      const res = await request(app).get(`/api/student/topics/${topic._id}/problems`).set('Authorization', `Bearer ${studentToken}`);
      expect(res.body.data.length).toBe(0);
    });
  });
});
