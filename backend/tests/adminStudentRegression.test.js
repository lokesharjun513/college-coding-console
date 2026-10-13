// backend/tests/adminStudentRegression.test.js
//
// Scenario-by-scenario regression verification of the Admin Students fixes.
// Each test is named for the scenario number it verifies.
//
//   1  create a student with Start Year 2022 / End Year 2026
//   2  API returns the correct academic batch and current academic year
//   4  deactivate, and the change persists after re-fetching the list
//   5  reactivate, and the correct status is returned
//   6  create another active student and enroll them in a batch
//   7  enrollment stores the linked User id, not the Student document id
//   8  the enrolled student appears in the batch student list
//  10  duplicate enrollment is rejected
//  11  missing academic years do not break legacy records
const request = require('supertest');
const app = require('../src/app');
const uniqueSuffix = require('./utils/unique');
const authService = require('../src/auth/authService');
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');

const PASSWORD = 'StrongP@ssw0rd';
const CURRENT_YEAR = new Date().getFullYear();

let adminToken;
let batchId;

const asAdmin = (method, path, body) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${adminToken}`);
  return body === undefined ? req : req.send(body);
};

/** Full lifecycle used by most scenarios. */
const lifecycle = async () => {
  const created = await asAdmin('post', '/api/admin/students', {
    name: 'Reg Ada',
    email: `ada${uniqueSuffix()}@test.com`,
    rollNumber: `R${uniqueSuffix()}`,
    department: 'CSE',
    academicBatch: { startYear: 2022, endYear: 2026 },
  });
  expect(created.status).toBe(201);
  return created.body.data;
};

beforeAll(async () => {
  const email = `admin${uniqueSuffix()}@test.com`;
  await User.create({
    name: 'Admin',
    email,
    passwordHash: await authService.hashPassword(PASSWORD),
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  adminToken = login.body.token;

  const batch = await asAdmin('post', '/api/admin/batches', { name: 'Regression Batch', code: `R${uniqueSuffix()}` });
  batchId = batch.body.data.id;
});

beforeEach(async () => {
  await BatchStudent.deleteMany({});
  await Student.deleteMany({});
  await User.deleteMany({ role: 'STUDENT' });
});

afterAll(async () => {
  try {
    await BatchStudent.deleteMany({});
    await Student.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});
  } catch {
    /* connection already closed by the shared setup */
  }
});

// ------------------------------------------------- scenarios 1 + 2
test('Scenario 1: creates a student with Start Year 2022 and End Year 2026', async () => {
  const res = await request(app)
    .post('/api/admin/students')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Scenario One',
      email: `s1${uniqueSuffix()}@test.com`,
      rollNumber: `R${uniqueSuffix()}`,
      department: 'CSE',
      section: 'A',
      academicBatch: { startYear: 2022, endYear: 2026 },
    });

  expect(res.status).toBe(201);
  expect(res.body.data.startYear).toBe(2022);
  expect(res.body.data.endYear).toBe(2026);
  // Both the User and the Student profile were written exactly once.
  expect(await User.countDocuments({ email: res.body.data.email })).toBe(1);
  expect(await Student.countDocuments({ email: res.body.data.email })).toBe(1);
  expect(String(res.body.data.userId)).toBe(String(res.body.data.id));
});

test('Scenario 2: API returns the correct academic batch and current academic year', async () => {
  const created = await lifecycle();

  expect(created.academicBatch.label).toBe('2022–2026');
  expect(created.academicBatch.startYear).toBe(2022);
  expect(created.academicBatch.endYear).toBe(2026);
  expect(created.status).toBe('ACTIVE');

  // Classification is driven by the REAL current year, not a hardcoded one.
  const expectedByCurrentYear = {
    2022: '1st Year', 2023: '2nd Year', 2024: '3rd Year', 2025: '4th Year', 2026: 'Final Year',
  };
  expect(created.currentAcademicYear.label).toBe(expectedByCurrentYear[CURRENT_YEAR]);
  expect(created.currentAcademicYear.totalYears).toBe(5);

  // The list endpoint must agree with the create response.
  const list = await asAdmin('get', '/api/admin/students');
  const fromList = list.body.data.find((s) => String(s._id) === String(created._id));
  expect(fromList.academicBatch.label).toBe('2022–2026');
  expect(fromList.currentAcademicYear.label).toBe(expectedByCurrentYear[CURRENT_YEAR]);
  expect(fromList.status).toBe('ACTIVE');
});

// ---------------------------------------------------- scenarios 4 + 5
test('Scenario 4: deactivation persists after re-fetching the list', async () => {
  const created = await lifecycle();

  const patch = await asAdmin('patch', `/api/admin/students/${created._id}`, { status: 'INACTIVE' });
  expect(patch.status).toBe(200);
  expect(patch.body.data.status).toBe('INACTIVE');

  // Persisted on the linked User, which is the source of truth.
  const user = await User.findById(created.userId);
  expect(user.status).toBe('INACTIVE');

  // Survives a brand new list fetch.
  const list = await asAdmin('get', '/api/admin/students');
  const row = list.body.data.find((s) => String(s._id) === String(created._id));
  expect(row.status).toBe('INACTIVE');
});

test('Scenario 5: reactivation returns the correct status', async () => {
  const created = await lifecycle();
  await asAdmin('patch', `/api/admin/students/${created._id}`, { status: 'INACTIVE' });

  const patch = await asAdmin('patch', `/api/admin/students/${created._id}`, { status: 'ACTIVE' });
  expect(patch.status).toBe(200);
  expect(patch.body.data.status).toBe('ACTIVE');

  const list = await asAdmin('get', '/api/admin/students');
  const row = list.body.data.find((s) => String(s._id) === String(created._id));
  expect(row.status).toBe('ACTIVE');
  expect((await User.findById(created.userId)).status).toBe('ACTIVE');

  // Academic batch is unaffected by status changes.
  expect(row.academicBatch.label).toBe('2022–2026');
});

// ------------------------------------------------ scenarios 6 + 7 + 8
test('Scenarios 6, 7, 8: enroll a second student under their linked User id', async () => {
  const first = await lifecycle();

  // Scenario 6: another ACTIVE student, in a different batch-safe state.
  const second = await asAdmin('post', '/api/admin/students', {
    name: 'Reg Grace',
    email: `grace${uniqueSuffix()}@test.com`,
    rollNumber: `R${uniqueSuffix()}`,
    department: 'IT',
    academicBatch: { startYear: CURRENT_YEAR, endYear: CURRENT_YEAR + 3 },
  });
  expect(second.status).toBe(201);
  expect(second.body.data.status).toBe('ACTIVE');

  // Scenario 7: enroll using the STUDENT DOCUMENT id — the backend must map it
  // through Student.userId to the linked User id.
  const enroll = await asAdmin('post', `/api/admin/batches/${batchId}/students`, {
    studentId: second.body.data._id,
  });
  expect(enroll.status).toBe(201);
  expect(String(enroll.body.data.student.id)).toBe(String(second.body.data.userId));

  const stored = await BatchStudent.findOne({ batch: batchId });
  expect(String(stored.student)).toBe(String(second.body.data.userId));
  expect(String(stored.student)).not.toBe(String(second.body.data.studentId));

  // Scenario 8: the enrolled student appears in the batch student list, keyed
  // by the same User id the selector filters on.
  const list = await asAdmin('get', `/api/admin/batches/${batchId}/students`);
  expect(list.status).toBe(200);
  expect(list.body.data).toHaveLength(1);
  expect(String(list.body.data[0].student.id)).toBe(String(second.body.data.userId));
  expect(list.body.data[0].student.name).toBe('Reg Grace');
  expect(list.body.data[0].student.rollNumber).toBe(second.body.data.rollNumber);

  // The first student was never enrolled.
  expect(await BatchStudent.countDocuments({ student: first.userId })).toBe(0);
});

test('Scenario 7b: enrolling by User id and by Student id are equivalent', async () => {
  const a = await lifecycle();
  const byUser = await asAdmin('post', `/api/admin/batches/${batchId}/students`, { studentId: a.userId });
  expect(byUser.status).toBe(201);

  const b = await lifecycle();
  const byStudent = await asAdmin('post', `/api/admin/batches/${batchId}/students`, { studentId: b._id });
  expect(byStudent.status).toBe(201);

  expect(await BatchStudent.countDocuments({ batch: batchId })).toBe(2);
  expect(String((await BatchStudent.findOne({ student: a.userId })).student)).toBe(String(a.userId));
  expect(String((await BatchStudent.findOne({ student: b.userId })).student)).toBe(String(b.userId));
});

// ------------------------------------------------------- scenario 10
test('Scenario 10: duplicate enrollment is rejected', async () => {
  const created = await lifecycle();

  const first = await asAdmin('post', `/api/admin/batches/${batchId}/students`, { studentId: created._id });
  expect(first.status).toBe(201);

  // Same student again, expressed the other way round.
  const second = await asAdmin('post', `/api/admin/batches/${batchId}/students`, { studentId: created.userId });
  expect(second.status).toBe(409);
  expect(second.body.message).toMatch(/already enrolled/i);

  expect(await BatchStudent.countDocuments({ batch: batchId })).toBe(1);
});

// ------------------------------------------------------- scenario 11
test('Scenario 11: legacy records without academic years are not broken', async () => {
  // A legacy User + Student pair written before years were captured.
  const user = await User.create({
    name: 'Legacy Person',
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
    department: 'ECE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // The list still renders it, with null academic data rather than an error.
  const list = await asAdmin('get', '/api/admin/students');
  expect(list.status).toBe(200);
  const legacy = list.body.data.find((s) => s.name === 'Legacy Person');
  expect(legacy).toBeDefined();
  expect(legacy.academicBatch.label).toBeNull();
  expect(legacy.currentAcademicYear).toBeNull();
  expect(legacy.status).toBe('ACTIVE');
  expect(legacy.userId).toBe(String(user._id));

  // Status still updates.
  const patch = await asAdmin('patch', `/api/admin/students/${legacy._id}`, { status: 'INACTIVE' });
  expect(patch.status).toBe(200);
  expect(patch.body.data.status).toBe('INACTIVE');
  expect(patch.body.data.academicBatch.label).toBeNull();

  // A rename also works.
  const rename = await asAdmin('patch', `/api/admin/students/${legacy._id}`, { name: 'Legacy Renamed' });
  expect(rename.status).toBe(200);
  expect(rename.body.data.name).toBe('Legacy Renamed');
  expect((await User.findById(user._id)).name).toBe('Legacy Renamed');

  // And it can still be enrolled, then filtered out of the selector.
  await asAdmin('patch', `/api/admin/students/${legacy._id}`, { status: 'ACTIVE' });
  const enroll = await asAdmin('post', `/api/admin/batches/${batchId}/students`, { studentId: legacy._id });
  expect(enroll.status).toBe(201);

  const enrolledList = await asAdmin('get', `/api/admin/batches/${batchId}/students`);
  expect(String(enrolledList.body.data[0].student.id)).toBe(String(user._id));
});

// ------------------------------------------- academic data consistency
test('Academic data stays consistent between Student and User after an edit', async () => {
  const created = await lifecycle();

  const res = await asAdmin('patch', `/api/admin/students/${created._id}`, {
    academicBatch: { startYear: 2023, endYear: 2027 },
  });
  expect(res.status).toBe(200);
  expect(res.body.data.academicBatch.label).toBe('2023–2027');

  const student = await Student.findById(created._id);
  expect(student.startYear).toBe(2023);
  expect(student.endYear).toBe(2027);

  const user = await User.findById(created.userId);
  expect(user.academicBatch.startYear).toBe(2023);
  expect(user.academicBatch.endYear).toBe(2027);
});

test('Invalid year ranges are still rejected', async () => {
  const inverted = await asAdmin('post', '/api/admin/students', {
    name: 'Bad Range',
    email: `bad${uniqueSuffix()}@test.com`,
    rollNumber: `R${uniqueSuffix()}`,
    department: 'CSE',
    academicBatch: { startYear: 2026, endYear: 2022 },
  });
  expect(inverted.status).toBe(400);

  const created = await lifecycle();
  const equal = await asAdmin('patch', `/api/admin/students/${created._id}`, {
    academicBatch: { startYear: 2024, endYear: 2024 },
  });
  expect(equal.status).toBe(400);

  // A partial edit is validated against the stored year, not skipped.
  const badPartial = await asAdmin('patch', `/api/admin/students/${created._id}`, {
    academicBatch: { endYear: 2000 },
  });
  expect(badPartial.status).toBe(400);
});