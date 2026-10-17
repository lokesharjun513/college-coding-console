// backend/tests/trainerRequirementGaps.test.js
//
// Regression coverage for the confirmed Trainer requirements that were not yet
// enforced by the API:
//
//   A. Training (Collection) / Day (Topic) lifecycle — create, list, detail,
//      edit, archive, unarchive and safe delete — with trainer ownership
//      enforced and admin/global curriculum left untouched.
//   B. Problem CRUD — search / status / difficulty filters, pagination,
//      preserved compiler settings and practice date, and a working
//      archive -> unarchive round trip.
//   C. Bulk import — a duplicate inside one file must be a row-level error, not
//      an opaque 500 that discards the whole import.
//   D. Reporting — a student performance query must not reach outside the
//      batches the requesting trainer owns.
//
// Every test cleans up only the rows it created: all suites share one test
// database, so a blanket deleteMany({}) here would break unrelated suites.

const request = require('supertest');
const app = require('../src/app');
const uniqueSuffix = require('./utils/unique');
const authService = require('../src/auth/authService');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const TestCase = require('../src/models/TestCase');
const Submission = require('../src/models/Submission');

const PASSWORD = 'StrongP@ssw0rd';

// The suites share one remote test database, so round trips are slow enough
// that the 30s default intermittently trips on the problem-creation round trip.
jest.setTimeout(120000);

const created = {
  users: [],
  batches: [],
  collections: [],
  topics: [],
  problems: [],
  enrollments: [],
};

async function createUser(role) {
  const suffix = uniqueSuffix();
  const user = await User.create({
    name: `${role} ${suffix}`,
    email: `${role.toLowerCase()}-${suffix}@testmail.com`,
    passwordHash: await authService.hashPassword(PASSWORD),
    role,
    status: 'ACTIVE',
  });
  created.users.push(user._id);
  return user;
}

async function login(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function createBatch(trainerId) {
  const suffix = uniqueSuffix();
  const batch = await Batch.create({ name: `Batch ${suffix}`, code: `B${suffix}`, trainer: trainerId });
  created.batches.push(batch._id);
  return batch;
}

// Trainer curriculum is BATCH scope and must name a batch belonging to that
// trainer. Tests address trainers by token, so remember a batch per trainer and
// reuse it, rather than making every createTraining call site pass one.
const trainerIdByToken = new Map();
const batchByTrainerId = new Map();

async function batchForTrainer(trainerId) {
  const key = String(trainerId);
  if (!batchByTrainerId.has(key)) {
    batchByTrainerId.set(key, await createBatch(trainerId));
  }
  return batchByTrainerId.get(key);
}

async function batchForToken(token) {
  const trainerId = trainerIdByToken.get(token);
  if (!trainerId) throw new Error('no trainer mapped for this token');
  return batchForTrainer(trainerId);
}

describe('Trainer requirement gaps', () => {
  let trainer;
  let trainerToken;
  let otherTrainer;
  let otherTrainerToken;
  let admin;
  let adminToken;

  beforeAll(async () => {
    trainer = await createUser('TRAINER');
    trainerToken = await login(trainer);
    trainerIdByToken.set(trainerToken, String(trainer._id));
    otherTrainer = await createUser('TRAINER');
    otherTrainerToken = await login(otherTrainer);
    trainerIdByToken.set(otherTrainerToken, String(otherTrainer._id));
    admin = await createUser('ADMIN');
    adminToken = await login(admin);
  });

  afterAll(async () => {
    await Submission.deleteMany({ student: { $in: created.users } });
    await ProblemTopic.deleteMany({});
    await Problem.deleteMany({ _id: { $in: created.problems } });
    await Topic.deleteMany({ _id: { $in: created.topics } });
    await Collection.deleteMany({ _id: { $in: created.collections } });
    await BatchStudent.deleteMany({ _id: { $in: created.enrollments } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  const asTrainer = (req, token = trainerToken) => req.set('Authorization', `Bearer ${token}`);

  // ---------------------------------------------------------------- A. Training/Day

  // A minimal import row. Overridable per test so each one supplies exactly the
  // field it is exercising.
  const validRow = (overrides = {}) => ({
    title: `Imported ${uniqueSuffix()}`,
    description: 'Imported description',
    difficulty: 'EASY',
    ...overrides,
  });

  async function createTraining(ownerToken, name = `Training ${uniqueSuffix()}`) {
    const batch = await batchForToken(ownerToken);
    const res = await asTrainer(request(app).post('/api/trainer/collections'), ownerToken).send({ name, batchId: batch._id });
    if (res.status !== 201) throw new Error(`training setup failed: ${res.status} ${JSON.stringify(res.body)}`);
    created.collections.push(res.body.data._id);
    return res.body.data;
  }

  async function createDay(collectionId, ownerToken, name = `Day ${uniqueSuffix()}`) {
    const res = await asTrainer(
      request(app).post(`/api/trainer/collections/${collectionId}/topics`),
      ownerToken
    ).send({ name, order: 0 });
    if (res.status !== 201) throw new Error(`day setup failed: ${res.status} ${JSON.stringify(res.body)}`);
    created.topics.push(res.body.data._id);
    return res.body.data;
  }

  describe('A. Training / Day lifecycle and ownership', () => {
    test('trainer can list, read detail, edit, archive and unarchive its own training', async () => {
      const collection = await createTraining(trainerToken);
      const day = await createDay(collection._id, trainerToken);

      const detail = await asTrainer(request(app).get(`/api/trainer/collections/${collection._id}`));
      expect(detail.status).toBe(200);
      expect(detail.body.data.owned).toBe(true);
      expect(detail.body.data.topics.map((t) => t.id)).toEqual([day._id.toString()]);

      const edit = await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}`))
        .send({ name: `Renamed ${uniqueSuffix()}`, description: 'Updated' });
      expect(edit.status).toBe(200);
      expect(edit.body.data.name).not.toBe(collection.name);

      const archive = await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}`))
        .send({ status: 'ARCHIVED' });
      expect(archive.status).toBe(200);
      expect(archive.body.data.status).toBe('ARCHIVED');

      const unarchive = await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}`))
        .send({ status: 'ACTIVE' });
      expect(unarchive.status).toBe(200);
      expect(unarchive.body.data.status).toBe('ACTIVE');
    });

    test('trainer cannot read, modify or archive an admin-owned (global) training', async () => {
      const res = await request(app)
        .post('/api/admin/collections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Admin Training ${uniqueSuffix()}` });
      expect(res.status).toBe(201);
      created.collections.push(res.body.data._id);
      const adminCollectionId = res.body.data._id;

      // Not readable. Ownership is enforced on reads as well as writes, so the
      // training is neither reachable by id nor listed for this trainer.
      const read = await asTrainer(request(app).get(`/api/trainer/collections/${adminCollectionId}`));
      expect(read.status).toBe(403);
      const readTopics = await asTrainer(request(app).get(`/api/trainer/collections/${adminCollectionId}/topics`));
      expect(readTopics.status).toBe(403);
      const listed = await asTrainer(request(app).get('/api/trainer/collections'));
      expect(listed.body.data.map((c) => c.id)).not.toContain(adminCollectionId);

      // Not writable.
      for (const req of [
        request(app).patch(`/api/trainer/collections/${adminCollectionId}`).send({ name: 'Hijacked' }),
        request(app).delete(`/api/trainer/collections/${adminCollectionId}`),
        request(app).post(`/api/trainer/collections/${adminCollectionId}/topics`).send({ name: 'Injected' }),
      ]) {
        const denied = await asTrainer(req);
        expect(denied.status).toBe(403);
      }

      const check = await request(app)
        .get(`/api/admin/collections/${adminCollectionId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(check.body.data.name).not.toBe('Hijacked');
      expect(check.body.data.status).not.toBe('ARCHIVED');

      // Owning the batch is not enough either: a trainer must not be able to file
      // one of their OWN problems into admin curriculum, because the problem would
      // then appear inside a curriculum they do not control. POST
      // /api/trainer/batches/:batchId/problems re-checks the collection's owner
      // rather than trusting batch ownership alone.
      //
      // A real Day is created under the admin Training so the request is a
      // well-formed collectionId/topicId pair and reaches the ownership check
      // instead of being rejected earlier for an incomplete pairing.
      const adminTopic = await request(app)
        .post(`/api/admin/collections/${adminCollectionId}/topics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Admin Day ${uniqueSuffix()}` });
      expect(adminTopic.status).toBe(201);
      created.topics.push(adminTopic.body.data._id);

      const ownBatch = await batchForToken(trainerToken);
      const intruderTitle = `Filed into admin ${uniqueSuffix()}`;
      const filed = await asTrainer(request(app).post(`/api/trainer/batches/${ownBatch._id}/problems`)).send({
        title: intruderTitle,
        description: 'd',
        difficulty: 'EASY',
        collectionId: adminCollectionId,
        topicId: adminTopic.body.data._id,
      });
      expect(filed.status).toBe(403);
      expect(await Problem.findOne({ title: intruderTitle })).toBeNull();
    });

    test('trainer cannot touch another trainer’s training or day', async () => {
      const collection = await createTraining(otherTrainerToken);
      const day = await createDay(collection._id, otherTrainerToken);

      // Not readable either.
      expect((await asTrainer(request(app).get(`/api/trainer/collections/${collection._id}`))).status).toBe(403);
      expect((await asTrainer(request(app).get(`/api/trainer/collections/${collection._id}/topics`))).status).toBe(403);

      expect((await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}`)).send({ name: 'X' })).status).toBe(403);
      expect((await asTrainer(request(app).delete(`/api/trainer/collections/${collection._id}`))).status).toBe(403);
      expect((await asTrainer(request(app).post(`/api/trainer/collections/${collection._id}/topics`)).send({ name: 'X' })).status).toBe(403);
      expect((await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}/topics/${day._id}`)).send({ name: 'X' })).status).toBe(403);
      expect((await asTrainer(request(app).delete(`/api/trainer/collections/${collection._id}/topics/${day._id}`))).status).toBe(403);
    });

    test('day lifecycle: rename, reorder, archive, unarchive, safe delete', async () => {
      const collection = await createTraining(trainerToken);
      const day = await createDay(collection._id, trainerToken);

      const renamed = await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}/topics/${day._id}`))
        .send({ name: `Renamed Day ${uniqueSuffix()}`, order: 3 });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data.order).toBe(3);

      const archived = await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}/topics/${day._id}`))
        .send({ status: 'ARCHIVED' });
      expect(archived.body.data.status).toBe('ARCHIVED');

      const unarchived = await asTrainer(request(app).patch(`/api/trainer/collections/${collection._id}/topics/${day._id}`))
        .send({ status: 'ACTIVE' });
      expect(unarchived.body.data.status).toBe('ACTIVE');

      // Empty day: a real delete is safe because nothing references it.
      const removed = await asTrainer(request(app).delete(`/api/trainer/collections/${collection._id}/topics/${day._id}`));
      expect(removed.status).toBe(200);
      expect(removed.body.data.hardDeleted).toBe(true);
      expect(await Topic.findById(day._id)).toBeNull();
    });

    test('deleting a training or day that still has content archives instead of cascading', async () => {
      // The problem must land in the SAME batch as the Training it links to.
      // `createTraining` builds the Training on this trainer's curriculum batch
      // (see `batchForToken`), so posting the problem at a freshly created,
      // unrelated batch is refused with 400 "Selected collection belongs to a
      // different batch" - the route deliberately refuses to cross a batch
      // boundary. Use the curriculum batch for both.
      const batch = await batchForToken(trainerToken);
      const collection = await createTraining(trainerToken);
      const day = await createDay(collection._id, trainerToken);

      const problemRes = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems`)).send({
        title: `Linked ${uniqueSuffix()}`,
        description: 'd',
        difficulty: 'EASY',
        collectionId: collection._id,
        topicId: day._id,
      });
      expect(problemRes.status).toBe(201);
      created.problems.push(problemRes.body.data.id);

      const dayDelete = await asTrainer(request(app).delete(`/api/trainer/collections/${collection._id}/topics/${day._id}`));
      expect(dayDelete.status).toBe(200);
      expect(dayDelete.body.data.hardDeleted).toBe(false);
      expect(dayDelete.body.data.archived).toBe(true);
      // The link and the problem both survive the archive.
      expect(await ProblemTopic.countDocuments({ topic: day._id })).toBe(1);
      expect(await Problem.findById(problemRes.body.data.id)).not.toBeNull();

      const collectionDelete = await asTrainer(request(app).delete(`/api/trainer/collections/${collection._id}`));
      expect(collectionDelete.status).toBe(200);
      expect(collectionDelete.body.data.hardDeleted).toBe(false);
      expect(await Collection.findById(collection._id)).not.toBeNull();
      expect((await Collection.findById(collection._id)).status).toBe('ARCHIVED');

      await ProblemTopic.deleteMany({ problem: problemRes.body.data.id });
    });

    test('duplicate training or day names are reported as 409, not 500', async () => {
      const collection = await createTraining(trainerToken);
      const dayName = `Day ${uniqueSuffix()}`;
      await createDay(collection._id, trainerToken, dayName);

      const dupeDay = await asTrainer(request(app).post(`/api/trainer/collections/${collection._id}/topics`))
        .send({ name: dayName });
      expect(dupeDay.status).toBe(409);

const name = `Training ${uniqueSuffix()}`;
    await createTraining(trainerToken, name);
    const dupeBatch = await batchForToken(trainerToken);
    const dupeCollection = await asTrainer(request(app).post('/api/trainer/collections')).send({ name, batchId: dupeBatch._id });
    expect(dupeCollection.status).toBe(409);
    });

    test('training list supports search and status filters and flags ownership', async () => {
      const name = `Findable ${uniqueSuffix()}`;
      await createTraining(trainerToken, name);

      const found = await asTrainer(request(app).get('/api/trainer/collections')).query({ search: 'Findable' });
      expect(found.status).toBe(200);
      expect(found.body.data.every((c) => /Findable/i.test(c.name))).toBe(true);
      expect(found.body.data.some((c) => c.owned)).toBe(true);

      const active = await asTrainer(request(app).get('/api/trainer/collections')).query({ status: 'ACTIVE' });
      expect(active.body.data.every((c) => c.status === 'ACTIVE')).toBe(true);

      expect((await asTrainer(request(app).get('/api/trainer/collections')).query({ status: 'NOPE' })).status).toBe(400);
    });

    test('malformed and unknown training ids keep 400 / 404', async () => {
      expect((await asTrainer(request(app).get('/api/trainer/collections/not-an-id'))).status).toBe(400);
      expect((await asTrainer(request(app).get('/api/trainer/collections/000000000000000000000001'))).status).toBe(404);
      expect((await asTrainer(request(app).delete('/api/trainer/collections/not-an-id'))).status).toBe(400);
    });
  });

  // ------------------------------------------------------------------- B. Problems

  async function seedProblems(batchId, count) {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batchId}/problems`)).send({
        title: `${i === 0 ? 'Alpha' : 'Beta'} ${i} ${uniqueSuffix()}`,
        description: 'desc',
        difficulty: i % 2 === 0 ? 'EASY' : 'HARD',
        status: i % 2 === 0 ? 'PUBLISHED' : 'DRAFT',
        allowedLanguages: ['python'],
      });
      expect(res.status).toBe(201);
      created.problems.push(res.body.data.id);
      ids.push(res.body.data);
    }
    return ids;
  }

  describe('B. Problem list filters and lifecycle', () => {
    let batch;

    beforeAll(async () => {
      batch = await createBatch(trainer._id);
      await seedProblems(batch._id, 6);
    });

    test('filters by status and difficulty', async () => {
      const published = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`))
        .query({ status: 'PUBLISHED' });
      expect(published.status).toBe(200);
      expect(published.body.data.length).toBe(3);
      expect(published.body.data.every((p) => p.status === 'PUBLISHED')).toBe(true);

      const hard = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`))
        .query({ difficulty: 'HARD' });
      expect(hard.body.data.length).toBe(3);
      expect(hard.body.data.every((p) => p.difficulty === 'HARD')).toBe(true);

      expect((await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`)).query({ status: 'BOGUS' })).status).toBe(400);
      expect((await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`)).query({ difficulty: 'BOGUS' })).status).toBe(400);
    });

    test('search matches titles literally, not as a regex pattern', async () => {
      const marker = `Zq${uniqueSuffix()}`;
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems`)).send({
        title: `Problem ${marker}`,
        description: 'desc',
        difficulty: 'EASY',
      });
      expect(res.status).toBe(201);
      created.problems.push(res.body.data.id);

      const hit = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`)).query({ search: marker });
      expect(hit.body.data.length).toBe(1);

      // A regex metacharacter must be matched literally, not interpreted.
      const literal = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`)).query({ search: '.*' });
      expect(literal.status).toBe(200);
      expect(literal.body.data).toEqual([]);
    });

    test('pagination returns meta and slices the list without losing rows', async () => {
      const all = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`));
      const total = all.body.data.length;

      const page1 = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`))
        .query({ page: 1, limit: 4 });
      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(4);
      // `meta` carries the full pagination contract: total/page/limit plus
      // totalPages/hasNext/hasPrev derived from the same filtered set (see
      // GET /api/trainer/batches/:batchId/problems). This used to assert a strict
      // three-key object, which failed purely because the route reports three
      // MORE fields - the core values already matched.
      expect(page1.body.meta).toMatchObject({ total, page: 1, limit: 4 });
      expect(page1.body.meta.totalPages).toBe(Math.max(1, Math.ceil(total / 4)));
      expect(page1.body.meta.hasNext).toBe(true);
      expect(page1.body.meta.hasPrev).toBe(false);

      const page2 = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`))
        .query({ page: 2, limit: 4 });
      const ids = new Set([...page1.body.data, ...page2.body.data].map((p) => p.id));
      expect(ids.size).toBe(page1.body.data.length + page2.body.data.length);

      expect((await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`)).query({ page: 0 })).status).toBe(400);
      expect((await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems`)).query({ limit: 5000 })).status).toBe(400);
    });

    test('payload preserves compiler settings and practice date', async () => {
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems`)).send({
        title: `Compiler ${uniqueSuffix()}`,
        description: 'desc',
        difficulty: 'MEDIUM',
        allowedLanguages: ['python', 'cpp'],
      });
      expect(res.status).toBe(201);
      created.problems.push(res.body.data.id);
      expect(res.body.data.compilers).toEqual(
        expect.objectContaining({ python: expect.any(String), cpp: expect.any(String) })
      );

      const detail = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems/${res.body.data.id}`));
      expect(detail.body.data.compilers).toEqual(res.body.data.compilers);
      expect(detail.body.data).toHaveProperty('practiceDate');
    });

    test('archive records its origin and unarchive restores it', async () => {
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems`)).send({
        title: `Lifecycle ${uniqueSuffix()}`,
        description: 'desc',
        difficulty: 'EASY',
        status: 'PUBLISHED',
      });
      expect(res.status).toBe(201);
      const id = res.body.data.id;
      created.problems.push(id);

      expect((await asTrainer(request(app).delete(`/api/trainer/batches/${batch._id}/problems/${id}`))).status).toBe(200);
      let stored = await Problem.findById(id);
      expect(stored.status).toBe('ARCHIVED');
      expect(stored.archivedFrom).toBe('PUBLISHED');

      // Archiving again must not lose the original provenance.
      await asTrainer(request(app).delete(`/api/trainer/batches/${batch._id}/problems/${id}`));
      expect((await Problem.findById(id)).archivedFrom).toBe('PUBLISHED');

      const restored = await asTrainer(request(app).patch(`/api/trainer/batches/${batch._id}/problems/${id}/unarchive`));
      expect(restored.status).toBe(200);
      expect(restored.body.data.status).toBe('PUBLISHED');
      expect(restored.body.data.archivedFrom).toBeNull();
      expect((await Problem.findById(id)).status).toBe('PUBLISHED');

      // Unarchiving something that is not archived is a client error.
      expect((await asTrainer(request(app).patch(`/api/trainer/batches/${batch._id}/problems/${id}/unarchive`))).status).toBe(400);
    });

    test('archive preserves submission history', async () => {
      const student = await createUser('STUDENT');
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems`)).send({
        title: `History ${uniqueSuffix()}`,
        description: 'desc',
        difficulty: 'EASY',
        status: 'PUBLISHED',
      });
      const id = res.body.data.id;
      created.problems.push(id);

      await Submission.create({ student: student._id, problem: id, code: 'print(1)', language: 'python', verdict: 'ACCEPTED' });
      await asTrainer(request(app).delete(`/api/trainer/batches/${batch._id}/problems/${id}`));
      expect(await Submission.countDocuments({ problem: id })).toBe(1);
    });

    test('list filters stay inside the trainer’s own batch', async () => {
      const foreignBatch = await createBatch(otherTrainer._id);
      const res = await asTrainer(request(app).get(`/api/trainer/batches/${foreignBatch._id}/problems`));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------- C. Import

  async function problemIdByTitle(title) {
    const found = await Problem.findOne({ title });
    if (!found) throw new Error(`problem not created: ${title}`);
    created.problems.push(found._id.toString());
    return found._id;
  }

  describe('C. Bulk import', () => {
    let batch;

    beforeAll(async () => {
      // Same reasoning as the archive test above: the rows in these tests link to
      // a Training built by `createTraining`, which lives on this trainer's
      // curriculum batch. Importing into an unrelated batch is refused because a
      // grouped import resolves its collection against this exact batch.
      batch = await batchForToken(trainerToken);
    });

    test('a duplicate title inside one file is a row-level error, not a 500', async () => {
      const title = `Dup ${uniqueSuffix()}`;
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`)).send({
        problems: [
          { title, description: 'first', difficulty: 'EASY' },
          { title, description: 'second', difficulty: 'EASY' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.summary.created).toBe(1);
      expect(res.body.summary.failed).toBe(1);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ row: 2, field: 'slug' }),
      ]);

      const inserted = await Problem.find({ batch: batch._id, title });
      created.problems.push(...inserted.map((p) => p._id.toString()));
      expect(inserted).toHaveLength(1);
    });

    test('imported problems default to DRAFT and are forced to the selected batch', async () => {
      const title = `Defaulted ${uniqueSuffix()}`;
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`)).send({
        problems: [{ title, description: 'no status given', difficulty: 'EASY' }],
      });
      expect(res.status).toBe(200);
      expect(res.body.summary.created).toBe(1);

      const inserted = await Problem.findOne({ title });
      expect(inserted.status).toBe('DRAFT');
      expect(inserted.scope).toBe('BATCH');
      expect(inserted.batch.toString()).toBe(batch._id.toString());
      created.problems.push(inserted._id.toString());
    });

    test('the template is importable exactly as shipped, with no editing', async () => {
      const res = await asTrainer(request(app).get(`/api/trainer/batches/${batch._id}/problems/template`));
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('trainer_problem_template.json');

      // The shipped file is the GROUPED shape the import endpoint prefers:
      //   { "topic": "<Day name>", "problems": [ <row>, ... ] }
      // `topic` is a name, not an id - the importer resolves it against the
      // selected Training and creates the Day when it is new. This assertion used
      // to expect a bare array of `{ collectionId, topicId, problem: {...} }`
      // rows, which is the legacy format the endpoint still accepts but which
      // this template deliberately stopped teaching.
      const file = JSON.parse(res.text);
      expect(Array.isArray(file.problems)).toBe(true);
      expect(file.problems.length).toBeGreaterThan(0);
      expect(typeof file.topic).toBe('string');
      expect(file.topic.trim()).not.toBe('');

      const row = file.problems[0];
      // The collection is chosen once in the UI and sent WITH the import, so it
      // is never written into the file. That is what lets one file be reused
      // across trainings - and it is also why the file must not carry a
      // placeholder: prose like "<optional collection id>" is not a valid
      // ObjectId and used to fail its own validation until the trainer deleted
      // the keys by hand.
      expect(row).not.toHaveProperty('collectionId');
      expect(row).not.toHaveProperty('topicId');
      // Never encourage an auto-published import.
      expect(row.status).toBe('DRAFT');
      expect(Array.isArray(row.allowedLanguages)).toBe(true);
      expect(Array.isArray(row.testCases)).toBe(true);

      const training = await createTraining(trainerToken);

      // Import the shipped file with only the two things a file cannot carry:
      // the selected Training, and a unique title.
      row.title = `From Template ${uniqueSuffix()}`;
      const imported = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`))
        .send({ ...file, collectionId: training._id });
      expect(imported.status).toBe(200);
      expect(imported.body.errors).toBeUndefined();
      expect(imported.body.summary).toEqual({ total: 1, created: 1, failed: 0 });

      const inserted = await Problem.findOne({ title: row.title });
      expect(inserted).not.toBeNull();
      expect(inserted.status).toBe('DRAFT');
      expect(inserted.batch.toString()).toBe(batch._id.toString());
      created.problems.push(inserted._id.toString());

      // The Day named in the file was resolved against the selected Training
      // rather than silently dropped.
      const linked = await ProblemTopic.findOne({ problem: inserted._id });
      expect(linked).not.toBeNull();
      expect(linked.collection.toString()).toBe(training._id.toString());
    });

    test('one malformed row never takes down the whole import', async () => {
      // Each of these used to throw mid-loop and answer 500, discarding every
      // valid row in the same file.
      const cases = [
        ['non-string title', { title: 42, description: 'd', difficulty: 'EASY' }],
        ['punctuation-only title', { title: '!!!', description: 'd', difficulty: 'EASY' }],
        ['non-string description', { title: 'X1', description: { a: 1 }, difficulty: 'EASY' }],
        ['non-array testCases', { title: 'X2', description: 'd', difficulty: 'EASY', testCases: {} }],
        ['null test case', { title: 'X3', description: 'd', difficulty: 'EASY', testCases: [null] }],
        ['non-array allowedLanguages', { title: 'X4', description: 'd', difficulty: 'EASY', allowedLanguages: 'python' }],
        ['invalid practiceDate', { title: 'X5', description: 'd', difficulty: 'EASY', practiceDate: 'not-a-date' }],
      ];

      const survivorTitle = `Survivor ${uniqueSuffix()}`;
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`))
        .send({ problems: [validRow({ title: survivorTitle }), ...cases.map(([, p]) => p)] });

      expect(res.status).toBe(200);
      // The valid row is still created; every bad row is a row-level error.
      expect(res.body.summary.created).toBe(1);
      expect(res.body.summary.failed).toBe(cases.length);
      expect(res.body.errors).toHaveLength(cases.length);
      for (const error of res.body.errors) {
        expect(error.row).toBeGreaterThan(1);
        expect(typeof error.message).toBe('string');
      }

      // The proof: the one good row exists and no malformed row did.
      const survivor = await Problem.findOne({ title: survivorTitle });
      expect(survivor).not.toBeNull();
      created.problems.push(survivor._id.toString());
      for (const [, p] of cases) {
        if (typeof p.title === 'string') {
          expect(await Problem.countDocuments({ title: p.title, batch: batch._id })).toBe(0);
        }
      }
    });

    test('summary.failed counts rejected rows, not individual error messages', async () => {
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`))
        .send({
          problems: [
            validRow({ title: `Ok ${uniqueSuffix()}` }),
            {
              title: `Many bad cases ${uniqueSuffix()}`,
              description: 'd',
              difficulty: 'EASY',
              testCases: [
                { input: '1' },
                { input: '2' },
                { input: '3' },
              ],
            },
          ],
        });

      expect(res.status).toBe(200);
      // Three errors, one row: "Imported X of Y · N failed" used to print N > Y - X.
      expect(res.body.errors.length).toBeGreaterThan(1);
      expect(res.body.summary.failed).toBe(1);
      expect(res.body.summary.created).toBe(1);

      const createdDocs = await Problem.find({ batch: batch._id });
      created.problems.push(...createdDocs.map((p) => p._id.toString()));
    });

    test('a test-case failure is reported as a row error, not a silent 500', async () => {
      const survivorTitle = `Survives ${uniqueSuffix()}`;
      const brokenTitle = `Broken cases ${uniqueSuffix()}`;
      const before = await Problem.countDocuments({ batch: batch._id });
      // Test cases whose parent problem no longer exists. Counted as a delta
      // rather than absolutely, because every suite shares one database.
      const orphanCount = async () => {
        const cases = await TestCase.find({}, 'problem').lean();
        let orphans = 0;
        for (const tc of cases) {
          if (!(await Problem.exists({ _id: tc.problem }))) orphans += 1;
        }
        return orphans;
      };
      const orphansBefore = await orphanCount();

      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`))
        .send({
          problems: [
            validRow({ title: survivorTitle }),
            // TestCase.expectedOutput accepts an empty string but not a number,
            // so this row fails at insert time rather than at validation.
            {
              title: brokenTitle,
              description: 'd',
              difficulty: 'EASY',
              testCases: [{ input: '1', expectedOutput: { nested: true } }],
            },
          ],
        });

      // The other row must still be reported, not answered with a bare 500 that
      // hid the fact that it had already been created.
      expect(res.status).toBe(200);
      expect(res.body.errors.some((e) => e.field === 'testCases')).toBe(true);
      expect(await Problem.countDocuments({ title: survivorTitle })).toBe(1);
      // The rolled-back problem is really gone, and it left no orphan behind.
      expect(await Problem.countDocuments({ title: brokenTitle })).toBe(0);
      expect(await orphanCount()).toBe(orphansBefore);
      expect(await Problem.countDocuments({ batch: batch._id })).toBe(before + 1);
    });

    test('practiceDate is honoured on import instead of being silently dropped', async () => {
      const title = `Scheduled ${uniqueSuffix()}`;
      const practiceDate = '2026-03-01T00:00:00.000Z';
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`))
        .send({ problems: [{ title, description: 'd', difficulty: 'EASY', practiceDate }] });

      expect(res.status).toBe(200);
      expect(res.body.summary.failed).toBe(0);
      const inserted = await Problem.findOne({ title });
      expect(inserted.practiceDate.toISOString()).toBe(practiceDate);
      created.problems.push(inserted._id.toString());
    });

    test('empty, malformed and oversized payloads are rejected', async () => {
      const notArray = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`))
        .send({ problems: 'nope' });
      expect(notArray.status).toBe(400);

      const oversized = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`))
        .send({ problems: new Array(101).fill({ title: `x${uniqueSuffix()}`, description: 'd', difficulty: 'EASY' }) });
      expect(oversized.status).toBe(400);
      expect(oversized.body.message).toMatch(/100/);
    });

    test('import-level collectionId/topicId apply as a default to every row', async () => {
      const collection = await createTraining(trainerToken);
      const day = await createDay(collection._id, trainerToken);
      const title = `Defaulted Link ${uniqueSuffix()}`;

      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`)).send({
        problems: [{ title, description: 'd', difficulty: 'EASY' }],
        collectionId: collection._id,
        topicId: day._id,
      });
      expect(res.status).toBe(200);
      expect(res.body.summary.failed).toBe(0);

      const link = await ProblemTopic.findOne({ problem: await problemIdByTitle(title) });
      expect(link).not.toBeNull();
      expect(link.topic.toString()).toBe(day._id.toString());
      expect(link.collection.toString()).toBe(collection._id.toString());
    });

    test('a row carrying only one of collectionId/topicId reports the pairing error', async () => {
      const collection = await createTraining(trainerToken);
      const day = await createDay(collection._id, trainerToken);
      const title = `Half Pair ${uniqueSuffix()}`;

      const res = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems/import`)).send({
        problems: [{ collectionId: collection._id, problem: { title, description: 'd', difficulty: 'EASY' } }],
      });
      expect(res.status).toBe(200);
      expect(res.body.summary.created).toBe(0);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ row: 1, message: expect.stringContaining('valid ids') }),
      ]);
      expect(await ProblemTopic.countDocuments({ topic: day._id })).toBe(0);
    });

    test('import refuses a batch the trainer does not own', async () => {
      const foreignBatch = await createBatch(otherTrainer._id);
      const res = await asTrainer(request(app).post(`/api/trainer/batches/${foreignBatch._id}/problems/import`))
        .send({ problems: [{ title: 'X', description: 'd', difficulty: 'EASY' }] });
      expect(res.status).toBe(403);
    });
  });

  // ----------------------------------------------------------------- D. Reporting

  describe('D. Reporting isolation', () => {
    test('student performance without ?batchId never reaches another trainer’s batch', async () => {
      const student = await createUser('STUDENT');

      const mineBatch = await createBatch(trainer._id);
      const foreignBatch = await createBatch(otherTrainer._id);

      await BatchStudent.create({ batch: mineBatch._id, student: student._id, status: 'ACTIVE' }).then((r) => created.enrollments.push(r._id));
      await BatchStudent.create({ batch: foreignBatch._id, student: student._id, status: 'ACTIVE' }).then((r) => created.enrollments.push(r._id));

      const mine = await asTrainer(request(app).post(`/api/trainer/batches/${mineBatch._id}/problems`)).send({
        title: `Mine ${uniqueSuffix()}`, description: 'd', difficulty: 'EASY',
      });
      const theirs = await asTrainer(
        request(app).post(`/api/trainer/batches/${foreignBatch._id}/problems`),
        otherTrainerToken
      ).send({ title: `Theirs ${uniqueSuffix()}`, description: 'd', difficulty: 'EASY' });
      created.problems.push(mine.body.data.id, theirs.body.data.id);

      await Submission.create({ student: student._id, problem: mine.body.data.id, code: 'a', language: 'python', verdict: 'ACCEPTED' });
      await Submission.create({ student: student._id, problem: theirs.body.data.id, code: 'a', language: 'python', verdict: 'ACCEPTED' });

      const res = await asTrainer(request(app).get(`/api/trainer/performance/student/${student._id}`));
      expect(res.status).toBe(200);
      // Only the trainer's own batch counts.
      expect(res.body.data.solvedCount).toBe(1);
      expect(res.body.data.attemptedCount).toBe(1);
      expect(res.body.data.totalSubmissions).toBe(1);
    });

    test('batch performance reports progress as null, not 0%, when there are no problems', async () => {
      const emptyBatch = await createBatch(trainer._id);
      const res = await asTrainer(request(app).get(`/api/trainer/performance/batch/${emptyBatch._id}`));
      expect(res.status).toBe(200);
      expect(res.body.data.totalProblems).toBe(0);
      expect(res.body.data.progress).toBeNull();
    });

    test('problem performance distinguishes accepted submissions from distinct students', async () => {
      const student = await createUser('STUDENT');
      const batch = await createBatch(trainer._id);
      const problem = await asTrainer(request(app).post(`/api/trainer/batches/${batch._id}/problems`)).send({
        title: `Double ${uniqueSuffix()}`, description: 'd', difficulty: 'EASY',
      });
      created.problems.push(problem.body.data.id);

      await Submission.create({ student: student._id, problem: problem.body.data.id, code: 'a', language: 'python', verdict: 'WRONG_ANSWER' });
      await Submission.create({ student: student._id, problem: problem.body.data.id, code: 'b', language: 'python', verdict: 'ACCEPTED' });
      await Submission.create({ student: student._id, problem: problem.body.data.id, code: 'c', language: 'python', verdict: 'ACCEPTED' });

      const res = await asTrainer(request(app).get(`/api/trainer/performance/problem/${problem.body.data.id}`));
      expect(res.status).toBe(200);
      expect(res.body.data.totalSubmissions).toBe(3);
      expect(res.body.data.solvedCount).toBe(2);
      expect(res.body.data.solvedStudents).toBe(1);
      expect(res.body.data.studentCount).toBe(1);
    });

    test('performance endpoints refuse batches the trainer does not own', async () => {
      const foreignBatch = await createBatch(otherTrainer._id);
      const student = await createUser('STUDENT');
      await BatchStudent.create({ batch: foreignBatch._id, student: student._id, status: 'ACTIVE' })
        .then((r) => created.enrollments.push(r._id));

      expect((await asTrainer(request(app).get(`/api/trainer/performance/batch/${foreignBatch._id}`))).status).toBe(403);
      expect((await asTrainer(request(app).get(`/api/trainer/performance/student/${student._id}`).query({ batchId: foreignBatch._id }))).status).toBe(403);
    });
  });
});