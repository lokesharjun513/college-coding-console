// backend/tests/trainerBatchProblemDuplicates.test.js
//
// Regression coverage for the single Batch-Problem representation rule.
//
// "Adding a problem to a batch is the operation that associates it with that
// batch." A problem whose `batch` is already the target batch is therefore
// already associated, and must not be offered for assignment a second time —
// otherwise the same (batch, problem) pair exists both as a BATCH-scoped Problem
// and as an Assignment, and a student meets it twice (once on the training and
// problem list, once on the assignment feed).
//
// What must keep working:
//   - PUBLISHED GLOBAL problems are still assignable, and assignments still
//     create/update/soft-delete exactly as before;
//   - batch ownership and role checks are untouched;
//   - the student assignment feed and AssignmentCompletion are untouched —
//     students reach batch problems through Problem.scope/batch, never through
//     Assignment (backend/src/services/problemAccess.js).
//
// Every test cleans up only the rows it created: all suites share one database.

const request = require('supertest');
const uniqueSuffix = require('./utils/unique');
const authService = require('../src/auth/authService');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const Assignment = require('../src/models/Assignment');
const AssignmentCompletion = require('../src/models/AssignmentCompletion');
const Submission = require('../src/models/Submission');
const TestCase = require('../src/models/TestCase');
const OnlineCompilerExecutor = require('../src/services/OnlineCompilerExecutor');

// The student submission endpoint grades against real test cases through the
// compiler executor. Mocked here for the same reason assignmentCompletionIntegration
// does — this suite is about associations, not about judging code — and the
// mocks must be registered before `require('../src/app')`.
jest.mock('../src/services/OnlineCompilerExecutor', () => ({ execute: jest.fn() }));

jest.mock('../src/services/compilerRegistry', () => {
  const CATALOG = {
    'gcc-15': { id: 'gcc-15', compiler: 'gcc-15', name: 'C 15', language: 'c', displayName: 'C 15' },
  };
  const LEGACY_MAP = { c: 'gcc-15' };
  return {
    getCompilers: jest.fn().mockResolvedValue(Object.values(CATALOG)),
    getCompilerById: jest.fn(async (id) => CATALOG[id] || null),
    isSupportedCompiler: (id) => id in CATALOG,
    getLanguageByCompiler: (id) => CATALOG[id]?.language || null,
    mapLegacyToCompiler: jest.fn((lang) => LEGACY_MAP[lang] || null),
    normalizeCompilerResponse: (r) => r,
    LEGACY_TO_COMPILER: LEGACY_MAP,
  };
});

const ACCEPTING_RUN = {
  status: 'success',
  exitCode: 0,
  stdout: '42',
  stderr: '',
  compile_stderr: '',
  executionTime: '0.01',
};

// Required only after the jest.mock calls above, which hoist.
const app = require('../src/app');

const PASSWORD = 'StrongP@ssw0rd';

// The suites share one remote test database, so round trips are slow enough
// that the 30s default intermittently trips.
jest.setTimeout(120000);

const created = {
  users: [],
  batches: [],
  problems: [],
  assignments: [],
  enrollments: [],
  submissions: [],
  testCases: [],
};

async function createUser(role) {
  const suffix = uniqueSuffix();
  const user = await User.create({
    name: `${role} ${suffix}`,
    email: `${role.toLowerCase()}-${suffix}@testmail.com`,
    passwordHash: await authService.hashPassword(PASSWORD),
    role,
    status: 'ACTIVE',
  });
  created.users.push(user._id);
  return user;
}

async function login(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function createBatch(trainerId) {
  const suffix = uniqueSuffix();
  const batch = await Batch.create({ name: `Batch ${suffix}`, code: `B${suffix}`, trainer: trainerId });
  created.batches.push(batch._id);
  return batch;
}

/** Create a problem directly so each test controls scope/batch/status exactly. */
async function createProblem({ scope = 'GLOBAL', batch = null, createdBy, status = 'PUBLISHED', title, withTestCase = false }) {
  const suffix = uniqueSuffix();
  const problem = await Problem.create({
    title: title || `Problem ${suffix}`,
    slug: `problem-${suffix}`.toLowerCase(),
    description: 'Description',
    difficulty: 'EASY',
    // The submission endpoint requires a language the problem allows and a
    // compiler mapped to it; the mocked registry only knows `c`.
    allowedLanguages: ['c'],
    compilers: { c: 'gcc-15' },
    scope,
    batch,
    createdBy,
    status,
  });
  created.problems.push(problem._id);
  if (withTestCase) {
    const tc = await TestCase.create({
      problem: problem._id,
      input: '0',
      expectedOutput: '42',
      isHidden: false,
      order: 0,
    });
    created.testCases.push(tc._id);
  }
  return problem;
}

/** Submit a C solution graded as ACCEPTED by the mocked executor. */
async function submitAccepted(token, problemId) {
  OnlineCompilerExecutor.execute.mockResolvedValue(ACCEPTING_RUN);
  return request(app)
    .post('/api/student/submissions')
    .set('Authorization', `Bearer ${token}`)
    .send({ problemId: problemId.toString(), code: 'int main(){return 0;}', language: 'c' });
}

describe('Single Batch-Problem representation', () => {
  let trainer;
  let trainerToken;
  let otherTrainer;
  let otherTrainerToken;
  let student;
  let studentToken;
  let batch;
  let otherBatch;

  beforeAll(async () => {
    trainer = await createUser('TRAINER');
    trainerToken = await login(trainer);
    otherTrainer = await createUser('TRAINER');
    otherTrainerToken = await login(otherTrainer);
    student = await createUser('STUDENT');
    studentToken = await login(student);

    batch = await createBatch(trainer._id);
    otherBatch = await createBatch(otherTrainer._id);
  });

  afterAll(async () => {
    await AssignmentCompletion.deleteMany({ assignment: { $in: created.assignments } });
    await TestCase.deleteMany({ _id: { $in: created.testCases } });
    await Submission.deleteMany({ _id: { $in: created.submissions } });
    await Assignment.deleteMany({ _id: { $in: created.assignments } });
    await Problem.deleteMany({ _id: { $in: created.problems } });
    await BatchStudent.deleteMany({ _id: { $in: created.enrollments } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  const asTrainer = (req, token = trainerToken) => req.set('Authorization', `Bearer ${token}`);
  const catalogue = (batchId, token = trainerToken) =>
    asTrainer(request(app).get(`/api/trainer/batches/${batchId}/assignments/problems`), token);
  const create = (batchId, body, token = trainerToken) =>
    asTrainer(request(app).post(`/api/trainer/batches/${batchId}/assignments`), token).send(body);

  // ---------------------------------------------------------------- catalogue

  describe('assignable catalogue', () => {
    test('does not offer a problem that is already associated with the batch', async () => {
      const inBatch = await createProblem({ scope: 'BATCH', batch: batch._id, createdBy: trainer._id });

      const res = await catalogue(batch._id);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p) => p.id)).not.toContain(inBatch._id.toString());
    });

    test('does not offer another trainer’s batch problem either', async () => {
      // Defence in depth: even if ownership ever changed, the catalogue is
      // GLOBAL-only, so no batch-scoped problem can surface here.
      const foreign = await createProblem({ scope: 'BATCH', batch: batch._id, createdBy: otherTrainer._id });

      const res = await catalogue(batch._id);
      expect(res.body.data.map((p) => p.id)).not.toContain(foreign._id.toString());
    });

    test('still offers published GLOBAL problems', async () => {
      const global = await createProblem({ createdBy: trainer._id });

      const res = await catalogue(batch._id);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p) => p.id)).toContain(global._id.toString());
    });

    test('still excludes unpublished GLOBAL problems', async () => {
      const draft = await createProblem({ createdBy: trainer._id, status: 'DRAFT' });
      const archived = await createProblem({ createdBy: trainer._id, status: 'ARCHIVED' });

      const res = await catalogue(batch._id);
      const ids = res.body.data.map((p) => p.id);
      expect(ids).not.toContain(draft._id.toString());
      expect(ids).not.toContain(archived._id.toString());
      expect(res.body.data.every((p) => p.scope === 'GLOBAL' && p.status === 'PUBLISHED')).toBe(true);
    });

    test('an empty catalogue is a valid 200, not an error', async () => {
      const emptyBatch = await createBatch(trainer._id);
      const res = await catalogue(emptyBatch._id);
      // Other suites' GLOBAL problems may exist, so only the shape is asserted.
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // --------------------------------------------------------------- creation

  describe('assignment creation', () => {
    test('refuses to create a second representation of an existing batch problem', async () => {
      const inBatch = await createProblem({ scope: 'BATCH', batch: batch._id, createdBy: trainer._id });

      const res = await create(batch._id, { problemId: inBatch._id.toString() });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ALREADY_BATCH_ASSOCIATED');
      // Nothing was written.
      expect(await Assignment.countDocuments({ problem: inBatch._id, deleted: false })).toBe(0);
    });

    test('the refusal is about duplication, not authorization', async () => {
      // The trainer OWNS this problem and the batch. 403 would wrongly imply
      // they lack permission for something that is already theirs.
      const inBatch = await createProblem({ scope: 'BATCH', batch: batch._id, createdBy: trainer._id });
      const res = await create(batch._id, { problemId: inBatch._id.toString() });
      expect(res.status).toBe(409);
      expect(res.status).not.toBe(403);
    });

    test('still creates an assignment for a published GLOBAL problem', async () => {
      const global = await createProblem({ createdBy: trainer._id });

      const res = await create(batch._id, { problemId: global._id.toString(), title: 'Weekly set' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.problem.id).toBe(global._id.toString());
      expect(res.body.data.batch.toString()).toBe(batch._id.toString());
      expect(res.body.data.title).toBe('Weekly set');
      created.assignments.push(res.body.data.id);
    });

    test('still refuses another trainer’s batch problem with 403', async () => {
      const foreign = await createProblem({ scope: 'BATCH', batch: otherBatch._id, createdBy: otherTrainer._id });
      const res = await create(otherBatch._id, { problemId: foreign._id.toString() }, otherTrainerToken);
      // Other trainer owns it, but it is scoped to a different batch.
      const crossBatch = await create(otherBatch._id, { problemId: foreign._id.toString() }, trainerToken);
      expect(crossBatch.status).toBe(403);
      void res;
    });

    test('still refuses an unpublished GLOBAL problem with 400', async () => {
      const draft = await createProblem({ createdBy: trainer._id, status: 'DRAFT' });
      const res = await create(batch._id, { problemId: draft._id.toString() });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/published/i);
    });
  });

  // ------------------------------------------------- students are unaffected

  describe('student behaviour is unchanged', () => {
    test('a student sees and can submit a batch problem with no Assignment row at all', async () => {
      const enrollment = await BatchStudent.create({
        batch: batch._id,
        student: student._id,
        status: 'ACTIVE',
      });
      created.enrollments.push(enrollment._id);

      const batchProblem = await createProblem({
        scope: 'BATCH',
        batch: batch._id,
        createdBy: trainer._id,
        title: `Reachable ${uniqueSuffix()}`,
        withTestCase: true,
      });

      // No Assignment exists for it — proving the batch association alone is
      // what makes it available.
      expect(await Assignment.countDocuments({ problem: batchProblem._id })).toBe(0);

      const list = await request(app)
        .get('/api/student/problems')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.map((p) => p.id)).toContain(batchProblem._id.toString());

      const detail = await request(app)
        .get(`/api/student/problems/${batchProblem._id}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(detail.status).toBe(200);

      // And a real submission is accepted.
      const submission = await submitAccepted(studentToken, batchProblem._id);
      expect(submission.status).toBe(201);
      expect(submission.body.data.verdict).toBe('ACCEPTED');
      if (submission.body?.data?.id) created.submissions.push(submission.body.data.id);

      // Still no Assignment row, and still no completion: the batch path never
      // needs one.
      expect(await Assignment.countDocuments({ problem: batchProblem._id })).toBe(0);
    });

    test('a GLOBAL assignment still appears on the student feed and records completion', async () => {
      const global = await createProblem({
        createdBy: trainer._id,
        title: `Feed item ${uniqueSuffix()}`,
        withTestCase: true,
      });
      const createdRes = await create(batch._id, { problemId: global._id.toString() });
      expect(createdRes.status).toBe(201);
      const assignmentId = createdRes.body.data.id;
      created.assignments.push(assignmentId);

      const feed = await request(app)
        .get('/api/student/assignments')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(feed.status).toBe(200);
      const entry = feed.body.data.find((a) => a.problem.id === global._id.toString());
      expect(entry).toBeDefined();
      expect(entry.completed).toBe(false);

      // An accepted submission completes it, exactly as before.
      const submission = await submitAccepted(studentToken, global._id);
      expect(submission.status).toBe(201);
      expect(submission.body.data.verdict).toBe('ACCEPTED');
      if (submission.body?.data?.id) created.submissions.push(submission.body.data.id);

      const completion = await AssignmentCompletion.findOne({
        assignment: assignmentId,
        student: student._id,
      });
      expect(completion).not.toBeNull();
      expect(completion.verdict).toBe('ACCEPTED');

      // And the trainer's monitoring still reflects it.
      const list = await asTrainer(
        request(app).get(`/api/trainer/batches/${batch._id}/assignments`)
      );
      expect(list.status).toBe(200);
      const monitored = list.body.data.find((a) => a.problem.id === global._id.toString());
      expect(monitored.monitoring.completed).toBe(1);
    });

    test('a student cannot see another student’s batch', async () => {
      const outsider = await createUser('STUDENT');
      const outsiderToken = await login(outsider);

      const feed = await request(app)
        .get('/api/student/assignments')
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(feed.status).toBe(200);
      // Not enrolled in `batch`, so nothing from it is visible.
      expect(feed.body.data.every((a) => a.batch.id !== batch._id.toString())).toBe(true);
    });
  });

  // ------------------------------------------------------------ authorization

  describe('authorization is unchanged', () => {
    test('the catalogue requires authentication', async () => {
      const res = await request(app).get(`/api/trainer/batches/${batch._id}/assignments/problems`);
      expect(res.status).toBe(401);
    });

    test('the catalogue refuses a student', async () => {
      const res = await catalogue(batch._id, studentToken);
      expect(res.status).toBe(403);
    });

    test('the catalogue refuses another trainer’s batch', async () => {
      const res = await catalogue(otherBatch._id, trainerToken);
      expect(res.status).toBe(403);
    });

    test('creating an assignment in another trainer’s batch is refused', async () => {
      const global = await createProblem({ createdBy: trainer._id });
      const res = await create(otherBatch._id, { problemId: global._id.toString() }, trainerToken);
      expect(res.status).toBe(403);
      expect(await Assignment.countDocuments({ batch: otherBatch._id, deleted: false })).toBe(0);
    });
  });
});