// backend/tests/trainerAvailableStudents.test.js
//
// Focused API coverage for the trainer available students endpoint:
//   GET    /api/trainer/batches/:batchId/students/available

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');

const PASSWORD = 'StrongP@ssw0rd';

const created = {
  users: [],
  batches: [],
  enrollments: [],
};

async function createTestUser(role, label) {
  const suffix = uniqueSuffix();
  const user = await User.create({
    name: `${label} ${suffix}`,
    email: `${label.toLowerCase()}-${suffix}@testmail.com`,
    passwordHash: await authService.hashPassword(PASSWORD),
    role,
    status: 'ACTIVE',
    ...(role === 'TRAINER' ? { trainerId: `T-${suffix}` } : { rollNumber: `R-${suffix}` }),
  });
  created.users.push(user._id);
  return user;
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function createBatch(trainer) {
  const batch = await Batch.create({
    name: `Batch ${uniqueSuffix()}`,
    code: `B${uniqueSuffix()}`,
    trainer: trainer ? trainer._id : undefined,
  });
  created.batches.push(batch._id);
  return batch;
}

describe('Trainer available students route', () => {
  let trainer;
  let trainerToken;
  let student1;
  let student2;
  let batch;

  beforeAll(async () => {
    trainer = await createTestUser('TRAINER', 'trainer');
    trainerToken = await login(trainer.email);
    student1 = await createTestUser('STUDENT', 'student1');
    student2 = await createTestUser('STUDENT', 'student2');
    batch = await createBatch(trainer);
  });

  afterAll(async () => {
    await BatchStudent.deleteMany({ _id: { $in: created.enrollments } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batch._id}/students/available`);
    expect(res.status).toBe(401);
  });

  test('requires trainer role', async () => {
    const studentToken = await login(student1.email);
    const res = await request(app)
      .get(`/api/trainer/batches/${batch._id}/students/available`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  test('returns empty array when no students are enrolled', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batch._id}/students/available`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.any(Array));
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('excludes enrolled students from available list', async () => {
    // Enroll student1
    const enrollment = await BatchStudent.create({
      batch: batch._id,
      student: student1._id,
      status: 'ACTIVE',
    });
    created.enrollments.push(enrollment._id);

    const res = await request(app)
      .get(`/api/trainer/batches/${batch._id}/students/available`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // student1 should not be in the available list
    const studentIds = res.body.data.map(s => s.id);
    expect(studentIds).not.toContain(student1._id.toString());
    // student2 should be available
    expect(studentIds).toContain(student2._id.toString());
  });

  test('supports search by name', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batch._id}/students/available`)
      .query({ search: student2.name })
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(student2._id.toString());
  });

  test('supports search by email', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batch._id}/students/available`)
      .query({ search: student2.email })
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(student2._id.toString());
  });

  test('returns 404 for unknown batch', async () => {
    const res = await request(app)
      .get('/api/trainer/batches/000000000000000000000001/students/available')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid batch id', async () => {
    const res = await request(app)
      .get('/api/trainer/batches/invalid/students/available')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(400);
  });
});
