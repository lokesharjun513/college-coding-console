// backend/tests/trainerEnrollment.test.js
// Trainer Batch Enrollment Authorization Tests
// Tests the trainer's ability to view enrollments in their own batches

const uniqueSuffix = require('./utils/unique');
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
  const suffix = uniqueSuffix();
  return `${base.replace('@', `${suffix}@`)}`;
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
    code: `CODE${uniqueSuffix()}`,
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
 * Helper to enroll a student into a batch (admin operation).
 */
async function enrollStudent(adminToken, batchId, studentId) {
  return await request(app)
    .post(`/api/admin/batches/${batchId}/students`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ studentId });
}

describe('Trainer Enrollment Visibility', () => {
  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    await BatchStudent.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});
  });

  afterEach(async () => {
    await BatchStudent.deleteMany({});
    await Batch.deleteMany({});
  });

  // ---------- AUTHENTICATION AND AUTHORIZATION ----------
  test('unauthenticated trainer cannot access students endpoint', async () => {
    const { adminToken, trainer } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);

    const res = await request(app)
      .get('/api/trainer/students');
    expect(res.status).toBe(401);
  });

  test('non-trainer user cannot access students endpoint', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const studentUser = await createTestUser({ name: 'Regular User', email: generateUniqueEmail('regular@testmail.com'), password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(studentUser.email, password);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  // ---------- BASIC FUNCTIONALITY ----------
  test('trainer can view their own batch enrollments', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;

    const student1 = await createStudent(password);
    const student2 = await createStudent(password);

    await enrollStudent(adminToken, batchId, student1._id);
    await enrollStudent(adminToken, batchId, student2._id);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);

    const studentIds = res.body.data.map(e => e.student.id);
    expect(studentIds).toContain(String(student1._id));
    expect(studentIds).toContain(String(student2._id));

    // Verify structure
    res.body.data.forEach(enrollment => {
      expect(enrollment.student).toBeDefined();
      expect(enrollment.student.name).toBeDefined();
      expect(enrollment.student.email).toBeDefined();
      expect(enrollment.student.role).toBe('STUDENT');
      expect(enrollment.batch).toBeDefined();
      expect(enrollment.status).toBeDefined();
      expect(enrollment.enrolledAt).toBeDefined();
    });
  });

  test('trainer sees empty list when no batches exist', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  test('trainer sees enrollments from multiple batches', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const batch1Res = await createBatch(adminToken, trainer._id, { name: 'Batch 1', code: `C1${uniqueSuffix()}` });
    const batch2Res = await createBatch(adminToken, trainer._id, { name: 'Batch 2', code: `C2${uniqueSuffix()}` });
    const batch1Id = batch1Res.body.data.id;
    const batch2Id = batch2Res.body.data.id;

    const student1 = await createStudent(password);
    const student2 = await createStudent(password);

    await enrollStudent(adminToken, batch1Id, student1._id);
    await enrollStudent(adminToken, batch2Id, student2._id);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);

    const batchCodes = res.body.data.map(e => e.batch.code);
    expect(batchCodes).toContain(batch1Res.body.data.code);
    expect(batchCodes).toContain(batch2Res.body.data.code);
  });

  // ---------- TRAINER BATCH ISOLATION ----------
  test('trainer cannot see enrollments from another trainer\\ batch', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const otherTrainer = await createTestUser({ name: 'Other Trainer', email: generateUniqueEmail('othertrainer@testmail.com'), password, role: 'TRAINER' });

    const batchRes = await createBatch(adminToken, otherTrainer._id, { name: 'Other Batch', code: `O${uniqueSuffix()}` });
    const batchId = batchRes.body.data.id;

    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  // ---------- STATUS FILTERING ----------
  test('trainer sees ACTIVE enrollments by default', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;

    const student1 = await createStudent(password);
    const student2 = await createStudent(password);

    // Enroll student1 as ACTIVE
    await enrollStudent(adminToken, batchId, student1._id);

    // Enroll student2 then mark INACTIVE
    await enrollStudent(adminToken, batchId, student2._id);
    await request(app)
      .patch(`/api/admin/batches/${batchId}/students/${student2._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);

    const statuses = res.body.data.map(e => e.status);
    expect(statuses).toContain('ACTIVE');
    expect(statuses).toContain('INACTIVE');
  });

  // ---------- DATA INTEGRITY ----------
  test('enrollment structure includes all expected fields', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;

    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    const enrollment = res.body.data[0];
    expect(enrollment.id).toBeDefined();
    expect(enrollment.student.id).toBeDefined();
    expect(enrollment.student.name).toBeDefined();
    expect(enrollment.student.email).toBeDefined();
    expect(enrollment.student.role).toBe('STUDENT');
    expect(enrollment.student.status).toBe('ACTIVE');
    expect(enrollment.batch.id).toBeDefined();
    expect(enrollment.batch.name).toBeDefined();
    expect(enrollment.batch.code).toBeDefined();
    expect(enrollment.status).toBe('ACTIVE');
    expect(enrollment.enrolledAt).toBeDefined();
    expect(enrollment.createdAt).toBeDefined();
    expect(enrollment.updatedAt).toBeDefined();
  });

  test('passwordHash is never exposed in enrollment response', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;

    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    const enrollment = res.body.data[0];
    expect(enrollment.student).not.toHaveProperty('passwordHash');
    expect(enrollment.student).not.toHaveProperty('trainerId');
    expect(enrollment.student).not.toHaveProperty('rollNumber');
  });

  // ---------- EDGE CASES ----------
  test('trainer sees enrollments when only one batch exists', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;

    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);

    const res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  test('trainer sees student status changes', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);

    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;

    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);

    // Initial view
    let res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.body.data[0].status).toBe('ACTIVE');

    // Deactivate student directly in DB
    await BatchStudent.updateOne(
      { student: student._id, batch: batchId },
      { status: 'INACTIVE' }
    );

    // Updated view
    res = await request(app)
      .get('/api/trainer/students')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.body.data[0].status).toBe('INACTIVE');
  });
});
