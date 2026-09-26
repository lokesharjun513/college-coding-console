require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const authService = require('../src/auth/authService');

async function createTestUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.token;
}

function generateUniqueEmail(base) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${base.replace('@', `${timestamp}_${random}@`)}`;
}

async function createAdminAndTrainer() {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const trainerEmail = generateUniqueEmail('trainer@testmail.com');
  const password = 'StrongP@ssw0rd';
  await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
  const adminToken = await loginAndGetToken(adminEmail, password);
  const trainer = await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
  const trainerToken = await loginAndGetToken(trainerEmail, password);
  return { adminToken, trainer, trainerToken, password };
}

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

async function createStudent(password) {
  const email = generateUniqueEmail('student@testmail.com');
  const student = await createTestUser({ name: 'Student', email, password, role: 'STUDENT' });
  return student;
}

async function enrollStudent(adminToken, batchId, studentId) {
  return await request(app)
    .post(`/api/admin/batches/${batchId}/students`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ studentId });
}

describe('Trainer Batch Management', () => {
  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    
    // DB connection managed globally by setup.js
  });


  afterEach(async () => {
    await BatchStudent.deleteMany({});
    await Batch.deleteMany({});
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/trainer/batches');
    expect(res.status).toBe(401);
  });

  test('admin cannot access trainer endpoint', async () => {
    const { adminToken } = await createAdminAndTrainer();
    const res = await request(app)
      .get('/api/trainer/batches')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  test('student cannot access trainer endpoint', async () => {
    const student = await createStudent(password);
    const token = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .get('/api/trainer/batches')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('trainer can list own batches', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const res = await request(app)
      .get('/api/trainer/batches')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(batchRes.body.data.id);
  });

  test('trainer cannot see other trainer batches', async () => {
    const { adminToken, trainer: trainerA, trainerToken: tokenA } = await createAdminAndTrainer();
    const { adminToken: adminToken2, trainer: trainerB, trainerToken: tokenB } = await createAdminAndTrainer();
    const batchA = await createBatch(adminToken, trainerA._id);
    const batchB = await createBatch(adminToken2, trainerB._id);
    const res = await request(app)
      .get('/api/trainer/batches')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(batchA.body.data.id);
    expect(res.body.data[0].id).not.toBe(batchB.body.data.id);
  });

  test('trainer can get own batch', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(batchId);
  });

  test('trainer cannot get other trainer batch', async () => {
    const { adminToken, trainer: trainerA, trainerToken: tokenA } = await createAdminAndTrainer();
    const { adminToken: adminToken2, trainer: trainerB, trainerToken: tokenB } = await createAdminAndTrainer();
    const batchA = await createBatch(adminToken, trainerA._id);
    const batchB = await createBatch(adminToken2, trainerB._id);
    const res = await request(app)
      .get(`/api/trainer/batches/${batchB.body.data.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  test('invalid batch id returns 400', async () => {
    const { trainerToken } = await createAdminAndTrainer();
    const res = await request(app)
      .get('/api/trainer/batches/invalidid')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(400);
  });

  test('nonexistent batch returns 404', async () => {
    const { trainerToken } = await createAdminAndTrainer();
    const res = await request(app)
      .get('/api/trainer/batches/000000000000000000000001')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(404);
  });

  test('trainer can list students in own batch', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].student.id).toBe(String(student._id));
  });

  test('empty batch returns empty array', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  test('trainer can get enrolled student', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}/students/${student._id}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student.id).toBe(String(student._id));
  });

  test('trainer cannot get other trainer batch students', async () => {
    const { adminToken, trainer: trainerA, trainerToken: tokenA } = await createAdminAndTrainer();
    const { adminToken: adminToken2, trainer: trainerB, trainerToken: tokenB } = await createAdminAndTrainer();
    const batchA = await createBatch(adminToken, trainerA._id);
    const batchB = await createBatch(adminToken2, trainerB._id);
    const student = await createStudent(password);
    await enrollStudent(adminToken2, batchB.body.data.id, student._id);
    const res = await request(app)
      .get(`/api/trainer/batches/${batchB.body.data.id}/students`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  test('non-enrolled student returns 404', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}/students/${student._id}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(404);
  });

  test('invalid student id returns 400', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}/students/invalidid`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(400);
  });

  test('passwordHash is never returned', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.body.data).not.toHaveProperty('passwordHash');
    const students = await request(app)
      .get(`/api/trainer/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${trainerToken}`);
    students.body.data.forEach(e => {
      expect(e.student).not.toHaveProperty('passwordHash');
    });
  });

  test('trainer has studentCount in batch response', async () => {
    const { adminToken, trainer, trainerToken } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const student = await createStudent(password);
    await enrollStudent(adminToken, batchId, student._id);
    const res = await request(app)
      .get(`/api/trainer/batches/${batchId}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.body.data).toHaveProperty('studentCount');
    expect(res.body.data.studentCount).toBe(1);
  });
});
