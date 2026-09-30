const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');

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

async function createAdminAndGetToken() {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const password = 'StrongP@ssw0rd';
  await createTestUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
  return loginAndGetToken(adminEmail, password);
}

describe('Admin User Management', () => {
  beforeAll(async () => {
    await User.deleteMany({});
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('PATCH /api/admin/users/:id', () => {
    test('should update user successfully', async () => {
      const token = await createAdminAndGetToken();
      const user = await createTestUser({
        name: 'Original Name',
        email: generateUniqueEmail('user@example.com'),
        password: 'password123',
        role: 'STUDENT',
        status: 'ACTIVE'
      });

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
          email: user.email,
          role: 'STUDENT',
          status: 'INACTIVE'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.status).toBe('INACTIVE');
    });

    test('should return 400 for empty name', async () => {
      const token = await createAdminAndGetToken();
      const user = await createTestUser({
        name: 'Original Name',
        email: generateUniqueEmail('user@example.com'),
        password: 'password123',
        role: 'STUDENT',
        status: 'ACTIVE'
      });

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Name cannot be empty');
    });
  });
});
