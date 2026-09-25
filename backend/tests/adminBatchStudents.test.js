require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
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

/**
 * Helper to create a student user.
 */
async function createStudent(password) {
  const email = generateUniqueEmail('student@testmail.com');
  const student = await createTestUser({ name: 'Student', email, password, role: 'STUDENT' });
  return student;
}

/**
 * Helper to enroll a student into a batch.
 */
async function enrollStudent(adminToken, batchId, studentId) {
  return await request(app)
    .post(`/api/admin/batches/${batchId}/students`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ studentId });
}


describe('Admin Batch Student Management', () => {
  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    const { connectDB } = require('../src/config/db');
    await connectDB();
    // Clean any leftover data from previous runs
    await BatchStudent.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
  });

  afterEach(async () => {
    // Only delete batch-related test data, preserve users for auth tokens
    await BatchStudent.deleteMany({});
    await Batch.deleteMany({});
  });

  // ---------- ENROLL ----------
  test('admin can enroll student', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    const enrollRes = await enrollStudent(adminToken, batchId, student._id);
    expect(enrollRes.status).toBe(201);
    expect(enrollRes.body.success).toBe(true);
    const data = enrollRes.body.data;
    expect(data.student.id).toBe(String(student._id));
    expect(data.student).not.toHaveProperty('passwordHash');
  });

  test('should return 400 for missing studentId', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('should return 400 for invalid student id', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await enrollStudent(adminToken, batchId, 'invalidid');
    expect(res.status).toBe(400);
  });

  test('should return 400 for invalid batch id', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const student = await createStudent(password);
    const res = await request(app)
      .post(`/api/admin/batches/invalidid/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student._id });
    expect(res.status).toBe(400);
  });

  test('should return 404 when batch does not exist', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const student = await createStudent(password);
    const fakeBatchId = '000000000000000000000001';
    const res = await enrollStudent(adminToken, fakeBatchId, student._id);
    expect(res.status).toBe(404);
  });

  test('should return 404 when student does not exist', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const fakeStudentId = '000000000000000000000001';
    const res = await enrollStudent(adminToken, batchId, fakeStudentId);
    expect(res.status).toBe(404);
  });

  test('should return 400 when user is not a student', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    // Create a trainer user (not student)
    const otherTrainer = await createTestUser({ name: 'Other Trainer', email: generateUniqueEmail('othertrainer@testmail.com'), password, role: 'TRAINER' });
    const res = await enrollStudent(adminToken, batchId, otherTrainer._id);
    expect(res.status).toBe(400);
  });

  test('should return 400 when student is inactive', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const inactiveStudent = await createTestUser({ name: 'Inactive', email: generateUniqueEmail('inactive@testmail.com'), password, role: 'STUDENT', status: 'INACTIVE' });
    const res = await enrollStudent(adminToken, batchId, inactiveStudent._id);
    expect(res.status).toBe(400);
  });

  test('should return 400 when batch is inactive', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id, { status: 'INACTIVE' });
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    const res = await enrollStudent(adminToken, batchId, student._id);
    expect(res.status).toBe(400);
  });

  test('should return 409 for duplicate enrollment', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await enrollStudent(adminToken, batchId, student._id);
    expect(res.status).toBe(409);
  });

  // ---------- LIST ----------
  test('admin can list students in batch', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student1 = await createStudent(password);
    const student2 = await createStudent(password);
    await enrollStudent(adminToken, batchId, student1._id);
    await enrollStudent(adminToken, batchId, student2._id);
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    const ids = res.body.data.map(e => e.student.id);
    expect(ids).toContain(String(student1._id));
    expect(ids).toContain(String(student2._id));
    // Ensure passwordHash not exposed
    res.body.data.forEach(e => {
      expect(e.student).not.toHaveProperty('passwordHash');
    });
  });

  test('list returns empty array when no students', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  // ---------- GET SINGLE ----------
  test('admin can get enrollment', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}/students/${student._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student.id).toBe(String(student._id));
  });

  test('should return 404 for non‑existent enrollment', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}/students/${student._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---------- UPDATE ----------
  test('admin can change enrollment status', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .patch(`/api/admin/batches/${batchId}/students/${student._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('INACTIVE');
  });

  test('should return 400 for invalid status', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .patch(`/api/admin/batches/${batchId}/students/${student._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'UNKNOWN' });
    expect(res.status).toBe(400);
  });

  // ---------- DELETE ----------
  test('admin can remove enrollment', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .delete(`/api/admin/batches/${batchId}/students/${student._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
    // Ensure student still exists
    const foundStudent = await User.findById(student._id);
    expect(foundStudent).not.toBeNull();
    // Ensure batch still exists
    const foundBatch = await Batch.findById(batchId);
    expect(foundBatch).not.toBeNull();
  });

  test('should return 404 when deleting non‑existent enrollment', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const fakeStudentId = '000000000000000000000001';
    const res = await request(app)
      .delete(`/api/admin/batches/${batchId}/students/${fakeStudentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---------- AUTHORIZATION ----------
  test('unauthenticated request returns 401', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}/students`);
    expect(res.status).toBe(401);
  });

  test('trainer cannot access admin batch student routes', async () => {
    // Get admin and trainer via helper
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    // Obtain trainer token
    const trainerToken = await loginAndGetToken(trainer.email, password);
    // Create a batch as admin
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  test('student cannot access admin batch student routes', async () => {
    const student = await createStudent(password);
    const token = await loginAndGetToken(student.email, password);
    // Need a batch (admin) to test
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .get(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
