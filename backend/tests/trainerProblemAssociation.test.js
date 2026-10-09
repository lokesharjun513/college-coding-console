const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const authService = require('../src/auth/authService');

async function createTestUser({ name, email, password, role = 'TRAINER' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Trainer Phase 1: ProblemTopic Association', () => {
  let trainerToken, trainer, batchId, adminToken;

  beforeAll(async () => {
    await ProblemTopic.deleteMany({});
    await Problem.deleteMany({});
    await Topic.deleteMany({});
    await Collection.deleteMany({});
    await Batch.deleteMany({});
    await User.deleteMany({});

    const adminEmail = 'admin@test.com';
    await createTestUser({ name: 'Admin', email: adminEmail, password: 'Password123!', role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, 'Password123!');

    trainer = await createTestUser({ name: 'Trainer', email: 'trainer@test.com', password: 'Password123!', role: 'TRAINER' });
    trainerToken = await loginAndGetToken('trainer@test.com', 'Password123!');

    const batchRes = await request(app)
      .post('/api/admin/batches')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Batch', code: 'B1', trainer: trainer._id });
    batchId = batchRes.body.data.id;
  });

  test('trainer can associate a problem with a collection and topic', async () => {
    const suffix = uniqueSuffix();
    const colRes = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Collection ' + suffix, slug: 'col-' + suffix });
    expect(colRes.status).toBe(201);
    const collectionId = colRes.body.data._id;

    const topicRes = await request(app)
      .post('/api/admin/collections/' + collectionId + '/topics')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Intro ' + suffix, slug: 'topic-' + suffix });
    expect(topicRes.status).toBe(201);
    const topicId = topicRes.body.data._id;

    const res = await request(app)
      .post('/api/trainer/batches/' + batchId + '/problems')
      .set('Authorization', 'Bearer ' + trainerToken)
      .send({
        title: 'Problem 1',
        description: 'Desc',
        difficulty: 'EASY',
        collectionId,
        topicId
      });
    // eslint-disable-next-line no-console
    if (res.status !== 201) console.log(JSON.stringify(res.body));

    expect(res.status).toBe(201);

    const pt = await ProblemTopic.findOne({ problem: res.body.data.id });
    expect(pt).toBeDefined();
    expect(pt.collection.toString()).toBe(collectionId);
    expect(pt.topic.toString()).toBe(topicId);
  });

  // Phase 4: problem payloads must carry their Training/Day association so the
  // trainer Training management UI can assemble a Day's problem list.
  test('batch problem list exposes collectionId/topicId per problem', async () => {
    const suffix = uniqueSuffix();
    const colRes = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'List Collection ' + suffix, slug: 'list-col-' + suffix });
    const collectionId = colRes.body.data._id;
    const topicRes = await request(app)
      .post('/api/admin/collections/' + collectionId + '/topics')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'List Topic ' + suffix, slug: 'list-topic-' + suffix });
    const topicId = topicRes.body.data._id;

    const createRes = await request(app)
      .post('/api/trainer/batches/' + batchId + '/problems')
      .set('Authorization', 'Bearer ' + trainerToken)
      .send({ title: 'Assoc Problem ' + suffix, description: 'Desc', difficulty: 'EASY', collectionId, topicId });
    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/trainer/batches/' + batchId + '/problems')
      .set('Authorization', 'Bearer ' + trainerToken);
    expect(listRes.status).toBe(200);
    const created = listRes.body.data.find(p => p.id === createRes.body.data.id);
    expect(created).toBeDefined();
    expect(created.collectionId).toBe(collectionId);
    expect(created.topicId).toBe(topicId);

    // Single GET exposes the association too
    const singleRes = await request(app)
      .get(`/api/trainer/batches/${batchId}/problems/${createRes.body.data.id}`)
      .set('Authorization', 'Bearer ' + trainerToken);
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.data.collectionId).toBe(collectionId);
    expect(singleRes.body.data.topicId).toBe(topicId);
  });
});
