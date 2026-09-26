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

describe('Admin Trainer Management', () => {
  const adminEmail = generateUniqueEmail('admin@testmail.com');
  const trainerEmail = generateUniqueEmail('trainer@testmail.com');
  const studentEmail = generateUniqueEmail('student@testmail.com');
  const password = 'StrongP@ssw0rd';

  beforeAll(async () => {
    
    // DB connection managed globally by setup.js
    await User.deleteMany({});
  });

  
  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('CREATE TRAINER', () => {
    test('should create trainer successfully', async () => {
      // Create admin user
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          email: 'trainer@example.com',
          password: 'Password123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('John Trainer');
      expect(res.body.data.email).toBe('trainer@example.com');
      expect(res.body.data.role).toBe('TRAINER');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    test('should return 400 for missing name', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'trainer@example.com',
          password: 'Password123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Name, email, and password are required');
    });

    test('should return 400 for missing email', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          password: 'Password123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Name, email, and password are required');
    });

    test('should return 400 for missing password', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          email: 'trainer@example.com'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Name, email, and password are required');
    });

    test('should return 400 for invalid email format', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          email: 'invalid-email',
          password: 'Password123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid email format');
    });

    test('should return 400 for weak password (less than 8 chars)', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          email: 'trainer@example.com',
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Password must be at least 8 characters long');
    });

    test('should return 409 for duplicate email', async () => {
      // Create admin user
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      // Create existing trainer with same email
      await createTestUser({
        name: 'Existing Trainer',
        email: 'trainer@example.com',
        password: 'existingpass123',
        role: 'TRAINER'
      });

      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          email: 'trainer@example.com',
          password: 'Password123'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('User with this email already exists');
    });

    test('should force role to TRAINER even if ADMIN requested', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          email: 'trainer@example.com',
          password: 'Password123',
          role: 'ADMIN' // Attempt to set role to ADMIN
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('TRAINER'); // Role should remain TRAINER
    });
  });

  describe('LIST TRAINERS', () => {
    test('should list only trainers', async () => {
      // Create admin user
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      // Create trainers
      await createTestUser({ name: 'Trainer 1', email: 'trainer1@example.com', password, role: 'TRAINER' });
      await createTestUser({ name: 'Trainer 2', email: 'trainer2@example.com', password, role: 'TRAINER', status: 'INACTIVE' });
      // Create admin and student (should not appear in list)
      await createTestUser({ name: 'Admin 2', email: 'admin2@example.com', password, role: 'ADMIN' });
      await createTestUser({ name: 'Student 1', email: 'student1@example.com', password, role: 'STUDENT' });

      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .get('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2); // Only trainers

      // Check that only trainers are returned
      res.body.data.forEach(trainer => {
        expect(trainer.role).toBe('TRAINER');
        expect(trainer).not.toHaveProperty('passwordHash');
      });

      // Check specific trainers
      const trainerEmails = res.body.data.map(t => t.email);
      expect(trainerEmails).toContain('trainer1@example.com');
      expect(trainerEmails).toContain('trainer2@example.com');
    });

    test('should return empty array when no trainers exist', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .get('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('GET SINGLE TRAINER', () => {
    test('should get trainer by id', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .get(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(trainer._id.toString());
      expect(res.body.data.name).toBe('John Trainer');
      expect(res.body.data.email).toBe('trainer@example.com');
      expect(res.body.data.role).toBe('TRAINER');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    test('should return 404 for nonexistent trainer id', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .get(`/api/admin/trainers/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trainer not found');
    });

    test('should return 404 for admin id supplied to trainer endpoint', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const adminUser = await createTestUser({
        name: 'Another Admin',
        email: 'admin2@example.com',
        password,
        role: 'ADMIN'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .get(`/api/admin/trainers/${adminUser._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trainer not found');
    });

    test('should return 404 for student id supplied to trainer endpoint', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const studentUser = await createTestUser({
        name: 'Student User',
        email: 'student@example.com',
        password,
        role: 'STUDENT'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .get(`/api/admin/trainers/${studentUser._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trainer not found');
    });
  });

  describe('UPDATE TRAINER', () => {
    test('should update trainer name successfully', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .patch(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Johnny Trainer'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Johnny Trainer');
      expect(res.body.data.email).toBe('trainer@example.com'); // Unchanged
      expect(res.body.data.role).toBe('TRAINER'); // Unchanged
      expect(res.body.data.status).toBe('ACTIVE'); // Unchanged
    });

    test('should update trainer email successfully', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .patch(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'newtrainer@example.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('newtrainer@example.com');
      expect(res.body.data.name).toBe('John Trainer'); // Unchanged
      expect(res.body.data.role).toBe('TRAINER'); // Unchanged
      expect(res.body.data.status).toBe('ACTIVE'); // Unchanged
    });

    test('should update trainer status successfully', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .patch(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'INACTIVE'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('INACTIVE');
      expect(res.body.data.name).toBe('John Trainer'); // Unchanged
      expect(res.body.data.email).toBe('trainer@example.com'); // Unchanged
      expect(res.body.data.role).toBe('TRAINER'); // Unchanged
    });

    test('should return 400 for invalid status value', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .patch(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'INVALID_STATUS'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Status must be either ACTIVE or INACTIVE');
    });

    test('should return 400 for duplicate email on update', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer1 = await createTestUser({
        name: 'Trainer 1',
        email: 'trainer1@example.com',
        password,
        role: 'TRAINER'
      });
      const trainer2 = await createTestUser({
        name: 'Trainer 2',
        email: 'trainer2@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .patch(`/api/admin/trainers/${trainer1._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'trainer2@example.com' // Try to use trainer2's email
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('User with this email already exists');
    });

    test('should not allow role modification through update', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .patch(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          role: 'ADMIN' // Attempt to change role
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('TRAINER'); // Role should remain TRAINER
    });

    test('should return 404 for nonexistent trainer id on update', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .patch(`/api/admin/trainers/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trainer not found');
    });
  });

  describe('DELETE TRAINER', () => {
    test('should delete trainer successfully', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .delete(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Trainer deleted successfully');
    });

    test('should return 404 for nonexistent trainer id on delete', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);
      const fakeId = '000000000000000000000000';

      const res = await request(app)
        .delete(`/api/admin/trainers/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trainer not found');
    });

    test('should not delete admin user through trainer endpoint', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const adminUser = await createTestUser({
        name: 'Another Admin',
        email: 'admin2@example.com',
        password,
        role: 'ADMIN'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .delete(`/api/admin/trainers/${adminUser._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trainer not found');
    });

    test('should not delete student user through trainer endpoint', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const studentUser = await createTestUser({
        name: 'Student User',
        email: 'student@example.com',
        password,
        role: 'STUDENT'
      });
      const token = await loginAndGetToken(adminEmail, password);

      const res = await request(app)
        .delete(`/api/admin/trainers/${studentUser._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Trainer not found');
    });
  });

  describe('AUTHORIZATION', () => {
    test('should return 401 for missing token', async () => {
      const res = await request(app).get('/api/admin/trainers');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Missing Authorization header');
    });

    test('should return 401 for invalid token', async () => {
      const res = await request(app)
        .get('/api/admin/trainers')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid token');
    });

    test('should return 403 for trainer accessing admin trainer endpoints', async () => {
      await createTestUser({ name: 'Trainer User', email: trainerEmail, password, role: 'TRAINER' });
      const token = await loginAndGetToken(trainerEmail, password);

      const endpoints = [
        { method: 'get', path: '/api/admin/trainers' },
        { method: 'post', path: '/api/admin/trainers' },
        { method: 'get', path: `/api/admin/trainers/000000000000000000000001` },
        { method: 'patch', path: `/api/admin/trainers/000000000000000000000001` },
        { method: 'delete', path: `/api/admin/trainers/000000000000000000000001` }
      ];

      for (const endpoint of endpoints) {
        let res;
        if (endpoint.method === 'get') {
          res = await request(app)
            .get(endpoint.path)
            .set('Authorization', `Bearer ${token}`);
        } else if (endpoint.method === 'post') {
          res = await request(app)
            .post(endpoint.path)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Test', email: 'test@test.com', password: 'test123' });
        } else if (endpoint.method === 'patch') {
          res = await request(app)
            .patch(endpoint.path)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Test' });
        } else if (endpoint.method === 'delete') {
          res = await request(app)
            .delete(endpoint.path)
            .set('Authorization', `Bearer ${token}`);
        }

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      }
    });

    test('should return 403 for student accessing admin trainer endpoints', async () => {
      await createTestUser({ name: 'Student User', email: studentEmail, password, role: 'STUDENT' });
      const token = await loginAndGetToken(studentEmail, password);

      const endpoints = [
        { method: 'get', path: '/api/admin/trainers' },
        { method: 'post', path: '/api/admin/trainers' },
        { method: 'get', path: `/api/admin/trainers/000000000000000000000001` },
        { method: 'patch', path: `/api/admin/trainers/000000000000000000000001` },
        { method: 'delete', path: `/api/admin/trainers/000000000000000000000001` }
      ];

      for (const endpoint of endpoints) {
        let res;
        if (endpoint.method === 'get') {
          res = await request(app)
            .get(endpoint.path)
            .set('Authorization', `Bearer ${token}`);
        } else if (endpoint.method === 'post') {
          res = await request(app)
            .post(endpoint.path)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Test', email: 'test@test.com', password: 'test123' });
        } else if (endpoint.method === 'patch') {
          res = await request(app)
            .patch(endpoint.path)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Test' });
        } else if (endpoint.method === 'delete') {
          res = await request(app)
            .delete(endpoint.path)
            .set('Authorization', `Bearer ${token}`);
        }

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      }
    });
  });

  describe('SECURITY', () => {
    test('should never expose passwordHash in responses', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const trainer = await createTestUser({
        name: 'John Trainer',
        email: 'trainer@example.com',
        password,
        role: 'TRAINER'
      });
      const token = await loginAndGetToken(adminEmail, password);

      // Test create response
      let res = await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Trainer',
          email: 'newtrainer@example.com',
          password: 'Password123'
        });
      expect(res.body.data).not.toHaveProperty('passwordHash');

      // Test list response
      res = await request(app)
        .get('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`);
      res.body.data.forEach(trainer => {
        expect(trainer).not.toHaveProperty('passwordHash');
      });

      // Test get response
      res = await request(app)
        .get(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.body.data).not.toHaveProperty('passwordHash');

      // Test update response
      res = await request(app)
        .patch(`/api/admin/trainers/${trainer._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    test('should prevent plaintext password storage in database', async () => {
      await createTestUser({ name: 'Admin User', email: adminEmail, password, role: 'ADMIN' });
      const token = await loginAndGetToken(adminEmail, password);

      await request(app)
        .post('/api/admin/trainers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Trainer',
          email: 'trainer@example.com',
          password: 'MyPlainTextPassword123'
        });

      // Check database directly
      const trainer = await User.findOne({ email: 'trainer@example.com' }).select('+passwordHash');
      expect(trainer).not.toBeNull();
      expect(trainer.passwordHash).not.toBe('MyPlainTextPassword123');
      expect(trainer.passwordHash.length).toBeGreaterThan(20); // Argon2 hash is long
    });
  });
});