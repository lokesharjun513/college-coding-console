const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');

async function createTestUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

function generateUniqueEmail(base) {
  return `${base.replace('@', `${uniqueSuffix()}@`)}`;
}

async function createAdminAndTrainer() {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const trainerEmail = generateUniqueEmail('trainer@testmail.com');
  const password = 'StrongP@ssw0rd';
  await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
  const adminToken = await loginAndGetToken(adminEmail, password);
  const trainer = await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
  const trainerToken = await loginAndGetToken(trainerEmail, password);
  return { adminToken, trainer, trainerToken };
}

async function createBatch(adminToken, trainerId) {
  const res = await request(app)
    .post('/api/admin/batches')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Batch Name',
      code: `CODE${uniqueSuffix()}`,
      trainer: trainerId,
      status: 'ACTIVE',
      startDate: '2026-10-01',
      endDate: '2027-03-31',
    });
  return res.body.data;
}

describe('Trainer Problem Scope & Authorization', () => {
  let adminToken, trainerToken, trainer, batch;

  beforeAll(async () => {
    await Problem.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});
    const data = await createAdminAndTrainer();
    adminToken = data.adminToken;
    trainerToken = data.trainerToken;
    trainer = data.trainer;
    batch = await createBatch(adminToken, trainer.id);
  });

  it('should set scope to BATCH when created by trainer', async () => {
    const res = await request(app)
      .post(`/api/trainer/batches/${batch.id}/problems`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({
        title: 'Batch Scope Test',
        description: 'Test scope setting',
        difficulty: 'EASY'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.scope).toBe('BATCH');

    const problem = await Problem.findById(res.body.data.id);
    expect(problem.scope).toBe('BATCH');
    expect(problem.createdBy.toString()).toBe(trainer.id.toString());
  });

  it('should reject creation if trainer does not own the batch', async () => {
    const { trainerToken: otherTrainerToken } = await createAdminAndTrainer();

    const res = await request(app)
      .post(`/api/trainer/batches/${batch.id}/problems`)
      .set('Authorization', `Bearer ${otherTrainerToken}`)
      .send({
        title: 'Hack Test',
        description: 'Test',
        difficulty: 'EASY'
      });

    expect(res.status).toBe(403);
  });
});
