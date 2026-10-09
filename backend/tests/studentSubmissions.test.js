// backend/tests/studentSubmissions.test.js
// Tests for student code submission endpoint

const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
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

// Helper to create a problem (trainer only)
async function createProblem(trainerToken, batchId, overrides = {}) {
  const unique = uniqueSuffix();
  const defaultData = {
    title: `Test Problem ${unique}`,
    description: 'Test problem description',
    difficulty: 'EASY',
    tags: ['array'],
    starterCode: 'function solution() {}',
    constraints: 'n <= 1000',
    allowedLanguages: ['typescript'],
    status: 'PUBLISHED',
    batch: batchId,
    createdBy: undefined, // will be set by auth middleware
  };
  const data = { ...defaultData, ...overrides };
  const res = await request(app)
    .post(`/api/trainer/batches/${batchId}/problems`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(data);
  return res;
}

// Helper to add a test case (trainer only)
async function addTestCase(trainerToken, problemId, testCaseData) {
  return await request(app)
    .post(`/api/trainer/problems/${problemId}/test-cases`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(testCaseData);
}

const OnlineCompilerExecutor = require('../src/services/OnlineCompilerExecutor');

jest.mock('../src/services/OnlineCompilerExecutor', () => ({
  execute: jest.fn(),
}));

// Mock the compiler registry so tests never hit the live provider
jest.mock('../src/services/compilerRegistry', () => {
  const CATALOG = {
    'python-3.14': { id: 'python-3.14', compiler: 'python-3.14', name: 'Python 3.14', language: 'python', displayName: 'Python 3.14' },
    'gcc-15': { id: 'gcc-15', compiler: 'gcc-15', name: 'GCC 15', language: 'c', displayName: 'C 15' },
    'g++-15': { id: 'g++-15', compiler: 'g++-15', name: 'G++ 15', language: 'cpp', displayName: 'C++ 15' },
    'openjdk-25': { id: 'openjdk-25', compiler: 'openjdk-25', name: 'OpenJDK 25', language: 'java', displayName: 'Java 25' },
    'typescript-deno': { id: 'typescript-deno', compiler: 'typescript-deno', name: 'TypeScript (Deno)', language: 'typescript', displayName: 'TypeScript' },
  };
  const LEGACY_MAP = {
    python: 'python-3.14',
    c: 'gcc-15',
    cpp: 'g++-15',
    java: 'openjdk-25',
    typescript: 'typescript-deno',
  };
  return {
    getCompilers: jest.fn().mockResolvedValue(Object.values(CATALOG)),
    getCompilerById: jest.fn(async id => CATALOG[id] || null),
    isSupportedCompiler: id => id in CATALOG,
    getLanguageByCompiler: id => CATALOG[id]?.language || null,
    mapLegacyToCompiler: jest.fn(lang => LEGACY_MAP[lang] || null),
    normalizeCompilerResponse: r => r,
    LEGACY_TO_COMPILER: LEGACY_MAP,
  };
});

// Create a problem directly in DB with a configured language→compiler map
async function createConfiguredProblem({ createdBy, languages = [['c', 'gcc-15']], title = 'Configured Problem' }) {
  const unique = uniqueSuffix();
  const allowedLanguages = languages.map(([lang]) => lang);
  const compilers = Object.fromEntries(languages);
  return await Problem.create({
    title: `${title} ${unique}`,
    slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${unique}`,
    description: 'Test problem description',
    difficulty: 'EASY',
    allowedLanguages,
    compilers,
    scope: 'GLOBAL',
    status: 'PUBLISHED',
    createdBy,
  });
}

beforeEach(async () => {
  // Clean only submissions before each test to avoid affecting other suites
  await Submission.deleteMany({});

  // Reset and set default OnlineCompilerExecutor mock that returns ACCEPTED
  OnlineCompilerExecutor.execute.mockReset().mockResolvedValue({
    success: true,
    status: 'success',
    exitCode: 0,
    stdout: '3\n',
    stderr: '',
    time: 0.01,
    memory: 1024,
  });
});

afterEach(async () => {
  // Clean up other collections to avoid test interference
  await User.deleteMany({});
  await Batch.deleteMany({});
  await Problem.deleteMany({});
  await TestCase.deleteMany({});
});

afterAll(() => {
  jest.restoreAllMocks();
});


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

    OnlineCompilerExecutor.execute.mockResolvedValue({
      success: true,
      status: 'success',
      exitCode: 0,
      stdout: '3\n',
      stderr: '',
      time: 0.01,
      memory: 1024,
    });

    // Act: student submits code (enrolled in the problem's batch)
    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: student._id, status: 'ACTIVE' });
    const studentToken = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){return 3;}', language: 'typescript' });

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

    OnlineCompilerExecutor.execute.mockResolvedValue({
      success: true,
      status: 'success',
      exitCode: 0,
      stdout: '4\n',
      stderr: '',
      time: 0.01,
      memory: 1024,
    });

    const studentEmail = `student2${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: student._id, status: 'ACTIVE' });
    const studentToken = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){return 4;}', language: 'typescript' });

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

    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      success: false,
      status: 'compile_error',
      exitCode: 1,
      stdout: '',
      stderr: 'Syntax error',
      compile_output: 'Syntax error',
      time: 0,
      memory: 0,
    });

    const studentEmail = `student3${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: student._id, status: 'ACTIVE' });
    const studentToken = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){', language: 'typescript' });

    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('COMPILATION_ERROR');
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/student/submissions')
      .send({ problemId: 'dummy', code: 'code', language: 'typescript' });
    expect(res.status).toBe(401);
  });

  test('non‑student role returns 403', async () => {
    const adminEmail = `admin2${uniqueSuffix()}@test.com`;
    const admin = await createUser({ name: 'Admin', email: adminEmail, password: 'pwd', role: 'ADMIN' });
    const adminToken = await loginAndGetToken(admin.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problemId: 'dummy', code: 'code', language: 'typescript' });
    expect(res.status).toBe(403);
  });
});

describe('Submission Compiler Enforcement (per-language resolution is authoritative)', () => {
  test('submission executes the compiler resolved from problem.compilers for the language', async () => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [['c', 'gcc-15']] });
    await TestCase.create({ problem: problem._id, input: '5\n12 35 1 10 34', expectedOutput: '34' });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'int main(){return 0;}', language: 'c' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(OnlineCompilerExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'c', compilerId: 'gcc-15' })
    );
    const stored = await Submission.findOne({ student: student._id });
    expect(stored.language).toBe('c');
  });

  test('client compilerId CANNOT override the server-resolved compiler', async () => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [['c', 'gcc-15']] });
    await TestCase.create({ problem: problem._id, input: '1', expectedOutput: '1' });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'int main(){return 0;}', language: 'c', compilerId: 'python-3.14' });

    expect(res.status).toBe(201);
    // Client python compiler must NOT be used — problem.compilers for 'c' wins
    expect(OnlineCompilerExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'c', compilerId: 'gcc-15' })
    );
    const stored = await Submission.findOne({ student: student._id });
    expect(stored.language).toBe('c');
  });

  test('language not in allowedLanguages returns 400', async () => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [['c', 'gcc-15']] });
    await TestCase.create({ problem: problem._id, input: '1', expectedOutput: '1' });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'print("hi")', language: 'python' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Language not supported for this problem');
  });

  test('problem without configured compiler for language returns COMPILER_NOT_CONFIGURED', async () => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [['c', 'gcc-15']] });
    // Remove the compilers map entry to simulate an unconfigured language
    await Problem.findByIdAndUpdate(problem._id, { $unset: { compilers: '' } });
    await TestCase.create({ problem: problem._id, input: '1', expectedOutput: '1' });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'int main(){return 0;}', language: 'c' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPILER_NOT_CONFIGURED');
  });

  test('problem with unsupported compiler returns COMPILER_NOT_SUPPORTED', async () => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [['c', 'cobol-1']] });
    await TestCase.create({ problem: problem._id, input: '1', expectedOutput: '1' });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'int main(){return 0;}', language: 'c' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPILER_NOT_SUPPORTED');
  });

  test('problem with no test cases returns NO_TEST_CASES_CONFIGURED', async () => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [['c', 'gcc-15']] });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'int main(){return 0;}', language: 'c' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_TEST_CASES_CONFIGURED');
  });

  test.each([
    ['python', 'python-3.14'],
    ['c', 'gcc-15'],
    ['cpp', 'g++-15'],
    ['java', 'openjdk-25'],
    ['typescript', 'typescript-deno'],
  ])('registry language accepted: %s → %s', async (language, expectedCompilerId) => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [[language, expectedCompilerId]] });
    await TestCase.create({ problem: problem._id, input: '1', expectedOutput: '1' });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'code', language });

    expect(res.status).toBe(201);
    expect(OnlineCompilerExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ language, compilerId: expectedCompilerId })
    );
    const stored = await Submission.findOne({ student: student._id });
    expect(stored.language).toBe(language);
  });

  test('javascript is rejected as UNSUPPORTED_LANGUAGE', async () => {
    const admin = await createUser({ name: 'Admin', email: `a${uniqueSuffix()}@test.com`, password: 'pwd', role: 'ADMIN' });
    const problem = await createConfiguredProblem({ createdBy: admin._id, languages: [['typescript', 'typescript-deno']] });
    await TestCase.create({ problem: problem._id, input: '1', expectedOutput: '1' });

    const studentEmail = `s${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: problem._id.toString(), code: 'console.log(1)', language: 'javascript' });

    // javascript is not in the problem's allowedLanguages → rejected before resolution
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Language not supported for this problem');
  });
});

// GET endpoint tests
describe('Student Submission History Endpoints', () => {
  test('authenticated student can list submissions', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: student._id, status: 'ACTIVE' });
    const studentToken = await loginAndGetToken(student.email, password);
    const submitRes = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){return 3;}', language: 'typescript' });
    expect(submitRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThan(0);
    const sub = listRes.body.data[0];
    expect(sub.id).toBe(submitRes.body.data.id);
    expect(sub.problem).toBe(problemId);
    expect(sub.language).toBe('typescript');
    expect(sub.verdict).toBe('ACCEPTED');
  });

  test('authenticated student can retrieve a specific submission', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: student._id, status: 'ACTIVE' });
    const studentToken = await loginAndGetToken(student.email, password);
    const submitRes = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ problemId, code: 'function solution(){return 3;}', language: 'typescript' });
    const subId = submitRes.body.data.id;

    const getRes = await request(app)
      .get(`/api/student/submissions/${subId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    const data = getRes.body.data;
    expect(data.id).toBe(subId);
    expect(data.problem).toBe(problemId);
    expect(data.language).toBe('typescript');
    expect(data.verdict).toBe('ACCEPTED');
    expect(Array.isArray(data.testResults)).toBe(true);
  });

  test('list returns empty array when no submissions', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;

    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);

    const listRes = await request(app)
      .get('/api/student/submissions')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBe(0);
  });

  test('unauthenticated request returns 401 for list', async () => {
    const res = await request(app).get('/api/student/submissions');
    expect(res.status).toBe(401);
  });

  test('non‑student role returns 403 for list', async () => {
    const adminEmail = `admin${uniqueSuffix()}@test.com`;
    const admin = await createUser({ name: 'Admin', email: adminEmail, password: 'pwd', role: 'ADMIN' });
    const adminToken = await loginAndGetToken(admin.email, 'pwd');
    const res = await request(app)
      .get('/api/student/submissions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  test('invalid submission ID returns 400', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);
    const res = await request(app)
      .get('/api/student/submissions/invalid-id')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(400);
  });

  test('nonexistent submission returns 404', async () => {
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, password);
    const nonExistentId = '64b8c8f8c8c8c8c8c8c8c8c8'; // valid ObjectId format but not present
    const res = await request(app)
      .get(`/api/student/submissions/${nonExistentId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });

  test('student cannot access another student\'s submission', async () => {
    // Student A creates a submission
    const { adminToken, trainer, password } = await createAdminAndTrainer();
    const trainerToken = await loginAndGetToken(trainer.email, password);
    const batchRes = await createBatch(adminToken, trainer._id);
    const batchId = batchRes.body.data.id;
    const problemRes = await createProblem(trainerToken, batchId);
    const problemId = problemRes.body.data.id;
    await addTestCase(trainerToken, problemId, { input: '1 2', expectedOutput: '3' });

    const studentAEmail = `studentA${uniqueSuffix()}@test.com`;
    const studentA = await createUser({ name: 'StudentA', email: studentAEmail, password, role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: studentA._id, status: 'ACTIVE' });
    const tokenA = await loginAndGetToken(studentA.email, password);
    const submitRes = await request(app)
      .post('/api/student/submissions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemId, code: 'function solution(){return 3;}', language: 'typescript' });
    const subId = submitRes.body.data.id;

    // Student B attempts to fetch Student A's submission
    const studentBEmail = `studentB${uniqueSuffix()}@test.com`;
    const studentB = await createUser({ name: 'StudentB', email: studentBEmail, password, role: 'STUDENT' });
    const tokenB = await loginAndGetToken(studentB.email, password);
    const res = await request(app)
      .get(`/api/student/submissions/${subId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});
