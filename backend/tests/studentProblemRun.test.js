// backend/tests/studentProblemRun.test.js
// Tests for student problem run endpoint

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');
const OnlineCompilerExecutor = require('../src/services/OnlineCompilerExecutor');

// Mock the OnlineCompilerExecutor service
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

let app;

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

// Helper to create a problem (trainer only)
async function createProblem(trainerToken, batchId, overrides = {}) {
  const unique = uniqueSuffix();
  const defaultData = {
    title: `Test Problem ${unique}`,
    description: 'Test problem description',
    difficulty: 'EASY',
    allowedLanguages: ['python', 'typescript'],
    batch: batchId,
    createdBy: undefined, // will be set by auth middleware
    status: 'PUBLISHED',
  };
  // Filter out undefined values to avoid overriding defaults
  const filteredOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined)
  );
  const data = { ...defaultData, ...filteredOverrides };
  return await request(app)
    .post(`/api/trainer/batches/${batchId}/problems`)
    .set('Authorization', `Bearer ${trainerToken}`)
    .send(data);
}

describe('Student Problem Run Endpoint', () => {
  let adminToken;
  let trainerToken;
  let studentToken;
  let problemId;

  beforeAll(async () => {
    const appReq = require('../src/app');
    app = appReq;
  });

  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await Problem.deleteMany({});
    await Batch.deleteMany({});
    await BatchStudent.deleteMany({});

    // Reset and set default mock for OnlineCompilerExecutor
    OnlineCompilerExecutor.execute.mockReset().mockResolvedValue({
      success: true,
      status: 'success',
      exitCode: 0,
      stdout: 'Hello, World!\n',
      stderr: '',
      time: '0.0248',
      total: '0.0330',
      memory: '8192',
    });

    // Create admin, trainer, batch, problem, and student
    const adminEmail = `admin${uniqueSuffix()}@test.com`;
    const admin = await createUser({ name: 'Admin', email: adminEmail, password: 'StrongP@ssw0rd', role: 'ADMIN' });
    const adminLoginRes = await request(app).post('/api/auth/login').send({ email: adminEmail, password: 'StrongP@ssw0rd' });
    adminToken = adminLoginRes.body.token;
    if (!adminToken) throw new Error('Admin login failed: ' + JSON.stringify(adminLoginRes.body));

    const trainerEmail = `trainer${uniqueSuffix()}@test.com`;
    const trainer = await createUser({ name: 'Trainer', email: trainerEmail, password: 'StrongP@ssw0rd', role: 'TRAINER' });
    const trainerLoginRes = await request(app).post('/api/auth/login').send({ email: trainerEmail, password: 'StrongP@ssw0rd' });
    trainerToken = trainerLoginRes.body.token;
    if (!trainerToken) throw new Error('Trainer login failed: ' + JSON.stringify(trainerLoginRes.body));

    const batchRes = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Batch Name',
        code: `CODE${uniqueSuffix()}`,
        description: 'Batch description',
        trainer: trainer._id,
        status: 'ACTIVE',
        startDate: '2026-10-01',
        endDate: '2027-03-31',
      });
    if (!batchRes.body.data?.id) throw new Error('Batch creation failed: ' + JSON.stringify(batchRes.body));
    const batchId = batchRes.body.data.id;

    const problemRes = await createProblem(trainerToken, batchId);
    if (!problemRes.body.data?.id) throw new Error('Problem creation failed: ' + JSON.stringify(problemRes.body));
    problemId = problemRes.body.data.id;

    const studentEmail = `student${uniqueSuffix()}@test.com`;
    const student = await createUser({ name: 'Student', email: studentEmail, password: 'pwd', role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: student._id });
    const studentLoginRes = await request(app).post('/api/auth/login').send({ email: studentEmail, password: 'pwd' });
    studentToken = studentLoginRes.body.token;
    if (!studentToken) throw new Error('Student login failed: ' + JSON.stringify(studentLoginRes.body));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .send({ language: 'python', code: 'console.log(1);' });
    expect(res.status).toBe(401);
  });

  test('non-student receives 403', async () => {
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ language: 'python', code: 'console.log(1);' });
    expect(res.status).toBe(403);
  });

  test('invalid problem id returns 400', async () => {
    const res = await request(app)
      .post(`/api/student/problems/invalid-id/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log(1);' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('problem not found or inaccessible returns 404', async () => {
    const res = await request(app)
      .post(`/api/student/problems/${new mongoose.Types.ObjectId()}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log(1);' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('missing code returns 400', async () => {
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Language and code are required');
  });

  test('language is required — client cannot omit it and get a compiler', async () => {
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ code: 'console.log(1);' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Language and code are required');
  });

  test('language not in allowedLanguages returns 400', async () => {
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'c', code: 'int main(){return 0;}' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Language not supported for this problem');
  });

  test('client cannot override the server-resolved compiler with a different compilerId', async () => {
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', compilerId: 'typescript-deno', code: 'print(1)' });
    expect(res.status).toBe(200);
    // Client typescript compilerId must NOT win — python resolves to python-3.14
    expect(OnlineCompilerExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'python', compilerId: 'python-3.14' })
    );
  });

  test('oversized code returns 400', async () => {
    const largeCode = 'x'.repeat(101 * 1024); // 101 KB
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: largeCode });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('exceeds 100 KB limit');
  });

  test('oversized input returns 400', async () => {
    const largeInput = 'x'.repeat(101 * 1024); // 101 KB
    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log(process.argv[2]);', input: largeInput });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('exceeds 100 KB limit');
  });

  test('successful run returns 200 with normalized result', async () => {
    // Test both OnlineCompiler format (output/error) and Judge0 format (stdout/stderr)
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      output: 'Hello, World!\n',
      error: '',
      status: 'success',
      exit_code: 0,
      time: '0.0248',
      total: '0.0330',
      memory: '8192',
    });

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log("Hello, World!");' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('success');
    expect(res.body.data.output).toBe('Hello, World!\n');
    expect(res.body.data.error).toBe('');
    expect(res.body.data.exit_code).toBe(0);
    expect(res.body.data.time).toBe('0.0248');
    expect(res.body.data.memory).toBe('8192');
  });

  test('provider compilation error returns 200 with error status', async () => {
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      success: false,
      status: 'compile_error',
      exitCode: 1,
      stdout: '',
      stderr: 'Syntax error: unexpected token',
      compile_output: 'Syntax error: unexpected token',
      time: '0',
      total: '0.0010',
      memory: '0',
    });

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log("Hello, World!");}' }); // Invalid code

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('compile_error');
    expect(res.body.data.error).toBe('Syntax error: unexpected token');
  });

  test('provider runtime error returns 200 with error status', async () => {
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      success: false,
      status: 'error',
      exitCode: 1,
      stdout: '',
      stderr: 'Runtime error: ReferenceError: foo is not defined',
      time: '0.0100',
      total: '0.0200',
      memory: '4096',
    });

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log(foo);' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('error');
    expect(res.body.data.error).toBe('Runtime error: ReferenceError: foo is not defined');
  });

  test('provider timeout returns 408 with timeout message', async () => {
    const timeoutError = new Error('Code execution service timed out. Please try again.');
    timeoutError.code = 'ONLINE_COMPILER_TIMEOUT';
    OnlineCompilerExecutor.execute.mockRejectedValueOnce(timeoutError);

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'while(true);' });

    expect(res.status).toBe(408);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Code execution service timed out. Please try again.');
  });

  test('provider unavailable returns 500 with service unavailable message', async () => {
    OnlineCompilerExecutor.execute.mockRejectedValueOnce(new Error('OnlineCompiler error 502: Bad Gateway'));

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log(1);' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Code execution service is temporarily unavailable');
  });

  // Regression test: OnlineCompiler returns 'output'/'error', not 'stdout'/'stderr'
  test('successful C execution with OnlineCompiler format (output/error fields)', async () => {
    // Note: We use 'javascript' because the test problem only allows 'javascript'
    // This tests the response normalization, not C compilation itself
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      output: 'The second largest distinct element is: 34\n',
      error: '',
      status: 'success',
      exit_code: 0,
      signal: null,
      time: '0.0175',
      total: '0.0200',
      memory: '2872',
    });

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log("Hello");' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('success');
    expect(res.body.data.output).toBe('The second largest distinct element is: 34\n');
    expect(res.body.data.error).toBe('');
    expect(res.body.data.exit_code).toBe(0);
    expect(res.body.data.signal).toBe(null);
    expect(res.body.data.time).toBe('0.0175');
    expect(res.body.data.total).toBe('0.0200');
    expect(res.body.data.memory).toBe('2872');
  });

  test('successful Python execution with OnlineCompiler format', async () => {
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      output: 'Hello, World!\n',
      error: '',
      status: 'success',
      exit_code: 0,
      signal: null,
      time: '0.0248',
      total: '0.0330',
      memory: '8192',
    });

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'print("Hello, World!")' });

    expect(res.status).toBe(200);
    expect(res.body.data.output).toBe('Hello, World!\n');
    expect(res.body.data.exit_code).toBe(0);
    expect(res.body.data.status).toBe('success');
  });

  test('runtime error with OnlineCompiler format', async () => {
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      output: '',
      error: 'IndexError: list index out of range',
      status: 'error',
      exit_code: 1,
      signal: null,
      time: '0.0050',
      total: '0.0100',
      memory: '4096',
    });

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'print(a[100])' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('error');
    expect(res.body.data.output).toBe('');
    expect(res.body.data.error).toBe('IndexError: list index out of range');
    expect(res.body.data.exit_code).toBe(1);
  });

  test('compilation error with OnlineCompiler format', async () => {
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      output: '',
      error: 'SyntaxError: Unexpected token',
      status: 'compile_error',
      exit_code: 1,
      signal: null,
      time: '0.0010',
      total: '0.0020',
      memory: '0',
    });

    const res = await request(app)
      .post(`/api/student/problems/${problemId}/run`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ language: 'python', code: 'console.log("Hello");}' }); // Invalid JS

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('compile_error');
    expect(res.body.data.error).toContain('Unexpected token');
  });
});