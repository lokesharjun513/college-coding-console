// Regression tests for GET /api/student/problems?scope=BATCH — the trainer
// assigned problems shown on the Student Problems page.
//
// Covered here:
//   - authentication and role authorization
//   - batch membership validation (a client-supplied batchId is never trusted)
//   - assignment scope: only the student's own batches, never GLOBAL
//   - archived / unpublished / future-dated problems are excluded
//   - missing related problem documents are handled
//   - filtering (search / difficulty / status) and pagination
//   - unique solved counts that repeated submissions cannot inflate
//   - per-batch aggregates used by the batch overview card

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Submission = require('../src/models/Submission');
const Topic = require('../src/models/Topic');
const Collection = require('../src/models/Collection');
const ProblemTopic = require('../src/models/ProblemTopic');
const authService = require('../src/auth/authService');

async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return User.create({ name, email, passwordHash, role, status });
}

async function tokenFor(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'pwd' });
  return res.body.token;
}

const batchScope = (token, query = '') =>
  request(app).get(`/api/student/problems?scope=BATCH${query}`).set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  await User.deleteMany({});
  await Problem.deleteMany({});
  await Batch.deleteMany({});
  await BatchStudent.deleteMany({});
  await Submission.deleteMany({});
  await Topic.deleteMany({});
  await Collection.deleteMany({});
  await ProblemTopic.deleteMany({});
});

async function seed() {
  const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });
  const trainer = await createUser({ name: 'Trainer', email: 'tra@test.com', password: 'pwd', role: 'TRAINER' });
  const batch = await Batch.create({ name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE', trainer: trainer._id, startDate: new Date('2026-06-01') });
  const otherBatch = await Batch.create({ name: 'CSE 2023', code: 'CSE23', status: 'ACTIVE' });
  await BatchStudent.create({ student: student._id, batch: batch._id, status: 'ACTIVE' });

  const easy = await Problem.create({
    title: 'Easy Batch Problem', slug: 'easy-batch', description: 'd', difficulty: 'EASY',
    scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', createdBy: trainer._id,
  });
  const medium = await Problem.create({
    title: 'Medium Batch Problem', slug: 'med-batch', description: 'd', difficulty: 'MEDIUM',
    scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', createdBy: trainer._id,
  });
  await Problem.create({
    title: 'Global Shared Problem', slug: 'global-one', description: 'd', difficulty: 'EASY',
    scope: 'GLOBAL', status: 'PUBLISHED', createdBy: trainer._id,
  });
  await Problem.create({
    title: 'Other Batch Problem', slug: 'other-batch', description: 'd', difficulty: 'EASY',
    scope: 'BATCH', batch: otherBatch._id, status: 'PUBLISHED', createdBy: trainer._id,
  });

  return { student, trainer, batch, otherBatch, easy, medium };
}

describe('Student assigned problems (scope=BATCH)', () => {
  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/student/problems?scope=BATCH');
    expect(res.status).toBe(401);
  });

  test('a trainer is refused', async () => {
    const trainer = await createUser({ name: 'T', email: 't@test.com', password: 'pwd', role: 'TRAINER' });
    const res = await batchScope(await tokenFor(trainer));
    expect(res.status).toBe(403);
  });

  test('an enrolled student sees only their own batch problems, never GLOBAL', async () => {
    const { student, batch, easy } = await seed();
    const res = await batchScope(await tokenFor(student));

    expect(res.status).toBe(200);
    expect(res.body.meta.scope).toBe('BATCH');
    expect(res.body.meta.enrolled).toBe(true);

    const titles = res.body.data.map((p) => p.title);
    expect(titles).toContain('Easy Batch Problem');
    expect(titles).toContain('Medium Batch Problem');
    // The whole point of the scope: global practice lives on another page.
    expect(titles).not.toContain('Global Shared Problem');
    // Another batch's assignment is never exposed.
    expect(titles).not.toContain('Other Batch Problem');
    expect(res.body.data.every((p) => p.scope === 'BATCH')).toBe(true);
    expect(res.body.data.find((p) => p.id === String(easy._id)).batch.id).toBe(String(batch._id));
  });

  test('an unenrolled student gets an empty, non-error response', async () => {
    const student = await createUser({ name: 'Solo', email: 'solo@test.com', password: 'pwd' });
    const res = await batchScope(await tokenFor(student));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.enrolled).toBe(false);
    expect(res.body.meta.counts).toEqual({ total: 0, solved: 0, attempted: 0, notStarted: 0 });
  });

  test('an archived or draft problem is never listed', async () => {
    const { student, trainer, batch } = await seed();
    await Problem.create({
      title: 'Archived Batch Problem', slug: 'arch-batch', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batch._id, status: 'ARCHIVED', createdBy: trainer._id,
    });
    await Problem.create({
      title: 'Draft Batch Problem', slug: 'draft-batch', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batch._id, status: 'DRAFT', createdBy: trainer._id,
    });

    const res = await batchScope(await tokenFor(student));
    const titles = res.body.data.map((p) => p.title);
    expect(titles).not.toContain('Archived Batch Problem');
    expect(titles).not.toContain('Draft Batch Problem');
  });

  test('a future-dated problem is hidden until its practice date arrives', async () => {
    const { student, trainer, batch } = await seed();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Problem.create({
      title: 'Future Batch Problem', slug: 'future-batch', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: future, createdBy: trainer._id,
    });

    const res = await batchScope(await tokenFor(student));
    expect(res.body.data.map((p) => p.title)).not.toContain('Future Batch Problem');
  });

  test('a past-dated problem is listed and flagged as not today', async () => {
    const { student, trainer, batch } = await seed();
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await Problem.create({
      title: 'Past Batch Problem', slug: 'past-batch', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: past, createdBy: trainer._id,
    });

    const res = await batchScope(await tokenFor(student));
    const row = res.body.data.find((p) => p.title === 'Past Batch Problem');
    expect(row).toBeDefined();
    expect(row.isToday).toBe(false);
  });

  test("a problem dated today is flagged isToday", async () => {
    const { student, trainer, batch } = await seed();
    await Problem.create({
      title: 'Today Batch Problem', slug: 'today-batch', description: 'd', difficulty: 'EASY',
      scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: new Date(), createdBy: trainer._id,
    });

    const res = await batchScope(await tokenFor(student));
    const row = res.body.data.find((p) => p.title === 'Today Batch Problem');
    expect(row.isToday).toBe(true);
    expect(res.body.meta.todayCount).toBeGreaterThanOrEqual(1);
  });

  test('a batchId the student is not enrolled in is refused with 403', async () => {
    const { student, otherBatch } = await seed();
    const res = await batchScope(await tokenFor(student), `&batchId=${otherBatch._id}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not enrolled/i);
  });

  test('a malformed batchId is refused with 400', async () => {
    const { student } = await seed();
    const res = await batchScope(await tokenFor(student), '&batchId=not-an-id');
    expect(res.status).toBe(400);
  });

  test("a batchId the student IS enrolled in narrows the result", async () => {
    const { student, batch } = await seed();
    const res = await batchScope(await tokenFor(student), `&batchId=${batch._id}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.batches).toHaveLength(1);
    expect(res.body.meta.batches[0].id).toBe(String(batch._id));
  });

  test('repeated submissions produce ONE solved problem, not many', async () => {
    const { student, easy, medium } = await seed();
    // One accepted, two failures on the same problem.
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    // A failed attempt only.
    await Submission.create({ student: student._id, problem: medium._id, code: 'x', language: 'python', verdict: 'TIME_LIMIT_EXCEEDED' });

    const res = await batchScope(await tokenFor(student));

    expect(res.body.meta.counts.total).toBe(2);
    expect(res.body.meta.counts.solved).toBe(1);
    expect(res.body.meta.counts.attempted).toBe(1);
    expect(res.body.meta.counts.notStarted).toBe(0);

    const easyRow = res.body.data.find((p) => p.id === String(easy._id));
    expect(easyRow.progress).toBe('SOLVED');
    expect(easyRow.attempts).toBe(3);

    // A failure is never Solved.
    const mediumRow = res.body.data.find((p) => p.id === String(medium._id));
    expect(mediumRow.progress).toBe('ATTEMPTED');
    expect(mediumRow.latestVerdict).toBe('TIME_LIMIT_EXCEEDED');
  });

  test("another student's accepted submission does not mark this one solved", async () => {
    const { student, trainer, batch, easy } = await seed();
    const other = await createUser({ name: 'Other', email: 'other@test.com', password: 'pwd' });
    await Submission.create({ student: other._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await batchScope(await tokenFor(student));
    expect(res.body.data.find((p) => p.id === String(easy._id)).progress).toBe('NOT_STARTED');
    expect(res.body.meta.counts.solved).toBe(0);
    expect(trainer).toBeDefined();
  });

  test('a problem with no problem document behind a stray submission still renders', async () => {
    const { student } = await seed();
    const missing = new (require('mongoose').Types.ObjectId)();
    await Submission.create({ student: student._id, problem: missing, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await batchScope(await tokenFor(student));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  test('difficulty and status filters compose', async () => {
    const { student, easy } = await seed();
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    const token = await tokenFor(student);

    const byDifficulty = await batchScope(token, '&difficulty=EASY');
    expect(byDifficulty.body.data.every((p) => p.difficulty === 'EASY')).toBe(true);

    const byStatus = await batchScope(token, '&status=SOLVED');
    expect(byStatus.body.data.map((p) => p.title)).toEqual(['Easy Batch Problem']);

    const combined = await batchScope(token, '&difficulty=MEDIUM&status=SOLVED');
    expect(combined.body.data).toEqual([]);
  });

  test('search matches the title and ignores regex metacharacters', async () => {
    const { student } = await seed();
    const token = await tokenFor(student);

    const hit = await batchScope(token, '&search=Medium');
    expect(hit.body.data.map((p) => p.title)).toEqual(['Medium Batch Problem']);

    // A malformed pattern must not throw or match everything.
    const literal = await batchScope(token, '&search=%28%2A');
    expect(literal.status).toBe(200);
  });

  test('an invalid difficulty or status is rejected', async () => {
    const { student } = await seed();
    const token = await tokenFor(student);
    expect((await batchScope(token, '&difficulty=IMPOSSIBLE')).status).toBe(400);
    expect((await batchScope(token, '&status=MAYBE')).status).toBe(400);
  });

  test('an unknown scope is rejected', async () => {
    const { student } = await seed();
    expect((await batchScope(await tokenFor(student))).status).toBe(200);
    const res = await request(app)
      .get('/api/student/problems?scope=SECRET')
      .set('Authorization', `Bearer ${await tokenFor(student)}`);
    expect(res.status).toBe(400);
  });

  test('pagination returns the requested slice and reports totals', async () => {
    const { student } = await seed();
    const res = await batchScope(await tokenFor(student), '&page=2&pageSize=1');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
  });

  test('an out-of-range page clamps instead of returning nothing', async () => {
    const { student } = await seed();
    const res = await batchScope(await tokenFor(student), '&page=99&pageSize=20');
    expect(res.status).toBe(200);
    expect(res.body.meta.pagination.page).toBe(1);
  });

  test('overview counts ignore filters so the header does not jump', async () => {
    const { student, easy } = await seed();
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await batchScope(await tokenFor(student), '&status=NOT_STARTED');
    expect(res.body.data).toHaveLength(1);
    // Still reports the whole assigned set.
    expect(res.body.meta.counts.total).toBe(2);
    expect(res.body.meta.counts.solved).toBe(1);
  });

  test('per-batch aggregates feed the batch overview card', async () => {
    const { student, batch, easy } = await seed();
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await batchScope(await tokenFor(student));
    expect(res.body.meta.batches[0]).toMatchObject({
      id: String(batch._id),
      name: 'CSE 2024',
      code: 'CSE24',
      status: 'ACTIVE',
      assigned: 2,
      solved: 1,
    });
    expect(res.body.meta.batches[0].trainerName).toBe('Trainer');
    expect(res.body.meta.batches[0].startDate).toBeTruthy();
  });

  test('a trainer name is exposed but no trainer account data is', async () => {
    const { student } = await seed();
    const res = await batchScope(await tokenFor(student));
    const batchEntry = res.body.meta.batches[0];
    expect(Object.keys(batchEntry)).toEqual(
      expect.arrayContaining(['trainerName']),
    );
    expect(batchEntry.trainerEmail).toBeUndefined();
    expect(batchEntry.trainerPasswordHash).toBeUndefined();
  });

  test('a missing trainer renders null rather than breaking the card', async () => {
    const { student, batch } = await seed();
    await Batch.updateOne({ _id: batch._id }, { $unset: { trainer: 1 } });

    const res = await batchScope(await tokenFor(student));
    expect(res.status).toBe(200);
    expect(res.body.meta.batches[0].trainerName).toBeNull();
  });

  test('topic names are resolved through the junction table', async () => {
    const { student, batch, trainer, easy } = await seed();
    const collection = await Collection.create({ name: 'Curriculum', slug: 'curriculum', status: 'ACTIVE', batch: batch._id, createdBy: trainer._id });
    const topic = await Topic.create({ name: 'Arrays', slug: 'arrays', collection: collection._id, createdBy: trainer._id });
    await ProblemTopic.create({ problem: easy._id, topic: topic._id, collection: collection._id, createdBy: trainer._id });

    const res = await batchScope(await tokenFor(student));
    const row = res.body.data.find((p) => p.id === String(easy._id));
    expect(row.topic).toBe('Arrays');
    expect(res.body.meta.topics).toContain('Arrays');
  });

  test('a problem with no topic link reports null, never a placeholder', async () => {
    const { student, easy } = await seed();
    const res = await batchScope(await tokenFor(student));
    expect(res.body.data.find((p) => p.id === String(easy._id)).topic).toBeNull();
    expect(res.body.meta.topics).not.toContain('General');
  });

  describe('topic filter', () => {
    async function seedTopics() {
      const seeded = await seed();
      const { trainer, easy, medium, batch } = seeded;
      const collection = await Collection.create({
        name: 'Curriculum', slug: 'curriculum', status: 'ACTIVE', batch: batch._id, createdBy: trainer._id,
      });
      const arrays = await Topic.create({ name: 'Arrays', slug: 'arrays', collection: collection._id, createdBy: trainer._id });
      const graphs = await Topic.create({ name: 'Graphs', slug: 'graphs', collection: collection._id, createdBy: trainer._id });
      await ProblemTopic.create({ problem: easy._id, topic: arrays._id, collection: collection._id, createdBy: trainer._id });
      await ProblemTopic.create({ problem: medium._id, topic: graphs._id, collection: collection._id, createdBy: trainer._id });
      return { ...seeded, arrays, graphs };
    }

    test('the topic filter is applied before pagination and counts only matching rows', async () => {
      const { student } = await seedTopics();
      const token = await tokenFor(student);

      const res = await batchScope(token, '&topic=Arrays');

      expect(res.status).toBe(200);
      expect(res.body.data.map((p) => p.title)).toEqual(['Easy Batch Problem']);
      // The totals describe the FILTERED set, not the whole assigned set.
      expect(res.body.meta.pagination.total).toBe(1);
      expect(res.body.meta.pagination.totalPages).toBe(1);
      // The overview deliberately still reports the whole assigned set.
      expect(res.body.meta.counts.total).toBe(2);
      expect(res.body.meta.topics).toEqual(['Arrays', 'Graphs']);
    });

    test('the topic filter composes with search, difficulty and status', async () => {
      const { student, easy } = await seedTopics();
      await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
      const token = await tokenFor(student);

      const hit = await batchScope(token, '&topic=Arrays&difficulty=EASY&status=SOLVED');
      expect(hit.body.data.map((p) => p.title)).toEqual(['Easy Batch Problem']);

      // Graphs holds the MEDIUM problem, so the Arrays + MEDIUM combination is
      // genuinely empty rather than silently ignored.
      const miss = await batchScope(token, '&topic=Arrays&difficulty=MEDIUM');
      expect(miss.body.data).toEqual([]);
      expect(miss.body.meta.pagination.total).toBe(0);
    });

    test('a topic the student cannot see is rejected, never widened', async () => {
      const { student, trainer, batch } = await seedTopics();
      // A topic from a collection the student has no assigned problems for.
      const otherCollection = await Collection.create({
        name: 'Other Curriculum', slug: 'other-curriculum', status: 'ACTIVE', batch: batch._id, createdBy: trainer._id,
      });
      const otherTopic = await Topic.create({
        name: 'Secret', slug: 'secret', collection: otherCollection._id, createdBy: trainer._id,
      });
      const token = await tokenFor(student);

      const res = await batchScope(token, `&topic=${otherTopic.name}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unknown topic/i);
    });

    test('omitting the topic filter still returns every assigned problem', async () => {
      const { student } = await seedTopics();
      const res = await batchScope(await tokenFor(student));
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.pagination.total).toBe(2);
    });
  });

  describe('today work', () => {
    test("meta.today lists today's problems over the whole assigned set, not the page", async () => {
      const { student, trainer, batch } = await seed();
      await Problem.create({
        title: 'Today Page One', slug: 'today-p1', description: 'd', difficulty: 'EASY',
        scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: new Date(), createdBy: trainer._id,
      });
      await Problem.create({
        title: 'Today Page Two', slug: 'today-p2', description: 'd', difficulty: 'MEDIUM',
        scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: new Date(), createdBy: trainer._id,
      });

      const token = await tokenFor(student);
      const firstPage = await batchScope(token, '&pageSize=1&page=1');
      expect(firstPage.body.data).toHaveLength(1);
      expect(firstPage.body.meta.todayCount).toBe(2);
      expect(firstPage.body.meta.today.map((r) => r.title).sort())
        .toEqual(['Today Page One', 'Today Page Two']);

      const secondPage = await batchScope(token, '&pageSize=1&page=2');
      expect(secondPage.body.meta.today).toHaveLength(2);

      // A filter that excludes today's problems from the LIST does not empty the
      // panel, because the panel is the day's work, not a filtered view of it.
      const filtered = await batchScope(token, '&status=SOLVED');
      expect(filtered.body.data).toEqual([]);
      expect(filtered.body.meta.today).toHaveLength(2);
      expect(filtered.body.meta.todayCount).toBe(2);
    });

    test("meta.today carries what the panel renders, including the action state", async () => {
      const { student, trainer, batch } = await seed();
      await Problem.create({
        title: 'Today Attempted', slug: 'today-attempted', description: 'd', difficulty: 'EASY',
        scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: new Date(), createdBy: trainer._id,
      });
      const attempted = (await batchScope(await tokenFor(student))).body.data
        .find((p) => p.title === 'Today Attempted');
      await Submission.create({ student: student._id, problem: attempted.id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });

      const res = await batchScope(await tokenFor(student));
      const row = res.body.meta.today.find((r) => r.title === 'Today Attempted');
      expect(row).toMatchObject({ difficulty: 'EASY', progress: 'ATTEMPTED' });
      expect(row.id).toBe(String(attempted.id));
      expect(row.id).not.toContain('undefined');
    });

    test("meta.today is empty when nothing is scheduled, and omits non-today rows", async () => {
      const { student } = await seed();
      const res = await batchScope(await tokenFor(student));
      expect(res.body.meta.today).toEqual([]);
      expect(res.body.meta.todayCount).toBe(0);
    });
  });

  test('overview counts are unique per problem', async () => {
    const { student, easy } = await seed();
    // Two accepted submissions on the same problem must not double-count it.
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: easy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await batchScope(await tokenFor(student));
    expect(res.body.meta.counts.total).toBe(2);
    expect(res.body.meta.counts.solved).toBe(1);
    expect(res.body.data).toHaveLength(2);
    // Every id in the response is distinct.
    expect(new Set(res.body.data.map((p) => p.id)).size).toBe(res.body.data.length);
    expect(res.body.meta.completionPercentage).toBe(50);
  });

  test('the combined listing still returns GLOBAL plus BATCH', async () => {
    const { student } = await seed();
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${await tokenFor(student)}`);
    const titles = res.body.data.map((p) => p.title);
    expect(titles).toContain('Global Shared Problem');
    expect(titles).toContain('Easy Batch Problem');
  });
});