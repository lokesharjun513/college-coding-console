// Regression coverage for trainer access to batches with no assigned trainer.
//
// A batch without a trainer belongs to nobody: every trainer-only endpoint must
// refuse it (403) instead of serving it or failing with a 500. Ownership for
// assigned batches, denial of other trainers' batches and admin behaviour are
// asserted here too so the guard cannot silently be removed.
const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const authService = require('../src/auth/authService');

const PASSWORD = 'StrongP@ssw0rd';

async function createTestUser({ name, email, password = PASSWORD, role = 'STUDENT' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status: 'ACTIVE' });
}

async function login(email, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

function uniqueEmail(base) {
  return base.replace('@', `${uniqueSuffix()}@`);
}

async function createAdminAndTrainer() {
  const adminEmail = uniqueEmail('admin@testmail.com');
  const trainerEmail = uniqueEmail('trainer@testmail.com');
  await createTestUser({ name: 'Admin', email: adminEmail, role: 'ADMIN' });
  const adminToken = await login(adminEmail);
  const trainer = await createTestUser({ name: 'Trainer', email: trainerEmail, role: 'TRAINER' });
  const trainerToken = await login(trainerEmail);
  return { adminToken, trainer, trainerToken };
}

// Admin-created batch; `trainerId` omitted leaves the batch unassigned.
async function createBatch(adminToken, trainerId) {
  const payload = { name: 'Batch Name', code: `CODE${uniqueSuffix()}`, description: 'Batch description' };
  if (trainerId) payload.trainer = trainerId;
  const res = await request(app)
    .post('/api/admin/batches')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload);
  if (res.status !== 201) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

// Admin-created BATCH-scoped problem (trainers may not create problems for a
// batch that has no trainer, so admin provisioning is used deliberately here).
async function createAdminProblem(adminToken, batchId, overrides = {}) {
  const res = await request(app)
    .post('/api/admin/problems')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: `Owned Problem ${uniqueSuffix()}`,
      description: 'Problem description',
      difficulty: 'EASY',
      scope: 'BATCH',
      batch: batchId,
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

describe('Trainer access to unassigned batches', () => {
  let adminToken;
  let trainer;
  let trainerToken;
  let unassignedBatch;
  let ownBatch;
  let unassignedProblemId;

  beforeEach(async () => {
    ({ adminToken, trainer, trainerToken } = await createAdminAndTrainer());
    unassignedBatch = await createBatch(adminToken);
    ownBatch = await createBatch(adminToken, trainer._id);
    const problem = await createAdminProblem(adminToken, unassignedBatch.id);
    unassignedProblemId = problem.id;
  });

  afterEach(async () => {
    await TestCase.deleteMany({});
    await Problem.deleteMany({});
    await Batch.deleteMany({});
  });

  // ---------- batch-level helper (assertTrainerOwnsBatch) ----------
  test('trainer cannot create a problem in an unassigned batch', async () => {
    const res = await request(app)
      .post(`/api/trainer/batches/${unassignedBatch.id}/problems`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ title: 'Should Not Exist', description: 'Test', difficulty: 'EASY' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('trainer cannot list problems of an unassigned batch', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${unassignedBatch.id}/problems`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  test('trainer cannot import problems into an unassigned batch', async () => {
    const res = await request(app)
      .post(`/api/trainer/batches/${unassignedBatch.id}/problems/import`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ problems: [{ title: 'Import Me', description: 'Test', difficulty: 'EASY' }] });
    expect(res.status).toBe(403);
  });

  test('trainer cannot download the import template of an unassigned batch', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${unassignedBatch.id}/problems/template`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  // ---------- problem-level helper (assertTrainerOwnsProblem) ----------
  test('trainer cannot retrieve a problem in an unassigned batch', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${unassignedBatch.id}/problems/${unassignedProblemId}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  test('trainer cannot update a problem in an unassigned batch', async () => {
    const res = await request(app)
      .patch(`/api/trainer/batches/${unassignedBatch.id}/problems/${unassignedProblemId}`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ title: 'Hacked' });
    expect(res.status).toBe(403);

    const check = await request(app)
      .get(`/api/admin/problems/${unassignedProblemId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(check.body.data.title).not.toBe('Hacked');
  });

  test('trainer cannot archive a problem in an unassigned batch', async () => {
    const res = await request(app)
      .delete(`/api/trainer/batches/${unassignedBatch.id}/problems/${unassignedProblemId}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);

    const check = await request(app)
      .get(`/api/admin/problems/${unassignedProblemId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(check.body.data.status).not.toBe('ARCHIVED');
  });

  // ---------- test case management ----------
  test('trainer cannot manage test cases of a problem in an unassigned batch', async () => {
    const listRes = await request(app)
      .get(`/api/trainer/problems/${unassignedProblemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(listRes.status).toBe(403);

    const createRes = await request(app)
      .post(`/api/trainer/problems/${unassignedProblemId}/test-cases`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ input: '1 2', expectedOutput: '3' });
    expect(createRes.status).toBe(403);
    expect(await TestCase.countDocuments({ problem: unassignedProblemId })).toBe(0);
  });

  // ---------- trainer batch endpoints ----------
  test('trainer batch routes refuse an unassigned batch with 403', async () => {
    const student = await createTestUser({ name: 'Student', email: uniqueEmail('student@testmail.com') });
    const studentId = student._id.toString();

    const cases = [
      ['GET batch', request(app).get(`/api/trainer/batches/${unassignedBatch.id}`).set('Authorization', `Bearer ${trainerToken}`)],
      ['GET students', request(app).get(`/api/trainer/batches/${unassignedBatch.id}/students`).set('Authorization', `Bearer ${trainerToken}`)],
      ['GET enrollment', request(app).get(`/api/trainer/batches/${unassignedBatch.id}/students/${studentId}`).set('Authorization', `Bearer ${trainerToken}`)],
      ['POST enroll', request(app).post(`/api/trainer/batches/${unassignedBatch.id}/students`).set('Authorization', `Bearer ${trainerToken}`).send({ studentId })],
      ['PATCH enrollment', request(app).patch(`/api/trainer/batches/${unassignedBatch.id}/students/${studentId}`).set('Authorization', `Bearer ${trainerToken}`).send({ status: 'DROPPED' })],
      ['DELETE enrollment', request(app).delete(`/api/trainer/batches/${unassignedBatch.id}/students/${studentId}`).set('Authorization', `Bearer ${trainerToken}`)],
      ['DELETE enrollments', request(app).delete(`/api/trainer/batches/${unassignedBatch.id}/students`).set('Authorization', `Bearer ${trainerToken}`).send({ studentIds: [studentId] })],
      ['GET batch performance', request(app).get(`/api/trainer/performance/batch/${unassignedBatch.id}`).set('Authorization', `Bearer ${trainerToken}`)],
      ['GET analytics', request(app).get(`/api/trainer/analytics?batchId=${unassignedBatch.id}`).set('Authorization', `Bearer ${trainerToken}`)],
      ['GET student analytics', request(app).get(`/api/trainer/analytics/student/${studentId}?batchId=${unassignedBatch.id}`).set('Authorization', `Bearer ${trainerToken}`)],
    ];

    const results = await Promise.all(cases.map(async ([name, pending]) => [name, await pending]));
    for (const [name, res] of results) {
      expect({ name, status: res.status }).toEqual({ name, status: 403 });
      expect(res.body.success).toBe(false);
    }
  });

  // ---------- preserved behaviour ----------
  test('known pre-existing routing bug: students/available is shadowed by :studentId', async () => {
    // The literal path is registered after "/:batchId/students/:studentId", so
    // "available" is parsed as a student id and rejected with 400 before any
    // ownership check runs. Documented here so it is not mistaken for the
    // authorization behaviour asserted above; fixing the ordering is separate work.
    const res = await request(app)
      .get(`/api/trainer/batches/${unassignedBatch.id}/students/available`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(400);
  });

  test('trainer keeps full access to their own assigned batch', async () => {
    const createRes = await request(app)
      .post(`/api/trainer/batches/${ownBatch.id}/problems`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ title: 'Mine', description: 'Test', difficulty: 'EASY' });
    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get(`/api/trainer/batches/${ownBatch.id}/problems`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);

    const batchRes = await request(app)
      .get(`/api/trainer/batches/${ownBatch.id}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(batchRes.status).toBe(200);
  });

  test('trainer is still denied another trainer\'s batch', async () => {
    const { trainer: otherTrainer } = await createAdminAndTrainer();
    const otherBatch = await createBatch(adminToken, otherTrainer._id);

    const res = await request(app)
      .get(`/api/trainer/batches/${otherBatch.id}/problems`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  test('admin can still manage problems of an unassigned batch', async () => {
    const listRes = await request(app)
      .get('/api/admin/problems')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);

    const patchRes = await request(app)
      .patch(`/api/admin/problems/${unassignedProblemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Admin edited' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.description).toBe('Admin edited');
  });

  test('invalid and unknown batch ids keep their existing status codes', async () => {
    const invalid = await request(app)
      .get('/api/trainer/batches/not-an-id/problems')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(invalid.status).toBe(400);

    const unknown = await request(app)
      .get('/api/trainer/batches/000000000000000000000001/problems')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(unknown.status).toBe(404);
  });
});
