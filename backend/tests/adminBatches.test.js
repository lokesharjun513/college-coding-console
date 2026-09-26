require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const authService = require('../src/auth/authService');

/**
 * Helper to create a user with a hashed password.
 */
async function createTestUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

/**
 * Helper to login and retrieve token.
 */
async function loginAndGetToken(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.token;
}

/**
 * Generate unique email for test isolation
 */
function generateUniqueEmail(base) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${base.replace('@', `${timestamp}_${random}@`)}`;
}

/**
 * Helper to create admin and trainer users and return token.
 */
async function createAdminAndTrainer() {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const trainerEmail = generateUniqueEmail('trainer@testmail.com');
  const password = 'StrongP@ssw0rd';
  await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
  const adminToken = await loginAndGetToken(adminEmail, password);
  const trainer = await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
  return { adminToken, trainer, password };
}

/**
 * Helper to create a batch.
 */
async function createBatch(adminToken, trainerId, overrides = {}) {
  const defaultData = {
    name: 'Batch Name',
    code: `CODE${Date.now()}`,
    description: 'Batch description',
    trainer: trainerId,
    status: 'ACTIVE',
    startDate: '2026-10-01',
    endDate: '2027-03-31',
  };
  const data = { ...defaultData, ...overrides };
  return await request(app)
    .post('/api/admin/batches')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(data);
}

describe('Admin Batch Management', () => {
  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    
    // DB connection managed globally by setup.js
  });


  afterEach(async () => {
    await Batch.deleteMany({});
    await User.deleteMany({});
  });

  // ---------- CREATE ----------
  test('admin can create batch', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const res = await createBatch(adminToken, trainer._id);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('Batch Name');
    expect(res.body.data.trainer.id).toBe(String(trainer._id));
  });

  test('should return 400 for missing name', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'CODE123',
        trainer: trainer._id,
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should return 400 for missing code', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Batch without code',
        trainer: trainer._id,
      });
    expect(res.status).toBe(400);
  });

  test('should return 400 for missing trainer', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No trainer',
        code: 'NOTR',
      });
    expect(res.status).toBe(400);
  });

  test('should return 400 for invalid trainer id', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid trainer',
        code: 'INVTR',
        trainer: 'invalidid',
      });
    // Mongoose will treat invalid ObjectId as not found, so we expect 400 from our validation
    expect(res.status).toBe(400);
  });

  test('should return 400 when trainer does not exist', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Nonexistent Trainer',
        code: 'NONTR',
        trainer: fakeId,
      });
    expect(res.status).toBe(400);
  });

  test('should return 400 when trainer is not a TRAINER', async () => {
    const adminEmail = generateUniqueEmail('admin@testmail.com');
    const studentEmail = generateUniqueEmail('student@testmail.com');
    await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    const adminToken = await loginAndGetToken(adminEmail, password);
    const student = await createTestUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Student as trainer',
        code: 'STU1',
        trainer: student._id,
      });
    expect(res.status).toBe(400);
  });

  test('should return 409 for duplicate batch code', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const code = 'DUPLICATE';
    await createBatch(adminToken, trainer._id, { code });
    const res = await createBatch(adminToken, trainer._id, { code });
    expect(res.status).toBe(409);
  });

  test('should return 400 for invalid status', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad status',
        code: 'BADSTAT',
        trainer: trainer._id,
        status: 'UNKNOWN',
      });
    expect(res.status).toBe(400);
  });

  test('should return 400 when endDate before startDate', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad dates',
        code: 'BADDATE',
        trainer: trainer._id,
        startDate: '2027-01-01',
        endDate: '2026-01-01',
      });
    expect(res.status).toBe(400);
  });

  // ---------- LIST ----------
  test('admin can list batches', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    await createBatch(adminToken, trainer._id);
    const res = await request(app)
      .get('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    const batch = res.body.data[0];
    expect(batch.trainer).toHaveProperty('id');
    expect(batch.trainer).not.toHaveProperty('passwordHash');
  });

  // ---------- GET SINGLE ----------
  test('admin can get single batch', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const createRes = await createBatch(adminToken, trainer._id);
    const batchId = createRes.body.data.id;
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(batchId);
  });

  test('should return 400 for invalid batch id', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const res = await request(app)
      .get('/api/admin/batches/invalidid')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test('should return 404 for non‑existent batch', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .get(`/api/admin/batches/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---------- UPDATE ----------
  test('admin can update batch name and code', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const createRes = await createBatch(adminToken, trainer._id);
    const batchId = createRes.body.data.id;
    const res = await request(app)
      .patch(`/api/admin/batches/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name', code: 'NEWCODE' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
    expect(res.body.data.code).toBe('NEWCODE');
  });

  test('admin can change trainer', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const newTrainer = await createTestUser({ name: 'New Trainer', email: generateUniqueEmail('newtrainer@testmail.com'), password, role: 'TRAINER' });
    const createRes = await createBatch(adminToken, trainer._id);
    const batchId = createRes.body.data.id;
    const res = await request(app)
      .patch(`/api/admin/batches/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ trainer: newTrainer._id });
    expect(res.status).toBe(200);
    expect(res.body.data.trainer.id).toBe(String(newTrainer._id));
  });

  test('should return 400 when updating trainer to non‑TRAINER', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const student = await createTestUser({ name: 'Student', email: generateUniqueEmail('student@testmail.com'), password, role: 'STUDENT' });
    const createRes = await createBatch(adminToken, trainer._id);
    const batchId = createRes.body.data.id;
    const res = await request(app)
      .patch(`/api/admin/batches/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ trainer: student._id });
    expect(res.status).toBe(400);
  });

  test('should return 409 for duplicate code on update', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const code1 = `CODE1${Date.now()}`;
    const code2 = `CODE2${Date.now()}`;
    const batch1 = await createBatch(adminToken, trainer._id, { code: code1 });
    const batch2 = await createBatch(adminToken, trainer._id, { code: code2 });
    const res = await request(app)
      .patch(`/api/admin/batches/${batch2.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: code1 });
    expect(res.status).toBe(409);
  });

  // ---------- DELETE ----------
  test('admin can delete batch', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const createRes = await createBatch(adminToken, trainer._id);
    const batchId = createRes.body.data.id;
    const res = await request(app)
      .delete(`/api/admin/batches/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
  });

  test('should return 404 when deleting non‑existent batch', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .delete(`/api/admin/batches/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---------- AUTHORIZATION ----------
  test('trainer cannot access admin batch routes', async () => {
    const trainerEmail = generateUniqueEmail('trainer@testmail.com');
    const password = 'StrongP@ssw0rd';
    const trainer = await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
    const token = await loginAndGetToken(trainerEmail, password);
    const res = await request(app)
      .get('/api/admin/batches')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('student cannot access admin batch routes', async () => {
    const studentEmail = generateUniqueEmail('student@testmail.com');
    const password = 'StrongP@ssw0rd';
    const student = await createTestUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const token = await loginAndGetToken(studentEmail, password);
    const res = await request(app)
      .get('/api/admin/batches')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get('/api/admin/batches');
    expect(res.status).toBe(401);
  });
});
