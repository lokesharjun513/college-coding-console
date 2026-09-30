// backend/tests/adminImportProblems.test.js
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const Problem = require('../src/models/Problem');
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

describe('JSON Import Tests', () => {
  let adminToken;

  beforeAll(async () => {
    const adminEmail = generateUniqueEmail('admin@testmail.com');
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, password);
  });

  // 1. Old flat JSON format still works
  test('Old flat JSON format still works', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          title: 'Flat Import Test',
          description: 'Old format',
          difficulty: 'EASY',
          scope: 'GLOBAL',
          status: 'PUBLISHED',
        }]
      });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(1);
    const problem = await Problem.findOne({ title: 'Flat Import Test' });
    expect(problem).not.toBeNull();
    expect(problem.scope).toBe('GLOBAL');
  });

  // 2. New collection/topic/problem format works
  test('New collection/topic/problem format works', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'New Format Collection',
          topic: 'Arrays',
          problem: {
            title: 'New Format Problem',
            description: 'New format test',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
          }
        }]
      });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(1);
    const collection = await Collection.findOne({ slug: 'new-format-collection' });
    expect(collection).not.toBeNull();
    const topic = await Topic.findOne({ collection: collection._id, slug: 'arrays' });
    expect(topic).not.toBeNull();
    const problem = await Problem.findOne({ title: 'New Format Problem' });
    expect(problem).not.toBeNull();
    const link = await ProblemTopic.findOne({ problem: problem._id, collection: collection._id, topic: topic._id });
    expect(link).not.toBeNull();
  });

  // 3. Multiple Collections in one import
  test('Multiple Collections in one import', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [
          {
            collection: 'Collection 1',
            topic: 'Topic 1',
            problem: { title: 'P1', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
          },
          {
            collection: 'Collection 2',
            topic: 'Topic 2',
            problem: { title: 'P2', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
          },
        ]
      });

    expect(res.body.success).toBe(true);
    const collections = await Collection.find();
    expect(collections.length).toBe(2);
  });

  // 4. Multiple Topics in one Collection
  test('Multiple Topics in one Collection', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [
          {
            collection: 'Multi Topic',
            topic: 'Arrays',
            problem: { title: 'Array Problem', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
          },
          {
            collection: 'Multi Topic',
            topic: 'Strings',
            problem: { title: 'String Problem', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
          },
        ]
      });

    expect(res.body.success).toBe(true);
    const topicCount = await Topic.find({ collection: { $in: (await Collection.find({ slug: 'multi-topic' })).map(c => c._id) } });
    expect(topicCount.length).toBe(2);
  });

  // 6. Missing Collection automatically creates it
  test('Missing Collection automatically creates it', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Auto Create',
          topic: 'Auto Topic',
          problem: { title: 'Auto', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
        }]
      });

    expect(res.body.success).toBe(true);
    const collection = await Collection.findOne({ slug: 'auto-create' });
    expect(collection).not.toBeNull();
  });

  // 7. Missing Topic automatically creates it
  test('Missing Topic automatically creates it', async () => {
    const collection = await Collection.create({ name: 'Existing Collection', slug: 'existing', createdBy: new mongoose.Types.ObjectId() });
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Existing Collection',
          topic: 'New Topic',
          problem: { title: 'Auto Topic', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
        }]
      });

    expect(res.body.success).toBe(true);
    const topic = await Topic.findOne({ collection: collection._id, slug: 'new-topic' });
    expect(topic).not.toBeNull();
  });

  // 8. Existing Collection is reused
  test('Existing Collection is reused', async () => {
    await Collection.create({ name: 'Reuse Collection', slug: 'reuse', createdBy: new mongoose.Types.ObjectId() });
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Reuse Collection',
          topic: 'Topic A',
          problem: { title: 'P1', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
        }, {
          collection: 'Reuse Collection',
          topic: 'Topic B',
          problem: { title: 'P2', description: 'd', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
        }]
      });

    expect(res.body.success).toBe(true);
    const collections = await Collection.find({ slug: 'reuse' });
    expect(collections.length).toBe(1);
  });

  // 10. Duplicate problem is rejected
  test('Duplicate problem is rejected', async () => {
    await Problem.create({ title: 'Duplicate Title', slug: 'duplicate-title', description: 'Existing', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Dup Collection',
          topic: 'Dup Topic',
          problem: { title: 'Duplicate Title', description: 'New', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' }
        }]
      });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.summary.created).toBe(0);
  });

  // 12. 100 problems succeeds
  test('100 problems succeeds', async () => {
    const problems = Array.from({ length: 100 }, (_, i) => ({
      title: `Problem ${i}`,
      description: 'Test',
      difficulty: 'EASY',
      scope: 'GLOBAL',
      status: 'PUBLISHED',
    }));

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(100);
  });

  // 13. 101 problems fails
  test('101 problems fails', async () => {
    const problems = Array.from({ length: 101 }, (_, i) => ({
      title: `Problem ${i}`,
      description: 'Test',
      difficulty: 'EASY',
    }));

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Maximum 100 problems');
  });

  // 14. malformed JSON rejected
  test('malformed JSON rejected', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: 'not an array' });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Expected an array');
  });

  // 15. missing title rejected
  test('missing title rejected', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ description: 'Test', difficulty: 'EASY' }] });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.failed).toBe(1);
  });

  // 16. missing description rejected
  test('missing description rejected', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ title: 'Test', difficulty: 'EASY' }] });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.failed).toBe(1);
  });

  // 17. invalid difficulty rejected
  test('invalid difficulty rejected', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ title: 'Test', description: 'd', difficulty: 'BEGINNER' }] });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.failed).toBe(1);
  });

  // 18. invalid language rejected
  test('invalid language rejected', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ title: 'Test', description: 'd', difficulty: 'EASY', allowedLanguages: ['rust'] }] });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.failed).toBe(1);
  });

  // 19. batch-scoped problem cannot enter Global Collection
  test('batch-scoped problem cannot enter Global Collection', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Global Collection',
          topic: 'Global Topic',
          problem: { title: 'Batch In Global', description: 'd', difficulty: 'EASY', scope: 'BATCH', status: 'PUBLISHED' }
        }]
      });

    expect(res.body.success).toBe(true);
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.summary.created).toBe(0);
  });

  // 20. row-level errors are returned
  test('row-level errors are returned', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [
        { title: 'Valid', description: 'd', difficulty: 'EASY' },
        { title: 'Invalid' },
      ]});

    expect(res.body.success).toBe(true);
    expect(res.body.errors.length).toBe(1);
    expect(res.body.errors[0].row).toBe(2);
  });
});

describe('Realistic 5-Problem Import Test', () => {
  let adminToken;

  beforeAll(async () => {
    const adminEmail = generateUniqueEmail('admin@testmail.com');
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, password);
  });

  afterAll(async () => {
    await ProblemTopic.deleteMany({});
    await Topic.deleteMany({});
    await Collection.deleteMany({});
    await Problem.deleteMany({});
  });

  test('Realistic 5-problem import creates correct structure', async () => {
    const payload = {
      problems: [
        {
          collection: 'Top 50 Placement Questions',
          topic: 'Arrays',
          problem: {
            title: 'Two Sum',
            description: 'Find two numbers whose sum equals the target.',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
          }
        },
        {
          collection: 'Top 50 Placement Questions',
          topic: 'Arrays',
          problem: {
            title: 'Find Largest Element',
            description: 'Find the largest element in an array.',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
          }
        },
        {
          collection: 'Top 50 Placement Questions',
          topic: 'Strings',
          problem: {
            title: 'Reverse String',
            description: 'Reverse a given string.',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
          }
        },
        {
          collection: 'Infosys Placement Questions',
          topic: 'Arrays',
          problem: {
            title: 'Second Largest Element',
            description: 'Find second largest element in an array.',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
          }
        },
        {
          collection: 'Infosys Placement Questions',
          topic: 'Strings',
          problem: {
            title: 'Palindrome String',
            description: 'Check if a string is a palindrome.',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
          }
        },
      ]
    };

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(5);

    // Verify Collections
    const top50 = await Collection.findOne({ slug: 'top-50-placement-questions' });
    expect(top50).not.toBeNull();

    const infosys = await Collection.findOne({ slug: 'infosys-placement-questions' });
    expect(infosys).not.toBeNull();

    // Verify Topics
    const top50Arrays = await Topic.findOne({ collection: top50._id, slug: 'arrays' });
    expect(top50Arrays).not.toBeNull();

    const top50Strings = await Topic.findOne({ collection: top50._id, slug: 'strings' });
    expect(top50Strings).not.toBeNull();

    const infosysArrays = await Topic.findOne({ collection: infosys._id, slug: 'arrays' });
    expect(infosysArrays).not.toBeNull();

    const infosysStrings = await Topic.findOne({ collection: infosys._id, slug: 'strings' });
    expect(infosysStrings).not.toBeNull();

    // Verify Problem counts
    const top50ArraysProblems = await ProblemTopic.find({ topic: top50Arrays._id });
    expect(top50ArraysProblems.length).toBe(2);

    const infosysArraysProblems = await ProblemTopic.find({ topic: infosysArrays._id });
    expect(infosysArraysProblems.length).toBe(1);

    const top50StringsProblems = await ProblemTopic.find({ topic: top50Strings._id });
    expect(top50StringsProblems.length).toBe(1);

    const infosysStringsProblems = await ProblemTopic.find({ topic: infosysStrings._id });
    expect(infosysStringsProblems.length).toBe(1);
  });
});
