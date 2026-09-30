// backend/tests/adminCollections.test.js
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
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
  await Collection.deleteMany({});
});

describe('Admin Collections API', () => {
  let adminToken, studentToken;

  beforeAll(async () => {
    const admin = await createAdmin();
    adminToken = admin.adminToken;
    const student = await createStudent();
    studentToken = student.studentToken;
  });

  // 1. ADMIN can create Collection
  test('ADMIN can create Collection', async () => {
    const res = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Top 50 Placement Questions', description: 'Most asked questions' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Top 50 Placement Questions');
    expect(res.body.data.slug).toBe('top-50-placement-questions');
  });

  // 2. non-ADMIN cannot create Collection
  test('non-ADMIN cannot create Collection', async () => {
    const res = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Test Collection' });

    expect([401, 403].includes(res.status)).toBe(true);
  });

  // 3. duplicate Collection is rejected
  test('duplicate Collection is rejected', async () => {
    await Collection.create({ name: 'Duplicate Collection', slug: 'duplicate-collection', createdBy: new mongoose.Types.ObjectId() });
    const res = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate Collection' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  // 4. ADMIN can list Collections
  test('ADMIN can list Collections', async () => {
    await Collection.create({ name: 'List Test 1', slug: 'list-test-1', createdBy: new mongoose.Types.ObjectId() });
    await Collection.create({ name: 'List Test 2', slug: 'list-test-2', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get('/api/admin/collections')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  // 5. pagination works
  test('pagination works', async () => {
    for (let i = 0; i < 5; i++) {
      await Collection.create({ name: `Paginated ${i}`, slug: `paginated-${i}`, createdBy: new mongoose.Types.ObjectId() });
    }

    const res = await request(app)
      .get('/api/admin/collections')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 3 });

    expect(res.body.data.length).toBe(3);
    expect(res.body.meta.total).toBe(5);
  });

  // 6. search works
  test('search works', async () => {
    await Collection.create({ name: 'Search Test Alpha', slug: 'search-test-alpha', createdBy: new mongoose.Types.ObjectId() });
    await Collection.create({ name: 'Search Test Beta', slug: 'search-test-beta', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get('/api/admin/collections')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ search: 'Alpha' });

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Search Test Alpha');
  });

  // 7. status filter works
  test('status filter works', async () => {
    await Collection.create({ name: 'Active Collection', slug: 'active', status: 'ACTIVE', createdBy: new mongoose.Types.ObjectId() });
    await Collection.create({ name: 'Archived Collection', slug: 'archived', status: 'ARCHIVED', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get('/api/admin/collections')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'ACTIVE' });

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('ACTIVE');
  });

  // 8. ADMIN can get Collection detail
  test('ADMIN can get Collection detail', async () => {
    const col = await Collection.create({ name: 'Detail Collection', slug: 'detail', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/admin/collections/${col._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Detail Collection');
  });

  // 9. Collection detail returns Topics and counts
  test('Collection detail returns topic and problem counts', async () => {
    const col = await Collection.create({ name: 'Count Collection', slug: 'count', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .get(`/api/admin/collections/${col._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.topicCount).toBeDefined();
    expect(res.body.data.problemCount).toBeDefined();
  });

  // 11. ADMIN can update Collection
  test('ADMIN can update Collection', async () => {
    const col = await Collection.create({ name: 'Original Name', slug: 'original', description: 'Old description', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .patch(`/api/admin/collections/${col._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name', description: 'New description' });

    expect(res.body.data.name).toBe('Updated Name');
    expect(res.body.data.description).toBe('New description');
    expect(res.body.data.slug).toBe('updated-name');
  });

  // 12. ADMIN can soft-delete Collection
  test('ADMIN can soft-delete Collection', async () => {
    const col = await Collection.create({ name: 'Soft Delete Test', slug: 'soft-delete', createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .delete(`/api/admin/collections/${col._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.success).toBe(true);
    const deleted = await Collection.findById(col._id);
    expect(deleted.status).toBe('ARCHIVED');
  });

  // 13. Collection with active Topics cannot be destructively deleted
  test('Collection with active Topics cannot be deleted', async () => {
    const Topic = require('../src/models/Topic');
    const col = await Collection.create({ name: 'With Topics', slug: 'with-topics', createdBy: new mongoose.Types.ObjectId() });
    await Topic.create({ name: 'Test Topic', slug: 'test-topic', collection: col._id, createdBy: new mongoose.Types.ObjectId() });

    const res = await request(app)
      .delete(`/api/admin/collections/${col._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 14. unauthorized access is rejected
  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/admin/collections');
    expect(res.status).toBe(401);
  });
});
