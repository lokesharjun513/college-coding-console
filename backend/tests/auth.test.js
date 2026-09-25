require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');
const jwt = require('jsonwebtoken');

/**
 * Helper to create a user with a hashed password.
 */
async function createTestUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

describe('Authentication', () => {
  const testEmail = 'authuser@testmail.com';
  const testPassword = 'StrongP@ssw0rd';

  beforeAll(async () => {
    // Ensure DB connection (already handled by other tests, but safe)
    const { connectDB } = require('../src/config/db');
    await connectDB();
  });

  afterAll(async () => {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await User.deleteMany({ email: /authuser@testmail.com$/ });
  });

  test('Valid login succeeds', async () => {
    await createTestUser({ name: 'Auth User', email: testEmail, password: testPassword });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  test('Wrong password returns 401', async () => {
    await createTestUser({ name: 'Auth User', email: testEmail, password: testPassword });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongPassword' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('Unknown email returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@testmail.com', password: testPassword });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('Missing email/password returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('Invalid email format returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'invalid-email', password: testPassword });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('Inactive user cannot login', async () => {
    await createTestUser({ name: 'Inactive User', email: testEmail, password: testPassword, status: 'INACTIVE' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('Access token contains sub and role', async () => {
    await createTestUser({ name: 'Auth User', email: testEmail, password: testPassword, role: 'ADMIN' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    const token = loginRes.body.token;
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    expect(payload.sub).toBeDefined();
    expect(payload.role).toBe('ADMIN');
  });

  test('Missing Authorization header returns 401 on /auth/me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('Invalid JWT returns 401 on /auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('Valid JWT allows /auth/me and does not return passwordHash', async () => {
    const user = await createTestUser({ name: 'Auth User', email: testEmail, password: testPassword });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    const token = loginRes.body.token;
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    const userInfo = meRes.body.user;
    expect(userInfo).toHaveProperty('id');
    expect(userInfo).toHaveProperty('name', 'Auth User');
    expect(userInfo).toHaveProperty('email', testEmail);
    expect(userInfo).toHaveProperty('role', 'STUDENT');
    expect(userInfo).toHaveProperty('status', 'ACTIVE');
    expect(userInfo).not.toHaveProperty('passwordHash');
  });

  test('Deleted user cannot access /auth/me', async () => {
    const user = await createTestUser({ name: 'Auth User', email: testEmail, password: testPassword });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    const token = loginRes.body.token;
    // Delete the user
    await User.deleteOne({ _id: user._id });
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
    expect(meRes.body.success).toBe(false);
  });

  test('Inactive user cannot access /auth/me', async () => {
    const user = await createTestUser({ name: 'Auth User', email: testEmail, password: testPassword, status: 'INACTIVE' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    // Login should have failed, but we still test the middleware directly
    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
    );
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
    expect(meRes.body.success).toBe(false);
  });
});
