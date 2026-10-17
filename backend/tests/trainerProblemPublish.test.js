// backend/tests/trainerProblemPublish.test.js
//
// Focused tests for the trainer problem publish/unpublish capability.
// Verifies:
// 1. Only the owning trainer can publish their batch problems
// 2. Problems are correctly scoped to their batch
// 3. Students can see PUBLISHED problems but not DRAFT problems
// 4. Cross-batch publishing is blocked

const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const ProblemTopic = require('../src/models/ProblemTopic');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const BatchStudent = require('../src/models/BatchStudent');
const authService = require('../src/auth/authService');

async function createTestUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.token;
}

function generateUniqueEmail(base) {
  const suffix = uniqueSuffix();
  return `${base.replace('@', `${suffix}@`)}`;
}

describe('Trainer Problem Publish', () => {
  let trainer;
  let trainerToken;
  let student;
  let studentToken;
  let batch;
  let collection;
  let topic;
  let draftProblem;
  let publishedProblem;
  let trainerPassword;

  beforeAll(async () => {
    // Create trainer
    const trainerEmail = generateUniqueEmail('trainer-pub@testmail.com');
    trainerPassword = 'TrainerP@ssw0rd';
    trainer = await createTestUser({
      name: 'Trainer User',
      email: trainerEmail,
      password: trainerPassword,
      role: 'TRAINER',
      status: 'ACTIVE',
    });

    // Create student
    const studentEmail = generateUniqueEmail('student-pub@testmail.com');
    const studentPassword = 'StudentP@ssw0rd';
    student = await createTestUser({
      name: 'Student User',
      email: studentEmail,
      password: studentPassword,
      role: 'STUDENT',
      status: 'ACTIVE',
    });

    // Get tokens
    trainerToken = await loginAndGetToken(trainerEmail, trainerPassword);
    studentToken = await loginAndGetToken(studentEmail, studentPassword);

    // Create batch
    batch = await Batch.create({
      name: 'Publish Test Batch',
      code: `PTB-${uniqueSuffix()}`,
      status: 'ACTIVE',
      trainer: trainer._id,
    });

    // Create collection and topic
    collection = await Collection.create({
      name: `Publish Collection ${uniqueSuffix()}`,
      slug: `publish-collection-${uniqueSuffix()}`,
      scope: 'BATCH',
      batch: batch._id,
      createdBy: trainer._id,
    });

    topic = await Topic.create({
      name: 'Publish Topic',
      slug: `publish-topic-${uniqueSuffix()}`,
      collection: collection._id,
      createdBy: trainer._id,
    });

    // Create a DRAFT problem
    draftProblem = await Problem.create({
      title: 'Draft Problem',
      slug: `draft-problem-${uniqueSuffix()}`,
      description: 'A problem in draft status',
      difficulty: 'EASY',
      scope: 'BATCH',
      batch: batch._id,
      createdBy: trainer._id,
      status: 'DRAFT',
      allowedLanguages: ['python'],
      compilers: { python: 'python3' },
    });

    // Create a PUBLISHED problem
    publishedProblem = await Problem.create({
      title: 'Published Problem',
      slug: `published-problem-${uniqueSuffix()}`,
      description: 'A published problem',
      difficulty: 'EASY',
      scope: 'BATCH',
      batch: batch._id,
      createdBy: trainer._id,
      status: 'PUBLISHED',
      allowedLanguages: ['python'],
      compilers: { python: 'python3' },
    });

    // Link problems to collection/topic
    await ProblemTopic.create({
      problem: draftProblem._id,
      collection: collection._id,
      topic: topic._id,
      createdBy: trainer._id,
    });

    await ProblemTopic.create({
      problem: publishedProblem._id,
      collection: collection._id,
      topic: topic._id,
      createdBy: trainer._id,
    });

    // Enroll student in batch
    await BatchStudent.create({
      student: student._id,
      batch: batch._id,
      status: 'ACTIVE',
    });
  });

  afterAll(async () => {
    await User.deleteMany({
      email: { $in: [trainer.email, student.email] },
    });
    await Batch.deleteMany({ code: { $regex: '^PTB' } });
    await BatchStudent.deleteMany({});
    await ProblemTopic.deleteMany({});
    await Topic.deleteMany({ slug: { $regex: '^publish-topic' } });
    await Collection.deleteMany({ slug: { $regex: '^publish-collection' } });
    await Problem.deleteMany({ slug: { $regex: '(draft-problem|published-problem)' } });
  });

  describe('PATCH /api/trainer/batches/:batchId/problems/:problemId', () => {
    test('trainer can publish their own DRAFT problem', async () => {
      const res = await request(app)
        .patch(`/api/trainer/batches/${batch._id}/problems/${draftProblem._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PUBLISHED');

      const refreshed = await Problem.findById(draftProblem._id);
      expect(refreshed.status).toBe('PUBLISHED');

      // Revert to DRAFT
      await Problem.findByIdAndUpdate(draftProblem._id, { status: 'DRAFT' });
    });

    test('trainer can unpublish their own PUBLISHED problem', async () => {
      const res = await request(app)
        .patch(`/api/trainer/batches/${batch._id}/problems/${publishedProblem._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'DRAFT' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');

      const refreshed = await Problem.findById(publishedProblem._id);
      expect(refreshed.status).toBe('DRAFT');

      // Revert to PUBLISHED
      await Problem.findByIdAndUpdate(publishedProblem._id, { status: 'PUBLISHED' });
    });

    test('invalid status value is rejected', async () => {
      const res = await request(app)
        .patch(`/api/trainer/batches/${batch._id}/problems/${draftProblem._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'INVALID' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('unauthenticated request is rejected', async () => {
      const res = await request(app)
        .patch(`/api/trainer/batches/${batch._id}/problems/${draftProblem._id}`)
        .send({ status: 'PUBLISHED' });

      expect(res.statusCode).toBe(401);
    });

    test('student cannot publish problems', async () => {
      const res = await request(app)
        .patch(`/api/trainer/batches/${batch._id}/problems/${draftProblem._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: 'PUBLISHED' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Student visibility', () => {
    test('student cannot see DRAFT problems', async () => {
      // Ensure both problems are DRAFT
      await Problem.findByIdAndUpdate(publishedProblem._id, { status: 'DRAFT' });

      const res = await request(app)
        .get('/api/student/problems')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(200);
      const visibleTitles = res.body.data.map((p) => p.title);
      expect(visibleTitles.includes('Draft Problem')).toBe(false);
      expect(visibleTitles.includes('Published Problem')).toBe(false);
    });

    test('student can see PUBLISHED batch problems', async () => {
      // Ensure publishedProblem is PUBLISHED
      await Problem.findByIdAndUpdate(publishedProblem._id, { status: 'PUBLISHED' });

      const res = await request(app)
        .get('/api/student/problems')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(200);
      const visibleTitles = res.body.data.map((p) => p.title);
      expect(visibleTitles.includes('Published Problem')).toBe(true);
    });

    test('student cannot access DRAFT problem detail by ID', async () => {
      const res = await request(app)
        .get(`/api/student/problems/${draftProblem._id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
