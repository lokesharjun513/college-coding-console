// Tests for Student persistence and integration with User and Batch enrollment
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const Batch = require('../src/models/Batch');
const authService = require('../src/auth/authService');
const jwt = require('jsonwebtoken');

// Helper to create admin JWT
async function createAdminToken() {
  const uniqueEmail = `admin-${Date.now()}@test.com`;
  const admin = await User.create({
    name: 'Admin',
    email: uniqueEmail,
    passwordHash: await authService.hashPassword('AdminPass123!'),
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  return jwt.sign({ sub: admin._id.toString(), role: 'ADMIN' }, process.env.JWT_ACCESS_SECRET || 'testsecret');
}

describe('Student persistence and enrollment integration', () => {
  let adminToken;

  beforeAll(async () => {
    adminToken = await createAdminToken();
  });

  afterEach(async () => {
    // Clean up all collections used in tests
    await User.deleteMany({});
    await Student.deleteMany({});
    await Batch.deleteMany({});
  });

  test('Create student creates both User and Student records', async () => {
    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      rollNumber: 'R001',
      department: 'CSE',
      academicBatch: { startYear: 2023, endYear: 2027 },
    };
    const res = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const userId = res.body.data.id;
    const studentId = res.body.data.studentId;
    // Verify User exists
    const user = await User.findById(userId);
    expect(user).toBeDefined();
    expect(user.email).toBe(payload.email.toLowerCase());
    // Verify Student profile exists and links to User
    const student = await Student.findById(studentId);
    expect(student).toBeDefined();
    expect(student.userId.toString()).toBe(userId.toString());
    expect(student.email).toBe(user.email);
  });

  test('Duplicate email or rollNumber returns conflict', async () => {
    const payload = {
      name: 'Alice',
      email: 'alice@example.com',
      rollNumber: 'R002',
      department: 'CSE',
      academicBatch: { startYear: 2023, endYear: 2027 },
    };
    // First creation succeeds
    const first = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(first.status).toBe(201);
    // Second with same email
    const dupEmail = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, rollNumber: 'R003' });
    expect(dupEmail.status).toBe(409);
    // Second with same rollNumber
    const dupRoll = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, email: 'alice2@example.com' });
    expect(dupRoll.status).toBe(409);
  });

  test('Update student synchronises User and Student', async () => {
    const payload = {
      name: 'Bob',
      email: 'bob@example.com',
      rollNumber: 'R004',
      department: 'IT',
      academicBatch: { startYear: 2023, endYear: 2027 },
    };
    const createRes = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    const userId = createRes.body.data.id;
    // `studentId` is the Student profile document; `userId` is the linked User.
    // (Previously `userId` wrongly returned the Student document id.)
    const studentId = createRes.body.data.studentId;
    expect(String(createRes.body.data.userId)).toBe(String(userId));
    const updatePayload = {
      name: 'Bob Updated',
      email: 'bobnew@example.com',
      rollNumber: 'R004-NEW',
      department: 'ECE',
      academicBatch: { startYear: 2024, endYear: 2028 },
    };
    const updRes = await request(app)
      .patch(`/api/admin/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(updatePayload);
    expect(updRes.status).toBe(200);
    const user = await User.findById(userId);
    const student = await Student.findById(studentId);
    expect(user.name).toBe(updatePayload.name);
    expect(user.email).toBe(updatePayload.email.toLowerCase());
    expect(user.rollNumber).toBe(updatePayload.rollNumber);
    expect(student.name).toBe(updatePayload.name);
    expect(student.email).toBe(updatePayload.email.toLowerCase());
    expect(student.rollNumber).toBe(updatePayload.rollNumber);
    expect(student.startYear).toBe(updatePayload.academicBatch.startYear);
    expect(student.endYear).toBe(updatePayload.academicBatch.endYear);
    expect(student.department).toBe(updatePayload.department);
  });

  test('Delete student removes both User and Student', async () => {
    const payload = {
      name: 'Carol',
      email: 'carol@example.com',
      rollNumber: 'R005',
      department: 'MECH',
      academicBatch: { startYear: 2023, endYear: 2027 },
    };
    const createRes = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    const userId = createRes.body.data.id;
    const studentId = createRes.body.data.studentId;
    const delRes = await request(app)
      .delete(`/api/admin/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    const user = await User.findById(userId);
    const student = await Student.findById(studentId);
    expect(user).toBeNull();
    expect(student).toBeNull();
  });

  test('Batch enrollment works with newly created student', async () => {
    // Create a batch first
    const batch = await Batch.create({ name: 'Batch 1', code: 'B001', status: 'ACTIVE' });
    // Create a student
    const payload = {
      name: 'Dave',
      email: 'dave@example.com',
      rollNumber: 'R006',
      department: 'CIVIL',
      academicBatch: { startYear: 2023, endYear: 2027 },
    };
    const createRes = await request(app)
      .post('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    const userId = createRes.body.data.id;
    // Enroll via batch endpoint (expects studentId = userId)
    const enrollRes = await request(app)
      .post(`/api/admin/batches/${batch._id}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: userId });
    expect(enrollRes.status).toBe(201);
    // Verify enrollment exists
    const enrollment = await require('../src/models/BatchStudent').findOne({ batch: batch._id, student: userId });
    expect(enrollment).toBeDefined();
  });
});
