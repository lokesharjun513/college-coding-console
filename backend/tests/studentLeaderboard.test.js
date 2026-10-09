const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const Submission = require('../src/models/Submission');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');

async function createUser(name, role = 'STUDENT') {
  const email = `${name.toLowerCase()}${uniqueSuffix()}@test.com`;
  const passwordHash = await authService.hashPassword('StrongP@ssw0rd');
  const user = await User.create({ name, email, passwordHash, role, status: 'ACTIVE' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'StrongP@ssw0rd' });
  return { user, token: login.body.token };
}

async function createProblem({ title, scope, batch, status = 'PUBLISHED' }) {
  return Problem.create({
    title,
    slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${uniqueSuffix()}`,
    description: 'Leaderboard test problem',
    difficulty: 'EASY',
    createdBy: new mongoose.Types.ObjectId(),
    scope,
    batch,
    status,
  });
}

async function accept(student, problem) {
  return Submission.create({
    student,
    problem,
    code: 'return 1;',
    language: 'python',
    verdict: 'ACCEPTED',
  });
}

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}), Batch.deleteMany({}), BatchStudent.deleteMany({}),
    Problem.deleteMany({}), Submission.deleteMany({}),
  ]);
});

describe('Student Leaderboard Endpoint', () => {
  test('requires authentication and student role', async () => {
    expect((await request(app).get('/api/student/leaderboard')).status).toBe(401);
    const trainer = await createUser('Trainer', 'TRAINER');
    expect((await request(app).get('/api/student/leaderboard').set('Authorization', `Bearer ${trainer.token}`)).status).toBe(403);
  });

  test('global leaderboard is enrollment-independent and excludes batch/draft problems', async () => {
    const first = await createUser('Alpha');
    const second = await createUser('Beta');
    const batch = await Batch.create({ name: 'Batch', code: `B${uniqueSuffix()}` });
    await BatchStudent.create({ batch: batch._id, student: first.user._id, status: 'ACTIVE' });
    const global = await createProblem({ title: 'Global', scope: 'GLOBAL' });
    const batchProblem = await createProblem({ title: 'Batch', scope: 'BATCH', batch: batch._id });
    await createProblem({ title: 'Draft', scope: 'GLOBAL', status: 'DRAFT' });
    await accept(first.user._id, global);
    await accept(first.user._id, batchProblem);

    const response = await request(app).get('/api/student/leaderboard?scope=GLOBAL').set('Authorization', `Bearer ${second.token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.metrics.assignedProblems).toBe(1);
    expect(response.body.data.leaderboard.map(row => row.name)).toEqual(['Alpha', 'Beta']);
    expect(response.body.data.leaderboard[0].solved).toBe(1);
    expect(response.body.data.leaderboard[1].solved).toBe(0);
  });

  test('batch leaderboard isolates active members and deduplicates accepted submissions', async () => {
    const alpha = await createUser('Alpha');
    const beta = await createUser('Beta');
    const outsider = await createUser('Outsider');
    const batch = await Batch.create({ name: 'Batch', code: `B${uniqueSuffix()}` });
    await BatchStudent.create({ batch: batch._id, student: alpha.user._id, status: 'ACTIVE' });
    await BatchStudent.create({ batch: batch._id, student: beta.user._id, status: 'ACTIVE' });
    await BatchStudent.create({ batch: batch._id, student: outsider.user._id, status: 'INACTIVE' });
    const first = await createProblem({ title: 'First', scope: 'BATCH', batch: batch._id });
    const second = await createProblem({ title: 'Second', scope: 'BATCH', batch: batch._id });
    await accept(alpha.user._id, first);
    await accept(alpha.user._id, first);
    await accept(alpha.user._id, second);
    await accept(outsider.user._id, first);

    const response = await request(app).get(`/api/student/leaderboard?scope=BATCH&batchId=${batch._id}`).set('Authorization', `Bearer ${alpha.token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.metrics.assignedProblems).toBe(2);
    expect(response.body.data.leaderboard.map(row => row.name)).toEqual(['Alpha', 'Beta']);
    expect(response.body.data.leaderboard[0]).toMatchObject({ solved: 2, assigned: 2, completionPercentage: 100, rank: 1, isCurrentUser: true });
  });

  test('rejects a batch the student does not belong to and handles zero assigned problems', async () => {
    const student = await createUser('Student');
    const other = await Batch.create({ name: 'Other', code: `B${uniqueSuffix()}` });
    const forbidden = await request(app).get(`/api/student/leaderboard?scope=BATCH&batchId=${other._id}`).set('Authorization', `Bearer ${student.token}`);
    expect(forbidden.status).toBe(403);

    const own = await Batch.create({ name: 'Own', code: `B${uniqueSuffix()}` });
    await BatchStudent.create({ batch: own._id, student: student.user._id, status: 'ACTIVE' });
    const empty = await request(app).get(`/api/student/leaderboard?scope=BATCH&batchId=${own._id}`).set('Authorization', `Bearer ${student.token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.leaderboard[0].completionPercentage).toBe(0);
    expect(empty.body.data.leaderboard[0].currentUserRank).toBeUndefined();
  });
});
