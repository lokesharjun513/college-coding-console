const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const authService = require('../src/auth/authService');
const jwt = require('jsonwebtoken');

/**
 * Helper to create a user with a hashed password.
 */
async function createTestUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

describe('Admin Student Management', () => {
  const adminEmail = 'admin@testmail.com';
  const adminPassword = 'AdminPassword123!';
  let adminToken;

  beforeAll(async () => {
    // Create admin user for auth
    const admin = await createTestUser({ name: 'Admin', email: adminEmail, password: adminPassword, role: 'ADMIN' });
    adminToken = jwt.sign(
      { sub: admin._id.toString(), role: 'ADMIN' },
      process.env.JWT_ACCESS_SECRET || 'testsecret'
    );
  });

  afterEach(async () => {
    // Clean up students
    await Student.deleteMany({});
    await User.deleteMany({ role: 'STUDENT' });
  });

  afterAll(async () => {
    await User.deleteMany({ email: adminEmail });
  });

  test('Successful student creation and password behavior', async () => {
    const studentData = {
      name: 'Test Student',
      email: 'student@example.com',
      rollNumber: 'S001',
      department: 'CSE',
      academicBatch: { startYear: 2023, endYear: 2027 }
    };
    const res = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(studentData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(studentData.name);
    expect(res.body.data).not.toHaveProperty('passwordHash');
    expect(res.body.data).toHaveProperty('email'); // email can be returned, passwordHash not

    const student = await User.findOne({ email: 'student@example.com' }).select('+passwordHash');
    expect(student).toBeDefined();
    expect(student.passwordHash).toBeDefined();

    // The initial password must NOT be derivable from public data. It used to be
    // the email local part ('student'), which let anyone who knew the address
    // sign in as the new student.
    const isLegacyGuess = await authService.verifyPassword('student', student.passwordHash);
    expect(isLegacyGuess).toBe(false);

    // It is returned exactly once so an admin can distribute it, and it is the
    // password the account actually has.
    expect(res.body.data.initialPassword).toBeDefined();
    expect(res.body.data.initialPassword).not.toBe('student');
    expect(res.body.data.initialPassword.length).toBeGreaterThanOrEqual(12);
    const isMatch = await authService.verifyPassword(
      res.body.data.initialPassword,
      student.passwordHash
    );
    expect(isMatch).toBe(true);
  });

  test('Required-field validation', async () => {
    const res = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('Academic batch validation (endYear > startYear)', async () => {
    const studentData = {
      name: 'Test Student',
      email: 'student2@example.com',
      rollNumber: 'S002',
      department: 'CSE',
      academicBatch: { startYear: 2027, endYear: 2023 }
    };
    const res = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(studentData);
    expect(res.status).toBe(400);
  });

  test('Invalid department', async () => {
    const studentData = {
      name: 'Test Student',
      email: 'student3@example.com',
      rollNumber: 'S003',
      department: 'INVALID',
      academicBatch: { startYear: 2023, endYear: 2027 }
    };
    const res = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(studentData);
    expect(res.status).toBe(400);
  });

  test('GET list students', async () => {
    // Create via API to ensure Student and User are both created
    const createRes = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Student 1', email: 's1@example.com', rollNumber: 'S010', department: 'CSE', academicBatch: { startYear: 2023, endYear: 2027 } });
    expect(createRes.status).toBe(201);
    const res = await request(app)
      .get('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  test('PATCH student', async () => {
    // Create via API
    const createRes = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'S1', email: 's1@example.com', rollNumber: 'S004', department: 'CSE', academicBatch: { startYear: 2023, endYear: 2027 } });
    expect(createRes.status).toBe(201);
    const studentId = createRes.body.data.id;
    const res = await request(app)
      .patch(`/api/admin/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'S1 Updated', email: 's1@example.com', rollNumber: 'S004', department: 'CSE', academicBatch: { startYear: 2023, endYear: 2027 } });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('S1 Updated');
  });

  test('DELETE student', async () => {
    // Create via API
    const createRes = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'S1', email: 's1@example.com', rollNumber: 'S005', department: 'CSE', academicBatch: { startYear: 2023, endYear: 2027 } });
    expect(createRes.status).toBe(201);
    const studentId = createRes.body.data.id;
    const res = await request(app)
      .delete(`/api/admin/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
