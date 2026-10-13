// backend/tests/adminStudentAcademicBatch.test.js
//
// Focused coverage for the three admin-student fixes:
//   1. academic batch label + current-year classification (real current year)
//   2. active/inactive status updates via the existing PATCH endpoint
//   3. Student profile -> linked User id mapping for batch enrollment
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const uniqueSuffix = require('./utils/unique');
const authService = require('../src/auth/authService');
const {
  calculateCurrentAcademicYear,
  formatAcademicBatch,
  isValidAcademicBatch,
} = require('../src/utils/academicBatch');
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');

const PASSWORD = 'StrongP@ssw0rd';
let adminToken;

async function createAdmin() {
  const email = `admin${uniqueSuffix()}@test.com`;
  await User.create({
    name: 'Admin',
    email,
    passwordHash: await authService.hashPassword(PASSWORD),
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.token;
}

const createStudentViaApi = (overrides = {}) =>
  request(app)
    .post('/api/admin/students')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Student One',
      email: `s1${uniqueSuffix()}@test.com`,
      rollNumber: `R${uniqueSuffix()}`,
      department: 'CSE',
      academicBatch: { startYear: 2022, endYear: 2026 },
      ...overrides,
    });

beforeAll(async () => {
  adminToken = await createAdmin();
});

beforeEach(async () => {
  await BatchStudent.deleteMany({});
  await Student.deleteMany({});
  await Batch.deleteMany({});
  await User.deleteMany({ role: 'STUDENT' });
});

afterAll(async () => {
  // Guarded: the shared setup may already have closed the connection.
  try {
    await BatchStudent.deleteMany({});
    await Student.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});
  } catch {
    /* connection already closed */
  }
});

// ---------------------------------------------------------------- Issue 1
describe('Academic batch calculation (pure helpers)', () => {
  test('formats a batch as start–end', () => {
    expect(formatAcademicBatch(2022, 2026)).toBe('2022–2026');
    expect(formatAcademicBatch('2022', '2026')).toBe('2022–2026');
  });

  test('returns null for missing or invalid years', () => {
    expect(formatAcademicBatch(null, 2026)).toBeNull();
    expect(formatAcademicBatch(2022, undefined)).toBeNull();
    expect(formatAcademicBatch('abc', 2026)).toBeNull();
    expect(formatAcademicBatch(2022.5, 2026)).toBeNull();
  });

  test('classifies each year of a 2022–2026 batch', () => {
    expect(calculateCurrentAcademicYear(2022, 2026, 2022).label).toBe('1st Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2023).label).toBe('2nd Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2024).label).toBe('3rd Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2025).label).toBe('4th Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2026).label).toBe('Final Year');
  });

  test('classifies before-start and after-end', () => {
    expect(calculateCurrentAcademicYear(2022, 2026, 2021).label).toBe('Not Started');
    expect(calculateCurrentAcademicYear(2022, 2026, 2027).label).toBe('Completed');
    expect(calculateCurrentAcademicYear(2022, 2026, 2021).status).toBe('NOT_STARTED');
    expect(calculateCurrentAcademicYear(2022, 2026, 2027).status).toBe('COMPLETED');
    expect(calculateCurrentAcademicYear(2022, 2026, 2026).status).toBe('FINAL_YEAR');
  });

  test('handles a five-year-then-extra batch and single-year batches', () => {
    expect(calculateCurrentAcademicYear(2020, 2027, 2024).label).toBe('5th Year');
    expect(calculateCurrentAcademicYear(2020, 2027, 2027).label).toBe('Final Year');
    // start == end => single year, which is also the final year
    expect(calculateCurrentAcademicYear(2024, 2024, 2024).label).toBe('Final Year');
  });

  test('uses the actual current year when none is supplied', () => {
    const now = new Date().getFullYear();
    const result = calculateCurrentAcademicYear(now, now + 3);
    expect(result).not.toBeNull();
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.label).toBe('1st Year');
  });

  test('returns null when years are missing (legacy students)', () => {
    expect(calculateCurrentAcademicYear(null, null)).toBeNull();
    expect(calculateCurrentAcademicYear(2022, null)).toBeNull();
  });

  test('validates the year range', () => {
    expect(isValidAcademicBatch(2022, 2026)).toBe(true);
    expect(isValidAcademicBatch(2026, 2022)).toBe(false);
    expect(isValidAcademicBatch(2024, 2024)).toBe(false);
    expect(isValidAcademicBatch(null, 2026)).toBe(false);
  });
});

describe('Admin students API — academic batch', () => {
  test('returns the academic batch label and current year on create', async () => {
    const currentYear = new Date().getFullYear();
    const res = await createStudentViaApi({ academicBatch: { startYear: currentYear, endYear: currentYear + 3 } });

    expect(res.status).toBe(201);
    expect(res.body.data.academicBatch.label).toBe(`${currentYear}–${currentYear + 3}`);
    expect(res.body.data.currentAcademicYear.label).toBe('1st Year');
    expect(res.body.data.startYear).toBe(currentYear);
    expect(res.body.data.endYear).toBe(currentYear + 3);
  });

  test('POST returns the linked User id in userId (not the Student id)', async () => {
    const res = await createStudentViaApi();
    expect(res.status).toBe(201);
    expect(res.body.data.userId).not.toBe(res.body.data.studentId);

    const user = await User.findById(res.body.data.userId);
    expect(user).not.toBeNull();
    expect(user.role).toBe('STUDENT');
    expect(String(user._id)).toBe(String(res.body.data.userId));
  });

  test('GET list exposes academic batch, current year, status and userId', async () => {
    const currentYear = new Date().getFullYear();
    await createStudentViaApi({ academicBatch: { startYear: currentYear, endYear: currentYear + 1 } });

    const res = await request(app)
      .get('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const student = res.body.data[0];
    expect(student.academicBatch.label).toBe(`${currentYear}–${currentYear + 1}`);
    expect(student.currentAcademicYear.label).toBe('1st Year');
    expect(student.status).toBe('ACTIVE');
    expect(student.userId).toBeTruthy();
    expect(String(student.userId)).not.toBe(String(student._id));
  });

  test('rejects an inverted year range', async () => {
    const res = await createStudentViaApi({ academicBatch: { startYear: 2027, endYear: 2023 } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/greater than start year/i);
  });

  test('rejects an equal year range', async () => {
    const res = await createStudentViaApi({ academicBatch: { startYear: 2024, endYear: 2024 } });
    expect(res.status).toBe(400);
  });

  test('requires years on create', async () => {
    const res = await createStudentViaApi({ academicBatch: undefined });
    expect(res.status).toBe(400);
  });

  test('updating years changes the computed label', async () => {
    const created = await createStudentViaApi();
    const currentYear = new Date().getFullYear();

    const res = await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ academicBatch: { startYear: currentYear + 1, endYear: currentYear + 4 } });

    expect(res.status).toBe(200);
    expect(res.body.data.academicBatch.label).toBe(`${currentYear + 1}–${currentYear + 4}`);
    expect(res.body.data.currentAcademicYear.label).toBe('Not Started');
  });

  test('legacy student without years still lists and can be updated', async () => {
    // Simulate a legacy record written before years were captured.
    const user = await User.create({
      name: 'Legacy',
      email: `legacy${uniqueSuffix()}@test.com`,
      passwordHash: await authService.hashPassword(PASSWORD),
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    await Student.collection.insertOne({
      userId: user._id,
      name: user.name,
      email: user.email,
      rollNumber: `L${uniqueSuffix()}`,
      department: 'CSE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const listRes = await request(app)
      .get('/api/admin/students')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const legacy = listRes.body.data.find((s) => s.name === 'Legacy');
    expect(legacy.academicBatch.label).toBeNull();
    expect(legacy.currentAcademicYear).toBeNull();
    expect(legacy.status).toBe('ACTIVE');

    // Status changes must still work for a legacy record.
    const patchRes = await request(app)
      .patch(`/api/admin/students/${legacy._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.status).toBe('INACTIVE');
  });
});

// ---------------------------------------------------------------- Issue 2
describe('Admin students API — status updates', () => {
  test('PATCH updates the status on the linked User', async () => {
    const created = await createStudentViaApi();

    const res = await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');

    const user = await User.findById(created.body.data.userId);
    expect(user.status).toBe('INACTIVE');
  });

  test('PATCH accepts the linked User id as the path parameter', async () => {
    const created = await createStudentViaApi();

    const res = await request(app)
      .patch(`/api/admin/students/${created.body.data.userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');
  });

  test('PATCH rejects an invalid status', async () => {
    const created = await createStudentViaApi();
    const res = await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'BOGUS' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid status/i);
  });

  test('PATCH returns 404 for an unknown student', async () => {
    const res = await request(app)
      .patch('/api/admin/students/000000000000000000000009')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(404);
  });

  test('a deactivated student can be reactivated and the list reflects it', async () => {
    const created = await createStudentViaApi();

    await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });

    let list = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data[0].status).toBe('INACTIVE');

    await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    list = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data[0].status).toBe('ACTIVE');
  });

  test('status updates require the ADMIN role', async () => {
    const created = await createStudentViaApi();
    const res = await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    const anonymous = await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .send({ status: 'ACTIVE' });
    expect(anonymous.status).toBe(401);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------- Issue 3
describe('Batch enrollment — Student profile to User id mapping', () => {
  async function createBatch() {
    const res = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Batch', code: `B${uniqueSuffix()}` });
    return res.body.data.id;
  }

  test('a student created by Admin can be enrolled using the Student profile id', async () => {
    const created = await createStudentViaApi();
    const batchId = await createBatch();

    const res = await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: created.body.data._id }); // Student profile id

    expect(res.status).toBe(201);
    expect(String(res.body.data.student.id)).toBe(String(created.body.data.userId));

    // BatchStudent must store the linked User id, not the Student id.
    const enrollment = await BatchStudent.findOne({ batch: batchId });
    expect(String(enrollment.student)).toBe(String(created.body.data.userId));
    expect(String(enrollment.student)).not.toBe(String(created.body.data.studentId));
  });

  test('enrolling with the linked User id also works', async () => {
    const created = await createStudentViaApi();
    const batchId = await createBatch();

    const res = await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: created.body.data.userId });

    expect(res.status).toBe(201);
    const enrollment = await BatchStudent.findOne({ batch: batchId });
    expect(String(enrollment.student)).toBe(String(created.body.data.userId));
  });

  test('duplicate enrollment is rejected with 409 for both id forms', async () => {
    const created = await createStudentViaApi();
    const batchId = await createBatch();

    const first = await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: created.body.data._id });
    expect(first.status).toBe(201);

    const duplicateByUserId = await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: created.body.data.userId });
    expect(duplicateByUserId.status).toBe(409);

    expect(await BatchStudent.countDocuments({ batch: batchId })).toBe(1);
  });

  test('an inactive student cannot be enrolled', async () => {
    const created = await createStudentViaApi();
    await request(app)
      .patch(`/api/admin/students/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' });

    const batchId = await createBatch();
    const res = await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: created.body.data._id });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not active/i);
  });

  test('unknown student, bad ids and non-active batches are still rejected', async () => {
    const created = await createStudentViaApi();
    const batchId = await createBatch();

    expect((await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: '00000000000000000000000a' })).status).toBe(404);

    expect((await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: 'not-an-id' })).status).toBe(400);

    const batch = await Batch.findById(batchId);
    await Batch.updateOne({ _id: batch._id }, { $set: { status: 'COMPLETED' } });
    expect((await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: created.body.data._id })).status).toBe(400);
  });

  test('the enrolled-student list is keyed by the User id so filtering works', async () => {
    const created = await createStudentViaApi();
    const batchId = await createBatch();
    await request(app)
      .post(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: created.body.data._id });

    const list = await request(app)
      .get(`/api/admin/batches/${batchId}/students`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    // This is the value the selector filters on; it must match the student list.
    expect(String(list.body.data[0].student.id)).toBe(String(created.body.data.userId));
  });
});