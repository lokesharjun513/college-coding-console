// backend/tests/studentTrainingProgress.test.js
// Added tests for cross-student isolation and collection-specific topic inclusion
// Focused tests for authoritative Student Daily Training progress (Phase 3).
// Reuses the existing architecture: Collection/Topic/ProblemTopic/Submission/BatchStudent.

const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const ProblemTopic = require('../src/models/ProblemTopic');
const Problem = require('../src/models/Problem');
const Submission = require('../src/models/Submission');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');

async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

// Create a PUBLISHED problem linked to a collection/topic
async function createLinkedProblem({ title, scope = 'GLOBAL', batch = null, collection, topic, difficulty = 'EASY' }) {
  const unique = uniqueSuffix();
  const problem = await Problem.create({
    title: `${title} ${unique}`,
    slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${unique}`,
    description: 'Test problem',
    difficulty,
    createdBy: new mongoose.Types.ObjectId(),
    scope,
    batch,
    status: 'PUBLISHED',
  });
  await ProblemTopic.create({ problem: problem._id, collection, topic, createdBy: new mongoose.Types.ObjectId() });
  return problem;
}

let studentToken;
let student;

beforeEach(async () => {
  await Submission.deleteMany({});
  await ProblemTopic.deleteMany({});
  await Topic.deleteMany({});
  await Collection.deleteMany({});
  await Problem.deleteMany({});
  await Batch.deleteMany({});
  await BatchStudent.deleteMany({});
  await User.deleteMany({});

  student = await createUser({ name: 'Student', email: `stu${uniqueSuffix()}@test.com`, password: 'StrongP@ssw0rd' });
  studentToken = await loginAndGetToken(student.email, 'StrongP@ssw0rd');
});

describe('GET /api/student/collections/training', () => {
  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/student/collections/training');
    expect(res.status).toBe(401);
  });

  test('returns trainings with days and authoritative totals', async () => {
    const col = await Collection.create({ name: 'Python Fundamentals', slug: 'py', status: 'ACTIVE', createdBy: student._id });
    const day1 = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    const day2 = await Topic.create({ name: 'Day 02', slug: 'day-2', collection: col._id, createdBy: student._id });

    // Day1: 2 problems, 1 solved
    const p1 = await createLinkedProblem({ title: 'One', collection: col._id, topic: day1._id });
    const p2 = await createLinkedProblem({ title: 'Two', collection: col._id, topic: day1._id });
    await Submission.create({ student: student._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    // Day2: 1 problem, unsolved
    await createLinkedProblem({ title: 'Three', collection: col._id, topic: day2._id });

    const res = await request(app)
      .get('/api/student/collections/training')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const trainings = res.body.data;
    expect(trainings).toHaveLength(1);
    const training = trainings[0];
    expect(training.totalProblems).toBe(3);
    expect(training.solvedProblems).toBe(1);
    expect(training.progressPercentage).toBeCloseTo(33.33);
    expect(training.status).toBe('IN_PROGRESS');

    expect(training.days).toHaveLength(2);
    const day1Data = training.days.find(d => d.name === 'Day 01');
    const day2Data = training.days.find(d => d.name === 'Day 02');
    expect(day1Data.totalProblems).toBe(2);
    expect(day1Data.solvedProblems).toBe(1);
    expect(day1Data.status).toBe('IN_PROGRESS');
    expect(day2Data.totalProblems).toBe(1);
    expect(day2Data.solvedProblems).toBe(0);
    expect(day2Data.status).toBe('NOT_STARTED');
  });

  test('day/training completion occurs only when all assigned problems are solved', async () => {
    const col = await Collection.create({ name: 'C', slug: 'c', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    const p1 = await createLinkedProblem({ title: 'A', collection: col._id, topic: day._id });
    await createLinkedProblem({ title: 'B', collection: col._id, topic: day._id });
    await Submission.create({ student: student._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const dayData = res.body.data[0].days[0];
    expect(dayData.totalProblems).toBe(2);
    expect(dayData.solvedProblems).toBe(1);
    expect(dayData.status).toBe('IN_PROGRESS');
  });

  test('accepted submission counts as solved; wrong answer does not', async () => {
    const col = await Collection.create({ name: 'C', slug: 'c2', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    const p1 = await createLinkedProblem({ title: 'A', collection: col._id, topic: day._id });
    const p2 = await createLinkedProblem({ title: 'B', collection: col._id, topic: day._id });
    await Submission.create({ student: student._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: p2._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });

    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const dayData = res.body.data[0].days[0];
    expect(dayData.solvedProblems).toBe(1); // only ACCEPTED
    expect(dayData.totalProblems).toBe(2);
  });
});

describe('Cross-batch isolation', () => {
  test('student cannot see another batch\'s training problems', async () => {
    // Batch B owns the problem
    const otherBatch = await Batch.create({ name: 'Batch B', code: `B${uniqueSuffix()}`, trainer: new mongoose.Types.ObjectId() });
    const col = await Collection.create({ name: 'C', slug: 'cb', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    await createLinkedProblem({ title: 'Secret', scope: 'BATCH', batch: otherBatch._id, collection: col._id, topic: day._id });

    // Student is in Batch A (not Batch B)
    const batchA = await Batch.create({ name: 'Batch A', code: `A${uniqueSuffix()}`, trainer: new mongoose.Types.ObjectId() });
    await BatchStudent.create({ batch: batchA._id, student: student._id, status: 'ACTIVE' });

    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const training = res.body.data[0];
    expect(training.totalProblems).toBe(0);
    expect(training.status).toBe('NO_PROBLEMS');
  });

  test('enrolled student sees batch-scoped problems in training', async () => {
    const batch = await Batch.create({ name: 'Batch A', code: `A${uniqueSuffix()}`, trainer: new mongoose.Types.ObjectId() });
    await BatchStudent.create({ batch: batch._id, student: student._id, status: 'ACTIVE' });
    const col = await Collection.create({ name: 'C', slug: 'ca', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    await createLinkedProblem({ title: 'Mine', scope: 'BATCH', batch: batch._id, collection: col._id, topic: day._id });

    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const training = res.body.data[0];
    expect(training.totalProblems).toBe(1);
    expect(training.status).toBe('NOT_STARTED');
  });
});

describe('Cross-student isolation', () => {
  test('another student&#s accepted submission does not count', async () => {
    // Create a second student
    const otherStudent = await createUser({ name: 'Other Student', email: `other${uniqueSuffix()}@test.com`, password: 'StrongP@ssw0rd' });
    const otherToken = await loginAndGetToken(otherStudent.email, 'StrongP@ssw0rd');

    const col = await Collection.create({ name: 'C', slug: 'cs', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    const p1 = await createLinkedProblem({ title: 'P1', collection: col._id, topic: day._id });

    // Other student solves the problem
    await Submission.create({ student: otherStudent._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });

    // Student should see 0 solved
    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const training = res.body.data[0];
    expect(training.solvedProblems).toBe(0);
    expect(training.totalProblems).toBe(1);
    expect(training.status).toBe('NOT_STARTED');
  });
});

describe('Collection-specific training', () => {
  test('training only includes topics belonging to that collection', async () => {
    const colA = await Collection.create({ name: 'Collection A', slug: 'col-a', status: 'ACTIVE', createdBy: student._id });
    const colB = await Collection.create({ name: 'Collection B', slug: 'col-b', status: 'ACTIVE', createdBy: student._id });

    const dayA = await Topic.create({ name: 'Day A', slug: 'day-a', collection: colA._id, createdBy: student._id });
    const dayB = await Topic.create({ name: 'Day B', slug: 'day-b', collection: colB._id, createdBy: student._id });

    await createLinkedProblem({ title: 'Problem A', collection: colA._id, topic: dayA._id });
    await createLinkedProblem({ title: 'Problem B', collection: colB._id, topic: dayB._id });

    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const trainings = res.body.data;

    // Collection A training
    const trainingA = trainings.find(t => t.id.toString() === colA._id.toString());
    expect(trainingA).toBeDefined();
    expect(trainingA.totalProblems).toBe(1);
    expect(trainingA.days).toHaveLength(1);
    expect(trainingA.days[0].name).toBe('Day A');

    // Collection B training
    const trainingB = trainings.find(t => t.id.toString() === colB._id.toString());
    expect(trainingB).toBeDefined();
    expect(trainingB.totalProblems).toBe(1);
    expect(trainingB.days).toHaveLength(1);
    expect(trainingB.days[0].name).toBe('Day B');
  });
});

describe('Mandatory regression: denominator is authoritative assignment data, not loaded UI data', () => {
  test('100 total problems / 40 solved renders 40%, regardless of how many are loaded', async () => {
    const col = await Collection.create({ name: 'Big Training', slug: 'big', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });

    // Assign 100 problems to the training; solve 40 of them.
    // Bulk fixture creation (insertMany) — same documents the per-doc helper
    // would create, without 200 sequential round-trips to the remote test DB.
    const unique = uniqueSuffix();
    const created = await Problem.insertMany(
      Array.from({ length: 100 }, (_, i) => ({
        title: `P${i} ${unique}-${i}`,
        slug: `p${i}-${unique}-${i}`,
        description: 'Test problem',
        difficulty: 'EASY',
        createdBy: new mongoose.Types.ObjectId(),
        scope: 'GLOBAL',
        status: 'PUBLISHED',
      }))
    );
    await ProblemTopic.insertMany(
      created.map(p => ({
        problem: p._id,
        collection: col._id,
        topic: day._id,
        createdBy: new mongoose.Types.ObjectId(),
      }))
    );
    await Submission.insertMany(
      created.slice(0, 40).map(p => ({
        student: student._id,
        problem: p._id,
        code: 'x',
        language: 'python',
        verdict: 'ACCEPTED',
      }))
    );

    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const training = res.body.data[0];
    expect(training.totalProblems).toBe(100);
    expect(training.solvedProblems).toBe(40);
    expect(training.progressPercentage).toBeCloseTo(40);
    expect(training.status).toBe('IN_PROGRESS');

    // Day-level count also authoritative over the full 100, not a partial loaded set.
    const dayData = training.days[0];
    expect(dayData.totalProblems).toBe(100);
    expect(dayData.solvedProblems).toBe(40);
    expect(dayData.progressPercentage).toBeCloseTo(40);

    // Never 0/0, 5/10, 10/10.
    expect(training.totalProblems).not.toBe(0);
    expect(training.progressPercentage).not.toBeCloseTo(5);
    expect(training.progressPercentage).not.toBe(100);
    expect(Number.isFinite(training.progressPercentage)).toBe(true);
    expect(Number.isFinite(dayData.progressPercentage)).toBe(true);
  });
});

describe('Zero-problem behavior', () => {
  test('zero-problem training and day are NO_PROBLEMS with 0% — never NaN or 100%', async () => {
    const col = await Collection.create({ name: 'Empty', slug: 'empty', status: 'ACTIVE', createdBy: student._id });
    await Topic.create({ name: 'Day 00', slug: 'day-0', collection: col._id, createdBy: student._id });

    const res = await request(app).get('/api/student/collections/training').set('Authorization', `Bearer ${studentToken}`);
    const training = res.body.data[0];
    expect(training.totalProblems).toBe(0);
    expect(training.progressPercentage).toBe(0);
    expect(training.status).toBe('NO_PROBLEMS');
    const day = training.days[0];
    expect(day.totalProblems).toBe(0);
    expect(day.progressPercentage).toBe(0);
    expect(day.status).toBe('NO_PROBLEMS');
  });
});

describe('GET /api/student/practice/next with collectionId scope', () => {
  test('prioritizes ATTEMPTED unsolved problem within the training', async () => {
    const col = await Collection.create({ name: 'C', slug: 'cn', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    const p1 = await createLinkedProblem({ title: 'Attempted', collection: col._id, topic: day._id });
    const p2 = await createLinkedProblem({ title: 'Fresh', collection: col._id, topic: day._id });
    await Submission.create({ student: student._id, problem: p1._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });
    void p2;

    const res = await request(app)
      .get('/api/student/practice/next')
      .query({ collectionId: col._id.toString() })
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.problemTitle).toContain('Attempted');
  });

  test('falls back to NOT_STARTED when nothing attempted in the training', async () => {
    const col = await Collection.create({ name: 'C', slug: 'cn2', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    await createLinkedProblem({ title: 'Fresh', collection: col._id, topic: day._id });

    const res = await request(app)
      .get('/api/student/practice/next')
      .query({ collectionId: col._id.toString() })
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.problemTitle).toContain('Fresh');
  });
});

describe('GET /api/student/topics/:topicId/problems per-problem progress', () => {
  test('returns SOLVED for accepted submission, ATTEMPTED for wrong answer', async () => {
    const col = await Collection.create({ name: 'C', slug: 'tp', status: 'ACTIVE', createdBy: student._id });
    const day = await Topic.create({ name: 'Day 01', slug: 'day-1', collection: col._id, createdBy: student._id });
    const p1 = await createLinkedProblem({ title: 'Solved', collection: col._id, topic: day._id });
    const p2 = await createLinkedProblem({ title: 'Attempted', collection: col._id, topic: day._id });
    const p3 = await createLinkedProblem({ title: 'Fresh', collection: col._id, topic: day._id });
    await Submission.create({ student: student._id, problem: p1._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    await Submission.create({ student: student._id, problem: p2._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });

    const res = await request(app)
      .get(`/api/student/topics/${day._id}/problems`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const byId = {};
    res.body.data.forEach(p => { byId[p.title.split(' ')[0]] = p.progress; });
    expect(byId.Solved).toBe('SOLVED');
    expect(byId.Attempted).toBe('ATTEMPTED');
    expect(byId.Fresh).toBe('NOT_STARTED');
  });
});
