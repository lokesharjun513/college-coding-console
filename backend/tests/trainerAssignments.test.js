// backend/tests/trainerAssignments.test.js
//
// Focused API coverage for the trainer assignment endpoints:
//   POST   /api/trainer/batches/:batchId/assignments
//   GET    /api/trainer/batches/:batchId/assignments
//   GET    /api/trainer/batches/:batchId/assignments/:assignmentId
//   PATCH  /api/trainer/batches/:batchId/assignments/:assignmentId
//   DELETE /api/trainer/batches/:batchId/assignments/:assignmentId

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const Assignment = require('../src/models/Assignment');
const AssignmentCompletion = require('../src/models/AssignmentCompletion');

const PASSWORD = 'StrongP@ssw0rd';

const created = {
  users: [],
  batches: [],
  problems: [],
  testCases: [],
  assignments: [],
  completions: [],
  enrollments: [],
};

async function createTestUser(role, label) {
  const suffix = uniqueSuffix();
  const user = await User.create({
    name: `${label} ${suffix}`,
    email: `${label.toLowerCase()}-${suffix}@testmail.com`,
    passwordHash: await authService.hashPassword(PASSWORD),
    role,
    status: 'ACTIVE',
    ...(role === 'TRAINER' ? { trainerId: `T-${suffix}` } : { rollNumber: `R-${suffix}` }),
  });
  created.users.push(user._id);
  return user;
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function createBatch(trainer) {
  const batch = await Batch.create({
    name: `Batch ${uniqueSuffix()}`,
    code: `B${uniqueSuffix()}`,
    trainer: trainer ? trainer._id : undefined,
  });
  created.batches.push(batch._id);
  return batch;
}

async function createProblem({ scope = 'GLOBAL', batch, createdBy, status = 'PUBLISHED' }) {
  const suffix = uniqueSuffix();
  const problem = await Problem.create({
    title: `Problem ${suffix}`,
    slug: `problem-${suffix}`,
    description: 'Problem description',
    difficulty: 'EASY',
    constraints: 'n <= 100',
    inputFormat: 'n',
    outputFormat: 'result',
    examples: [{ input: '1 2', output: '3', explanation: 'sample' }],
    starterCode: { cpp: 'int main(){}' },
    allowedLanguages: ['cpp'],
    scope,
    batch: scope === 'BATCH' ? batch._id : undefined,
    createdBy: createdBy._id,
    status,
  });
  created.problems.push(problem._id);
  return problem;
}

describe('Trainer assignment routes', () => {
  let trainerA;
  let trainerAToken;
  let trainerB;
  let trainerBToken;
  let student;
  let studentToken;
  let batchA;
  let batchB;
  let globalProblem;
  let ownBatchProblem;
  let otherTrainerProblem;

  const post = (batchId, token) => (body) =>
    request(app).post(`/api/trainer/batches/${batchId}/assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    trainerA = await createTestUser('TRAINER', 'trainer-a');
    trainerAToken = await login(trainerA.email);
    trainerB = await createTestUser('TRAINER', 'trainer-b');
    trainerBToken = await login(trainerB.email);
    student = await createTestUser('STUDENT', 'student');
    studentToken = await login(student.email);

    batchA = await createBatch(trainerA);
    batchB = await createBatch(trainerB);

    globalProblem = await createProblem({ createdBy: trainerB });
    ownBatchProblem = await createProblem({ scope: 'BATCH', batch: batchA, createdBy: trainerA });
    otherTrainerProblem = await createProblem({ scope: 'BATCH', batch: batchB, createdBy: trainerB });
  });

  afterAll(async () => {
    await AssignmentCompletion.deleteMany({ _id: { $in: created.completions } });
    await Assignment.deleteMany({ _id: { $in: created.assignments } });
    await TestCase.deleteMany({ _id: { $in: created.testCases } });
    await Problem.deleteMany({ _id: { $in: created.problems } });
    await BatchStudent.deleteMany({ _id: { $in: created.enrollments } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  const track = async (res) => {
    if (res.body && res.body.data && res.body.data.id) created.assignments.push(res.body.data.id);
    return res;
  };

  // ---------- create ----------
  test('trainer can assign a GLOBAL problem to their batch', async () => {
    const res = await track(await post(batchA._id, trainerAToken)({
      problemId: globalProblem._id.toString(),
      title: 'Global assignment',
      availableFrom: '2026-10-01',
    }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.problem.id).toBe(globalProblem._id.toString());
    expect(res.body.data.batch.toString()).toBe(batchA._id.toString());
    expect(res.body.data.title).toBe('Global assignment');
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.deleted).toBe(false);

    const stored = await Assignment.findById(res.body.data.id).lean();
    expect(stored.trainer.toString()).toBe(trainerA._id.toString());
    expect(stored.availableFrom.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  test('a problem already part of the batch is refused instead of duplicated', async () => {
    // Adding a problem to a batch IS the batch association, so assigning the
    // same problem again would give the same (batch, problem) pair two parallel
    // representations and let a student meet it twice.
    const res = await post(batchA._id, trainerAToken)({ problemId: ownBatchProblem._id.toString() });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('ALREADY_BATCH_ASSOCIATED');
    expect(res.body.message).toMatch(/already part of this batch/i);

    // Nothing was written.
    expect(await Assignment.countDocuments({
      batch: batchA._id,
      problem: ownBatchProblem._id,
      deleted: false,
    })).toBe(0);
  });

  test('client cannot override the trainer id', async () => {
    const res = await track(await post(batchA._id, trainerAToken)({
      problemId: globalProblem._id.toString(),
      trainer: trainerB._id.toString(),
      batch: batchB._id.toString(),
      deleted: true,
      availableFrom: '2026-11-05',
    }));

    expect(res.status).toBe(201);
    const stored = await Assignment.findById(res.body.data.id).lean();
    expect(stored.trainer.toString()).toBe(trainerA._id.toString());
    expect(stored.batch.toString()).toBe(batchA._id.toString());
    expect(stored.deleted).toBe(false);
  });

  test('duplicate assignment of the same problem/date returns 409', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const payload = { problemId: problem._id.toString(), availableFrom: '2026-12-01' };

    const first = await track(await post(batchA._id, trainerAToken)(payload));
    expect(first.status).toBe(201);

    const second = await post(batchA._id, trainerAToken)(payload);
    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.code).toBe('DUPLICATE_ASSIGNMENT');

    expect(await Assignment.countDocuments({ problem: problem._id, batch: batchA._id })).toBe(1);
  });

  test('the same problem can be assigned on a different availableFrom', async () => {
    const problem = await createProblem({ createdBy: trainerB });

    const first = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString(), availableFrom: '2026-10-01' }));
    const second = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString(), availableFrom: '2026-10-02' }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  // ---------- input validation ----------
  test('rejects a missing problemId', async () => {
    const res = await post(batchA._id, trainerAToken)({ title: 'No problem' });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid problemId', async () => {
    const res = await post(batchA._id, trainerAToken)({ problemId: 'not-an-id' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid problem id/i);
  });

  test('rejects an invalid batchId', async () => {
    const res = await post('not-an-id', trainerAToken)({ problemId: globalProblem._id.toString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid batch id/i);
  });

  test('rejects an unknown batchId with 404', async () => {
    const res = await post('000000000000000000000001', trainerAToken)({ problemId: globalProblem._id.toString() });
    expect(res.status).toBe(404);
  });

  test('rejects an invalid status', async () => {
    const res = await post(batchA._id, trainerAToken)({ problemId: globalProblem._id.toString(), status: 'NOPE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid status/i);
  });

  test('rejects an invalid availableFrom', async () => {
    const res = await post(batchA._id, trainerAToken)({ problemId: globalProblem._id.toString(), availableFrom: 'yesterday' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid availableFrom/i);
  });

  test('rejects a non-string title', async () => {
    const res = await post(batchA._id, trainerAToken)({ problemId: globalProblem._id.toString(), title: 42 });
    expect(res.status).toBe(400);
  });

  test('returns 404 for an unknown problem', async () => {
    const res = await post(batchA._id, trainerAToken)({ problemId: '000000000000000000000002' });
    expect(res.status).toBe(404);
  });

  // ---------- problem authorization ----------
  test('refuses another trainer\'s private problem', async () => {
    const res = await post(batchA._id, trainerAToken)({ problemId: otherTrainerProblem._id.toString() });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(await Assignment.countDocuments({ problem: otherTrainerProblem._id })).toBe(0);
  });

  test('refuses the trainer\'s own problem when it belongs to another batch', async () => {
    const ownProblemInOtherBatch = await createProblem({ scope: 'BATCH', batch: batchB, createdBy: trainerA });
    const res = await post(batchA._id, trainerAToken)({ problemId: ownProblemInOtherBatch._id.toString() });
    expect(res.status).toBe(403);
  });

  test('refuses an unpublished problem', async () => {
    const draft = await createProblem({ createdBy: trainerB, status: 'DRAFT' });
    const archived = await createProblem({ createdBy: trainerB, status: 'ARCHIVED' });

    const draftRes = await post(batchA._id, trainerAToken)({ problemId: draft._id.toString() });
    const archivedRes = await post(batchA._id, trainerAToken)({ problemId: archived._id.toString() });

    expect(draftRes.status).toBe(400);
    expect(draftRes.body.message).toMatch(/published/i);
    expect(archivedRes.status).toBe(400);
  });

  // ---------- authentication / role / ownership ----------
  test('requires authentication', async () => {
    const res = await request(app)
      .post(`/api/trainer/batches/${batchA._id}/assignments`)
      .send({ problemId: globalProblem._id.toString() });
    expect(res.status).toBe(401);

    const listRes = await request(app).get(`/api/trainer/batches/${batchA._id}/assignments`);
    expect(listRes.status).toBe(401);
  });

  test('refuses a non-trainer role', async () => {
    const res = await post(batchA._id, studentToken)({ problemId: globalProblem._id.toString() });
    expect(res.status).toBe(403);
  });

  test('refuses another trainer\'s batch on every endpoint', async () => {
    const batchId = batchA._id.toString();
    const assignmentId = (await Assignment.findOne({ batch: batchA._id, trainer: trainerA._id }))._id.toString();

    const cases = [
      ['POST', await request(app).post(`/api/trainer/batches/${batchId}/assignments`).set('Authorization', `Bearer ${trainerBToken}`).send({ problemId: globalProblem._id.toString() })],
      ['GET list', await request(app).get(`/api/trainer/batches/${batchId}/assignments`).set('Authorization', `Bearer ${trainerBToken}`)],
      ['GET one', await request(app).get(`/api/trainer/batches/${batchId}/assignments/${assignmentId}`).set('Authorization', `Bearer ${trainerBToken}`)],
      ['PATCH', await request(app).patch(`/api/trainer/batches/${batchId}/assignments/${assignmentId}`).set('Authorization', `Bearer ${trainerBToken}`).send({ title: 'Hijacked' })],
      ['DELETE', await request(app).delete(`/api/trainer/batches/${batchId}/assignments/${assignmentId}`).set('Authorization', `Bearer ${trainerBToken}`)],
    ];

    for (const [name, res] of cases) {
      expect({ name, status: res.status }).toEqual({ name, status: 403 });
    }

    const unchanged = await Assignment.findById(assignmentId).lean();
    expect(unchanged.deleted).toBe(false);
  });

  test('an assignment created by another trainer inside my batch is not visible to me', async () => {
    const foreign = await Assignment.create({
      problem: globalProblem._id,
      batch: batchA._id,
      trainer: trainerB._id,
      availableFrom: new Date('2027-01-01'),
    });
    created.assignments.push(foreign._id);

    const res = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments/${foreign._id}`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(res.status).toBe(404);
  });

  // ---------- list / read ----------
  test('lists only my batch assignments and hides soft-deleted by default', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const created1 = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString() }));
    expect(created1.status).toBe(201);

    const delRes = await request(app)
      .delete(`/api/trainer/batches/${batchA._id}/assignments/${created1.body.data.id}`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(delRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((a) => a.id === created1.body.data.id)).toBe(false);

    const withDeleted = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments?includeDeleted=true`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(withDeleted.status).toBe(200);
    const found = withDeleted.body.data.find((a) => a.id === created1.body.data.id);
    expect(found).toBeDefined();
    expect(found.deleted).toBe(true);
  });

  test('assignment payloads never expose hidden test-case data', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const hidden = await TestCase.create({ problem: problem._id, input: '1 2', expectedOutput: 'SECRET-HIDDEN-OUTPUT', isHidden: true, order: 0 });
    created.testCases.push(hidden._id);

    const res = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString() }));
    expect(res.status).toBe(201);

    const single = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments/${res.body.data.id}`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    const serialized = JSON.stringify(single.body);
    expect(serialized).not.toContain('SECRET-HIDDEN-OUTPUT');
    expect(serialized).not.toContain('testCases');
    expect(serialized).not.toContain('expectedOutput');
  });

  test('rejects an invalid assignment id', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments/not-an-id`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(res.status).toBe(400);
  });

  test('returns 404 for an unknown assignment id', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments/000000000000000000000003`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(res.status).toBe(404);
  });

  // ---------- update ----------
  test('updates title, status and availableFrom', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const created1 = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString() }));
    const id = created1.body.data.id;

    const res = await request(app)
      .patch(`/api/trainer/batches/${batchA._id}/assignments/${id}`)
      .set('Authorization', `Bearer ${trainerAToken}`)
      .send({ title: 'Renamed', status: 'CANCELLED', availableFrom: '2026-09-09' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed');
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.availableFrom).toBe('2026-09-09T00:00:00.000Z');
  });

  test('patch cannot change problem, batch, trainer or deleted', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const other = await createProblem({ createdBy: trainerB });
    const created1 = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString() }));

    const res = await request(app)
      .patch(`/api/trainer/batches/${batchA._id}/assignments/${created1.body.data.id}`)
      .set('Authorization', `Bearer ${trainerAToken}`)
      .send({
        problem: other._id.toString(),
        batch: batchB._id.toString(),
        trainer: trainerB._id.toString(),
        deleted: true,
      });

    expect(res.status).toBe(200);
    const stored = await Assignment.findById(created1.body.data.id).lean();
    expect(stored.problem.toString()).toBe(problem._id.toString());
    expect(stored.batch.toString()).toBe(batchA._id.toString());
    expect(stored.trainer.toString()).toBe(trainerA._id.toString());
    expect(stored.deleted).toBe(false);
  });

  test('patch to a conflicting availableFrom returns 409', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const first = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString(), availableFrom: '2026-03-01' }));
    const second = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString(), availableFrom: '2026-03-02' }));

    const res = await request(app)
      .patch(`/api/trainer/batches/${batchA._id}/assignments/${second.body.data.id}`)
      .set('Authorization', `Bearer ${trainerAToken}`)
      .send({ availableFrom: '2026-03-01' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_ASSIGNMENT');

    const unchanged = await Assignment.findById(second.body.data.id).lean();
    expect(unchanged.availableFrom.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  test('patch rejects an invalid status', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const created1 = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString() }));

    const res = await request(app)
      .patch(`/api/trainer/batches/${batchA._id}/assignments/${created1.body.data.id}`)
      .set('Authorization', `Bearer ${trainerAToken}`)
      .send({ status: 'ARCHIVED' });

    expect(res.status).toBe(400);
  });

  // ---------- delete ----------
  test('delete is a soft delete and frees the unique slot', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const payload = { problemId: problem._id.toString(), availableFrom: '2026-04-01' };

    const first = await track(await post(batchA._id, trainerAToken)(payload));
    expect(first.status).toBe(201);

    const delRes = await request(app)
      .delete(`/api/trainer/batches/${batchA._id}/assignments/${first.body.data.id}`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.deleted).toBe(true);

    // Row retained, not removed.
    expect(await Assignment.countDocuments({ _id: first.body.data.id })).toBe(1);

    // Deleting again is a 404.
    const again = await request(app)
      .delete(`/api/trainer/batches/${batchA._id}/assignments/${first.body.data.id}`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(again.status).toBe(404);

    // The freed slot accepts a fresh assignment for the same problem and date.
    const recreated = await track(await post(batchA._id, trainerAToken)(payload));
    expect(recreated.status).toBe(201);
  });

  // ---------- assignable problem catalogue ----------
  test('lists exactly the problems this trainer may assign to this batch', async () => {
    const globalPub = await createProblem({ createdBy: trainerB });
    const ownBatchPub = await createProblem({ scope: 'BATCH', batch: batchA, createdBy: trainerA });
    const otherTrainerInBatchB = await createProblem({ scope: 'BATCH', batch: batchB, createdBy: trainerB });
    const draft = await createProblem({ createdBy: trainerB, status: 'DRAFT' });
    const archived = await createProblem({ createdBy: trainerB, status: 'ARCHIVED' });

    const res = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments/problems`)
      .set('Authorization', `Bearer ${trainerAToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((p) => p.id);
    expect(ids).toContain(globalPub._id.toString());
    // Already part of this batch: offering it would duplicate the association.
    expect(ids).not.toContain(ownBatchPub._id.toString());
    expect(ids).not.toContain(otherTrainerInBatchB._id.toString());
    expect(ids).not.toContain(draft._id.toString());
    expect(ids).not.toContain(archived._id.toString());
    // Every offered problem is a PUBLISHED GLOBAL one — the only assignable kind.
    expect(res.body.data.every((p) => p.scope === 'GLOBAL' && p.status === 'PUBLISHED')).toBe(true);
    // Payload is the same light shape used everywhere else.
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['difficulty', 'id', 'scope', 'slug', 'status', 'title']);
  });

  test('assignable problem catalogue refuses another trainer\'s batch', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batchB._id}/assignments/problems`)
      .set('Authorization', `Bearer ${trainerAToken}`);
    expect(res.status).toBe(403);
  });

  test('assignable problem catalogue requires authentication and a trainer role', async () => {
    expect((await request(app).get(`/api/trainer/batches/${batchA._id}/assignments/problems`)).status).toBe(401);
    const asStudent = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments/problems`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(asStudent.status).toBe(403);
  });

  // ---------- trainer monitoring counts ----------
  test('reports completed vs pending students for an assignment', async () => {
    const problem = await createProblem({ createdBy: trainerB });
    const created1 = await track(await post(batchA._id, trainerAToken)({ problemId: problem._id.toString() }));
    const assignmentId = created1.body.data.id;

    const enrolled = [student, await createTestUser('STUDENT', 'student-b'), await createTestUser('STUDENT', 'student-c')];
    const enrollmentDocs = await BatchStudent.insertMany(
      enrolled.map((s) => ({ batch: batchA._id, student: s._id, status: 'ACTIVE' }))
    );
    created.enrollments.push(...enrollmentDocs.map((e) => e._id));

    const completion = await AssignmentCompletion.create({
      assignment: assignmentId,
      student: enrolled[0]._id,
      verdict: 'ACCEPTED',
      acceptedSubmission: new mongoose.Types.ObjectId(),
    });
    created.completions.push(completion._id);

    const res = await request(app)
      .get(`/api/trainer/batches/${batchA._id}/assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${trainerAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.monitoring.enrolledStudents).toBe(3);
    expect(res.body.data.monitoring.completed).toBe(1);
    expect(res.body.data.monitoring.pending).toBe(2);

    await BatchStudent.deleteMany({ _id: { $in: created.enrollments } });
    created.enrollments.length = 0;
  });
});