
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
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

describe('Idempotent Import Tests', () => {
  let adminToken;

  beforeAll(async () => {
    const adminEmail = generateUniqueEmail('admin-idempotent@testmail.com');
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, password);
  });

  afterEach(async () => {
    await ProblemTopic.deleteMany({});
    await TestCase.deleteMany({});
    await Problem.deleteMany({});
    await Topic.deleteMany({});
    await Collection.deleteMany({});
  });

  // Test 1: First import creates everything
  test('First import creates Problems, Collections, Topics, ProblemTopic links, TestCases', async () => {
    const payload = {
      problems: [{
        collection: 'Test Collection',
        topic: 'Test Topic',
        problem: {
          title: 'Test Problem',
          description: 'Test description',
          difficulty: 'EASY',
          scope: 'GLOBAL',
          status: 'PUBLISHED',
          testCases: [
            { input: '1 2', expectedOutput: '3', isHidden: false, order: 0 }
          ]
        }
      }]
    };

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(1);
    expect(res.body.summary.failed).toBe(0);

    const problem = await Problem.findOne({ title: 'Test Problem' });
    expect(problem).not.toBeNull();
    expect(problem.scope).toBe('GLOBAL');

    const collection = await Collection.findOne({ slug: 'test-collection' });
    expect(collection).not.toBeNull();

    const topic = await Topic.findOne({ collection: collection._id, slug: 'test-topic' });
    expect(topic).not.toBeNull();

    const link = await ProblemTopic.findOne({ problem: problem._id, topic: topic._id });
    expect(link).not.toBeNull();

    const testCases = await TestCase.find({ problem: problem._id });
    expect(testCases.length).toBe(1);
  });

  // Test 2: Second import (same data) reuses everything - no duplicates
  test('Second import reuses existing items - no duplicates', async () => {
    const payload = {
      problems: [{
        collection: 'Idempotent Collection',
        topic: 'Idempotent Topic',
        problem: {
          title: 'Idempotent Problem',
          description: 'Test idempotency',
          difficulty: 'EASY',
          scope: 'GLOBAL',
          status: 'PUBLISHED',
          testCases: [
            { input: '1 2', expectedOutput: '3', isHidden: false, order: 0 }
          ]
        }
      }]
    };

    // First import
    const res1 = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(res1.body.success).toBe(true);
    expect(res1.body.summary.created).toBe(1);

    const problem = await Problem.findOne({ title: 'Idempotent Problem' });
    const initialProblemCount = await Problem.countDocuments({ title: 'Idempotent Problem' });
    const initialTestCaseCount = await TestCase.countDocuments({ problem: problem._id });

    // Second import
    const res2 = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res2.body.success).toBe(true);
    expect(res2.body.summary.created).toBe(0); // No new problems created
    expect(res2.body.summary.failed).toBe(0);

    // Verify no duplicates
    const finalProblemCount = await Problem.countDocuments({ title: 'Idempotent Problem' });
    const finalTestCaseCount = await TestCase.countDocuments({ problem: problem._id });
    expect(finalProblemCount).toBe(initialProblemCount);
    expect(finalTestCaseCount).toBe(initialTestCaseCount);
  });

  // Test 3: Existing Problem remains unchanged when re-imported
  test('Existing Problem remains unchanged when re-imported', async () => {
    const payload = {
      problems: [{
        collection: 'Keep Collection',
        topic: 'Keep Topic',
        problem: {
          title: 'Keep Problem',
          description: 'Original description',
          difficulty: 'EASY',
          scope: 'GLOBAL',
          status: 'PUBLISHED',
        }
      }]
    };

    // First import
    const res1 = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(res1.body.success).toBe(true);

    const problem = await Problem.findOne({ title: 'Keep Problem' });
    expect(problem.description).toBe('Original description');

    // Second import with different description
    const res2 = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Keep Collection',
          topic: 'Keep Topic',
          problem: {
            title: 'Keep Problem',
            description: 'Different description',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
          }
        }]
      });
    expect(res2.body.success).toBe(true);
    expect(res2.body.summary.created).toBe(0);

    // Problem description should remain unchanged
    const updatedProblem = await Problem.findOne({ title: 'Keep Problem' });
    expect(updatedProblem.description).toBe('Original description');
  });

  // Test 4: Partial import - one invalid item still reports its actual problem/slug
  test('Partial import - invalid item reports actual problem name', async () => {
    const payload = {
      problems: [
        { title: 'Valid Problem', description: 'Test', difficulty: 'EASY' },
        { title: 'Invalid Problem' }, // Missing description and difficulty
      ]
    };

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(1);
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(2);
    expect(res.body.errors[0].field).toBe('title');
  });
});
