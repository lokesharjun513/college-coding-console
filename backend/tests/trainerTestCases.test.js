require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
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
 * Helper to create admin and trainer users.
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
    code: `CODE${Date.now()}${Math.floor(Math.random() * 1000)}`,
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
 * Helper to create a problem for a batch.
 */
async function createProblem(trainerToken, batchId, overrides = {}) {
  const defaultData = {
    title: 'Test Problem',
    description: 'Test problem description',
    difficulty: 'EASY',
    tags: ['array'],
    starterCode: 'function solution() {}',
    constraints: 'n <= 1000',
  };
  const data = { ...defaultData, ...overrides };
  return await request(app)
    .post(`/api/trainer/batches/${batchId}/problems`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(data);
}

describe('Trainer Test Case Management', () => {
  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    console.log('[DEBUG] Running beforeAll cleanup');
    await TestCase.deleteMany({});
    await Problem.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});
    console.log('[DEBUG] Cleanup complete');
  });

  afterEach(async () => {
    await TestCase.deleteMany({});
    await Problem.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});
  });

  // ---------- CREATE TEST CASE ----------
  test('trainer can create test case', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const res = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.input).toBe('1 2');
    expect(res.body.data.expectedOutput).toBe('3');
    expect(res.body.data.isHidden).toBe(false);
  });

  test('should return 400 for missing input', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const res = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ expectedOutput: '3' });

    expect(res.status).toBe(400);
  });

  test('should return 400 for missing expectedOutput', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const res = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2' });

    expect(res.status).toBe(400);
  });

  test('should return 400 for empty input', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const res = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '', expectedOutput: '3' });

    expect(res.status).toBe(400);
  });

  test('should return 404 for non-existent problem', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const fakeProblemId = '000000000000000000000001';

    const res = await request(app)
      .post(`/api/trainer/problems/${fakeProblemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });

    expect(res.status).toBe(404);
  });

  test('should return 403 when trainer does not own the problem', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);

    // Create another trainer
    const otherTrainer = await createTestUser({
      name: 'Other Trainer',
      email: generateUniqueEmail('othertrainer@testmail.com'),
      password: pwd,
      role: 'TRAINER'
    });

    // Create batch with first trainer
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;

    // Create problem with first trainer
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    // Try to access with other trainer token
    const otherTrainerToken = await loginAndGetToken(otherTrainer.email, pwd);
    const res = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${otherTrainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });

    expect(res.status).toBe(403);
  });

  // ---------- LIST TEST CASES ----------
  test('trainer can list test cases', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });
    await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '4 5', expectedOutput: '9', order: 1 });

    const res = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  test('list returns empty array when no test cases', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const res = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  // ---------- GET SINGLE TEST CASE ----------
  test('trainer can get single test case', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const createRes = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });
    const testCaseId = createRes.body.data.id;

    const res = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases/${testCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testCaseId);
  });

  test('should return 404 for non-existent test case', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    const fakeTestCaseId = '000000000000000000000001';

    const res = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases/${fakeTestCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(404);
  });

  // ---------- UPDATE TEST CASE ----------
  test('trainer can update test case', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const createRes = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });
    const testCaseId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/trainer/problems/${problemId}/test-cases/${testCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '10 20', isHidden: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.input).toBe('10 20');
    expect(res.body.data.isHidden).toBe(true);
  });

  test('should return 400 for empty input on update', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const createRes = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });
    const testCaseId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/trainer/problems/${problemId}/test-cases/${testCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '' });

    expect(res.status).toBe(400);
  });

  test('should return 404 when updating non-existent test case', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    const fakeTestCaseId = '000000000000000000000001';

    const res = await request(app)
      .patch(`/api/trainer/problems/${problemId}/test-cases/${fakeTestCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '10 20' });

    expect(res.status).toBe(404);
  });

  // ---------- DELETE TEST CASE ----------
  test('trainer can delete test case', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const createRes = await request(app)
      .post(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });
    const testCaseId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/trainer/problems/${problemId}/test-cases/${testCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();

    // Verify deletion
    const checkRes = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases/${testCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(checkRes.status).toBe(404);
  });

  test('should return 404 when deleting non-existent test case', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    const fakeTestCaseId = '000000000000000000000001';

    const res = await request(app)
      .delete(`/api/trainer/problems/${problemId}/test-cases/${fakeTestCaseId}`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(404);
  });

  // ---------- AUTHORIZATION ----------
  test('unauthenticated request returns 401', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const res = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases`);

    expect(res.status).toBe(401);
  });

  test('admin cannot access trainer test case routes', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const res = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  test('student cannot access trainer test case routes', async () => {
    const { adminToken, trainer, password: pwd } = await createAdminAndTrainer();
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const trainerToken = await loginAndGetToken(trainer.email, pwd);
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const student = await createTestUser({
      name: 'Student',
      email: generateUniqueEmail('student@testmail.com'),
      password: pwd,
      role: 'STUDENT'
    });
    const studentToken = await loginAndGetToken(student.email, pwd);

    const res = await request(app)
      .get(`/api/trainer/problems/${problemId}/test-cases`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});