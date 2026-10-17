// Tests for GET /api/student/performance — the Student Stats page.
//
// Covered here:
//   - authentication and role authorization, and scope validation
//   - GLOBAL reports published global problems only; BATCH reports the
//     published, available problems of ONE enrolled batch
//   - a batchId the student is not enrolled in is refused, never trusted
//   - an unenrolled student asking for BATCH scope is refused
//   - unique solved counts: repeated accepted submissions cannot inflate them,
//     and one accept outranks any number of failures
//   - the difficulty breakdown is scoped to the request, not to every submission
//   - `activeBatches` never carries trainer account data (email / passwordHash)
//   - a submission whose problem document is gone still appears, with no id that
//     could produce a link to a document that cannot be opened

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Submission = require('../src/models/Submission');
const authService = require('../src/auth/authService');

async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return User.create({ name, email, passwordHash, role, status });
}

async function tokenFor(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'pwd' });
  return res.body.token;
}

const stats = (token, query = '') =>
  request(app).get(`/api/student/performance${query}`).set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  await User.deleteMany({});
  await Problem.deleteMany({});
  await Batch.deleteMany({});
  await BatchStudent.deleteMany({});
  await Submission.deleteMany({});
});

/**
 * Student enrolled in TWO batches, with:
 *   - 2 published GLOBAL problems (one EASY, one HARD)
 *   - 1 published BATCH problem in batchA, 1 in batchB
 *   - 1 archived and 1 draft problem that must never be counted
 */
async function seed() {
  const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });
  const trainer = await createUser({ name: 'Priya Menon', email: 'tra@test.com', password: 'pwd', role: 'TRAINER' });

  const batchA = await Batch.create({ name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE', trainer: trainer._id });
  const batchB = await Batch.create({ name: 'CSE 2023', code: 'CSE23', status: 'ACTIVE', trainer: trainer._id });
  await BatchStudent.create({ student: student._id, batch: batchA._id, status: 'ACTIVE' });
  await BatchStudent.create({ student: student._id, batch: batchB._id, status: 'ACTIVE' });

  const globalEasy = await Problem.create({
    title: 'Global Two Sum', slug: 'g-two-sum', description: 'd', difficulty: 'EASY',
    scope: 'GLOBAL', status: 'PUBLISHED', createdBy: trainer._id,
  });
  const globalHard = await Problem.create({
    title: 'Global Graph Walk', slug: 'g-graph', description: 'd', difficulty: 'HARD',
    scope: 'GLOBAL', status: 'PUBLISHED', createdBy: trainer._id,
  });
  const batchProblemA = await Problem.create({
    title: 'Batch A Problem', slug: 'b-a', description: 'd', difficulty: 'EASY',
    scope: 'BATCH', batch: batchA._id, status: 'PUBLISHED', createdBy: trainer._id,
  });
  await Problem.create({
    title: 'Batch B Problem', slug: 'b-b', description: 'd', difficulty: 'EASY',
    scope: 'BATCH', batch: batchB._id, status: 'PUBLISHED', createdBy: trainer._id,
  });
  await Problem.create({
    title: 'Global Archived', slug: 'g-arch', description: 'd', difficulty: 'EASY',
    scope: 'GLOBAL', status: 'ARCHIVED', createdBy: trainer._id,
  });
  await Problem.create({
    title: 'Global Draft', slug: 'g-draft', description: 'd', difficulty: 'EASY',
    scope: 'GLOBAL', status: 'DRAFT', createdBy: trainer._id,
  });

  return { student, trainer, batchA, batchB, globalEasy, globalHard, batchProblemA };
}

describe('GET /api/student/performance', () => {
  test('unauthenticated request is rejected', async () => {
    expect((await request(app).get('/api/student/performance')).status).toBe(401);
  });

  test('a trainer is refused', async () => {
    const trainer = await createUser({ name: 'T', email: 't@test.com', password: 'pwd', role: 'TRAINER' });
    expect((await stats(await tokenFor(trainer))).status).toBe(403);
  });

  test('an unknown scope is rejected', async () => {
    const { student } = await seed();
    expect((await stats(await tokenFor(student), '?scope=SECRET')).status).toBe(400);
  });

  test('GLOBAL reports published global problems only', async () => {
    const { student } = await seed();
    const res = await stats(await tokenFor(student), '?scope=GLOBAL');

    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('GLOBAL');
    expect(res.body.data.metrics).toMatchObject({ assigned: 2, solved: 0, attempted: 0, notStarted: 2, completionPercentage: 0 });
    expect(res.body.data.breakdowns.difficulty.map((d) => d.label).sort()).toEqual(['EASY', 'HARD']);
  });

  test('the response envelope is preserved', async () => {
    const { student } = await seed();
    const res = await stats(await tokenFor(student));
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toEqual(expect.objectContaining({
      scope: expect.any(String),
      batch: null,
      activeBatches: expect.any(Array),
      metrics: expect.objectContaining({
        assigned: expect.any(Number),
        solved: expect.any(Number),
        attempted: expect.any(Number),
        notStarted: expect.any(Number),
        completionPercentage: expect.any(Number),
      }),
      breakdowns: expect.objectContaining({ difficulty: expect.any(Array) }),
      recentActivity: expect.any(Array),
    }));
  });

  test('BATCH scope is scoped to the selected batch', async () => {
    const { student, batchA, batchB } = await seed();
    const token = await tokenFor(student);

    const first = await stats(token, `?scope=BATCH&batchId=${batchA._id}`);
    expect(first.body.data.batch.id).toBe(String(batchA._id));
    expect(first.body.data.metrics.assigned).toBe(1);

    const second = await stats(token, `?scope=BATCH&batchId=${batchB._id}`);
    expect(second.body.data.batch.id).toBe(String(batchB._id));
    expect(second.body.data.metrics.assigned).toBe(1);
  });

  test('BATCH scope with one enrollment resolves without a batchId', async () => {
    const { student, batchA } = await seed();
    await BatchStudent.deleteMany({ batch: (await Batch.findOne({ name: 'CSE 2023' }))._id });

    const res = await stats(await tokenFor(student), '?scope=BATCH');
    expect(res.status).toBe(200);
    expect(res.body.data.batch.id).toBe(String(batchA._id));
  });

  test('with several enrollments a batch must be chosen', async () => {
    const { student } = await seed();
    const res = await stats(await tokenFor(student), '?scope=BATCH');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BATCH_SELECTION_REQUIRED');
    // The list travels with the error so the client can offer the choice.
    expect(res.body.data.activeBatches).toHaveLength(2);
  });

  test('a batch the student is not enrolled in is refused, never trusted', async () => {
    const { student } = await seed();
    const foreign = await Batch.create({ name: 'Someone Else', code: 'X', status: 'ACTIVE' });

    const res = await stats(await tokenFor(student), `?scope=BATCH&batchId=${foreign._id}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not enrolled/i);
  });

  test('a malformed batchId is rejected', async () => {
    const { student } = await seed();
    expect((await stats(await tokenFor(student), '?scope=BATCH&batchId=not-an-id')).status).toBe(400);
  });

  test('an unenrolled student cannot read batch performance', async () => {
    const solo = await createUser({ name: 'Solo', email: 'solo@test.com', password: 'pwd' });
    const res = await stats(await tokenFor(solo), '?scope=BATCH');
    expect(res.status).toBe(403);
  });

  test('archived, draft and future batch problems are not counted', async () => {
    const { student, trainer, batchA } = await seed();
    await Problem.create({
      title: 'Archived Batch', slug: 'b-arch', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batchA._id, status: 'ARCHIVED', createdBy: trainer._id,
    });
    await Problem.create({
      title: 'Future Batch', slug: 'b-future', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batchA._id, status: 'PUBLISHED',
      practiceDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createdBy: trainer._id,
    });

    const res = await stats(await tokenFor(student), `?scope=BATCH&batchId=${batchA._id}`);
    expect(res.body.data.metrics.assigned).toBe(1);
  });

  test('repeated accepted submissions produce ONE solved problem', async () => {
    const { student, globalEasy, globalHard } = await seed();
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: globalHard._id, code: 'x', language: 'python', verdict: 'TIME_LIMIT_EXCEEDED' });

    const res = await stats(await tokenFor(student), '?scope=GLOBAL');

    expect(res.body.data.metrics).toMatchObject({
      assigned: 2, solved: 1, attempted: 1, notStarted: 0, completionPercentage: 50,
    });

    const easy = res.body.data.breakdowns.difficulty.find((d) => d.label === 'EASY');
    expect(easy).toMatchObject({ assigned: 1, solved: 1, attempted: 0, completionPercentage: 100 });
  });

  test('an accept outranks failures regardless of submission order', async () => {
    const { student, globalEasy } = await seed();
    // Newest first: the failure is inserted last but must not win.
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });

    const res = await stats(await tokenFor(student), '?scope=GLOBAL');
    expect(res.body.data.metrics.solved).toBe(1);
    expect(res.body.data.metrics.attempted).toBe(0);
  });

  test('another student’s submission does not count', async () => {
    const { student, globalEasy } = await seed();
    const other = await createUser({ name: 'Other', email: 'other@test.com', password: 'pwd' });
    await Submission.create({ student: other._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await stats(await tokenFor(student), '?scope=GLOBAL');
    expect(res.body.data.metrics.solved).toBe(0);
  });

  test('the difficulty breakdown is scoped, not built from every submission', async () => {
    const { student, trainer, batchA, globalEasy } = await seed();
    // A batch submission for an EASY problem: it must not leak into the GLOBAL
    // breakdown beyond the problems actually in scope.
    const batchEasy = await Problem.create({
      title: 'Batch Easy', slug: 'b-easy', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batchA._id, status: 'PUBLISHED', createdBy: trainer._id,
    });
    await Submission.create({ student: student._id, problem: batchEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const globalRes = await stats(await tokenFor(student), '?scope=GLOBAL');
    const globalEasyRow = globalRes.body.data.breakdowns.difficulty.find((d) => d.label === 'EASY');
    expect(globalEasyRow.assigned).toBe(1);
    expect(globalEasyRow.solved).toBe(1);

    const batchRes = await stats(await tokenFor(student), `?scope=BATCH&batchId=${batchA._id}`);
    const batchEasyRow = batchRes.body.data.breakdowns.difficulty.find((d) => d.label === 'EASY');
    // Batch A holds two EASY problems (the seeded one and `batchEasy`); only
    // the one actually solved counts, and the GLOBAL accept must not leak in.
    expect(batchEasyRow).toMatchObject({ assigned: 2, solved: 1, completionPercentage: 50 });
    expect(batchRes.body.data.metrics).toMatchObject({ assigned: 2, solved: 1 });
  });

  test('activeBatches names the trainer but never exposes account data', async () => {
    const { student } = await seed();
    const res = await stats(await tokenFor(student));

    const entry = res.body.data.activeBatches[0];
    expect(entry.trainer).toEqual({ _id: expect.anything(), name: 'Priya Menon' });
    expect(entry.trainer.email).toBeUndefined();
    expect(entry.trainer.passwordHash).toBeUndefined();
    expect(entry.trainer.role).toBeUndefined();
  });

  test('activeBatches is empty for a student with no enrollment', async () => {
    const solo = await createUser({ name: 'Solo', email: 'solo@test.com', password: 'pwd' });
    const res = await stats(await tokenFor(solo), '?scope=GLOBAL');
    expect(res.body.data.activeBatches).toEqual([]);
    expect(res.body.data.metrics.assigned).toBeGreaterThanOrEqual(0);
  });

  test('recent activity links only to problems that still exist', async () => {
    const { student, globalEasy, globalHard } = await seed();
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    // A submission whose problem document is gone.
    await Submission.create({
      student: student._id,
      problem: new (require('mongoose').Types.ObjectId)(),
      code: 'x', language: 'python', verdict: 'WRONG_ANSWER',
    });

    const res = await stats(await tokenFor(student), '?scope=GLOBAL');
    const activity = res.body.data.recentActivity;

    const live = activity.find((item) => item.problemId);
    expect(live.problemId).toBe(String(globalEasy._id));

    // Every id present must resolve to a real problem document.
    for (const item of activity.filter((i) => i.problemId)) {
      expect(await Problem.findById(item.problemId)).not.toBeNull();
    }
    // Nothing is left pointing at a document that cannot be opened.
    expect(activity.filter((i) => i.problemId).length).toBe(1);
    void globalHard;
  });

  test('recent activity always carries a verdict, straight from the submission', async () => {
    const { student, globalEasy, globalHard } = await seed();
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: globalHard._id, code: 'x', language: 'python', verdict: 'COMPILATION_ERROR' });

    const res = await stats(await tokenFor(student), '?scope=GLOBAL');
    const activity = res.body.data.recentActivity;

    expect(activity).toHaveLength(2);
    // `verdict` is a required field on the Submission model, so the endpoint can
    // always pass it through unchanged rather than inventing a default.
    for (const item of activity) {
      expect(typeof item.verdict).toBe('string');
      expect(item.verdict.length).toBeGreaterThan(0);
      expect(item).toHaveProperty('createdAt');
    }
    expect(activity.map((i) => i.title).sort()).toEqual(['Global Graph Walk', 'Global Two Sum']);
  });
});