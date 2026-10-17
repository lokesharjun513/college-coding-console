// Tests that POST /api/student/console/run is governed by the code-execution
// rate limiter, not the general student one.
//
// `consoleLimiter` is defined in src/middleware/rateLimiter.js with its own
// CONSOLE_RATE_LIMIT_MAX budget but was never referenced by any route, so the
// Free Console ran under STUDENT_RATE_LIMIT_MAX (30/min) shared with every other
// student endpoint. Every one of those requests spends a slot in the provider's
// four concurrent synchronous executions per API key, so the purpose-built limit
// is the correct one.
//
// Kept in its own file on purpose: the limiter keeps its counters in a
// module-level Map, and jest gives every test file a fresh module registry, so
// this file's counters cannot leak into studentFreeConsole.test.js.

const request = require('supertest');

// Must be set before src/app.js is required: createRateLimiter reads its window
// and maximum from the environment when the module is first evaluated.
process.env.ENABLE_RATE_LIMIT_IN_TESTS = 'true';
process.env.CONSOLE_RATE_LIMIT_MAX = '3';

const app = require('../src/app');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');

jest.mock('../src/services/OnlineCompilerExecutor', () => ({ execute: jest.fn() }));
const { execute } = require('../src/services/OnlineCompilerExecutor');

jest.mock('../src/services/compilerRegistry', () => {
  const actual = jest.requireActual('../src/services/compilerRegistry');
  return { ...actual, mapLegacyToCompiler: jest.fn(), getCompilerById: jest.fn() };
});
const { mapLegacyToCompiler, getCompilerById, LEGACY_TO_COMPILER } = require('../src/services/compilerRegistry');

const providerSuccess = {
  output: 'ok\n',
  error: '',
  status: 'success',
  exit_code: 0,
  signal: null,
  time: '0.0100',
  total: '0.0200',
  memory: '14000',
};

let token;

beforeAll(async () => {
  const passwordHash = await authService.hashPassword('pwd');
  const user = await User.create({ name: 'S', email: 'limit@test.com', passwordHash, role: 'STUDENT', status: 'ACTIVE' });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'pwd' });
  token = res.body.token;
});

beforeEach(() => {
  jest.clearAllMocks();
  mapLegacyToCompiler.mockImplementation((lang) => LEGACY_TO_COMPILER[lang] || null);
  getCompilerById.mockImplementation(async (id) => (id ? { id, name: id } : null));
  execute.mockResolvedValue(providerSuccess);
});

const run = () =>
  request(app).post('/api/student/console/run').set('Authorization', `Bearer ${token}`).send({ language: 'python', code: 'print(1)' });

test('code execution stops at the console budget and says so', async () => {
  // CONSOLE_RATE_LIMIT_MAX is 3 for this file.
  const statuses = [];
  for (let i = 0; i < 5; i += 1) {
    statuses.push((await run()).status);
  }

  // Under the previous wiring this endpoint had a 30/min budget, so all five
  // would have reached the provider.
  expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
  expect(statuses.slice(3)).toEqual([429, 429]);

  // The refused calls never cost a provider request.
  expect(execute).toHaveBeenCalledTimes(3);
});

test('a throttled run is refused with the limiter code and a Retry-After', async () => {
  // The budget is already spent by the previous test in this file (same IP, same
  // 60s window), so every call here is throttled.
  const res = await run();

  expect(res.status).toBe(429);
  expect(res.body.success).toBe(false);
  expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  expect(res.body.message).toMatch(/code executions/i);
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
});

test('the limiter does not apply to the language list', async () => {
  const res = await request(app).get('/api/student/console/languages').set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
});
