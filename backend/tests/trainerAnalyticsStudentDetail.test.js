// backend/tests/trainerAnalyticsStudentDetail.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const Submission = require('../src/models/Submission');
const authService = require('../src/auth/authService');

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

function problemDoc(batchId, trainerId, suffix) {
  return {
    title: 'P ' + suffix,
    slug: 'sasd-' + suffix,
    description: 'Desc',
    difficulty: 'EASY',
    allowedLanguages: ['python'],
    compilers: [],
    scope: 'BATCH',
    batch: batchId,
    createdBy: trainerId,
    status: 'PUBLISHED',
  };
}

describe('Trainer Analytics Student Detail', () => {
  let trainer, otherTrainer, trainerToken, otherTrainerToken;
  let batchA, batchB, collection, topic1, topic2, p1, p2, p3;
  let student1, student2, otherStudent;

  beforeAll(async () => {
    await Promise.all([
      Submission.deleteMany({}), ProblemTopic.deleteMany({}), Problem.deleteMany({}),
      Topic.deleteMany({}), Collection.deleteMany({}), BatchStudent.deleteMany({}),
      Batch.deleteMany({}), User.deleteMany({}),
    ]);

    trainer = await User.create({
      name: 'Trainer', email: 'tsd-trainer@test.com',
      passwordHash: await authService.hashPassword('Password123!'), role: 'TRAINER',
    });
    otherTrainer = await User.create({
      name: 'Other Trainer', email: 'tsd-otrainer@test.com',
      passwordHash: await authService.hashPassword('Password123!'), role: 'TRAINER',
    });
    trainerToken = await loginAndGetToken('tsd-trainer@test.com', 'Password123!');
    otherTrainerToken = await loginAndGetToken('tsd-otrainer@test.com', 'Password123!');

    batchA = await Batch.create({ name: 'Batch A', code: 'TSD-A', trainer: trainer._id });
    batchB = await Batch.create({ name: 'Batch B', code: 'TSD-B', trainer: otherTrainer._id });

    collection = await Collection.create({ name: 'Collection A', slug: 'tsd-col-' + Date.now(), status: 'ACTIVE', createdBy: trainer._id });
    topic1 = await Topic.create({ collection: collection._id, name: 'Day 1', slug: 'tsd-day1-' + Date.now(), status: 'ACTIVE', createdBy: trainer._id });
    topic2 = await Topic.create({ collection: collection._id, name: 'Day 2', slug: 'tsd-day2-' + Date.now(), status: 'ACTIVE', createdBy: trainer._id });

    p1 = await Problem.create(problemDoc(batchA._id, trainer._id, '1'));
    p2 = await Problem.create({ ...problemDoc(batchA._id, trainer._id, '2'), difficulty: 'MEDIUM' });
    p3 = await Problem.create({ ...problemDoc(batchA._id, trainer._id, '3'), difficulty: 'HARD' });
    await ProblemTopic.create({ problem: p1._id, collection: collection._id, topic: topic1._id });
    await ProblemTopic.create({ problem: p2._id, collection: collection._id, topic: topic1._id });
    await ProblemTopic.create({ problem: p3._id, collection: collection._id, topic: topic2._id });

    student1 = await User.create({
      name: 'Student Alpha', email: 'tsd-s1@test.com',
      passwordHash: await authService.hashPassword('Password123!'), role: 'STUDENT',
    });
    student2 = await User.create({
      name: 'Student Beta', email: 'tsd-s2@test.com',
      passwordHash: await authService.hashPassword('Password123!'), role: 'STUDENT',
    });
    otherStudent = await User.create({
      name: 'Other Student', email: 'tsd-so@test.com',
      passwordHash: await authService.hashPassword('Password123!'), role: 'STUDENT',
    });

    await BatchStudent.create({ batch: batchA._id, student: student1._id, status: 'ACTIVE' });
    await BatchStudent.create({ batch: batchA._id, student: student2._id, status: 'ACTIVE' });
    await BatchStudent.create({ batch: batchB._id, student: otherStudent._id, status: 'ACTIVE' });
  });

  const getDetail = (studentId, query, token = trainerToken) =>
    request(app)
      .get(`/api/trainer/analytics/student/${studentId}`)
      .set('Authorization', `Bearer ${token}`)
      .query(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])));

  describe('Access Control', () => {
    test('unauthenticated request returns 401', async () => {
      const res = await request(app)
        .get(`/api/trainer/analytics/student/${student1._id}`)
        .query({ batchId: batchA._id });
      expect(res.status).toBe(401);
    });

    test('student role returns 403', async () => {
      const sToken = await loginAndGetToken('tsd-s1@test.com', 'Password123!');
      const res = await getDetail(student1._id, { batchId: batchA._id }, sToken);
      expect(res.status).toBe(403);
    });

    test('trainer without batch ownership returns 403', async () => {
      const res = await getDetail(student1._id, { batchId: batchA._id }, otherTrainerToken);
      expect(res.status).toBe(403);
    });

    test('missing batchId returns 400', async () => {
      const res = await getDetail(student1._id, {});
      expect(res.status).toBe(400);
    });

    test('invalid studentId returns 400', async () => {
      const res = await getDetail('invalid-id', { batchId: batchA._id });
      expect(res.status).toBe(400);
    });

    test('non-existent student returns 404', async () => {
      const res = await getDetail(new mongoose.Types.ObjectId(), { batchId: batchA._id });
      expect(res.status).toBe(404);
    });

    test('student not enrolled in the batch returns 403 (cross-batch isolation)', async () => {
      const res = await getDetail(otherStudent._id, { batchId: batchA._id });
      expect(res.status).toBe(403);
    });
  });

  describe('Progress Derivation', () => {
    test('returns NO_PROBLEMS status when no problems assigned', async () => {
      const emptyBatch = await Batch.create({ name: 'Empty Batch', code: 'TSD-EMPTY', trainer: trainer._id });
      const emptyStudent = await User.create({
        name: 'Empty Student', email: 'tsd-empty@test.com',
        passwordHash: await authService.hashPassword('Password123!'), role: 'STUDENT',
      });
      await BatchStudent.create({ batch: emptyBatch._id, student: emptyStudent._id, status: 'ACTIVE' });

      const res = await getDetail(emptyStudent._id, { batchId: emptyBatch._id });
      expect(res.status).toBe(200);
      expect(res.body.data.overall.status).toBe('NO_PROBLEMS');
      expect(res.body.data.overall.total).toBe(0);
      expect(res.body.data.overall.percentage).toBe(0);
      expect(res.body.data.days).toHaveLength(0);
      expect(res.body.data.problems).toHaveLength(0);
    });

    test('returns NOT_STARTED when student has no submissions', async () => {
      await Submission.deleteMany({ student: student2._id });
      const res = await getDetail(student2._id, { batchId: batchA._id });
      expect(res.status).toBe(200);
      expect(res.body.data.overall.status).toBe('NOT_STARTED');
      expect(res.body.data.overall.solved).toBe(0);
      expect(res.body.data.overall.total).toBe(3);
    });

    test('returns IN_PROGRESS when student solved some problems', async () => {
      await Submission.deleteMany({ student: student1._id });
      await Submission.create({ student: student1._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

      const res = await getDetail(student1._id, { batchId: batchA._id });
      expect(res.status).toBe(200);
      expect(res.body.data.overall.status).toBe('IN_PROGRESS');
      expect(res.body.data.overall.solved).toBe(1);
      expect(res.body.data.overall.total).toBe(3);
    });

    test('returns COMPLETED when student solved all problems', async () => {
      await Submission.deleteMany({ student: student1._id });
      for (const p of [p1, p2, p3]) {
        await Submission.create({ student: student1._id, problem: p._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
      }

      const res = await getDetail(student1._id, { batchId: batchA._id });
      expect(res.status).toBe(200);
      expect(res.body.data.overall.status).toBe('COMPLETED');
      expect(res.body.data.overall.solved).toBe(3);
    });
  });

  describe('Duplicate ACCEPTED Handling', () => {
    test('duplicate ACCEPTED submissions count once', async () => {
      await Submission.deleteMany({ student: student1._id });
      await Submission.create({ student: student1._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
      await Submission.create({ student: student1._id, problem: p1._id, code: 'y', language: 'python', verdict: 'ACCEPTED' });

      const res = await getDetail(student1._id, { batchId: batchA._id });
      expect(res.status).toBe(200);
      expect(res.body.data.overall.solved).toBe(1);
    });
  });

  describe('Day/Topic Breakdown', () => {
    test('returns correct day-by-day progress and cross-student independence', async () => {
      await Submission.deleteMany({ student: student1._id });
      await Submission.deleteMany({ student: student2._id });
      await Submission.create({ student: student1._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
      await Submission.create({ student: student1._id, problem: p3._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

      const res = await getDetail(student1._id, { batchId: batchA._id });
      expect(res.status).toBe(200);
      expect(res.body.data.days).toHaveLength(2);

      const day1 = res.body.data.days.find(d => d.name === 'Day 1');
      const day2 = res.body.data.days.find(d => d.name === 'Day 2');
      expect(day1.total).toBe(2);
      expect(day1.solved).toBe(1);
      expect(day1.status).toBe('IN_PROGRESS');
      expect(day2.total).toBe(1);
      expect(day2.solved).toBe(1);
      expect(day2.status).toBe('COMPLETED');

      // Student 2 is unaffected — cross-student independence
      const res2 = await getDetail(student2._id, { batchId: batchA._id });
      expect(res2.body.data.overall.solved).toBe(0);
      expect(res2.body.data.overall.status).toBe('NOT_STARTED');
    });
  });

  describe('Problem Status', () => {
    test('marks problems as SOLVED, ATTEMPTED, or NOT_STARTED correctly', async () => {
      await Submission.deleteMany({ student: student1._id });
      await Submission.create({ student: student1._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
      await Submission.create({ student: student1._id, problem: p2._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });

      const res = await getDetail(student1._id, { batchId: batchA._id });
      const list = res.body.data.problems;
      const byId = Object.fromEntries(list.map(p => [p.problemId, p.status]));

      expect(byId[p1._id.toString()]).toBe('SOLVED');
      expect(byId[p2._id.toString()]).toBe('ATTEMPTED');
      expect(byId[p3._id.toString()]).toBe('NOT_STARTED');
    });
  });

  describe('Filtering', () => {
    test('collectionId filter keeps problems linked to that collection', async () => {
      const res = await getDetail(student1._id, { batchId: batchA._id, collectionId: collection._id });
      expect(res.status).toBe(200);
      expect(res.body.data.overall.total).toBe(3);
    });

    test('topicId filter narrows to that Day only', async () => {
      await Submission.deleteMany({ student: student1._id });
      await Submission.create({ student: student1._id, problem: p2._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

      const res = await getDetail(student1._id, { batchId: batchA._id, topicId: topic1._id });
      expect(res.status).toBe(200);
      expect(res.body.data.overall.total).toBe(2);
      expect(res.body.data.overall.solved).toBe(1);
      expect(res.body.data.days).toHaveLength(1);
      expect(res.body.data.days[0].name).toBe('Day 1');
    });
  });
});
