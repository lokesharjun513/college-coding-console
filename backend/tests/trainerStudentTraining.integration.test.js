// backend/tests/trainerStudentTraining.integration.test.js
// END-TO-END INTEGRATION AUDIT:
// Trainer → Batch → Training → Day → Problem → Student → Submission → Progress → Analytics.
// Everything goes through the real HTTP routes; only the external compiler executor is
// mocked (deterministic verdicts, no network). Distinct (student, problem) pairs drive
// all progress; SOLVED === ACCEPTED only.
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
const TestCase = require('../src/models/TestCase');
const authService = require('../src/auth/authService');
const OnlineCompilerExecutor = require('../src/services/OnlineCompilerExecutor');

jest.mock('../src/services/OnlineCompilerExecutor', () => ({
  execute: jest.fn(),
}));
jest.mock('../src/services/compilerRegistry', () => {
  const CATALOG = {
    'python-3.14': { id: 'python-3.14', compiler: 'python-3.14', name: 'Python 3.14', language: 'python', displayName: 'Python 3.14' },
  };
  return {
    getCompilers: jest.fn().mockResolvedValue(Object.values(CATALOG)),
    getCompilerById: jest.fn(async id => CATALOG[id] || null),
    isSupportedCompiler: id => id in CATALOG,
    getLanguageByCompiler: id => CATALOG[id]?.language || null,
    mapLegacyToCompiler: jest.fn(lang => (lang === 'python' ? 'python-3.14' : null)),
    normalizeCompilerResponse: r => r,
    LEGACY_TO_COMPILER: { python: 'python-3.14' },
  };
});

async function createUser({ name, email, password, role }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

const PASSWORD = 'Password123!';

describe('End-to-end: Trainer Daily Training → Student Practice → Analytics', () => {
  let adminToken, trainerA, trainerAToken, trainerB, trainerBToken;
  let batchAId, batchBId, studentA, studentAToken, studentB, studentBToken, studentC;
  let trainingId, day1Id, day2Id, training2Id, day2T2Id;
  let p1, p2, p3, p4, pB1;

  beforeAll(async () => {
    await Promise.all([
      Submission.deleteMany({}), TestCase.deleteMany({}), ProblemTopic.deleteMany({}),
      Problem.deleteMany({}), Topic.deleteMany({}), Collection.deleteMany({}),
      BatchStudent.deleteMany({}), Batch.deleteMany({}), User.deleteMany({}),
    ]);

    adminToken = await (async () => {
      await createUser({ name: 'Admin', email: 'e2e-admin@test.com', password: PASSWORD, role: 'ADMIN' });
      return loginAndGetToken('e2e-admin@test.com', PASSWORD);
    })();

    trainerA = await createUser({ name: 'Trainer A', email: 'e2e-ta@test.com', password: PASSWORD, role: 'TRAINER' });
    trainerAToken = await loginAndGetToken('e2e-ta@test.com', PASSWORD);
    trainerB = await createUser({ name: 'Trainer B', email: 'e2e-tb@test.com', password: PASSWORD, role: 'TRAINER' });
    trainerBToken = await loginAndGetToken('e2e-tb@test.com', PASSWORD);

    const batchA = await request(app).post('/api/admin/batches').set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Batch A', code: 'E2EA' + uniqueSuffix(), trainer: trainerA._id });
    batchAId = batchA.body.data.id;
    const batchB = await request(app).post('/api/admin/batches').set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Batch B', code: 'E2EB' + uniqueSuffix(), trainer: trainerB._id });
    batchBId = batchB.body.data.id;

    studentA = await createUser({ name: 'Student A', email: 'e2e-sa@test.com', password: PASSWORD, role: 'STUDENT' });
    studentAToken = await loginAndGetToken('e2e-sa@test.com', PASSWORD);
    studentB = await createUser({ name: 'Student B', email: 'e2e-sb@test.com', password: PASSWORD, role: 'STUDENT' });
    studentBToken = await loginAndGetToken('e2e-sb@test.com', PASSWORD);
    studentC = await createUser({ name: 'Student C', email: 'e2e-sc@test.com', password: PASSWORD, role: 'STUDENT' });

    await BatchStudent.create({ batch: batchAId, student: studentA._id, status: 'ACTIVE' });
    await BatchStudent.create({ batch: batchAId, student: studentC._id, status: 'ACTIVE' });
    await BatchStudent.create({ batch: batchBId, student: studentB._id, status: 'ACTIVE' });

    // Training (Collection) with Day 01 + Day 02, plus a second Training with one Day
    const col = await request(app).post('/api/admin/collections').set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Python Training', slug: 'e2e-py-' + uniqueSuffix() });
    trainingId = col.body.data._id;
    const d1 = await request(app).post(`/api/admin/collections/${trainingId}/topics`).set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Day 01', slug: 'e2e-d1-' + uniqueSuffix() });
    day1Id = d1.body.data._id;
    const d2 = await request(app).post(`/api/admin/collections/${trainingId}/topics`).set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Day 02', slug: 'e2e-d2-' + uniqueSuffix() });
    day2Id = d2.body.data._id;
    const col2 = await request(app).post('/api/admin/collections').set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Java Training', slug: 'e2e-java-' + uniqueSuffix() });
    training2Id = col2.body.data._id;
    const d2t2 = await request(app).post(`/api/admin/collections/${training2Id}/topics`).set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Java Day', slug: 'e2e-jd-' + uniqueSuffix() });
    day2T2Id = d2t2.body.data._id;

    const createProblem = async (token, batchId, title, collectionId, topicId) => {
      const res = await request(app)
        .post(`/api/trainer/batches/${batchId}/problems`)
        .set('Authorization', 'Bearer ' + token)
        .send({
          title, description: 'Desc ' + title, difficulty: 'EASY', status: 'PUBLISHED',
          allowedLanguages: ['python'], collectionId, topicId,
        });
      expect(res.status).toBe(201);
      return res.body.data.id;
    };

    p1 = await createProblem(trainerAToken, batchAId, 'E2E Problem 1', trainingId, day1Id);
    p2 = await createProblem(trainerAToken, batchAId, 'E2E Problem 2', trainingId, day1Id);
    p3 = await createProblem(trainerAToken, batchAId, 'E2E Problem 3', trainingId, day2Id);
    p4 = await createProblem(trainerAToken, batchAId, 'E2E Problem 4', training2Id, day2T2Id);
    pB1 = await createProblem(trainerBToken, batchBId, 'E2E Batch B Problem', null, null);

    // Visible test case for each submitted problem (input '1 2' → expected '3')
    const addCase = async (problemId) => {
      const res = await request(app)
        .post(`/api/trainer/problems/${problemId}/test-cases`)
        .set('Authorization', 'Bearer ' + trainerAToken)
        .send({ input: '1 2', expectedOutput: '3', isHidden: false, order: 1 });
      expect([201, 200]).toContain(res.status);
    };
    await addCase(p1);
    await addCase(p2);
    await addCase(p3);
  });

  const accept = () => OnlineCompilerExecutor.execute.mockResolvedValue({
    success: true, status: 'success', exitCode: 0, stdout: '3\n', stderr: '', time: 0.01, memory: 1024,
  });
  const reject = () => OnlineCompilerExecutor.execute.mockResolvedValue({
    success: true, status: 'success', exitCode: 0, stdout: 'WRONG\n', stderr: '', time: 0.01, memory: 1024,
  });
  const submit = (token, problemId) => request(app)
    .post('/api/student/submissions')
    .set('Authorization', 'Bearer ' + token)
    .send({ problemId, code: 'print(3)', language: 'python' });

  const trainingView = (token) => request(app)
    .get('/api/student/collections/training')
    .set('Authorization', 'Bearer ' + token);

  const analytics = (query, token = trainerAToken) => request(app)
    .get('/api/trainer/analytics')
    .set('Authorization', 'Bearer ' + token)
    .query(query);

  test('1. persisted relationships: Problem scope/batch/createdBy + ProblemTopic + Topic.collection', async () => {
    const problem = await Problem.findById(p1);
    expect(problem.scope).toBe('BATCH');
    expect(problem.batch.toString()).toBe(batchAId);
    expect(problem.createdBy.toString()).toBe(trainerA._id.toString());
    expect(problem.status).toBe('PUBLISHED');

    const link = await ProblemTopic.findOne({ problem: p1 });
    expect(link).toBeDefined();
    expect(link.collection.toString()).toBe(trainingId);
    expect(link.topic.toString()).toBe(day1Id);

    const topic = await Topic.findById(day1Id);
    expect(topic.collection.toString()).toBe(trainingId);

    const col = await Collection.findById(trainingId);
    expect(col.status).toBe('ACTIVE');
  });

  test('2. trainer ownership: Trainer B cannot manage Batch A (403), unauthenticated 401', async () => {
    const createRes = await request(app)
      .post(`/api/trainer/batches/${batchAId}/problems`).set('Authorization', 'Bearer ' + trainerBToken)
      .send({ title: 'Intruder', description: 'x', difficulty: 'EASY', allowedLanguages: ['python'] });
    expect(createRes.status).toBe(403);

    const patchRes = await request(app)
      .patch(`/api/trainer/batches/${batchAId}/problems/${p1}`).set('Authorization', 'Bearer ' + trainerBToken)
      .send({ title: 'Hacked' });
    expect(patchRes.status).toBe(403);

    const delRes = await request(app)
      .delete(`/api/trainer/batches/${batchAId}/problems/${p1}`).set('Authorization', 'Bearer ' + trainerBToken);
    expect(delRes.status).toBe(403);

    const analyticsRes = await analytics({ batchId: batchAId }, trainerBToken);
    expect(analyticsRes.status).toBe(403);

    const reverseRes = await analytics({ batchId: batchBId }, trainerAToken);
    expect(reverseRes.status).toBe(403);

    const unauth = await request(app).get('/api/trainer/analytics').query({ batchId: batchAId });
    expect(unauth.status).toBe(401);
  });

  test('3. student batch isolation: Student A sees only Batch A problems; cannot access Batch B problem', async () => {
    const topicRes = await request(app).get(`/api/student/topics/${day1Id}/problems`)
      .set('Authorization', 'Bearer ' + studentAToken);
    expect(topicRes.status).toBe(200);
    expect(topicRes.body.meta.total).toBe(2);
    const titles = topicRes.body.data.map(p => p.title);
    expect(titles.some(t => t.startsWith('E2E Problem 1'))).toBe(true);
    expect(titles.some(t => t.startsWith('E2E Problem 2'))).toBe(true);
    expect(titles.some(t => t.startsWith('E2E Batch B Problem'))).toBe(false);

    // Known Batch B problem id must be inaccessible: detail and submission
    const detail = await request(app).get(`/api/student/problems/${pB1}`)
      .set('Authorization', 'Bearer ' + studentAToken);
    expect(detail.status).toBe(404);

    accept();
    const crossSubmit = await submit(studentAToken, pB1);
    expect(crossSubmit.status).toBe(404);

    // Student B sees only Batch B problems
    const listB = await request(app).get('/api/student/problems').set('Authorization', 'Bearer ' + studentBToken);
    const idsB = listB.body.data.map(p => p.id.toString());
    expect(idsB).toContain(pB1.toString());
    expect(idsB).not.toContain(p1.toString());
  });

  test('4. initial progress: all NOT_STARTED 0%; zero-problem training is NO_PROBLEMS (never COMPLETED/NaN)', async () => {
    const res = await trainingView(studentAToken);
    expect(res.status).toBe(200);
    const training = res.body.data.find(t => t.id.toString() === trainingId.toString());
    expect(training.totalProblems).toBe(3);
    expect(training.solvedProblems).toBe(0);
    expect(training.progressPercentage).toBe(0);
    expect(training.status).toBe('NOT_STARTED');
    const day1 = training.days.find(d => d.id.toString() === day1Id.toString());
    expect(day1.totalProblems).toBe(2);
    expect(day1.solvedProblems).toBe(0);
    expect(day1.status).toBe('NOT_STARTED');

    // Zero-problem scope: Student B's training view has no visible problems
    const resB = await trainingView(studentBToken);
    const visibleTotals = resB.body.data.reduce((acc, t) => acc + t.totalProblems, 0);
    expect(visibleTotals).toBe(0);
    for (const t of resB.body.data) {
      expect(t.status).toBe('NO_PROBLEMS');
      expect(t.progressPercentage).toBe(0);
      expect(Number.isFinite(t.progressPercentage)).toBe(true);
    }
  });

  test('5. RUN does not create a submission: progress remains NOT_STARTED', async () => {
    accept();
    const before = await Submission.countDocuments({ student: studentA._id });
    const res = await request(app).post(`/api/student/problems/${p1}/run`)
      .set('Authorization', 'Bearer ' + studentAToken)
      .send({ language: 'python', code: 'print(3)', input: '' });
    expect(res.status).toBe(200);
    const after = await Submission.countDocuments({ student: studentA._id });
    expect(after).toBe(before); // run never persists
    expect(after).toBe(0);

    const topicRes = await request(app).get(`/api/student/topics/${day1Id}/problems`)
      .set('Authorization', 'Bearer ' + studentAToken);
    const p1row = topicRes.body.data.find(p => p.id.toString() === p1.toString());
    expect(p1row.progress).toBe('NOT_STARTED');
  });

  test('6. correct submission → ACCEPTED; Problem 1 SOLVED, training 1/3 33.33% IN_PROGRESS', async () => {
    accept();
    const res = await submit(studentAToken, p1);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    const persisted = await Submission.findOne({ student: studentA._id, problem: p1 });
    expect(persisted.verdict).toBe('ACCEPTED');

    const view = await trainingView(studentAToken);
    const training = view.body.data.find(t => t.id.toString() === trainingId.toString());
    expect(training.solvedProblems).toBe(1);
    expect(training.totalProblems).toBe(3);
    expect(training.progressPercentage).toBeCloseTo(33.33, 1);
    expect(training.status).toBe('IN_PROGRESS');

    const day1 = training.days.find(d => d.id.toString() === day1Id.toString());
    expect(day1.solvedProblems).toBe(1);
    expect(day1.totalProblems).toBe(2);
    expect(day1.status).toBe('IN_PROGRESS');
  });

  test('7. duplicate ACCEPTED on Problem 1 still counts once', async () => {
    accept();
    const res = await submit(studentAToken, p1);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    const view = await trainingView(studentAToken);
    const training = view.body.data.find(t => t.id.toString() === trainingId.toString());
    expect(training.solvedProblems).toBe(1);

    const analyticsRes = await analytics({ batchId: batchAId });
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.data.kpis.solvedAssignments).toBe(1);
  });

  test('8. WRONG_ANSWER on Problem 2 does not count: training remains 1/3', async () => {
    reject();
    const res = await submit(studentAToken, p2);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('WRONG_ANSWER');

    const persisted = await Submission.findOne({ student: studentA._id, problem: p2 });
    expect(persisted.verdict).toBe('WRONG_ANSWER');

    const view = await trainingView(studentAToken);
    const training = view.body.data.find(t => t.id.toString() === trainingId.toString());
    expect(training.solvedProblems).toBe(1);
    expect(training.totalProblems).toBe(3);

    const topicRes = await request(app).get(`/api/student/topics/${day1Id}/problems`)
      .set('Authorization', 'Bearer ' + studentAToken);
    const p2row = topicRes.body.data.find(p => p.id.toString() === p2.toString());
    expect(p2row.progress).toBe('ATTEMPTED'); // attempted, not solved
  });

  test('9. practice/next prioritizes ATTEMPTED within the requested Training', async () => {
    const res = await request(app).get('/api/student/practice/next')
      .query({ collectionId: trainingId.toString() })
      .set('Authorization', 'Bearer ' + studentAToken);
    expect(res.status).toBe(200);
    expect(res.body.data.problemId.toString()).toBe(p2.toString()); // attempted > not started
    expect(res.body.data.status).toBe('ATTEMPTED');
    expect(res.body.data.collectionId.toString()).toBe(trainingId.toString());
  });

  test('10. completing Day 01: 2/2 100% COMPLETED day, training 2/3 66.67% IN_PROGRESS', async () => {
    accept();
    const res = await submit(studentAToken, p2);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    const view = await trainingView(studentAToken);
    const training = view.body.data.find(t => t.id.toString() === trainingId.toString());
    const day1 = training.days.find(d => d.id.toString() === day1Id.toString());
    expect(day1.solvedProblems).toBe(2);
    expect(day1.totalProblems).toBe(2);
    expect(day1.progressPercentage).toBe(100);
    expect(day1.status).toBe('COMPLETED');

    // Training needs ALL days: Day 02 still 0/1
    expect(training.solvedProblems).toBe(2);
    expect(training.totalProblems).toBe(3);
    expect(training.progressPercentage).toBeCloseTo(66.67, 1);
    expect(training.status).toBe('IN_PROGRESS');
    expect(training.daysCompleted).toBe(1);
    expect(training.daysCounted).toBe(2);
  });

  test('11. practice/next falls back to NOT_STARTED Problem 3 within the Training', async () => {
    const res = await request(app).get('/api/student/practice/next')
      .query({ collectionId: trainingId.toString() })
      .set('Authorization', 'Bearer ' + studentAToken);
    expect(res.status).toBe(200);
    expect(res.body.data.problemId.toString()).toBe(p3.toString());
    expect(res.body.data.status).toBe('NOT_STARTED');
  });

  test('12. cross-student independence: Student C shows 0 solved; Student B absent from Batch A analytics', async () => {
    const analyticsRes = await analytics({ batchId: batchAId });
    expect(analyticsRes.status).toBe(200);
    const data = analyticsRes.body.data;
    expect(data.kpis.activeStudents).toBe(2); // A and C only
    expect(data.kpis.assignedProblems).toBe(4); // P1-P4 published batch problems
    expect(data.kpis.solvedAssignments).toBe(2); // distinct pairs: A×P1 + A×P2

    const rows = data.leaderboard;
    expect(rows).toHaveLength(2);
    const rowA = rows.find(r => r.name === 'Student A');
    const rowC = rows.find(r => r.name === 'Student C');
    expect(rowA.solvedProblems).toBe(2);
    expect(rowA.status).toBe('IN_PROGRESS');
    expect(rowC.solvedProblems).toBe(0);
    expect(rowC.status).toBe('NOT_STARTED');
    expect(rowA.rank).toBe(1);
    expect(rowC.rank).toBe(2);
    expect(rows.find(r => r.name === 'Student B')).toBeUndefined();

    // Student B's own training view is unaffected by Student A's submissions
    const viewB = await trainingView(studentBToken);
    const totalsB = viewB.body.data.reduce((acc, t) => acc + t.solvedProblems, 0);
    expect(totalsB).toBe(0);
  });

  test('13. Training filter excludes other Trainings; Day filter narrows to Day 01', async () => {
    // Training 1 (Python) filter: assigned 3, not 4 (P4 is in Java Training)
    const byTraining = await analytics({ batchId: batchAId, collectionId: trainingId });
    expect(byTraining.body.data.kpis.assignedProblems).toBe(3);
    const rowA = byTraining.body.data.leaderboard.find(r => r.name === 'Student A');
    expect(rowA.solvedProblems).toBe(2);
    expect(rowA.daysCompleted).toBe(1);
    expect(rowA.totalDays).toBe(2);

    // Day 01 filter: assigned 2, Student A 2/2 100% COMPLETED, 1/1 days
    const byDay = await analytics({ batchId: batchAId, collectionId: trainingId, topicId: day1Id });
    expect(byDay.body.data.kpis.assignedProblems).toBe(2);
    const rowADay = byDay.body.data.leaderboard.find(r => r.name === 'Student A');
    expect(rowADay.solvedProblems).toBe(2);
    expect(rowADay.completionPercentage).toBe(100);
    expect(rowADay.status).toBe('COMPLETED');
    expect(rowADay.daysCompleted).toBe(1);
    expect(rowADay.totalDays).toBe(1);
  });

  test('14. status filter returns only matching rows (backend-filtered)', async () => {
    const completed = await analytics({ batchId: batchAId, collectionId: trainingId, topicId: day1Id, status: 'COMPLETED' });
    expect(completed.body.data.leaderboard).toHaveLength(1);
    expect(completed.body.data.leaderboard[0].name).toBe('Student A');

    const notStarted = await analytics({ batchId: batchAId, status: 'NOT_STARTED' });
    expect(notStarted.body.data.leaderboard).toHaveLength(1);
    expect(notStarted.body.data.leaderboard[0].name).toBe('Student C');
  });

  test('15. Batch B analytics is isolated: only Student B, only Batch B problem', async () => {
    const res = await analytics({ batchId: batchBId }, trainerBToken);
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.activeStudents).toBe(1);
    expect(res.body.data.kpis.assignedProblems).toBe(1);
    expect(res.body.data.leaderboard).toHaveLength(1);
    expect(res.body.data.leaderboard[0].name).toBe('Student B');
    expect(res.body.data.leaderboard[0].solvedProblems).toBe(0);
  });
});
