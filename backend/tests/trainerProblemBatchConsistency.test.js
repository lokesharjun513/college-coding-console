// Regression coverage for collection <-> batch consistency in Trainer problems.
//
// A Training (collection) belongs to exactly one batch. Owning a collection is
// not enough to link it into a problem of a different batch: a trainer assigned
// to two batches could otherwise point one batch's problems at the other
// batch's curriculum, and those problems would surface outside their batch.
//
// This file deliberately does NOT call deleteMany({}) on any shared collection.
// It creates suffixed fixtures and removes only the documents it created, so it
// is safe to run against a populated test database.

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
const authService = require('../src/auth/authService');

const PASSWORD = 'Password123!';

const created = {
  users: [],
  batches: [],
  collections: [],
  topics: [],
  problems: [],
  links: [],
};

async function createTestUser(role) {
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

describe('Trainer problems: a collection must belong to the problem batch', () => {
  let admin, adminToken;
  let trainerA, trainerAToken; // owns batchA and batchB
  let trainerB; // owns batchC, and therefore an unrelated collection
  let batchA, batchB, batchC;

  let collectionA; // batchA
  let topicA;
  let collectionB; // batchB, same trainer
  let topicB;
  let collectionC; // batchC, different trainer
  let topicC;

  beforeAll(async () => {
    admin = await createTestUser('ADMIN');
    adminToken = await login(admin.email);
    trainerA = await createTestUser('TRAINER');
    trainerAToken = await login(trainerA.email);
    trainerB = await createTestUser('TRAINER');
    const trainerBToken = await login(trainerB.email);

    const makeBatch = async (code, trainerId) => {
      const res = await request(app)
        .post('/api/admin/batches')
        .set('Authorization', 'Bearer ' + adminToken)
        .send({ name: `Batch ${code}`, code, trainer: trainerId });
      expect(res.status).toBe(201);
      const id = res.body.data.id;
      created.batches.push(id);
      return id;
    };

    batchA = await makeBatch('BA' + uniqueSuffix().slice(-6), trainerA._id);
    batchB = await makeBatch('BB' + uniqueSuffix().slice(-6), trainerA._id);
    batchC = await makeBatch('BC' + uniqueSuffix().slice(-6), trainerB._id);

    const makeCollection = async (name, batchId, token) => {
      const res = await request(app)
        .post('/api/trainer/collections')
        .set('Authorization', 'Bearer ' + token)
        .send({ name, batchId });
      expect(res.status).toBe(201);
      const id = res.body.data._id;
      created.collections.push(id);
      const topicRes = await request(app)
        .post(`/api/trainer/collections/${id}/topics`)
        .set('Authorization', 'Bearer ' + token)
        .send({ name: name + ' topic' });
      expect(topicRes.status).toBe(201);
      created.topics.push(topicRes.body.data._id);
      return { id, topicId: topicRes.body.data._id };
    };

    ({ id: collectionA, topicId: topicA } = await makeCollection('CollA', batchA, trainerAToken));
    ({ id: collectionB, topicId: topicB } = await makeCollection('CollB', batchB, trainerAToken));
    ({ id: collectionC, topicId: topicC } = await makeCollection('CollC', batchC, trainerBToken));
  });

  afterAll(async () => {
    // Remove only what this file created.
    await ProblemTopic.deleteMany({ problem: { $in: created.problems } });
    await Problem.deleteMany({ _id: { $in: created.problems } });
    await Topic.deleteMany({ _id: { $in: created.topics } });
    await Collection.deleteMany({ _id: { $in: created.collections } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  const validProblem = (title) => ({
    title,
    description: 'Find the answer.',
    difficulty: 'EASY',
  });

  const createProblem = async (batchId, body) =>
    request(app)
      .post(`/api/trainer/batches/${batchId}/problems`)
      .set('Authorization', 'Bearer ' + trainerAToken)
      .send(body);

  const importProblems = async (batchId, problems) =>
    request(app)
      .post(`/api/trainer/batches/${batchId}/problems/import`)
      .set('Authorization', 'Bearer ' + trainerAToken)
      .send({ problems });

  test('single create accepts a collection from the same batch', async () => {
    const suffix = uniqueSuffix();
    const res = await createProblem(batchA, {
      ...validProblem('Same Batch ' + suffix),
      collectionId: collectionA,
      topicId: topicA,
    });

    expect(res.status).toBe(201);
    created.problems.push(res.body.data.id);
  });

  test('single create rejects a collection owned by the trainer but from another batch', async () => {
    const suffix = uniqueSuffix();
    const res = await createProblem(batchA, {
      ...validProblem('Cross Batch ' + suffix),
      collectionId: collectionB, // trainerA owns it, but it belongs to batchB
      topicId: topicB,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different batch/i);
    // Nothing may be persisted for a rejected association.
    const orphan = await Problem.findOne({ title: 'Cross Batch ' + suffix });
    expect(orphan).toBeNull();
  });

  test('single create still rejects another trainer collection before the batch check', async () => {
    const suffix = uniqueSuffix();
    const res = await createProblem(batchA, {
      ...validProblem('Other Trainer ' + suffix),
      collectionId: collectionC,
      topicId: topicC,
    });

    expect(res.status).toBe(403);
    expect(await Problem.findOne({ title: 'Other Trainer ' + suffix })).toBeNull();
  });

  test('import accepts rows whose collection belongs to the batch', async () => {
    const suffix = uniqueSuffix();
    const res = await importProblems(batchA, [
      { collectionId: collectionA, topicId: topicA, problem: validProblem('Imported OK ' + suffix) },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 1, created: 1, failed: 0 });
    expect(res.body.errors).toBeUndefined();

    const doc = await Problem.findOne({ title: 'Imported OK ' + suffix });
    expect(doc).not.toBeNull();
    created.problems.push(doc._id);
  });

  test('import reports a row error for a cross-batch collection and imports nothing for it', async () => {
    const suffix = uniqueSuffix();
    const res = await importProblems(batchA, [
      { collectionId: collectionB, topicId: topicB, problem: validProblem('Imported Cross ' + suffix) },
    ]);

    // The row is rejected, but the request itself is not an error.
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 1, created: 0, failed: 1 });
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].message).toMatch(/different batch/i);
    expect(await Problem.findOne({ title: 'Imported Cross ' + suffix })).toBeNull();
  });

  test('import still rejects another trainer collection with the ownership message', async () => {
    const suffix = uniqueSuffix();
    const res = await importProblems(batchA, [
      { collectionId: collectionC, topicId: topicC, problem: validProblem('Imported Foreign ' + suffix) },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ created: 0, failed: 1 });
    expect(res.body.errors[0].message).toMatch(/not yours/i);
    expect(await Problem.findOne({ title: 'Imported Foreign ' + suffix })).toBeNull();
  });

  test('one bad row does not block the valid rows in the same import', async () => {
    const suffix = uniqueSuffix();
    const res = await importProblems(batchA, [
      { collectionId: collectionB, topicId: topicB, problem: validProblem('Partial Bad ' + suffix) },
      { collectionId: collectionA, topicId: topicA, problem: validProblem('Partial Good ' + suffix) },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 2, created: 1, failed: 1 });

    expect(await Problem.findOne({ title: 'Partial Bad ' + suffix })).toBeNull();
    const good = await Problem.findOne({ title: 'Partial Good ' + suffix });
    expect(good).not.toBeNull();
    created.problems.push(good._id);
  });

  test('re-linking an existing problem into another batch collection is refused', async () => {
    const suffix = uniqueSuffix();
    const createdRes = await createProblem(batchA, validProblem('Relink ' + suffix));
    expect(createdRes.status).toBe(201);
    const problemId = createdRes.body.data.id;
    created.problems.push(problemId);

    const relink = await request(app)
      .patch(`/api/trainer/batches/${batchA}/problems/${problemId}`)
      .set('Authorization', 'Bearer ' + trainerAToken)
      .send({ collectionId: collectionB, topicId: topicB });

    expect(relink.status).toBe(400);
    expect(relink.body.message).toMatch(/different batch/i);

    const link = await ProblemTopic.findOne({ problem: problemId });
    expect(link).toBeNull();
  });

  test('a collection with no batch is not treated as a match', async () => {
    // A record written before the scope/batch backfill. It must fail closed so
    // it can never absorb problems from an unrelated batch.
    const suffix = uniqueSuffix();
    const collection = await Collection.create({
      name: 'Legacy ' + suffix,
      slug: 'legacy-' + suffix,
      createdBy: trainerA._id,
    });
    created.collections.push(collection._id);
    const topic = await Topic.create({
      name: 'Legacy topic',
      slug: 'legacy-topic-' + suffix,
      collection: collection._id,
      createdBy: trainerA._id,
    });
    created.topics.push(topic._id);

    const res = await createProblem(batchA, {
      ...validProblem('Legacy ' + suffix),
      collectionId: collection._id,
      topicId: topic._id,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different batch/i);
    expect(await Problem.findOne({ title: 'Legacy ' + suffix })).toBeNull();
  });
});