require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
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


describe('Authorization', () => {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const trainerEmail = generateUniqueEmail('trainer@testmail.com');
  const studentEmail = generateUniqueEmail('student@testmail.com');
  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    const { connectDB } = require('../src/config/db');
    await connectDB();
  });

  afterAll(async () => {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await User.deleteMany({ email: /@testmail\.com$/ });
  });

  test('Admin token accesses admin endpoint', async () => {
    await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    const token = await loginAndGetToken(adminEmail, password);
    const res = await request(app).get('/api/test/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Admin token forbidden on trainer endpoint', async () => {
    await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    const token = await loginAndGetToken(adminEmail, password);
    const res = await request(app).get('/api/test/trainer').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('Admin token forbidden on student endpoint', async () => {
    await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    const token = await loginAndGetToken(adminEmail, password);
    const res = await request(app).get('/api/test/student').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('Admin token accesses staff endpoint', async () => {
    await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    const token = await loginAndGetToken(adminEmail, password);
    const res = await request(app).get('/api/test/staff').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('Trainer token accesses trainer endpoint', async () => {
    await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
    const token = await loginAndGetToken(trainerEmail, password);
    const res = await request(app).get('/api/test/trainer').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('Trainer token forbidden on admin endpoint', async () => {
    await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
    const token = await loginAndGetToken(trainerEmail, password);
    const res = await request(app).get('/api/test/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('Trainer token accesses staff endpoint', async () => {
    await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
    const token = await loginAndGetToken(trainerEmail, password);
    const res = await request(app).get('/api/test/staff').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('Trainer token forbidden on student endpoint', async () => {
    await createTestUser({ name: 'Trainer', email: trainerEmail, password, role: 'TRAINER' });
    const token = await loginAndGetToken(trainerEmail, password);
    const res = await request(app).get('/api/test/student').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('Student token accesses student endpoint', async () => {
    await createTestUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const token = await loginAndGetToken(studentEmail, password);
    const res = await request(app).get('/api/test/student').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('Student token forbidden on admin endpoint', async () => {
    await createTestUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const token = await loginAndGetToken(studentEmail, password);
    const res = await request(app).get('/api/test/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('Student token forbidden on trainer endpoint', async () => {
    await createTestUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const token = await loginAndGetToken(studentEmail, password);
    const res = await request(app).get('/api/test/trainer').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('Student token forbidden on staff endpoint', async () => {
    await createTestUser({ name: 'Student', email: studentEmail, password, role: 'STUDENT' });
    const token = await loginAndGetToken(studentEmail, password);
    const res = await request(app).get('/api/test/staff').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('No token returns 401 on all protected endpoints', async () => {
    const endpoints = ['/api/test/admin', '/api/test/trainer', '/api/test/student', '/api/test/staff'];
    for (const ep of endpoints) {
      const res = await request(app).get(ep);
      expect(res.status).toBe(401);
    }
  });

  test('Invalid token returns 401 on all protected endpoints', async () => {
    const endpoints = ['/api/test/admin', '/api/test/trainer', '/api/test/student', '/api/test/staff'];
    for (const ep of endpoints) {
      const res = await request(app).get(ep).set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    }
  });
});
