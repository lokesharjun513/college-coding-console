const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const authService = require('../src/auth/authService');

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
});

describe('Student Problem Scheduling', () => {
  test('exposes current batch practice but not future practice', async () => {
    const student = await createUser({ name: 'Student', email: 'stu@test.com', password: 'pwd' });
    const batch = await Batch.create({ name: 'B1', code: 'B1', trainer: new mongoose.Types.ObjectId() });
    await BatchStudent.create({ batch: batch._id, student: student._id });
    const token = await loginAndGetToken(student.email, 'pwd');

    const now = new Date();
    // Use mid-day to avoid IST boundary issues in this simple test
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0);

    await Problem.create({ title: 'Today P', slug: 'today-p', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: today });
    await Problem.create({ title: 'Upcoming P', slug: 'up-p', description: 'desc', difficulty: 'EASY', createdBy: new mongoose.Types.ObjectId(), scope: 'BATCH', batch: batch._id, status: 'PUBLISHED', practiceDate: tomorrow });

    const res = await request(app)
      .get('/api/student/problems')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.meta.todayCount).toBe(1);
    expect(res.body.meta.upcomingCount).toBe(0);
    expect(res.body.meta.today[0].title).toBe('Today P');
    expect(res.body.data.map(p => p.title)).not.toContain('Upcoming P');
  });
});
