const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Submission = require('../src/models/Submission');
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

beforeEach(async () => {
    await User.deleteMany({});
    await Problem.deleteMany({});
    await Batch.deleteMany({});
    await BatchStudent.deleteMany({});
    await Submission.deleteMany({});
});

describe('Student Problems Endpoint', () => {
  test('authenticated student can access GET /api/student/problems', async () => {
    const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/student/problems');
    expect(res.status).toBe(401);
  });

  test('non-student receives 403', async () => {
    const trainer = await createUser({ name: 'Trainer', email: 'tra@test.com', password: 'pwd', role: 'TRAINER' });
    const token = await loginAndGetToken(trainer.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GLOBAL problems are visible', async () => {
    await Problem.create({ title: 'G1', slug: 'g1', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });
    const batch = await Batch.create({ name: 'B1', code: 'B1', trainer: new mongoose.Types.ObjectId() });
    const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });
    await BatchStudent.create({ batch: batch._id, student: student._id });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.meta.enrolled).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  test('Unenrolled student receives meta.enrolled false and no batch problems', async () => {
    // Create a batch and a batch problem, but do not enroll the student
    const batch = await Batch.create({ name: 'B1', code: 'B1', trainer: new mongoose.Types.ObjectId() });
    await Problem.create({ title: 'B1P', slug: 'b1p', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', batch: batch._id, status: 'PUBLISHED' });
    const student = await createUser({ name: 'Student', email: 'stu2@test.com', password: 'pwd' });
    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.meta.enrolled).toBe(false);
    // Should not include batch problem in data
    const ids = (res.body.data || []).map(p => p.id);
    expect(ids).not.toContainEqual(expect.any(String)); // No batch problems
  });

  test('INACTIVE enrollment does not count as enrolled', async () => {
    const batch = await Batch.create({ name: 'B2', code: 'B2', trainer: new mongoose.Types.ObjectId() });
    await Problem.create({ title: 'B2P', slug: 'b2p', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', batch: batch._id, status: 'PUBLISHED' });
    const student = await createUser({ name: 'Student', email: 'stu3@test.com', password: 'pwd' });
    await BatchStudent.create({ batch: batch._id, student: student._id, status: 'INACTIVE' });

    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.meta.enrolled).toBe(false);
  });

  test('Problems from enrolled batch are visible', async () => {
    const batch = await Batch.create({ name: 'B1', code: 'B1', trainer: new mongoose.Types.ObjectId() });
    await Problem.create({ title: 'B1P', slug: 'b1p', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', batch: batch._id, status: 'PUBLISHED' });
    const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });
    await BatchStudent.create({ batch: batch._id, student: student._id });

    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].batch.id).toBe(batch._id.toString());
  });

  test('Problems from unrelated batch are NOT visible', async () => {
    const batch = await Batch.create({ name: 'B1', code: 'B1', trainer: new mongoose.Types.ObjectId() });
    await Problem.create({ title: 'B1P', slug: 'b1p', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', batch: batch._id, status: 'PUBLISHED' });

    const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });

    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.length).toBe(0);
  });

  test('progress status (NOT_STARTED, ATTEMPTED, SOLVED)', async () => {
    const problem = await Problem.create({ title: 'P1', slug: 'p1', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'GLOBAL', status: 'PUBLISHED' });
    const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });

    // 1. Not started
    const token = await loginAndGetToken(student.email, 'pwd');
    let res = await request(app).get('/api/student/problems').set('Authorization', `Bearer ${token}`);
    expect(res.body.data[0].progress).toBe('NOT_STARTED');

    // 2. Attempted
    await Submission.create({ student: student._id, problem: problem._id, code: 'x', language: 'python', verdict: 'WRONG_ANSWER' });
    res = await request(app).get('/api/student/problems').set('Authorization', `Bearer ${token}`);
    expect(res.body.data[0].progress).toBe('ATTEMPTED');

    // 3. Solved
    await Submission.create({ student: student._id, problem: problem._id, code: 'x', language: 'python', verdict: 'ACCEPTED' });
    res = await request(app).get('/api/student/problems').set('Authorization', `Bearer ${token}`);
    expect(res.body.data[0].progress).toBe('SOLVED');
  });

  test('Batch problems with practiceDate expose only current IST-day practice', async () => {
    // Setup
    const batch = await Batch.create({ name: 'B1', code: 'B1', trainer: new mongoose.Types.ObjectId() });
    const student = await createUser({ name: 'Student', email: 'stu.prac@test.com', password: 'pwd' });
    await BatchStudent.create({ batch: batch._id, student: student._id });

    // Get current IST day bounds
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const year = istNow.getUTCFullYear();
    const month = istNow.getUTCMonth();
    const day = istNow.getUTCDate();
    const todayStart = new Date(Date.UTC(year, month, day) - istOffset);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStart = new Date(todayEnd.getTime() + 24 * 60 * 60 * 1000);

    // Create problems with different practiceDate values
    await Problem.create({
      title: 'Today Problem',
      slug: 'today-problem',
      description: 'desc',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'BATCH',
      batch: batch._id,
      status: 'PUBLISHED',
      practiceDate: new Date(todayStart.getTime() + 12 * 60 * 60 * 1000), // Midday today
    });

    await Problem.create({
      title: 'Tomorrow Problem',
      slug: 'tomorrow-problem',
      description: 'desc',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'BATCH',
      batch: batch._id,
      status: 'PUBLISHED',
      practiceDate: new Date(tomorrowStart.getTime() + 12 * 60 * 60 * 1000), // Midday tomorrow
    });

    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.meta.today.length).toBe(1);
    expect(res.body.meta.today[0].title).toBe('Today Problem');

    expect(res.body.meta.upcoming.length).toBe(0);
    expect(res.body.data.map(p => p.title)).not.toContain('Tomorrow Problem');

    expect(res.body.meta.global.length).toBe(0);
  });

  test('Batch problems without practiceDate are still visible (backward compatibility)', async () => {
    const batch = await Batch.create({ name: 'B2', code: 'B2', trainer: new mongoose.Types.ObjectId() });
    const student = await createUser({ name: 'Student', email: 'stu.legacy@test.com', password: 'pwd' });
    await BatchStudent.create({ batch: batch._id, student: student._id });

    await Problem.create({
      title: 'Legacy Problem',
      slug: 'legacy-problem',
      description: 'desc',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'BATCH',
      batch: batch._id,
      status: 'PUBLISHED',
      // No practiceDate
    });

    const token = await loginAndGetToken(student.email, 'pwd');
    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Legacy Problem');
  });

  test('Students in different batches see isolated daily problems', async () => {
    const batch1 = await Batch.create({ name: 'Batch1', code: 'B1', trainer: new mongoose.Types.ObjectId() });
    const batch2 = await Batch.create({ name: 'Batch2', code: 'B2', trainer: new mongoose.Types.ObjectId() });

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const year = istNow.getUTCFullYear();
    const month = istNow.getUTCMonth();
    const day = istNow.getUTCDate();
    const todayStart = new Date(Date.UTC(year, month, day) - istOffset);

    await Problem.create({
      title: 'Batch1 Today',
      slug: 'batch1-today',
      description: 'desc',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'BATCH',
      batch: batch1._id,
      status: 'PUBLISHED',
      practiceDate: new Date(todayStart.getTime() + 12 * 60 * 60 * 1000),
    });

    await Problem.create({
      title: 'Batch2 Today',
      slug: 'batch2-today',
      description: 'desc',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'BATCH',
      batch: batch2._id,
      status: 'PUBLISHED',
      practiceDate: new Date(todayStart.getTime() + 12 * 60 * 60 * 1000),
    });

    const student1 = await createUser({ name: 'Student1', email: 's1@diff.com', password: 'pwd' });
    const student2 = await createUser({ name: 'Student2', email: 's2@diff.com', password: 'pwd' });
    await BatchStudent.create({ batch: batch1._id, student: student1._id });
    await BatchStudent.create({ batch: batch2._id, student: student2._id });

    const token1 = await loginAndGetToken(student1.email, 'pwd');
    const token2 = await loginAndGetToken(student2.email, 'pwd');

    const res1 = await request(app).get('/api/student/problems').set('Authorization', `Bearer ${token1}`);
    const res2 = await request(app).get('/api/student/problems').set('Authorization', `Bearer ${token2}`);

    expect(res1.body.meta.today.length).toBe(1);
    expect(res1.body.meta.today[0].title).toBe('Batch1 Today');

    expect(res2.body.meta.today.length).toBe(1);
    expect(res2.body.meta.today[0].title).toBe('Batch2 Today');
  });

  test('Global problems remain in global meta regardless of practiceDate', async () => {
    const student = await createUser({ name: 'Student', email: 'stu.global@test.com', password: 'pwd' });
    const token = await loginAndGetToken(student.email, 'pwd');

    await Problem.create({
      title: 'Global Problem',
      slug: 'global-problem',
      description: 'desc',
      difficulty: 'EASY',
      createdBy: new mongoose.Types.ObjectId(),
      scope: 'GLOBAL',
      status: 'PUBLISHED',
      practiceDate: new Date(), // Even if global has practiceDate
    });

    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.meta.global.length).toBe(1);
    expect(res.body.meta.today.length).toBe(0);
    expect(res.body.data.length).toBe(1);
  });
});
