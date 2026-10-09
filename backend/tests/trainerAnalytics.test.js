const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
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

async function createTestUser({ name, email, password, role = 'TRAINER' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

// Minimal valid problem payload for direct model creation
function problemDoc(batchId, trainerId, suffix) {
  return {
    title: 'P ' + suffix,
    slug: 'p-' + suffix,
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

describe('Trainer Analytics (KPIs + Leaderboard)', () => {
  let trainer, trainerToken, batchId, adminToken, otherBatchId;
  let collectionId, topic1Id, topic2Id;
  let p1, p2, students;

  beforeAll(async () => {
    await Promise.all([
      Submission.deleteMany({}), ProblemTopic.deleteMany({}), Problem.deleteMany({}),
      Topic.deleteMany({}), Collection.deleteMany({}), BatchStudent.deleteMany({}),
      Batch.deleteMany({}), User.deleteMany({}),
    ]);

    await createTestUser({ name: 'Admin', email: 'ga-admin@test.com', password: 'Password123!', role: 'ADMIN' });
    adminToken = await loginAndGetToken('ga-admin@test.com', 'Password123!');

    trainer = await createTestUser({ name: 'T1 Trainer', email: 'ga-trainer@test.com', password: 'Password123!', role: 'TRAINER' });
    trainerToken = await loginAndGetToken('ga-trainer@test.com', 'Password123!');

    const batchRes = await request(app)
      .post('/api/admin/batches').set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'GA Batch', code: 'GA1', trainer: trainer._id });
    batchId = batchRes.body.data.id;
    const otherRes = await request(app)
      .post('/api/admin/batches').set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'GA Other Batch', code: 'GA2', trainer: trainer._id });
    otherBatchId = otherRes.body.data.id;

    // Shared Training with two Days
    const colRes = await request(app).post('/api/admin/collections')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'GA Collection', slug: 'ga-col-' + uniqueSuffix() });
    collectionId = colRes.body.data._id;
    const t1 = await request(app).post('/api/admin/collections/' + collectionId + '/topics')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Day 1', slug: 'ga-day1-' + uniqueSuffix() });
    topic1Id = t1.body.data._id;
    const t2 = await request(app).post('/api/admin/collections/' + collectionId + '/topics')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Day 2', slug: 'ga-day2-' + uniqueSuffix() });
    topic2Id = t2.body.data._id;

    // Problems: p1+p2 on Day 1, p3 on Day 2, p4 unlinked
    p1 = await Problem.create({ ...problemDoc(batchId, trainer._id, '1'), title: 'GA P1' });
    p2 = await Problem.create({ ...problemDoc(batchId, trainer._id, '2'), title: 'GA P2' });
    const p3 = await Problem.create({ ...problemDoc(batchId, trainer._id, '3'), title: 'GA P3' });
    await Problem.create({ ...problemDoc(batchId, trainer._id, '4'), title: 'GA P4' });
    await ProblemTopic.create({ problem: p1._id, collection: collectionId, topic: topic1Id });
    await ProblemTopic.create({ problem: p2._id, collection: collectionId, topic: topic1Id });
    await ProblemTopic.create({ problem: p3._id, collection: collectionId, topic: topic2Id });

    // Three ACTIVE students + one INACTIVE
    students = [];
    for (let i = 1; i <= 3; i++) {
      const s = await createTestUser({ name: 'Student ' + (i === 1 ? 'Alpha' : i === 2 ? 'Beta' : 'Gamma'), email: 'ga-s' + i + '@test.com', password: 'Password123!', role: 'STUDENT' });
      await BatchStudent.create({ batch: batchId, student: s._id, status: 'ACTIVE' });
      students.push(s);
    }
    const inactive = await createTestUser({ name: 'Student Inactive', email: 'ga-s4@test.com', password: 'Password123!', role: 'STUDENT' });
    await BatchStudent.create({ batch: batchId, student: inactive._id, status: 'INACTIVE' });
  });

  const getAnalytics = (query, token = trainerToken) =>
    request(app).get('/api/trainer/analytics').set('Authorization', 'Bearer ' + token).query(query);

  test('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/trainer/analytics').query({ batchId });
    expect(res.status).toBe(401);
  });

  test('student role returns 403', async () => {
    await createTestUser({ name: 'GA Stud', email: 'ga-stud@test.com', password: 'Password123!', role: 'STUDENT' });
    const sToken = await loginAndGetToken('ga-stud@test.com', 'Password123!');
    const res = await getAnalytics({ batchId }, sToken);
    expect(res.status).toBe(403);
  });

  test('another trainer (not owner) returns 403 cross-batch', async () => {
    await createTestUser({ name: 'T2 Trainer', email: 'ga-t2@test.com', password: 'Password123!', role: 'TRAINER' });
    const t2Token = await loginAndGetToken('ga-t2@test.com', 'Password123!');
    const res = await getAnalytics({ batchId }, t2Token);
    expect(res.status).toBe(403);
  });

  test('missing batchId returns 400', async () => {
    const res = await getAnalytics({});
    expect(res.status).toBe(400);
  });

  test('active students KPI counts ACTIVE enrollments only', async () => {
    const res = await getAnalytics({ batchId });
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.activeStudents).toBe(3);
  });

  test('assigned problems KPI counts batch PUBLISHED problems', async () => {
    const res = await getAnalytics({ batchId });
    expect(res.body.data.kpis.assignedProblems).toBe(4);
    expect(res.body.data.kpis.solvedAssignments).toBe(0);
    expect(res.body.data.kpis.completionRate).toBe(0);
  });

  test('student with no submissions shows NOT_STARTED with 0% completion', async () => {
    const res = await getAnalytics({ batchId });
    const row = res.body.data.leaderboard.find(r => r.name === 'Student Beta');
    expect(row.status).toBe('NOT_STARTED');
    expect(row.completionPercentage).toBe(0);
    expect(row.assignedProblems).toBe(4);
  });

  test('ACCEPTED submission counts as solved assignment', async () => {
    await Submission.create({
      student: students[0]._id, problem: p1._id, verdict: 'ACCEPTED',
      language: 'python', code: 'x',
    });
    const res = await getAnalytics({ batchId });
    expect(res.body.data.kpis.solvedAssignments).toBe(1);
    const row = res.body.data.leaderboard.find(r => r.name === 'Student Alpha');
    expect(row.solvedProblems).toBe(1);
    expect(row.status).toBe('IN_PROGRESS');
  });

  test('duplicate ACCEPTED submissions on same problem count once', async () => {
    await Submission.create({
      student: students[0]._id, problem: p1._id, verdict: 'ACCEPTED',
      language: 'python', code: 'x2',
    });
    const res = await getAnalytics({ batchId });
    expect(res.body.data.kpis.solvedAssignments).toBe(1);
  });

  test('WRONG_ANSWER submission does not count as solved', async () => {
    await Submission.create({
      student: students[1]._id, problem: p1._id, verdict: 'WRONG_ANSWER',
      language: 'python', code: 'x',
    });
    const res = await getAnalytics({ batchId });
    expect(res.body.data.kpis.solvedAssignments).toBe(1);
    const row = res.body.data.leaderboard.find(r => r.name === 'Student Beta');
    expect(row.status).toBe('NOT_STARTED'); // failed attempt ≠ solved
    expect(row.solvedProblems).toBe(0);
  });

  test('completion rate is aggregate ratio of solved/total assignments', async () => {
    // 1 solved assignment of 12 total (3 students × 4 problems)
    const res = await getAnalytics({ batchId });
    expect(res.body.data.kpis.completionRate).toBeCloseTo(8.33, 1);
  });

  test('status filter returns only matching rows', async () => {
    const res = await getAnalytics({ batchId, status: 'IN_PROGRESS' });
    expect(res.body.data.leaderboard.length).toBe(1);
    expect(res.body.data.leaderboard[0].name).toBe('Student Alpha');
  });

  test('collection filter narrows assigned problems to linked ones', async () => {
    const res = await getAnalytics({ batchId, collectionId });
    expect(res.body.data.kpis.assignedProblems).toBe(3);
  });

  test('topic filter narrows to one Day', async () => {
    const res = await getAnalytics({ batchId, collectionId, topicId: topic1Id });
    expect(res.body.data.kpis.assignedProblems).toBe(2);
  });

  test('day completed only when all its problems are solved', async () => {
    const res = await getAnalytics({ batchId, collectionId });
    const row = res.body.data.leaderboard.find(r => r.name === 'Student Alpha');
    // Day 1 = p1+p2, Alpha solved only p1 → day not complete
    expect(row.daysCompleted).toBe(0);
    expect(row.totalDays).toBe(2);
  });

  test('leaderboard ordering: completion desc, then solved desc, then name asc', async () => {
    // Gamma solves both day-1 problems → 50%, Beta IN_PROGRESS → 25%
    await Submission.create({ student: students[2]._id, problem: p1._id, verdict: 'ACCEPTED', language: 'python', code: 'x' });
    await Submission.create({ student: students[2]._id, problem: p2._id, verdict: 'ACCEPTED', language: 'python', code: 'x' });
    const res = await getAnalytics({ batchId });
    const names = res.body.data.leaderboard.map(r => r.name);
    // Alpha 25% (1/4), Gamma 50% (2/4), Beta 25% (1/4 wrong answer doesn't count so 0%)
    expect(names[0]).toBe('Student Gamma');
    expect(names[1]).toBe('Student Alpha');
    expect(names[2]).toBe('Student Beta');
    const ranks = res.body.data.leaderboard.map(r => r.rank);
    expect(ranks).toEqual([1, 2, 3]);
  });

  test('tie on completion+solution broken alphabetically', async () => {
    // After the ordering fix Gamma is 2/4 = 50%. Tie Alpha (1/4) with a third student? Use Day scope:
    const res = await getAnalytics({ batchId });
    // Alpha 1/4, Beta 0/4, Gamma 2/4 — no tie here. Create a tie via Day filter:
    const dayRes = await getAnalytics({ batchId, collectionId, topicId: topic1Id });
    // scoped to 2 problems: Alpha 1/2 50%, Gamma 2/2 100%, Beta 0%
    expect(dayRes.body.data.leaderboard.map(r => r.name)).toEqual(['Student Gamma', 'Student Alpha', 'Student Beta']);
  });

  test('student not enrolled in batch never appears', async () => {
    await createTestUser({ name: 'Student Outsider', email: 'ga-s5@test.com', password: 'Password123!', role: 'STUDENT' });
    const res = await getAnalytics({ batchId });
    expect(res.body.data.leaderboard.find(r => r.name === 'Student Outsider')).toBeUndefined();
  });
});
