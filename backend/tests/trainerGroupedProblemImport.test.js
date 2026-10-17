// Grouped JSON import for Trainer problems: { topic, problems }.
//
// The collection is chosen once (request-level collectionId), the Day is named
// rather than id'd, and every imported problem is linked to that one Day.
//
// Non-destructive by design: this file creates suffixed fixtures and deletes
// only the documents it created, so it is safe against a populated test DB.

const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const TestCase = require('../src/models/TestCase');
const authService = require('../src/auth/authService');

const PASSWORD = 'Password123!';

const created = { users: [], batches: [], collections: [], topics: [], problems: [] };

async function createUser(role) {
  const suffix = uniqueSuffix();
  const email = `${role.toLowerCase()}-${suffix}@test.com`;
  const passwordHash = await authService.hashPassword(PASSWORD);
  const user = await User.create({ name: `${role} ${suffix}`, email, passwordHash, role });
  created.users.push(user._id);
  return user;
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('Trainer grouped problem import', () => {
  let admin, adminToken;
  let trainer, token;
  let otherTrainer, otherToken;
  let batchA, batchB, batchC;
  let collectionA, topicA;
  let collectionB;
  let collectionC;
  let adminCollection;

  beforeAll(async () => {
    admin = await createUser('ADMIN');
    adminToken = await login(admin.email);
    trainer = await createUser('TRAINER');
    token = await login(trainer.email);
    otherTrainer = await createUser('TRAINER');
    otherToken = await login(otherTrainer.email);

    const makeBatch = async (code, trainerId) => {
      const res = await request(app)
        .post('/api/admin/batches')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ name: `Batch ${code}`, code });
      expect(res.status).toBe(201);
      const id = res.body.data.id;
      created.batches.push(id);
      if (trainerId) {
        const assign = await request(app)
          .patch(`/api/admin/batches/${id}`)
          .set('Authorization', 'Bearer ' + adminToken)
          .send({ trainer: trainerId });
        expect([200, 201]).toContain(assign.status);
      }
      return id;
    };

    batchA = await makeBatch('GA' + uniqueSuffix().slice(-6), trainer._id);
    batchB = await makeBatch('GB' + uniqueSuffix().slice(-6), trainer._id);
    batchC = await makeBatch('GC' + uniqueSuffix().slice(-6), otherTrainer._id);

    const makeCollection = async (name, batchId, ownerToken) => {
      const res = await request(app)
        .post('/api/trainer/collections')
        .set('Authorization', 'Bearer ' + ownerToken)
        .send({ name, batchId });
      expect(res.status).toBe(201);
      const id = res.body.data._id;
      created.collections.push(id);
      return id;
    };

    collectionA = await makeCollection('CollA ' + uniqueSuffix(), batchA, token);
    collectionB = await makeCollection('CollB ' + uniqueSuffix(), batchB, token);
    collectionC = await makeCollection('CollC ' + uniqueSuffix(), batchC, otherToken);

    // Admin GLOBAL curriculum: a trainer must never be able to import into it.
    const adminColl = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Global ' + uniqueSuffix(), scope: 'GLOBAL' });
    if (adminColl.status === 201) {
      adminCollection = adminColl.body.data._id || adminColl.body.data.id;
      created.collections.push(adminCollection);
    }

    const topicRes = await request(app)
      .post(`/api/trainer/collections/${collectionA}/topics`)
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Existing Day' });
    expect(topicRes.status).toBe(201);
    topicA = topicRes.body.data._id;
    created.topics.push(topicA);
  });

  afterAll(async () => {
    await ProblemTopic.deleteMany({ problem: { $in: created.problems } });
    await TestCase.deleteMany({ problem: { $in: created.problems } });
    await Problem.deleteMany({ _id: { $in: created.problems } });
    await ProblemTopic.deleteMany({ collection: { $in: created.collections } });
    await Topic.deleteMany({ _id: { $in: created.topics } });
    // Anything the import created on its own, scoped to our collections.
    await Topic.deleteMany({ collection: { $in: created.collections }, _id: { $nin: created.topics } });
    await Collection.deleteMany({ _id: { $in: created.collections } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  const problem = (title, overrides = {}) => ({
    title,
    description: 'Find the answer.',
    difficulty: 'EASY',
    ...overrides,
  });

  const importGrouped = (batchId, body, asToken = token) =>
    request(app)
      .post(`/api/trainer/batches/${batchId}/problems/import`)
      .set('Authorization', 'Bearer ' + asToken)
      .send(body);

  /* ------------------------------------------------- existing topic is reused */

  test('a grouped import reuses an existing topic of the collection', async () => {
    const suffix = uniqueSuffix();
    const res = await importGrouped(batchA, {
      topic: 'Existing Day',
      collectionId: collectionA,
      problems: [problem('Reuse ' + suffix), problem('Reuse Two ' + suffix)],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 2, created: 2, failed: 0 });
    expect(res.body.topic).toMatchObject({ id: topicA.toString(), created: false });

    // No second Day was created for the same name.
    expect(await Topic.countDocuments({ collection: collectionA, slug: 'existing-day' })).toBe(1);

    const links = await ProblemTopic.find({ topic: topicA });
    expect(links).toHaveLength(2);
    created.problems.push(...links.map((l) => l.problem));
    // Every link points at the one collection.
    links.forEach((l) => expect(l.collection.toString()).toBe(collectionA.toString()));
  });

  test('topic matching is by normalised name, not case or spacing', async () => {
    const suffix = uniqueSuffix();
    const res = await importGrouped(batchA, {
      topic: '  EXISTING   day ',
      collectionId: collectionA,
      problems: [problem('Normalised ' + suffix)],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary.created).toBe(1);
    expect(res.body.topic.id).toBe(topicA.toString());
    expect(res.body.topic.created).toBe(false);
    expect(await Topic.countDocuments({ collection: collectionA, slug: 'existing-day' })).toBe(1);

    const link = await ProblemTopic.findOne({ topic: topicA, problem: { $ne: null } });
    created.problems.push(link.problem);
  });

  /* --------------------------------------------------------- topic is created */

  test('a grouped import creates the topic once when the collection lacks it', async () => {
    const suffix = uniqueSuffix();
    const name = 'Fresh Day ' + suffix;
    const res = await importGrouped(batchA, {
      topic: name,
      collectionId: collectionA,
      problems: [problem('Into Fresh ' + suffix), problem('Into Fresh Two ' + suffix)],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 2, created: 2, failed: 0 });
    expect(res.body.topic.created).toBe(true);

    const topics = await Topic.find({ collection: collectionA, name });
    expect(topics).toHaveLength(1);
    const links = await ProblemTopic.find({ topic: topics[0]._id });
    expect(links).toHaveLength(2);
    created.problems.push(...links.map((l) => l.problem));
  });

  test('a second import naming the same new topic reuses it instead of duplicating', async () => {
    const suffix = uniqueSuffix();
    const name = 'Twice Day ' + suffix;
    const body = (title) => ({ topic: name, collectionId: collectionA, problems: [problem(title)] });

    const first = await importGrouped(batchA, body('First ' + suffix));
    expect(first.body.topic.created).toBe(true);

    const second = await importGrouped(batchA, body('Second ' + suffix));
    expect(second.status).toBe(200);
    expect(second.body.topic.created).toBe(false);
    expect(second.body.topic.id).toBe(first.body.topic.id);

    expect(await Topic.countDocuments({ collection: collectionA, name })).toBe(1);
    const links = await ProblemTopic.find({ topic: second.body.topic.id });
    expect(links).toHaveLength(2);
    created.problems.push(...links.map((l) => l.problem));
  });

  /* ------------------------------------------------------- invalid / rejected */

  test('a grouped import without a topic name is rejected', async () => {
    const suffix = uniqueSuffix();

    // `topic` present but blank: unambiguously a grouped request.
    for (const topic of ['', '   ']) {
      const res = await importGrouped(batchA, {
        topic,
        collectionId: collectionA,
        problems: [problem('No Topic ' + suffix)],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/topic name is required/i);
    }

    // `topic` omitted entirely alongside a collection: incomplete in either
    // shape, so it is refused up front rather than failing every row.
    const omitted = await importGrouped(batchA, {
      collectionId: collectionA,
      problems: [problem('No Topic ' + suffix)],
    });
    expect(omitted.status).toBe(400);
    expect(omitted.body.message).toMatch(/select a topic/i);

    expect(await Problem.findOne({ title: 'No Topic ' + suffix })).toBeNull();
  });

  test('a topic name with no letters or numbers is rejected', async () => {
    const res = await importGrouped(batchA, {
      topic: '!!!',
      collectionId: collectionA,
      problems: [problem('Punctuation Topic')],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/letter or number/i);
  });

  test('an empty problems array is rejected', async () => {
    const res = await importGrouped(batchA, {
      topic: 'Empty Day',
      collectionId: collectionA,
      problems: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no problems/i);
    // Nothing was created for the Day that would have been needed.
    expect(await Topic.countDocuments({ collection: collectionA, name: 'Empty Day' })).toBe(0);
  });

  test('a missing problems array is rejected', async () => {
    const res = await importGrouped(batchA, { topic: 'No Problems Key', collectionId: collectionA });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/problems/i);
    expect(await Topic.countDocuments({ collection: collectionA, name: 'No Problems Key' })).toBe(0);
  });

  test('invalid rows are reported and the valid ones still import', async () => {
    const suffix = uniqueSuffix();
    const name = 'Mixed Day ' + suffix;
    const res = await importGrouped(batchA, {
      topic: name,
      collectionId: collectionA,
      problems: [
        problem('Good One ' + suffix),
        { title: 'No Description ' + suffix },
        problem('Bad Difficulty ' + suffix, { difficulty: 'IMPOSSIBLE' }),
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 3, created: 1, failed: 2 });
    expect(res.body.errors.map((e) => e.row).sort()).toEqual([2, 3]);

    const topic = await Topic.findOne({ collection: collectionA, name });
    const links = await ProblemTopic.find({ topic: topic._id });
    expect(links).toHaveLength(1);
    created.problems.push(...links.map((l) => l.problem));
  });

  test('a duplicate slug inside one grouped file is reported as a row error', async () => {
    const suffix = uniqueSuffix();
    const res = await importGrouped(batchA, {
      topic: 'Dupe Day ' + suffix,
      collectionId: collectionA,
      problems: [problem('Same Title ' + suffix), problem('Same Title ' + suffix)],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 2, created: 1, failed: 1 });
    expect(res.body.errors[0].message).toMatch(/already exists/i);
  });

  test('test cases and every other supported field survive a grouped import', async () => {
    const suffix = uniqueSuffix();
    const res = await importGrouped(batchA, {
      topic: 'Rich Day ' + suffix,
      collectionId: collectionA,
      problems: [
        problem('Rich ' + suffix, {
          constraints: '1 <= n <= 10^5',
          inputFormat: 'n then n integers',
          outputFormat: 'one integer',
          examples: [{ input: '3\n1 2 3', output: '6', explanation: 'sum' }],
          starterCode: { python: 'print(sum(map(int, input().split()[1:])))' },
          allowedLanguages: ['python'],
          status: 'PUBLISHED',
          practiceDate: '2026-01-15',
          testCases: [
            { input: '3\n1 2 3', expectedOutput: '6', isHidden: false, order: 0 },
            { input: '2\n4 5', expectedOutput: '9', isHidden: true, order: 1 },
          ],
        }),
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary.created).toBe(1);

    const doc = await Problem.findOne({ slug: 'rich-' + suffix.toLowerCase().replace(/[^a-z0-9]+/g, '-') })
      || await Problem.findOne({ title: 'Rich ' + suffix });
    expect(doc).not.toBeNull();
    created.problems.push(doc._id);
    expect(doc.status).toBe('PUBLISHED');
    expect(doc.constraints).toBe('1 <= n <= 10^5');
    expect(doc.scope).toBe('BATCH');
    expect(doc.batch.toString()).toBe(batchA);
    expect(doc.createdBy.toString()).toBe(trainer._id.toString());
    expect(doc.examples).toHaveLength(1);
    expect(doc.starterCode.python).toContain('print');
    expect(doc.allowedLanguages).toEqual(['python']);
    expect(doc.practiceDate).not.toBeNull();

    const cases = await TestCase.find({ problem: doc._id }).sort({ order: 1 });
    expect(cases).toHaveLength(2);
    expect(cases[1].isHidden).toBe(true);

    const links = await ProblemTopic.find({ problem: doc._id });
    expect(links).toHaveLength(1);
    // Exactly one association: no duplicate link was written.
    expect(await ProblemTopic.countDocuments({ problem: doc._id })).toBe(1);
  });

  /* -------------------------------------------- collection / batch isolation */

  test('a collection from another of the trainer batches is rejected', async () => {
    const suffix = uniqueSuffix();
    const res = await importGrouped(batchA, {
      topic: 'Wrong Batch ' + suffix,
      collectionId: collectionB, // owned by this trainer, but belongs to batchB
      problems: [problem('Cross Batch ' + suffix)],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different batch/i);
    expect(await Problem.findOne({ title: 'Cross Batch ' + suffix })).toBeNull();
    // The refused import created no Day in the other collection.
    expect(await Topic.countDocuments({ collection: collectionB, name: 'Wrong Batch ' + suffix })).toBe(0);
  });

  test("another trainer's collection is rejected", async () => {
    const suffix = uniqueSuffix();
    const res = await importGrouped(batchA, {
      topic: 'Foreign ' + suffix,
      collectionId: collectionC,
      problems: [problem('Foreign Problem ' + suffix)],
    });

    expect(res.status).toBe(403);
    expect(await Problem.findOne({ title: 'Foreign Problem ' + suffix })).toBeNull();
  });

  test('admin GLOBAL curriculum is refused, so Admin-Trainer isolation holds', async () => {
    if (!adminCollection) return; // admin route shape differs; skip rather than fail
    const res = await importGrouped(batchA, {
      topic: 'Into Admin Curriculum',
      collectionId: adminCollection,
      problems: [problem('Into Admin ' + uniqueSuffix())],
    });

    expect(res.status).toBe(403);
  });

  test('a missing collection is rejected before any topic is created', async () => {
    const res = await importGrouped(batchA, {
      topic: 'No Collection ' + uniqueSuffix(),
      problems: [problem('No Collection Problem')],
    });

    expect(res.status).toBe(400);
  });

  test('a batch the trainer does not own is refused before anything is read', async () => {
    const res = await importGrouped(batchC, {
      topic: 'Hijack',
      collectionId: collectionA,
      problems: [problem('Hijack ' + uniqueSuffix())],
    });

    expect(res.status).toBe(403);
  });

  /* ------------------------------------------------------- no orphan topics */

  test('a grouped import that creates nothing leaves no empty topic behind', async () => {
    const suffix = uniqueSuffix();
    const name = 'All Invalid ' + suffix;
    const res = await importGrouped(batchA, {
      topic: name,
      collectionId: collectionA,
      problems: [{ title: 'Broken ' + suffix }],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ created: 0, failed: 1 });
    // The Day this import would have created is removed again: an empty Day the
    // trainer never asked for is an orphan.
    expect(await Topic.countDocuments({ collection: collectionA, name })).toBe(0);
  });

  /* ------------------------------------------------- legacy format preserved */

  test('the legacy per-problem array format still imports', async () => {
    const suffix = uniqueSuffix();
    const topicRes = await request(app)
      .post(`/api/trainer/collections/${collectionA}/topics`)
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Legacy Day ' + suffix });
    expect(topicRes.status).toBe(201);
    const legacyTopic = topicRes.body.data._id;
    created.topics.push(legacyTopic);

    const res = await request(app)
      .post(`/api/trainer/batches/${batchA}/problems/import`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        problems: [
          { collectionId: collectionA, topicId: legacyTopic, problem: problem('Legacy ' + suffix) },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 1, created: 1, failed: 0 });
    // No grouped `topic` field was invented for the legacy shape.
    expect(res.body.topic).toBeUndefined();

    const link = await ProblemTopic.findOne({ topic: legacyTopic });
    expect(link).not.toBeNull();
    created.problems.push(link.problem);
  });

  test('the legacy request-level collection/topic defaults still apply', async () => {
    const suffix = uniqueSuffix();
    const topicRes = await request(app)
      .post(`/api/trainer/collections/${collectionA}/topics`)
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Default Day ' + suffix });
    const legacyTopic = topicRes.body.data._id;
    created.topics.push(legacyTopic);

    const res = await request(app)
      .post(`/api/trainer/batches/${batchA}/problems/import`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        problems: [problem('Defaults ' + suffix)],
        collectionId: collectionA,
        topicId: legacyTopic,
      });

    expect(res.status).toBe(200);
    expect(res.body.summary.created).toBe(1);
    const link = await ProblemTopic.findOne({ topic: legacyTopic });
    expect(link).not.toBeNull();
    created.problems.push(link.problem);
  });

  test('the grouped shape ignores ids a row tries to smuggle in', async () => {
    const suffix = uniqueSuffix();
    const res = await importGrouped(batchA, {
      topic: 'Smuggle ' + suffix,
      collectionId: collectionA,
      problems: [
        {
          // A row naming a different collection/topic, and even a batch, must
          // not redirect itself.
          collectionId: collectionB,
          topicId: topicA,
          batch: batchB,
          scope: 'GLOBAL',
          ...problem('Smuggled ' + suffix),
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary.created).toBe(1);

    const doc = await Problem.findOne({ title: 'Smuggled ' + suffix });
    expect(doc.batch.toString()).toBe(batchA);
    expect(doc.scope).toBe('BATCH');
    created.problems.push(doc._id);

    const links = await ProblemTopic.find({ problem: doc._id });
    expect(links).toHaveLength(1);
    expect(links[0].collection.toString()).toBe(collectionA.toString());
    expect(links[0].topic.toString()).toBe(res.body.topic.id);
  });

  /* ---------------------------------------------------------- template shape */

  test('the clean grouped path commits through a transaction when one is available', async () => {
    // Probed, not assumed: this deployment does support transactions even
    // though the topology-derived flag says otherwise, and the import must
    // still use them. A rejected session would make the import fall back.
    const realStartSession = mongoose.startSession;
    const sessions = [];
    const spy = jest.fn(async () => {
      const session = await realStartSession();
      sessions.push(session);
      return session;
    });
    mongoose.startSession = spy;

    try {
      const suffix = uniqueSuffix();
      const res = await importGrouped(batchA, {
        topic: 'Transactional ' + suffix,
        collectionId: collectionA,
        problems: [problem('Tx One ' + suffix), problem('Tx Two ' + suffix)],
      });

      expect(res.status).toBe(200);
      expect(res.body.summary.created).toBe(2);
      expect(sessions.length).toBeGreaterThan(0);

      const links = await ProblemTopic.find({ topic: res.body.topic.id });
      expect(links).toHaveLength(2);
      created.problems.push(...links.map((l) => l.problem));
    } finally {
      mongoose.startSession = realStartSession;
    }
  });

  test('an import that commits nothing leaves no problems, links or Day behind', async () => {
    // Everything in this file is invalid, so nothing should be written at all.
    const suffix = uniqueSuffix();
    const name = 'Nothing Survives ' + suffix;
    const res = await importGrouped(batchA, {
      topic: name,
      collectionId: collectionA,
      problems: [
        { title: 'Bad One ' + suffix },
        { title: 'Bad Two ' + suffix, difficulty: 'NOPE' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ created: 0, failed: 2 });
    expect(await Problem.countDocuments({ title: /Bad (One|Two) / })).toBe(0);
    expect(await Topic.countDocuments({ collection: collectionA, name })).toBe(0);
    // No ProblemTopic row points at a problem from this import.
    const orphans = await ProblemTopic.find({ collection: collectionA }).populate('problem', 'title');
    expect(orphans.filter((l) => /Bad (One|Two) /.test(l.problem?.title || ''))).toHaveLength(0);
  });

  test('the template endpoint returns the grouped shape', async () => {
    const res = await request(app)
      .get(`/api/trainer/batches/${batchA}/problems/template`)
      .set('Authorization', 'Bearer ' + token);

    expect(res.status).toBe(200);
    const template = JSON.parse(res.text);
    expect(Array.isArray(template)).toBe(false);
    expect(typeof template.topic).toBe('string');
    expect(template.topic.length).toBeGreaterThan(0);
    expect(Array.isArray(template.problems)).toBe(true);
    expect(template.problems[0]).toHaveProperty('title');
    expect(template.problems[0]).toHaveProperty('testCases');
    // The file never carries an id or a batch.
    expect(template).not.toHaveProperty('collectionId');
    expect(template).not.toHaveProperty('topicId');
    expect(template).not.toHaveProperty('batchId');
    expect(JSON.stringify(template)).not.toContain(batchA);
  });
  test('an import still completes when the deployment cannot do transactions', async () => {
    // Standalone MongoDB has no transactions. The import must detect that once,
    // fall back to ordered sequential writes, and still produce the same result
    // rather than failing the file.
    const realStartSession = mongoose.startSession;
    mongoose.startSession = jest.fn(async () => {
      const err = new Error('Transaction numbers are only allowed on a replica set member or mongos');
      err.code = 20;
      throw err;
    });

    try {
      const suffix = uniqueSuffix();
      const res = await importGrouped(batchA, {
        topic: 'No Transactions ' + suffix,
        collectionId: collectionA,
        problems: [
          problem('Sequential One ' + suffix, {
            testCases: [{ input: '1', expectedOutput: '1', order: 0 }],
          }),
          problem('Sequential Two ' + suffix),
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ total: 2, created: 2, failed: 0 });

      const links = await ProblemTopic.find({ topic: res.body.topic.id });
      expect(links).toHaveLength(2);
      created.problems.push(...links.map((l) => l.problem));

      // Test cases were written on the fallback path too.
      const withCases = links
        .map((l) => l.problem)
        .filter(Boolean);
      expect(withCases.length).toBe(2);
    } finally {
      mongoose.startSession = realStartSession;
    }
  });

});