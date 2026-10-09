const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const Problem = require('../src/models/Problem');
const authService = require('../src/auth/authService');

async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Regression Test: 50 Problems Import', () => {
  let adminToken;

  beforeAll(async () => {
    const adminEmail = 'admin_reg_test@test.com';
    const password = 'StrongP@ssw0rd';
    await User.deleteMany({ email: adminEmail });
    await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, password);
  });

  afterAll(async () => {
    await Problem.deleteMany({});
    await Collection.deleteMany({});
    await Topic.deleteMany({});
  });

  test('Should import 50 problems successfully', async () => {
    const problems = Array.from({ length: 50 }, (_, i) => ({
      title: `Problem ${i}`,
      description: `Description ${i}`,
      difficulty: 'EASY',
      scope: 'GLOBAL',
      status: 'PUBLISHED',
    }));

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems });

    if (res.body.success !== true) {
      console.log('Import Failed Body:', JSON.stringify(res.body, null, 2));
    }
    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(50);
  });
});
