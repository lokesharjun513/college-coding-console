const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
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
  const suffix = uniqueSuffix();
  return `${base.replace('@', `${suffix}@`)}`;
}

async function createAdmin() {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const password = 'StrongP@ssw0rd';
  await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
  const adminToken = await loginAndGetToken(adminEmail, password);
  return { adminToken, password };
}

describe('Admin Problems API', () => {
  let adminToken;

  beforeAll(async () => {
    const { adminToken: token } = await createAdmin();
    adminToken = token;
  });

  afterAll(async () => {
    // Clean up: delete all admin-created problems
    await Problem.deleteMany({ createdBy: { $exists: true } });
  });

  describe('POST /api/admin/problems/import', () => {
    test('creates valid problems from array', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            {
              title: 'Two Sum Test',
              description: 'Test problem for validation',
              difficulty: 'EASY',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.created).toBe(1);
    });

    test('requires array of problems', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: { title: 'Invalid' },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Expected an array of problems');
    });

    test('validates required fields', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            { title: 'Missing fields' }, // missing description, difficulty
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.failed).toBe(1);
      expect(res.body.errors.length).toBe(1);
      expect(res.body.errors[0].message).toContain('Missing required fields');
    });

    test('validates difficulty enum', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            {
              title: 'Invalid Difficulty',
              description: 'Test',
              difficulty: 'BEGINNER', // invalid
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.failed).toBe(1);
      expect(res.body.errors.length).toBe(1);
      expect(res.body.errors[0].field).toBe('difficulty');
    });

    test('generates slug from title', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            {
              title: 'Two Sum Test Again',
              description: 'Test',
              difficulty: 'EASY',
            },
          ],
        });

      expect(res.body.summary.created).toBe(1);
      const problem = await Problem.findOne({ title: 'Two Sum Test Again' });
      expect(problem).toBeTruthy();
      expect(problem.slug).toBe('two-sum-test-again');
    });

    test('handles duplicates with idempotent behavior', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            {
              title: 'Two Sum Test Again', // duplicate slug
              description: 'Another attempt',
              difficulty: 'MEDIUM',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Existing problem is reused - no new problem created, no failure
      expect(res.body.summary.created).toBe(0);
      expect(res.body.summary.failed).toBe(0);
    });

    test('handles multiple valid and invalid', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            { title: 'Valid 1', description: 'Test', difficulty: 'EASY' },
            { title: 'Invalid' }, // missing required
            { title: 'Valid 2', description: 'Test', difficulty: 'HARD' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.summary.total).toBe(3);
      expect(res.body.summary.created).toBe(2);
      expect(res.body.summary.failed).toBe(1);
    });

    test('defaults scope to GLOBAL', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            {
              title: 'Global Default',
              description: 'Test',
              difficulty: 'EASY',
            },
          ],
        });

      const problem = await Problem.findOne({ title: 'Global Default' });
      expect(problem.scope).toBe('GLOBAL');
      expect(problem.batch).toBeUndefined();
    });

    test('supports optional fields', async () => {
      const res = await request(app)
        .post('/api/admin/problems/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          problems: [
            {
              title: 'Full Problem',
              description: 'Full test',
              difficulty: 'MEDIUM',
              constraints: '1 <= n <= 100',
              examples: [{ input: '3', output: '[0,1,2]', explanation: 'Test' }],
              starterCode: { python: 'def solve(): pass' },
              allowedLanguages: ['python', 'typescript'],
              status: 'PUBLISHED',
            },
          ],
        });

      const problem = await Problem.findOne({ title: 'Full Problem' });
      expect(problem.constraints).toBe('1 <= n <= 100');
      expect(problem.examples).toHaveLength(1);
      expect(problem.starterCode.python).toBe('def solve(): pass');
      expect(problem.status).toBe('PUBLISHED');
    });
  });

  describe('GET /api/admin/problems/template', () => {
    test('downloads JSON template', async () => {
      const res = await request(app)
        .get('/api/admin/problems/template')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain('problem_template.json');

      const body = res.body;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      const template = body[0];
      expect(template).toHaveProperty('collection');
      expect(template).toHaveProperty('topic');
      expect(template).toHaveProperty('problem');
      const problem = template.problem;
      expect(problem).toHaveProperty('title');
      expect(problem).toHaveProperty('description');
      expect(problem).toHaveProperty('difficulty');
      expect(problem).toHaveProperty('examples');
      expect(problem).toHaveProperty('starterCode');
      expect(problem).toHaveProperty('allowedLanguages');
      expect(problem).toHaveProperty('scope');
      expect(problem.scope).toBe('GLOBAL');
      expect(problem).not.toHaveProperty('batch');
      expect(problem).not.toHaveProperty('createdBy');
    });
  });
});
