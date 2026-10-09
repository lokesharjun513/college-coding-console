// backend/tests/studentConsole.test.js
// Comprehensive tests for the student free console endpoint

const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');
const OnlineCompilerExecutor = require('../src/services/OnlineCompilerExecutor');

jest.mock('../src/services/OnlineCompilerExecutor', () => ({
  execute: jest.fn(),
}));

async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

beforeEach(async () => {
  await User.deleteMany({});
  OnlineCompilerExecutor.execute.mockResolvedValue({
    stdout: 'Hello, PEC Student\n',
    stderr: '',
    exitCode: 0,
    time: 0.01,
    memory: 256,
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('Student Free Console Endpoint', () => {
  test('1. valid student execution returns success', async () => {
    const email = `student${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Console Student', email, password, role: 'STUDENT' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'c',
        code: '#include <stdio.h>\nint main() { printf("Hello, PEC Student\\n"); return 0; }',
        stdin: '',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('success');
    expect(res.body.output).toBe('Hello, PEC Student\n');
    expect(res.body.exitCode).toBe(0);
  });

  test('2. missing code returns 400', async () => {
    const email = `student${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Console Student', email, password, role: 'STUDENT' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'c',
        code: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('3. unsupported language returns 400', async () => {
    const email = `student${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Console Student', email, password, role: 'STUDENT' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'ruby',
        code: 'puts "hello"',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('invalid_request');
  });

  test('4. provider exception returns 502 compiler_unavailable', async () => {
    OnlineCompilerExecutor.execute.mockRejectedValueOnce(new Error('OnlineCompiler service unavailable'));

    const email = `student${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Console Student', email, password, role: 'STUDENT' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'c',
        code: '#include <stdio.h>\nint main() { return 0; }',
      });

    console.log('Test 4 response:', res.status, res.body);
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('compiler_unavailable');
  });

  test('5. compile error returns success false with compile_error status', async () => {
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      stdout: '',
      stderr: 'main.c:2:5: error: expected \';\' before \'return\'',
      exitCode: 1,
    });

    const email = `student${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Console Student', email, password, role: 'STUDENT' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'c',
        code: '#include <stdio.h>\nint main() { printf("hi") return 0; }',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('compile_error');
    expect(res.body.error).toContain('error:');
  });

  test('6. timeout returns 408 timeout', async () => {
    const timeoutError = new Error('Code execution service timed out. Please try again.');
    timeoutError.code = 'ONLINE_COMPILER_TIMEOUT';
    OnlineCompilerExecutor.execute.mockRejectedValueOnce(timeoutError);

    const email = `student${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Console Student', email, password, role: 'STUDENT' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'c',
        code: '#include <stdio.h>\nint main() { while(1); }',
      });

    expect(res.status).toBe(408);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('timeout');
    expect(res.body.error).toBe('Code execution service timed out. Please try again.');
  });

  test('7. unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/student/console/run')
      .send({
        language: 'c',
        code: '#include <stdio.h>\nint main() { return 0; }',
      });

    expect(res.status).toBe(401);
  });

  test('8. non-STUDENT request returns 403', async () => {
    const email = `trainer${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Trainer User', email, password, role: 'TRAINER' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'c',
        code: '#include <stdio.h>\nint main() { return 0; }',
      });

    expect(res.status).toBe(403);
  });

  test('9. stdin input reaches OnlineCompilerExecutor via input field (10 20 → 30)', async () => {
    OnlineCompilerExecutor.execute.mockResolvedValueOnce({
      stdout: '30\n',
      stderr: '',
      exitCode: 0,
    });

    const email = `student${uniqueSuffix()}@test.com`;
    const password = 'StrongP@ssw0rd';
    await createUser({ name: 'Console Student', email, password, role: 'STUDENT' });
    const token = await loginAndGetToken(email, password);

    const res = await request(app)
      .post('/api/student/console/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'c',
        code: '#include <stdio.h>\nint main() { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); return 0; }',
        input: '10 20',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.output).toBe('30\n');
    expect(res.body.exitCode).toBe(0);

    expect(OnlineCompilerExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'c',
        stdin: '10 20',
      })
    );
  });
});
