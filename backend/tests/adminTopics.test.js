// backend/tests/adminTopics.test.js
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
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

async function createAdmin() {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const password = 'StrongP@ssw0rd';
  await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
  const adminToken = await loginAndGetToken(adminEmail, password);
  return { adminToken };
}

async function createStudent() {
  const studentEmail = generateUniqueEmail('student@testmail.com');
  const password = 'StrongP@ssw0rd';
  await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
  const token = await loginAndGetToken(studentEmail, password);
  return { studentToken: token };
}

beforeEach(async () => {
  await Topic.deleteMany({});
});

describe('Admin Topics API', () => {
  let adminToken, studentToken, testCollection;

  beforeAll(async () => {
    const admin = await createAdmin();
    adminToken = admin.adminToken;
    const student = await createStudent();
    studentToken = student.studentToken;
    testCollection = await Collection.create({ name: 'Test Collection', slug: 'test-collection', createdBy: new mongoose.Types.ObjectId() });
  });

  // 1. ADMIN can create Topic
  test('ADMIN can create Topic', async () => {
    const res = await request(app)
      .post(`/api/admin/collections/${testCollection._id}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Arrays', description: 'Array problems' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Arrays');
    expect(res.body.data.slug).toBe('arrays');
    expect(res.body.data.collection.toString()).toBe(testCollection._id.toString());
  });

  // 2. non-ADMIN cannot create Topic
  test('non-ADMIN cannot create Topic', async () => {
    const res = await request(app)
      .post(`/api/admin/collections/${testCollection._id}/topics`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Test Topic' });

    expect([401, 403].includes(res.status)).toBe(true);
  });

  // 3. Topic must belong to existing Collection
  test('Topic must belong to existing Collection', async () => {
    const invalidCollectionId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/collections/${invalidCollectionId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Topic' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 4. duplicate Topic inside same Collection is rejected
  test('duplicate Topic inside same Collection is rejected', async () => {
    await Topic.create({ name: 'Arrays', slug: 'arrays', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .post(`/api/admin/collections/${testCollection._id}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Arrays' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  // 5. same Topic name in different Collections is allowed
  test('same Topic name in different Collections is allowed', async () => {
    const collection2 = await Collection.create({ name: 'Collection 2', slug: 'collection-2', createdBy: new mongoose.Types.ObjectId() });
    await Topic.create({ name: 'Arrays', slug: 'arrays', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .post(`/api/admin/collections/${collection2._id}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Arrays' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Arrays');
  });

  // 6. ADMIN can list Topics
  test('ADMIN can list Topics', async () => {
    await Topic.create({ name: 'Topic 1', slug: 'topic-1', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });
    await Topic.create({ name: 'Topic 2', slug: 'topic-2', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/admin/collections/${testCollection._id}/topics`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  // 7. problem counts are correct
  test('problem counts are correct', async () => {
    const topic = await Topic.create({ name: 'Topic With Problems', slug: 'topic-problems', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/admin/collections/${testCollection._id}/topics`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data[0].problemCount).toBeDefined();
    expect(res.body.data[0].problemCount).toBe(0);
  });

  // 8. ADMIN can get Topic
  test('ADMIN can get Topic', async () => {
    const topic = await Topic.create({ name: 'Get Topic', slug: 'get-topic', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/admin/topics/${topic._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Get Topic');
  });

  // 9. ADMIN can update Topic
  test('ADMIN can update Topic', async () => {
    const topic = await Topic.create({ name: 'Original', slug: 'original', description: 'Old description', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .patch(`/api/admin/topics/${topic._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated', description: 'New description' });

    expect(res.body.data.name).toBe('Updated');
    expect(res.body.data.description).toBe('New description');
    expect(res.body.data.slug).toBe('updated');
  });

  // 10. ADMIN can delete/soft-delete Topic
  test('ADMIN can soft-delete Topic', async () => {
    const topic = await Topic.create({ name: 'Soft Delete', slug: 'soft-delete', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .delete(`/api/admin/topics/${topic._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.success).toBe(true);
    const deleted = await Topic.findById(topic._id);
    expect(deleted.status).toBe('ARCHIVED');
  });

  // 11. deleting Topic removes ProblemTopic links
  test('deleting Topic removes ProblemTopic links', async () => {
    const ProblemTopic = require('../src/models/ProblemTopic');
    const Problem = require('../src/models/Problem');

    const topic = await Topic.create({ name: 'With Links', slug: 'with-links', collection: testCollection._id, createdBy: new mongoose.Types.ObjectId() });
    const problem = await Problem.create({ title: 'Link Test', slug: 'link-test', description: 'Test', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });

    await ProblemTopic.create({ problem: problem._id, collection: testCollection._id, topic: topic._id, createdBy: new mongoose.Types.ObjectId() });

    await request(app)
      .delete(`/api/admin/topics/${topic._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const links = await ProblemTopic.find({ topic: topic._id });
    expect(links.length).toBe(0);
    const originalProblem = await Problem.findById(problem._id);
    expect(originalProblem).not.toBeNull();
  });

  // 12. unauthorized requests are rejected
  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get(`/api/admin/collections/${testCollection._id}/topics`);
    expect(res.status).toBe(401);
  });
});
