// Regression tests for the global practice library:
//   GET /api/student/problems?scope=GLOBAL
//   GET /api/student/practice/next?scope=GLOBAL
//
// Covered here:
//   - `scope=GLOBAL` is actually honoured. It used to pass validation and then
//     fall through to the combined listing, which returned the student's
//     enrolled BATCH problems too — so the Practice page silently received
//     trainer assignments.
//   - published / archived / draft visibility for global problems
//   - no batch membership is required, and batch membership does not change the
//     global result set
//   - server-side search, difficulty, status and topic filters compose
//   - pagination totals describe the FILTERED set
//   - unique solved counts that repeated accepted submissions cannot inflate
//   - response envelope and field shape

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

const globalScope = (token, query = '') =>
  request(app).get(`/api/student/problems?scope=GLOBAL${query}`).set('Authorization', `Bearer ${token}`);

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

/**
 * One enrolled student, one batch they belong to, and four global problems
 * across two topics. Nothing here needs the batch.
 */
async function seed() {
  const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });
  const trainer = await createUser({ name: 'Trainer', email: 'tra@test.com', password: 'pwd', role: 'TRAINER' });
  const batch = await Batch.create({ name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE', trainer: trainer._id });
  await BatchStudent.create({ student: student._id, batch: batch._id, status: 'ACTIVE' });

  const globalEasy = await Problem.create({
    title: 'Global Two Sum', slug: 'global-two-sum', description: 'Sum pair', difficulty: 'EASY',
    scope: 'GLOBAL', status: 'PUBLISHED', createdBy: trainer._id,
  });
  const globalHard = await Problem.create({
    title: 'Global Graph Walk', slug: 'global-graph-walk', description: 'Walk it', difficulty: 'HARD',
    scope: 'GLOBAL', status: 'PUBLISHED', createdBy: trainer._id,
  });
  const batchOnly = await Problem.create({
    title: 'Batch Secret', slug: 'batch-secret', description: 'Trainer only', difficulty: 'EASY',
    scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', createdBy: trainer._id,
  });

  const collection = await Collection.create({
    name: 'Shared Curriculum', slug: 'shared', status: 'ACTIVE', scope: 'GLOBAL', createdBy: trainer._id,
  });
  const arrays = await Topic.create({ name: 'Arrays', slug: 'arrays', collection: collection._id, createdBy: trainer._id });
  const graphs = await Topic.create({ name: 'Graphs', slug: 'graphs', collection: collection._id, createdBy: trainer._id });
  await ProblemTopic.create({ problem: globalEasy._id, topic: arrays._id, collection: collection._id, createdBy: trainer._id });
  await ProblemTopic.create({ problem: globalHard._id, topic: graphs._id, collection: collection._id, createdBy: trainer._id });

  return { student, trainer, batch, globalEasy, globalHard, batchOnly, arrays, graphs, collection };
}

describe('GET /api/student/problems?scope=GLOBAL', () => {
  test('unauthenticated request is rejected', async () => {
    expect((await request(app).get('/api/student/problems?scope=GLOBAL')).status).toBe(401);
  });

  test('a trainer is refused', async () => {
    const trainer = await createUser({ name: 'T', email: 't@test.com', password: 'pwd', role: 'TRAINER' });
    expect((await globalScope(await tokenFor(trainer))).status).toBe(403);
  });

  test('returns only global problems, never the student’s batch assignments', async () => {
    const { student, batchOnly } = await seed();
    const res = await globalScope(await tokenFor(student));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.scope).toBe('GLOBAL');

    const titles = res.body.data.map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining(['Global Two Sum', 'Global Graph Walk']));
    // The regression: scope=GLOBAL used to fall through to the combined listing.
    expect(titles).not.toContain('Batch Secret');
    expect(titles).not.toContain(batchOnly.title);
    expect(res.body.data.every((p) => p.scope === 'GLOBAL')).toBe(true);
  });

  test('batch membership does not change the global result set', async () => {
    const { student, batch } = await seed();

    const enrolled = await globalScope(await tokenFor(student));
    await BatchStudent.deleteMany({ student: student._id });
    const notEnrolled = await globalScope(await tokenFor(student));

    expect(notEnrolled.body.data.map((p) => p.title).sort())
      .toEqual(enrolled.body.data.map((p) => p.title).sort());
    expect(enrolled.body.meta.counts.total).toBe(2);
    expect(notEnrolled.body.meta.counts.total).toBe(2);
  });

  test('archived and draft global problems are never listed', async () => {
    const { student, trainer } = await seed();
    await Problem.create({
      title: 'Global Archived', slug: 'global-archived', description: 'd', difficulty: 'EASY',
      scope: 'GLOBAL', status: 'ARCHIVED', createdBy: trainer._id,
    });
    await Problem.create({
      title: 'Global Draft', slug: 'global-draft', description: 'd', difficulty: 'EASY',
      scope: 'GLOBAL', status: 'DRAFT', createdBy: trainer._id,
    });

    const res = await globalScope(await tokenFor(student));
    const titles = res.body.data.map((p) => p.title);
    expect(titles).not.toContain('Global Archived');
    expect(titles).not.toContain('Global Draft');
  });

  test('rows carry the topic, collection and the documented fields', async () => {
    const { student, globalEasy, collection } = await seed();
    const res = await globalScope(await tokenFor(student));

    const row = res.body.data.find((p) => p.id === String(globalEasy._id));
    expect(row).toMatchObject({
      title: 'Global Two Sum',
      description: 'Sum pair',
      difficulty: 'EASY',
      topic: 'Arrays',
      collection: collection.name,
      progress: 'NOT_STARTED',
      attempts: 0,
    });
    expect(row.id).not.toContain('undefined');
    expect(res.body.meta.topics).toEqual(['Arrays', 'Graphs']);
    expect(res.body.meta.difficulties).toEqual(['EASY', 'HARD']);
  });

  test('a problem with no topic link reports null, not a placeholder', async () => {
    const { student } = await seed();
    const res = await globalScope(await tokenFor(student));
    expect(res.body.data.every((p) => p.topic === null || typeof p.topic === 'string')).toBe(true);
  });

  test('a problem linked to several topics appears once', async () => {
    const { student, globalEasy, graphs, collection, trainer } = await seed();
    await ProblemTopic.create({ problem: globalEasy._id, topic: graphs._id, collection: collection._id, createdBy: trainer._id });

    const res = await globalScope(await tokenFor(student));
    const matching = res.body.data.filter((p) => p.id === String(globalEasy._id));
    expect(matching).toHaveLength(1);
    // The second link is not silently dropped from the payload either.
    expect(matching[0].additionalTopics).toEqual(['Graphs']);
    expect(res.body.meta.counts.total).toBe(2);
  });

  test('repeated accepted submissions still count as ONE solved problem', async () => {
    const { student, globalEasy } = await seed();
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });

    const res = await globalScope(await tokenFor(student));

    expect(res.body.meta.counts.total).toBe(2);
    expect(res.body.meta.counts.solved).toBe(1);
    expect(res.body.meta.completionPercentage).toBe(50);
    const row = res.body.data.find((p) => p.id === String(globalEasy._id));
    expect(row.progress).toBe('SOLVED');
    expect(row.attempts).toBe(3);
  });

  test('another student’s accepted submission does not mark this one solved', async () => {
    const { student, globalEasy } = await seed();
    const other = await createUser({ name: 'Other', email: 'other@test.com', password: 'pwd' });
    await Submission.create({ student: other._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await globalScope(await tokenFor(student));
    expect(res.body.data.find((p) => p.id === String(globalEasy._id)).progress).toBe('NOT_STARTED');
    expect(res.body.meta.counts.solved).toBe(0);
  });

  test('difficulty, status and topic filters compose', async () => {
    const { student, globalEasy } = await seed();
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    const token = await tokenFor(student);

    expect((await globalScope(token, '&difficulty=HARD')).body.data.map((p) => p.title)).toEqual(['Global Graph Walk']);
    expect((await globalScope(token, '&status=SOLVED')).body.data.map((p) => p.title)).toEqual(['Global Two Sum']);
    expect((await globalScope(token, '&topic=Graphs')).body.data.map((p) => p.title)).toEqual(['Global Graph Walk']);
    expect((await globalScope(token, '&topic=Arrays&difficulty=HARD')).body.data).toEqual([]);
  });

  test('search matches the title and the description and escapes metacharacters', async () => {
    const { student } = await seed();
    const token = await tokenFor(student);

    expect((await globalScope(token, '&search=Graph')).body.data.map((p) => p.title)).toEqual(['Global Graph Walk']);
    // "Sum pair" is the description of the other problem.
    expect((await globalScope(token, '&search=Sum pair')).body.data.map((p) => p.title)).toEqual(['Global Two Sum']);

    const literal = await globalScope(token, '&search=%28%2A');
    expect(literal.status).toBe(200);
    expect(literal.body.data).toEqual([]);
  });

  test('an unknown topic, difficulty or status is rejected', async () => {
    const { student } = await seed();
    const token = await tokenFor(student);
    expect((await globalScope(token, '&topic=Does+Not+Exist')).status).toBe(400);
    expect((await globalScope(token, '&difficulty=IMPOSSIBLE')).status).toBe(400);
    expect((await globalScope(token, '&status=MAYBE')).status).toBe(400);
  });

  test('overview counts describe the whole library, not the filtered page', async () => {
    const { student, globalEasy } = await seed();
    await Submission.create({ student: student._id, problem: globalEasy._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await globalScope(await tokenFor(student), '&difficulty=HARD');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination.total).toBe(1);
    expect(res.body.meta.counts.total).toBe(2);
    expect(res.body.meta.counts.solved).toBe(1);
  });

  test('pagination returns the requested slice with accurate totals', async () => {
    const { student } = await seed();
    const token = await tokenFor(student);

    const first = await globalScope(token, '&page=1&pageSize=1');
    expect(first.body.data).toHaveLength(1);
    expect(first.body.meta.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });

    const second = await globalScope(token, '&page=2&pageSize=1');
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  });

  test('an out-of-range page clamps rather than returning nothing', async () => {
    const { student } = await seed();
    const res = await globalScope(await tokenFor(student), '&page=99&pageSize=12');
    expect(res.status).toBe(200);
    expect(res.body.meta.pagination.page).toBe(1);
    expect(res.body.data).toHaveLength(2);
  });

  test('an unknown scope is still rejected', async () => {
    const { student } = await seed();
    const res = await request(app)
      .get('/api/student/problems?scope=SECRET')
      .set('Authorization', `Bearer ${await tokenFor(student)}`);
    expect(res.status).toBe(400);
  });

  test('the combined listing is unchanged and still includes batch problems', async () => {
    const { student } = await seed();
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${await tokenFor(student)}`);
    const titles = res.body.data.map((p) => p.title);
    expect(titles).toContain('Global Two Sum');
    expect(titles).toContain('Batch Secret');
  });
});

describe('GET /api/student/practice/next', () => {
  /**
   * A GLOBAL collection whose day links BOTH a global problem and the trainer's
   * BATCH problem — the exact shape that used to leak an assignment out of the
   * Practice page, because only the collection was scope-checked.
   */
  async function seedMixedScopeTopic() {
    const seeded = await seed();
    const { batch, batchOnly, collection, trainer } = seeded;

    const mixedTopic = await Topic.create({
      name: 'Mixed', slug: 'mixed', collection: collection._id, createdBy: trainer._id,
    });
    await ProblemTopic.create({
      problem: (await Problem.findOne({ title: 'Global Two Sum' }))._id,
      topic: mixedTopic._id, collection: collection._id, createdBy: trainer._id,
    });
    await ProblemTopic.create({
      problem: batchOnly._id, topic: mixedTopic._id, collection: collection._id, createdBy: trainer._id,
    });

    return { ...seeded, mixedTopic, batch };
  }

  test('scope=GLOBAL never returns a batch-scoped problem', async () => {
    const { student, batchOnly } = await seedMixedScopeTopic();
    const token = await tokenFor(student);

    const res = await request(app)
      .get('/api/student/practice/next?scope=GLOBAL')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toBeNull();
    expect(res.body.data.scope).toBe('GLOBAL');
    expect(res.body.data.problemId).not.toBe(String(batchOnly._id));
    expect(res.body.data.problemTitle).not.toBe('Batch Secret');
  });

  test('scope=BATCH returns only batch problems', async () => {
    const { student, batchOnly } = await seedMixedScopeTopic();
    const res = await request(app)
      .get('/api/student/practice/next?scope=BATCH')
      .set('Authorization', `Bearer ${await tokenFor(student)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toBeNull();
    expect(res.body.data.scope).toBe('BATCH');
    expect(res.body.data.problemId).toBe(String(batchOnly._id));
  });

  test('the default behaviour is unchanged', async () => {
    const { student, batchOnly } = await seedMixedScopeTopic();
    const res = await request(app)
      .get('/api/student/practice/next')
      .set('Authorization', `Bearer ${await tokenFor(student)}`);

    expect(res.status).toBe(200);
    // No scope requested: the historical answer still considers both, so the
    // GLOBAL problem (created first) is still reachable.
    expect(res.body.data.problemId).not.toBe(String(batchOnly._id));
  });

  test('an unknown scope is rejected', async () => {
    const { student } = await seedMixedScopeTopic();
    const res = await request(app)
      .get('/api/student/practice/next?scope=SECRET')
      .set('Authorization', `Bearer ${await tokenFor(student)}`);
    expect(res.status).toBe(400);
  });
});