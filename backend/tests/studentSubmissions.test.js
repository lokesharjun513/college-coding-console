// backend/tests/studentSubmissions.test.js
// Tests for student code submission endpoint

require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const Submission = require('../src/models/Submission');
const authService = require('../src/auth/authService');

// Helper to create a user with a role
async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

// Helper to login and retrieve JWT token
async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

// Helper to create admin and trainer (reuse from trainer tests)
async function createAdminAndTrainer() {
  const adminEmail = `admin${Date.now()}@test.com`;
  const trainerEmail = `trainer${Date.now()}@test.com`;
  const password = 'StrongP@ssw0rd';
  await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
  const adminToken = await loginAndGetToken(adminEmail, password);
  await createUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
  const trainer = await User.findOne({ email: trainerEmail });
  return { adminToken, trainer, password };
}

// Helper to create a batch (admin only)
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

// Helper to create a problem (trainer only)
async function createProblem(trainerToken, batchId, overrides = {}) {
  const unique = Date.now();
  const defaultData = {
    title: `Test Problem ${unique}`,
    description: 'Test problem description',
    difficulty: 'EASY',
    tags: ['array'],
    starterCode: 'function solution() {}',
    constraints: 'n <= 1000',
    allowedLanguages: ['javascript'],
    batch: batchId,
    createdBy: undefined, // will be set by auth middleware
  };
  const data = { ...defaultData, ...overrides };
  return await request(app)
    .post(`/api/trainer/batches/${batchId}/problems`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(data);
}

// Helper to add a test case (trainer only)
async function addTestCase(trainerToken, problemId, testCaseData) {
  return await request(app)
    .post(`/api/trainer/problems/${problemId}/test-cases`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(testCaseData);
}

beforeAll(() => {
  global.fetch = jest.fn();
});

beforeEach(async () => {
  // Clean only submissions before each test to avoid affecting other suites
  await Submission.deleteMany({});

  // Reset and set default fetch mock that returns ACCEPTED
  global.fetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: { id: 3, description: 'Accepted' },
      stdout: '3\n',
      stderr: '',
      time: 0.01,
      memory: 1024,
    }),
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Set a dummy Judge0 endpoint for the service
process.env.JUDGE0_ENDPOINT = 'http://mock-judge0.com';

describe('Student Submission Endpoint', () => {
  test('authenticated student can submit code and receive ACCEPTED verdict', async () => {
    // Arrange: create admin, trainer, batch, problem, test case
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    // Mock Judge0 to return accepted result
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: { id: 3, description: 'Accepted' },
        stdout: '3\n',
        stderr: '',
        time: 0.01,
        memory: 1024,
      }),
    });

    // Act: student submits code
    const studentEmail = `student${Date.now()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){return 3;}', language: 'javascript' });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe('ACCEPTED');
    expect(res.body.data.testResults).toHaveLength(1);
    expect(res.body.data.testResults[0].passed).toBe(true);
  });

  test('submission with wrong answer returns WRONG_ANSWER verdict', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    // Mock Judge0 to return wrong output
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: { id: 3, description: 'Accepted' },
        stdout: '4\n',
        stderr: '',
        time: 0.01,
        memory: 1024,
      }),
    });

    const studentEmail = `student2${Date.now()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){return 4;}', language: 'javascript' });

    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('WRONG_ANSWER');
    expect(res.body.data.testResults[0].passed).toBe(false);
  });

  test('compilation error returns COMPILATION_ERROR verdict', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1', expectedOutput: '1' });

    // Mock Judge0 to return compilation error
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: { id: 4, description: 'Compilation Error' },
        stdout: '',
        stderr: 'Syntax error',
        time: 0,
        memory: 0,
      }),
    });

    const studentEmail = `student3${Date.now()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){', language: 'javascript' });

    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('COMPILATION_ERROR');
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/student/submissions')
      .send({ problemId: 'dummy', code: 'code', language: 'javascript' });
    expect(res.status).toBe(401);
  });

  test('non‑student role returns 403', async () => {
    const adminEmail = `admin2${Date.now()}@test.com`;
    const admin = await createUser({ name: 'Admin', email: adminEmail, password: 'pwd', role: 'ADMIN' });
    const adminToken = await loginAndGetToken(admin.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problemId: 'dummy', code: 'code', language: 'javascript' });
    expect(res.status).toBe(403);
  });
});
