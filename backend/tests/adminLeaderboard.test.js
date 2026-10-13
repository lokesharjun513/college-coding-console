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

async function createAdmin(name) {
  return createUser(name, 'ADMIN');
}

async function createProblem({ title, scope, batch, status = 'PUBLISHED' }) {
  return Problem.create({
    title,
    slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${uniqueSuffix()}`,
    description: 'Admin leaderboard test problem',
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
    User.deleteMany({}),
    Batch.deleteMany({}),
    BatchStudent.deleteMany({}),
    Problem.deleteMany({}),
    Submission.deleteMany({}),
  ]);
});

describe('Admin Leaderboard Endpoint', () => {
  describe('Authorization', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/admin/leaderboard');
      expect(res.status).toBe(401);
    });

    test('requires ADMIN role', async () => {
      const student = await createUser('Student');
      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${student.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Global scope', () => {
    test('excludes batch-scoped problems', async () => {
      const admin1 = await createAdmin('Admin1');
      const admin2 = await createAdmin('Admin2');
      const first = await createUser('Alpha');
      const second = await createUser('Beta');
      const batch = await Batch.create({ name: 'Batch', code: `B${uniqueSuffix()}` });
      await BatchStudent.create({ batch: batch._id, student: first.user._id, status: 'ACTIVE' });
      const globalProblem = await createProblem({ title: 'Global', scope: 'GLOBAL' });
      const batchProblem = await createProblem({ title: 'Batch', scope: 'BATCH', batch: batch._id });

      await accept(first.user._id, globalProblem);
      await accept(first.user._id, batchProblem);

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin2.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.metrics.assignedProblems).toBe(1); // Only global
      expect(res.body.data.leaderboard[0].solved).toBe(1);
    });

    test('excludes draft and archived problems', async () => {
      const admin = await createAdmin('Admin');
      await createProblem({ title: 'Published', scope: 'GLOBAL', status: 'PUBLISHED' });
      await createProblem({ title: 'Draft', scope: 'GLOBAL', status: 'DRAFT' });
      await createProblem({ title: 'Archived', scope: 'GLOBAL', status: 'ARCHIVED' });

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.metrics.assignedProblems).toBe(1);
    });

    test('excludes inactive students', async () => {
      const admin = await createAdmin('Admin');
      const activeStudent = await createUser('Active');
      const inactiveUser = await User.create({
        name: 'Inactive',
        email: `inactive${uniqueSuffix()}@test.com`,
        passwordHash: await authService.hashPassword('StrongP@ssw0rd'),
        role: 'STUDENT',
        status: 'INACTIVE',
      });
      const problem = await createProblem({ title: 'Problem', scope: 'GLOBAL' });
      await accept(inactiveUser._id, problem);

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      const names = res.body.data.leaderboard.map((r) => r.name);
      expect(names).not.toContain('Inactive');
    });
  });

  describe('Scoring and ranking', () => {
    test('only ACCEPTED submissions count', async () => {
      const admin = await createAdmin('Admin');
      const student = await createUser('Student');
      const problem = await createProblem({ title: 'Problem', scope: 'GLOBAL' });

      await Submission.create({
        student: student.user._id,
        problem: problem._id,
        code: 'wrong code',
        language: 'python',
        verdict: 'WRONG_ANSWER',
      });

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.body.data.leaderboard[0].solved).toBe(0);
    });

    test('deduplicates multiple accepted submissions for same problem', async () => {
      const admin = await createAdmin('Admin');
      const student = await createUser('Student');
      const problem = await createProblem({ title: 'Problem', scope: 'GLOBAL' });

      await accept(student.user._id, problem);
      await accept(student.user._id, problem);
      await accept(student.user._id, problem);

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.body.data.leaderboard[0].solved).toBe(1);
    });

    test('ranks by completion percentage descending, then solved, then name', async () => {
      const admin = await createAdmin('Admin');
      const zoe = await createUser('Zoe');
      const alice = await createUser('Alice');
      const bob = await createUser('Bob');

      const problem1 = await createProblem({ title: 'P1', scope: 'GLOBAL' });
      const problem2 = await createProblem({ title: 'P2', scope: 'GLOBAL' });
      const problem3 = await createProblem({ title: 'P3', scope: 'GLOBAL' });

      await accept(zoe.user._id, problem1);
      await accept(alice.user._id, problem1);
      await accept(alice.user._id, problem2);
      await accept(bob.user._id, problem1);
      await accept(bob.user._id, problem2);
      await accept(bob.user._id, problem3);

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      const names = res.body.data.leaderboard.map((r) => r.name);
      expect(names).toEqual(['Bob', 'Alice', 'Zoe']); // 100%, 67%, 33%
    });

    test('handles zero published problems without division by zero', async () => {
      const admin = await createAdmin('Admin');
      await createUser('Student');

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.metrics.assignedProblems).toBe(0);
      expect(res.body.data.leaderboard[0].completionPercentage).toBe(0);
    });

    test('completion percentage calculation is correct', async () => {
      const admin = await createAdmin('Admin');
      const student = await createUser('Student');
      const p1 = await createProblem({ title: 'P1', scope: 'GLOBAL' });
      const p2 = await createProblem({ title: 'P2', scope: 'GLOBAL' });
      const p3 = await createProblem({ title: 'P3', scope: 'GLOBAL' });
      const p4 = await createProblem({ title: 'P4', scope: 'GLOBAL' });

      await accept(student.user._id, p1);
      await accept(student.user._id, p2);

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.body.data.leaderboard[0].solved).toBe(2);
      expect(res.body.data.leaderboard[0].assigned).toBe(4);
      expect(res.body.data.leaderboard[0].completionPercentage).toBe(50);
    });
  });

  describe('Pagination and search', () => {
    test('respects limit and offset', async () => {
      const admin = await createAdmin('Admin');
      await createUser('A');
      await createUser('B');
      await createUser('C');

      const res1 = await request(app)
        .get('/api/admin/leaderboard?limit=2&offset=0')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res1.body.data.leaderboard.length).toBe(2);

      const res2 = await request(app)
        .get('/api/admin/leaderboard?limit=2&offset=2')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res2.body.data.leaderboard.length).toBe(1);
    });

    test('search filters by student name', async () => {
      const admin = await createAdmin('Admin');
      await createUser('Alice');
      await createUser('Bob');

      const res = await request(app)
        .get('/api/admin/leaderboard?search=alice')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.body.data.leaderboard.length).toBe(1);
      expect(res.body.data.leaderboard[0].name).toBe('Alice');
    });

    test('returns total count in meta', async () => {
      const admin = await createAdmin('Admin');
      await createUser('A');
      await createUser('B');
      await createUser('C');

      const res = await request(app)
        .get('/api/admin/leaderboard?limit=1&offset=0')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.body.meta.totalCount).toBe(3);
      expect(res.body.data.leaderboard.length).toBe(1);
    });
  });

  describe('Privacy protections', () => {
    test('never exposes student emails', async () => {
      const admin = await createAdmin('Admin');
      await createUser('Student');

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      const leaderboard = res.body.data.leaderboard;
      expect(leaderboard.length).toBeGreaterThan(0);

      // Check that no email field exists in leaderboard entries
      const hasEmail = leaderboard.some((row) => row.email !== undefined);
      expect(hasEmail).toBe(false);
    });

    test('never exposes source code', async () => {
      const admin = await createAdmin('Admin');
      const student = await createUser('Student');
      const problem = await createProblem({ title: 'Problem', scope: 'GLOBAL' });
      await accept(student.user._id, problem);

      const res = await request(app)
        .get('/api/admin/leaderboard')
        .set('Authorization', `Bearer ${admin.token}`);

      const leaderboard = res.body.data.leaderboard;
      const hasCode = leaderboard.some((row) => row.code !== undefined);
      expect(hasCode).toBe(false);
    });
  });
});



