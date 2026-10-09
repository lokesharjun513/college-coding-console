// Phase 4A: Trainer read-only access to Training (Collection) / Day (Topic) metadata.
// Also guards the admin boundary: trainers must still be 403 on /admin/collections.
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const authService = require('../src/auth/authService');

async function createTestUser({ name, email, password, role }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Trainer access to Training (Collection) endpoints', () => {
  let trainerToken, adminToken, collectionId;

  beforeAll(async () => {
    await User.deleteMany({});
    await Collection.deleteMany({});
    await Topic.deleteMany({});
    const stamp = Date.now();
    const trainer = await createTestUser({ name: 'T', email: `t${stamp}@x.com`, password: 'Password123!', role: 'TRAINER' });
    trainerToken = await loginAndGetToken(trainer.email, 'Password123!');
    const admin = await createTestUser({ name: 'A', email: `a${stamp}@x.com`, password: 'Password123!', role: 'ADMIN' });
    adminToken = await loginAndGetToken(admin.email, 'Password123!');
    const col = await request(app).post('/api/admin/collections').set('Authorization', `Bearer ${adminToken}`).send({ name: 'CT', slug: `ct${stamp}` });
    collectionId = col.body.data._id;
    await Topic.create({ name: 'Day 1', slug: `day1${stamp}`, collection: collectionId, order: 1, createdBy: admin._id });
  });

  // Trainer-readable endpoints
  test('TRAINER can GET /api/trainer/collections', async () => {
    const res = await request(app).get('/api/trainer/collections').set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('trainer collection response exposes expected read-safe fields', async () => {
    const res = await request(app).get('/api/trainer/collections').set('Authorization', `Bearer ${trainerToken}`);
    const item = res.body.data.find(c => c.id === collectionId);
    expect(item).toBeDefined();
    expect(item).toEqual(expect.objectContaining({
      name: 'CT', topicCount: expect.any(Number), problemCount: expect.any(Number), status: 'ACTIVE',
    }));
    expect(item.createdBy).toBeUndefined();
  });

  test('TRAINER can GET /api/trainer/collections/:id/topics', async () => {
    const res = await request(app).get(`/api/trainer/collections/${collectionId}/topics`).set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual(expect.objectContaining({
      name: 'Day 1', order: 1, problemCount: expect.any(Number),
    }));
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/trainer/collections');
    expect(res.status).toBe(401);
  });

  // Admin boundary stays intact
  test('TRAINER still gets 403 on GET /api/admin/collections', async () => {
    const res = await request(app).get('/api/admin/collections').set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  test('TRAINER still gets 403 on GET /api/admin/collections/:id/topics', async () => {
    const res = await request(app).get(`/api/admin/collections/${collectionId}/topics`).set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  // Trainer namespace is trainer-only
  test('ADMIN gets 403 on trainer-only endpoint (trainer role is exact)', async () => {
    const res = await request(app).get('/api/trainer/collections').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  // Student isolation
  test('STUDENT gets 403 on trainer-only endpoint', async () => {
    const stamp = Date.now();
    const student = await createTestUser({ name: 'S', email: `s${stamp}@x.com`, password: 'Password123!', role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, 'Password123!');
    const res = await request(app).get('/api/trainer/collections').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
