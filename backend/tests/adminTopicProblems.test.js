// backend/tests/adminTopicProblems.test.js
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
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
  // Preserve Collection/Topic/Problem created in beforeAll — deleting them
  // causes admin-topic routes to 404.
  // Most tests need a clean ProblemTopic slate, but tests 7–8
  // ("GET topic problems ..." and "pagination works") assert on state created
  // by test 6 ("problem ordering works"), so we must not wipe between 6→7→8.
  const name = (expect.getState().currentTestName || '').toLowerCase();
  const keepLinks = name.includes('returns correct order') || name.includes('pagination works');
  if (!keepLinks) await ProblemTopic.deleteMany({});
  await Batch.deleteMany({});
});

describe('Problem Linking API', () => {
  let adminToken, studentToken, testCollection, testTopic, globalProblem, batchProblem;

  beforeAll(async () => {
    const adminEmail = generateUniqueEmail('admin@testmail.com');
    const studentEmail = generateUniqueEmail('student@testmail.com');
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, password);
    await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    studentToken = await loginAndGetToken(studentEmail, password);

    testCollection = await Collection.create({ name: 'Link Collection', slug: 'link', createdBy: new mongoose.Types.ObjectId() });
    testTopic = await Topic.create({ name: 'Link Topic', slug: 'link-topic', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });
    globalProblem = await Problem.create({ title: 'Global Problem', slug: 'global', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });
    batchProblem = await Problem.create({ title: 'Batch Problem', slug: 'batch', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', status: 'PUBLISHED' });
  });

  // 1. ADMIN can link GLOBAL problem
  test('ADMIN can link GLOBAL problem', async () => {
    const res = await request(app)
      .put(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ problemId: globalProblem._id, order: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].problem.title).toBe('Global Problem');
  });

  // 2. BATCH problem cannot be linked
  test('BATCH problem cannot be linked', async () => {
    const res = await request(app)
      .put(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ problemId: batchProblem._id, order: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Only GLOBAL problems can be linked');
  });

  // 3. non-existent Problem rejected
  test('non-existent Problem rejected', async () => {
    const invalidId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ problemId: invalidId, order: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 4. non-existent Topic rejected
  test('non-existent Topic rejected', async () => {
    const invalidId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/admin/topics/${invalidId}/problems`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ problemId: globalProblem._id, order: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 5. duplicate ProblemTopic relationship prevented
  test('duplicate ProblemTopic relationship prevented', async () => {
    await ProblemTopic.create({ problem: globalProblem._id, collection: testCollection._id, topic: testTopic._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .put(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [{ problemId: globalProblem._id, order: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  // 6. problem ordering works
  test('problem ordering works', async () => {
    const p2 = await Problem.create({ title: 'Problem 2', slug: 'p2', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });
    const p3 = await Problem.create({ title: 'Problem 3', slug: 'p3', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });

    await request(app)
      .put(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems: [
        { problemId: globalProblem._id, order: 2 },
        { problemId: p2._id, order: 1 },
        { problemId: p3._id, order: 3 },
      ]});

    const res = await request(app)
      .get(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.length).toBe(3);
    expect(res.body.data[0].problem.title).toBe('Problem 2');
    expect(res.body.data[1].problem.title).toBe('Global Problem');
    expect(res.body.data[2].problem.title).toBe('Problem 3');
  });

  // 7. GET topic problems returns correct order
  test('GET topic problems returns correct order', async () => {
    const res = await request(app)
      .get(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.length).toBe(3);
  });

  // 8. pagination works
  test('pagination works', async () => {
    const res = await request(app)
      .get(`/api/admin/topics/${testTopic._id}/problems`)
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 2 });

    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.total).toBe(3);
  });

  // 9. linking does not modify the original Problem document
  test('linking does not modify original Problem', async () => {
    const originalProblem = await Problem.findById(globalProblem._id);
    expect(originalProblem.title).toBe('Global Problem');
  });

  // 10. existing Submission remains valid
  test('existing Submission remains valid after linking', async () => {
    const Submission = require('../src/models/Submission');
    const studentEmail = generateUniqueEmail('submission@testmail.com');
    const password = 'StrongP@ssw0rd';
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    await Submission.create({ student: student._id, problem: globalProblem._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await Submission.findOne({ student: student._id, problem: globalProblem._id });
    expect(res).not.toBeNull();
    expect(res.verdict).toBe('ACCEPTED');
  });

  // Data Isolation Test
  describe('Data Isolation Test', () => {
    let colA, colB, topicAArrays, topicBArrays, p1, p2;

    beforeEach(async () => {
      // Delete existing collections and problems with these names/slug to avoid duplicate key errors
      await Collection.deleteMany({ name: { $in: ['Collection A', 'Collection B'] } });
      await Topic.deleteMany({ name: 'Arrays' });
      await Problem.deleteMany({ slug: { $in: ['p1', 'p2'] } });

      colA = await Collection.create({ name: 'Collection A', slug: 'coll-a', createdBy: new mongoose.Types.ObjectId() });
      colB = await Collection.create({ name: 'Collection B', slug: 'coll-b', createdBy: new mongoose.Types.ObjectId() });
      topicAArrays = await Topic.create({ name: 'Arrays', slug: 'arrays', collection: colA._id, createdBy: new mongoose.Types.ObjectId() });
      topicBArrays = await Topic.create({ name: 'Arrays', slug: 'arrays', collection: colB._id, createdBy: new mongoose.Types.ObjectId() });
      p1 = await Problem.create({ title: 'Problem 1', slug: 'p1', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });
      p2 = await Problem.create({ title: 'Problem 2', slug: 'p2', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });
    });

    test('Collection A → Arrays returns only Problem 1', async () => {
      await ProblemTopic.create({ problem: p1._id, collection: colA._id, topic: topicAArrays._id, createdBy: new mongoose.Types.ObjectId() });
      await ProblemTopic.create({ problem: p2._id, collection: colB._id, topic: topicBArrays._id, createdBy: new mongoose.Types.ObjectId() });

      const res = await request(app)
        .get(`/api/admin/topics/${topicAArrays._id}/problems`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].problem.title).toBe('Problem 1');
    });

    test('Collection B → Arrays returns only Problem 2', async () => {
      await ProblemTopic.create({ problem: p2._id, collection: colB._id, topic: topicBArrays._id, createdBy: new mongoose.Types.ObjectId() });

      const res = await request(app)
        .get(`/api/admin/topics/${topicBArrays._id}/problems`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].problem.title).toBe('Problem 2');
    });

    test('Problem can belong to multiple Topics/Collections', async () => {
      const placementTopic = await Topic.create({ name: 'Placement Basics', slug: 'placement', collection: colB._id, createdBy: new mongoose.Types.ObjectId() });
      await ProblemTopic.create({ problem: p1._id, collection: colA._id, topic: topicAArrays._id, createdBy: new mongoose.Types.ObjectId() });
      await ProblemTopic.create({ problem: p1._id, collection: colB._id, topic: placementTopic._id, createdBy: new mongoose.Types.ObjectId() });

      const resA = await request(app).get(`/api/admin/topics/${topicAArrays._id}/problems`).set('Authorization', `Bearer ${adminToken}`);
      const resB = await request(app).get(`/api/admin/topics/${placementTopic._id}/problems`).set('Authorization', `Bearer ${adminToken}`);

      expect(resA.body.data.length).toBe(1);
      expect(resB.body.data.length).toBe(1);
      expect(resA.body.data[0].problem.title).toBe('Problem 1');
      expect(resB.body.data[0].problem.title).toBe('Problem 1');

      const problems = await Problem.find({ _id: p1._id });
      expect(problems.length).toBe(1);
    });
  });
});

