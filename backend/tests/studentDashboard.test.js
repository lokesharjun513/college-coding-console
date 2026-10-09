// backend/tests/studentDashboard.test.js
// Tests for the new student dashboard endpoint

const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const Submission = require('../src/models/Submission');
const BatchStudent = require('../src/models/BatchStudent');
const authService = require('../src/auth/authService');

// Mock compilerRegistry (list cached count = 0, so getCompilerById returns undefined)
jest.mock('../src/services/compilerRegistry', () => ({
  getCompilerById: jest.fn(async (id) => ({
    id,
    name: id,
    displayName: id,
    language: (id || '').split('-')[0] === 'python' ? 'python' : (id || '').split('-')[0],
    version: '',
    compiler: id,
  })),
  getCompilers: jest.fn(async () => []),
  isSupportedCompiler: jest.fn(() => true),
  getLanguageByCompiler: jest.fn(() => 'python'),
  mapLegacyToCompiler: jest.fn((lang) => lang === 'python' ? 'python-3.14' : null),
  LEGACY_TO_COMPILER: { python: 'python-3.14' },
}));

// Mock OnlineCompilerExecutor
const { execute } = require('../src/services/OnlineCompilerExecutor');
jest.mock('../src/services/OnlineCompilerExecutor');

// Mock successful execution (mockReset in beforeEach, default returns accepted output '3')
execute.mockResolvedValue({
  output: '3',
  error: '',
  time: 0.01,
  memory: 1024,
});

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

// Helper to create admin and trainer (reuse from other tests)
async function createAdminAndTrainer() {
  const adminEmail = `admin${uniqueSuffix()}@test.com`;
  const trainerEmail = `trainer${uniqueSuffix()}@test.com`;
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

// Helper to create a problem (trainer only).
// NOTE: the trainer API intentionally forces scope BATCH on batch problems
// (see routes/trainer/problems.js CREATE). GLOBAL fixtures are applied at the
// document level after creation — the API contract itself is not weakened.
async function createProblem(trainerToken, batchId, overrides = {}) {
  const unique = uniqueSuffix();
  const defaultData = {
    title: `Test Problem ${unique}`,
    description: 'Test problem description',
    difficulty: 'EASY',
    allowedLanguages: ['python'],
    batch: batchId,
  };
  const data = { ...defaultData, ...overrides };
  const res = await request(app)
    .post(`/api/trainer/batches/${batchId}/problems`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(data);
  if (overrides.scope === 'GLOBAL' && res.body?.data?.id) {
    await Problem.findByIdAndUpdate(res.body.data.id, { scope: 'GLOBAL' });
  }
  return res;
}

// Helper to add a test case (trainer only)
async function addTestCase(trainerToken, problemId, testCaseData) {
  return await request(app)
    .post(`/api/trainer/problems/${problemId}/test-cases`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(testCaseData);
}

beforeEach(async () => {
  // Clean collections that could affect tests
  await Promise.all([
    Submission.deleteMany({}),
    BatchStudent.deleteMany({}),
    User.deleteMany({}),
    Batch.deleteMany({}),
    Problem.deleteMany({}),
    TestCase.deleteMany({}),
  ]);
  // Default execute mock returns an accepted result
  execute.mockReset().mockResolvedValue({
    output: '3',
    error: '',
    status: 'success',
    time: 0.01,
    memory: 1024,
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});


describe('Student Dashboard Endpoint', () => {
  test('authenticated student with no batch receives correct dashboard', async () => {
    // Arrange: create trainer, batch, global problem, test case, student
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    // Global problem (scope defaults to GLOBAL, status published)
    const problemRes = await createProblem(trainerToken, batchId, { scope: 'GLOBAL', status: 'PUBLISHED' });
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });
    // Create student (no batch enrollment)
    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);
    // Submit code (accepted)
    const submitRes = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){return 3;}', language: 'python' });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.success).toBe(true);    // Act: fetch dashboard
    const res = await request(app)
      .get('/api/student/dashboard')
      .set('Authorization', `Bearer ${studentToken}`);
    // Assert
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    // Student info (no passwordHash)
    expect(data.student.id).toBe(String(student._id));
    expect(data.student.email).toBe(student.email);
    expect(data.student.name).toBe(student.name);
    expect(data.student).not.toHaveProperty('passwordHash');
    // No batch
    expect(data.batch).toBeNull();
    // Metrics
    expect(data.metrics.totalProblems).toBe(1);
    expect(data.metrics.attemptedProblems).toBe(1);
    expect(data.metrics.solvedProblems).toBe(1);
    expect(data.metrics.accuracy).toBe(100);
    // Recent submissions
    expect(Array.isArray(data.recentSubmissions)).toBe(true);
    expect(data.recentSubmissions.length).toBe(1);
    const sub = data.recentSubmissions[0];
    expect(sub.verdict).toBe('ACCEPTED');
    expect(sub.problem).toBeTruthy();
  });

  test('authenticated student with batch receives correct dashboard', async () => {
    // Arrange: admin/trainer, batch, enroll student, create global & batch problems
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    // Enroll student in batch
    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: student._id, status: 'ACTIVE' });
    const studentToken = await loginAndGetToken(student.email, password);
    // Global problem
    const globalProbRes = await createProblem(trainerToken, batchId, { scope: 'GLOBAL', status: 'PUBLISHED' });
    const globalProbId = globalProbRes.body.data.id;
    await addTestCase(trainerToken, globalProbId, { input: '1 2', expectedOutput: '3' });
    // Batch‑specific problem
    const batchProbRes = await createProblem(trainerToken, batchId, { scope: 'BATCH', status: 'PUBLISHED' });
    const batchProbId = batchProbRes.body.data.id;
    await addTestCase(trainerToken, batchProbId, { input: '2 2', expectedOutput: '4' });
    // Submit accepted code for global problem
    await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId: globalProbId, code: 'function solution(){return 3;}', language: 'python' });
    // Submit wrong answer for batch problem (execute returns wrong output '5')
    execute.mockResolvedValueOnce({
      output: '5',
      error: '',
      status: 'success',
      time: 0.01,
      memory: 1024,
    });
    await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId: batchProbId, code: 'function solution(){return 5;}', language: 'python' });
    // Act: fetch dashboard
    const res = await request(app)
      .get('/api/student/dashboard')
      .set('Authorization', `Bearer ${studentToken}`);
    // Assert
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    // Batch info present
    expect(data.batch).not.toBeNull();
    expect(data.batch.id).toBe(String(batchId));
    // Metrics: totalProblems = 2 (global + batch)
    expect(data.metrics.totalProblems).toBe(2);
    // attemptedProblems = 2 (both have a submission)
    expect(data.metrics.attemptedProblems).toBe(2);
    // solvedProblems = 1 (only global accepted)
    expect(data.metrics.solvedProblems).toBe(1);
    // accuracy = 50 (rounded)
    expect(data.metrics.accuracy).toBe(50);
    // Recent submissions (2 entries, most recent first)
    expect(Array.isArray(data.recentSubmissions)).toBe(true);
    expect(data.recentSubmissions.length).toBe(2);
    const [first, second] = data.recentSubmissions;
    // The most recent is the batch problem (wrong answer)
    expect(first.problem).toBeTruthy();
    expect(first.verdict).toBe('WRONG_ANSWER');
    expect(second.verdict).toBe('ACCEPTED');
  });

  // Regression: compiler-independence — historical submissions count in metrics
  // even if the problem's compiler is later removed, and metrics never require
  // a compiler to be configured (visibility/authorization is compiler-free).
  test('attempted metrics do not require compiler configuration', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId, { scope: 'GLOBAL', status: 'PUBLISHED' });
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);

    // Submit while the compilers map is configured (auto-derived at create)
    const submitRes = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'x', language: 'python' });
    expect(submitRes.status).toBe(201);

    // Remove compilers afterwards — historical submission must still count
    await Problem.findByIdAndUpdate(problemId, { $unset: { compilers: '' } });
    const res = await request(app)
      .get('/api/student/dashboard')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.metrics.totalProblems).toBe(1); // still visible without compiler
    expect(res.body.data.metrics.attemptedProblems).toBe(1);
  });

  // Regression: submissions to inaccessible BATCH problems are not counted
  test('submissions to inaccessible batch problems are not counted', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body?.data?.id || batchRes.body?.data?._id;
    if (!batchId) throw new Error(`Batch creation failed: status=${batchRes.status} body=${JSON.stringify(batchRes.body)}`);
    const batchProbRes = await createProblem(trainerToken, batchId, { scope: 'BATCH', status: 'PUBLISHED' });
    const batchProbId = batchProbRes.body.data.id;
    // Trainer route does not accept scope — set BATCH scope directly
    await Problem.findByIdAndUpdate(batchProbId, { scope: 'BATCH', compilers: { 'python': 'python-3.14' } });
    await addTestCase(trainerToken, batchProbId, { input: '1', expectedOutput: '1' });

    // Student NOT enrolled in the batch
    const student = await createUser({ name: 'Outsider', email: `out${uniqueSuffix()}@test.com`, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);

    // Direct submission attempt must be rejected (no backdoor)
    const submitRes = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId: batchProbId, code: 'x', language: 'python' });
    expect(submitRes.status).toBe(404);

    // Dashboard shows the problem as available but not attempted
    const res = await request(app)
      .get('/api/student/dashboard')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.metrics.totalProblems).toBe(0); // batch problem not in scope
    expect(res.body.data.metrics.attemptedProblems).toBe(0);
  });

  test('non‑student role cannot access dashboard', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const res = await request(app)
      .get('/api/student/dashboard')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app)
      .get('/api/student/dashboard');
    expect(res.status).toBe(401);
  });
});
