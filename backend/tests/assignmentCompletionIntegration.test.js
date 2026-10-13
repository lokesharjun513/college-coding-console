// backend/tests/assignmentCompletionIntegration.test.js
//
// Phase 3 integration: a persisted ACCEPTED student submission records an
// AssignmentCompletion for the matching (assignment, student) pairs.
//
// Covers:
//   1. ACCEPTED completes the correct assignment
//   2. WRONG_ANSWER does not
//   3. COMPILATION_ERROR does not
//   4. Two batch assignments of the same problem complete independently
//   5. A student cannot complete another student's assignment
//   6. An unenrolled student cannot complete an assignment
//   7. Cancelled / deleted / not-yet-available assignments are not completed
//   8. Repeated processing does not create duplicates
//   9. A completion-service failure does not fail a successful submission
//  10. Submission responses and history are unchanged

const uniqueSuffix = require('./utils/unique');
const request = require('supertest');
const mongoose = require('mongoose');
const authService = require('../src/auth/authService');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const Submission = require('../src/models/Submission');
const Assignment = require('../src/models/Assignment');
const AssignmentCompletion = require('../src/models/AssignmentCompletion');
const OnlineCompilerExecutor = require('../src/services/OnlineCompilerExecutor');
const { recordAssignmentCompletion } = require('../src/services/assignmentCompletion');

jest.mock('../src/services/OnlineCompilerExecutor', () => ({ execute: jest.fn() }));

jest.mock('../src/services/compilerRegistry', () => {
  const CATALOG = {
    'g++-15': { id: 'g++-15', compiler: 'g++-15', name: 'C++ 15', language: 'cpp', displayName: 'C++ 15' },
    'gcc-15': { id: 'gcc-15', compiler: 'gcc-15', name: 'C 15', language: 'c', displayName: 'C 15' },
  };
  const LEGACY_MAP = { c: 'gcc-15', cpp: 'g++-15' };
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

// Spy wrapper so the real service runs by default but can be forced to throw.
// submissions.js destructures this export at require time, so the module must
// be mocked before `require('../src/app')`.
jest.mock('../src/services/assignmentCompletion', () => {
  const actual = jest.requireActual('../src/services/assignmentCompletion');
  return { ...actual, recordAssignmentCompletion: jest.fn(actual.recordAssignmentCompletion) };
});

const app = require('../src/app');

const PASSWORD = 'StrongP@ssw0rd';
const EXPECTED = '3';
const HIDDEN_EXPECTED = 'HIDDEN-OUTPUT-XYZ';

const created = {
  users: [], batches: [], problems: [], testCases: [],
  assignments: [], completions: [], submissions: [], enrollments: [],
};

async function createUser(role, label) {
  const suffix = uniqueSuffix();
  const user = await User.create({
    name: `${label} ${suffix}`,
    email: `${label.toLowerCase()}-${suffix}@testmail.com`,
    passwordHash: await authService.hashPassword(PASSWORD),
    role,
    status: 'ACTIVE',
    ...(role === 'TRAINER' ? { trainerId: `T-${suffix}` } : { rollNumber: `R-${suffix}` }),
  });
  created.users.push(user._id);
  return user;
}

async function login(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function createBatch(trainer) {
  const batch = await Batch.create({
    name: `Batch ${uniqueSuffix()}`,
    code: `B${uniqueSuffix()}`,
    trainer: trainer._id,
  });
  created.batches.push(batch._id);
  return batch;
}

// GLOBAL problem: every enrolled student can submit to it.
async function createProblem(trainer) {
  const suffix = uniqueSuffix();
  const problem = await Problem.create({
    title: `Problem ${suffix}`,
    slug: `problem-${suffix}`,
    description: 'Problem description',
    difficulty: 'EASY',
    allowedLanguages: ['cpp'],
    compilers: { cpp: 'g++-15' },
    scope: 'GLOBAL',
    status: 'PUBLISHED',
    createdBy: trainer._id,
  });
  created.problems.push(problem._id);

  const visible = await TestCase.create({ problem: problem._id, input: '1 2', expectedOutput: EXPECTED, isHidden: false, order: 0 });
  const hidden = await TestCase.create({ problem: problem._id, input: '9 9', expectedOutput: HIDDEN_EXPECTED, isHidden: true, order: 1 });
  created.testCases.push(visible._id, hidden._id);

  return problem;
}

async function createAssignment({ problem, batch, trainer, availableFrom = null, status = 'ACTIVE', deleted = false }) {
  const assignment = await Assignment.create({
    problem: problem._id,
    batch: batch._id,
    trainer: trainer._id,
    availableFrom,
    status,
    deleted,
  });
  created.assignments.push(assignment._id);
  return assignment;
}

async function enroll(student, batch, status = 'ACTIVE') {
  // Idempotent: the (batch, student) index is unique.
  const existing = await BatchStudent.findOne({ batch: batch._id, student: student._id });
  if (existing) {
    existing.status = status;
    await existing.save();
    created.enrollments.push(existing._id);
    return existing;
  }
  const enrollment = await BatchStudent.create({ batch: batch._id, student: student._id, status });
  created.enrollments.push(enrollment._id);
  return enrollment;
}

/** Submit through the real endpoint and return the response. */
async function submit(token, problemId, code = 'int main(){}') {
  return request(app)
    .post('/api/student/submissions')
    .set('Authorization', `Bearer ${token}`)
    .send({ problemId: problemId.toString(), code, language: 'cpp' });
}

const acceptingRun = (stdout) => ({
  success: true, status: 'success', exitCode: 0, stdout: `${stdout}\n`, stderr: '', time: 0.01, memory: 512,
});

// The executor is input-aware so both the visible and the hidden test case pass,
// exactly as a correct solution would. The hidden case's expected output is
// never asserted against — it is only used to drive the real submission flow.
const EXPECTED_BY_INPUT = { '1 2': EXPECTED, '9 9': HIDDEN_EXPECTED };
const acceptingExecutor = async ({ stdin }) => acceptingRun(EXPECTED_BY_INPUT[stdin] ?? '0');

const WRONG_RUN = { success: true, status: 'success', exitCode: 0, stdout: '4\n', stderr: '', time: 0.01, memory: 512 };
const COMPILE_FAIL_RUN = { success: false, status: 'compile_error', exitCode: 1, stdout: '', stderr: 'Syntax error', compile_output: 'Syntax error', time: 0, memory: 0 };

const completionsFor = (assignmentId, studentId) =>
  AssignmentCompletion.find({ assignment: assignmentId, student: studentId }).lean();

describe('Submission → assignment completion integration', () => {
  let trainer;
  let student;
  let studentToken;
  let batchOne;
  let batchTwo;
  let problem;

  beforeEach(async () => {
    // Reset both mocks fully so a forced failure or verdict override from a
    // previous test can never leak into this one.
    OnlineCompilerExecutor.execute.mockReset().mockImplementation(acceptingExecutor);
    const actual = jest.requireActual('../src/services/assignmentCompletion').recordAssignmentCompletion;
    recordAssignmentCompletion.mockReset().mockImplementation(actual);
  });

  beforeAll(async () => {
    trainer = await createUser('TRAINER', 'trainer');
    student = await createUser('STUDENT', 'student');
    studentToken = await login(student);
    batchOne = await createBatch(trainer);
    batchTwo = await createBatch(trainer);
    problem = await createProblem(trainer);
  });

  afterAll(async () => {
    await AssignmentCompletion.deleteMany({ _id: { $in: created.completions } });
    await Assignment.deleteMany({ _id: { $in: created.assignments } });
    await Submission.deleteMany({ _id: { $in: created.submissions } });
    await TestCase.deleteMany({ _id: { $in: created.testCases } });
    await Problem.deleteMany({ _id: { $in: created.problems } });
    await BatchStudent.deleteMany({ _id: { $in: created.enrollments } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  // ---------- 1. ACCEPTED completes the correct assignment ----------
  test('ACCEPTED submission completes the correct assignment', async () => {
    await enroll(student, batchOne);
    const assignment = await createAssignment({ problem, batch: batchOne, trainer });

    const res = await submit(studentToken, problem._id);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    const submissionId = res.body.data.id;
    const completions = await completionsFor(assignment._id, student._id);
    expect(completions).toHaveLength(1);
    expect(completions[0].verdict).toBe('ACCEPTED');
    expect(completions[0].acceptedSubmission.toString()).toBe(submissionId.toString());
  });

  // ---------- 2. WRONG_ANSWER does not ----------
  test('WRONG_ANSWER submission does not complete the assignment', async () => {
    await enroll(student, batchOne);
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-01') });

    OnlineCompilerExecutor.execute.mockResolvedValue(WRONG_RUN);
    const res = await submit(studentToken, problem._id);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('WRONG_ANSWER');

    expect(await completionsFor(assignment._id, student._id)).toHaveLength(0);
    expect(recordAssignmentCompletion).not.toHaveBeenCalled();

    // The student's OWN stdout is returned, but the stored expected output of
    // the hidden case is never echoed back.
    expect(JSON.stringify(res.body)).not.toContain(HIDDEN_EXPECTED);
    expect(JSON.stringify(res.body)).not.toContain('expectedOutput');
  });

  // ---------- 3. COMPILATION_ERROR does not ----------
  test('COMPILATION_ERROR submission does not complete the assignment', async () => {
    await enroll(student, batchOne);
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-02') });

    OnlineCompilerExecutor.execute.mockResolvedValue(COMPILE_FAIL_RUN);
    const res = await submit(studentToken, problem._id);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('COMPILATION_ERROR');

    expect(await completionsFor(assignment._id, student._id)).toHaveLength(0);
    expect(recordAssignmentCompletion).not.toHaveBeenCalled();
  });

  // ---------- 4. Two batches, same problem, independent completions ----------
  test('two batch assignments of the same problem complete independently', async () => {
    const mover = await createUser('STUDENT', 'mover');
    const moverToken = await login(mover);
    await enroll(mover, batchOne);
    await enroll(mover, batchTwo);

    const inBatchOne = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-03') });
    const inBatchTwo = await createAssignment({ problem, batch: batchTwo, trainer, availableFrom: new Date('2026-01-03') });

    // The mover is enrolled in both, so both complete.
    const res = await submit(moverToken, problem._id);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    expect(await completionsFor(inBatchOne._id, mover._id)).toHaveLength(1);
    expect(await completionsFor(inBatchTwo._id, mover._id)).toHaveLength(1);

    // A student enrolled in only one batch completes only that one.
    const single = await createUser('STUDENT', 'single');
    const singleToken = await login(single);
    await enroll(single, batchOne);
    const otherBatchAssignment = await createAssignment({ problem, batch: batchTwo, trainer, availableFrom: new Date('2026-01-04') });
    const ownBatchAssignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-04') });

    const singleRes = await submit(singleToken, problem._id);
    expect(singleRes.body.data.verdict).toBe('ACCEPTED');

    expect(await completionsFor(ownBatchAssignment._id, single._id)).toHaveLength(1);
    expect(await completionsFor(otherBatchAssignment._id, single._id)).toHaveLength(0);
  });

  // ---------- 5. A student cannot complete another student's assignment ----------
  test('a student cannot complete another student\'s assignment', async () => {
    const owner = await createUser('STUDENT', 'owner');
    const intruder = await createUser('STUDENT', 'intruder');
    const intruderToken = await login(intruder);

    await enroll(owner, batchOne);
    await enroll(intruder, batchOne); // same batch, so submission access is identical

    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-05') });

    const res = await submit(intruderToken, problem._id);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    // Only the intruder is completed, and only as themselves.
    expect(await completionsFor(assignment._id, owner._id)).toHaveLength(0);
    const intruderCompletions = await completionsFor(assignment._id, intruder._id);
    expect(intruderCompletions).toHaveLength(1);
    expect(intruderCompletions[0].student.toString()).toBe(intruder._id.toString());

    const ownerCompletions = await AssignmentCompletion.find({ assignment: assignment._id }).lean();
    expect(ownerCompletions).toHaveLength(1);
    expect(ownerCompletions[0].student.toString()).toBe(intruder._id.toString());
  });

  // ---------- 6. Unenrolled student ----------
  test('an unenrolled student cannot complete an assignment', async () => {
    const outsider = await createUser('STUDENT', 'outsider');
    const outsiderToken = await login(outsider);
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-06') });

    // The problem is GLOBAL, so the submission succeeds...
    const res = await submit(outsiderToken, problem._id);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    // ...but there is no enrollment, so nothing is completed.
    expect(await completionsFor(assignment._id, outsider._id)).toHaveLength(0);

    // An INACTIVE enrollment is treated the same way.
    const inactive = await createUser('STUDENT', 'inactive');
    const inactiveToken = await login(inactive);
    await enroll(inactive, batchOne, 'INACTIVE');
    const inactiveRes = await submit(inactiveToken, problem._id);
    expect(inactiveRes.body.data.verdict).toBe('ACCEPTED');
    expect(await completionsFor(assignment._id, inactive._id)).toHaveLength(0);
  });

  // ---------- 7. Cancelled / deleted / unavailable ----------
  test('cancelled, deleted and not-yet-available assignments are not completed', async () => {
    await enroll(student, batchOne);

    const cancelled = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-07'), status: 'CANCELLED' });
    const deleted = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-08'), deleted: true });
    const future = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });

    const res = await submit(studentToken, problem._id);
    expect(res.status).toBe(201);
    expect(res.body.data.verdict).toBe('ACCEPTED');

    expect(await completionsFor(cancelled._id, student._id)).toHaveLength(0);
    expect(await completionsFor(deleted._id, student._id)).toHaveLength(0);
    expect(await completionsFor(future._id, student._id)).toHaveLength(0);
  });

  // ---------- 8. Idempotency ----------
  test('repeated completion processing does not create duplicates', async () => {
    const solver = await createUser('STUDENT', 'solver');
    const solverToken = await login(solver);
    await enroll(solver, batchOne);
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-09') });

    const res = await submit(solverToken, problem._id);
    expect(res.body.data.verdict).toBe('ACCEPTED');
    const firstSubmissionId = res.body.data.id;

    // Processing the same accepted submission repeatedly is a no-op.
    for (let i = 0; i < 3; i++) {
      await recordAssignmentCompletion({ studentId: solver._id, submissionId: firstSubmissionId });
    }

    const completions = await completionsFor(assignment._id, solver._id);
    expect(completions).toHaveLength(1);
    expect(completions[0].acceptedSubmission.toString()).toBe(firstSubmissionId);

    // A second, different accepted submission also does not add a row...
    const second = await submit(solverToken, problem._id);
    expect(second.body.data.verdict).toBe('ACCEPTED');
    expect(await completionsFor(assignment._id, solver._id)).toHaveLength(1);

    // ...and the originally recorded submission is preserved.
    const current = await completionsFor(assignment._id, solver._id);
    expect(current[0].acceptedSubmission.toString()).toBe(firstSubmissionId);
  });

  // ---------- 9. Service failure must not fail the submission ----------
  test('a completion-service failure does not fail a successful submission', async () => {
    await enroll(student, batchOne);
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-10') });

    recordAssignmentCompletion.mockRejectedValueOnce(new Error('completion store unavailable'));

    const res = await submit(studentToken, problem._id);

    // The submission response is unchanged.
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe('ACCEPTED');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.testResults).toHaveLength(2);

    // No stored expected output is ever returned — only the student's own
    // program output. On a passing run program output and expected output are
    // necessarily identical, so the guarantee is asserted structurally.
    expect(JSON.stringify(res.body)).not.toContain('expectedOutput');
    for (const result of res.body.data.testResults) {
      expect(Object.keys(result).sort()).toEqual(['error', 'output', 'passed', 'testCase']);
      expect(result).not.toHaveProperty('expectedOutput');
    }

    // The submission really was persisted with its verdict.
    const stored = await Submission.findById(res.body.data.id).lean();
    expect(stored).not.toBeNull();
    expect(stored.verdict).toBe('ACCEPTED');
    expect(stored.student.toString()).toBe(student._id.toString());

    // Nothing was completed.
    expect(await completionsFor(assignment._id, student._id)).toHaveLength(0);
  });

  // ---------- 10. Existing response/history contract unchanged ----------
  test('submission responses and history are unchanged', async () => {
    const reader = await createUser('STUDENT', 'reader');
    const readerToken = await login(reader);
    await enroll(reader, batchOne);
    await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-11') });

    const submitRes = await submit(readerToken, problem._id);
    expect(Object.keys(submitRes.body).sort()).toEqual(['data', 'success']);
    expect(Object.keys(submitRes.body.data).sort()).toEqual(['id', 'testResults', 'verdict']);
    expect(Object.keys(submitRes.body.data.testResults[0]).sort()).toEqual(['error', 'output', 'passed', 'testCase']);

    const listRes = await request(app)
      .get('/api/student/submissions')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(submitRes.body.data.id);
    expect(listRes.body.data[0].verdict).toBe('ACCEPTED');
    expect(listRes.body.data[0]).not.toHaveProperty('code');
    expect(listRes.body.data[0]).not.toHaveProperty('executionResult');

    const getRes = await request(app)
      .get(`/api/student/submissions/${submitRes.body.data.id}`)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.verdict).toBe('ACCEPTED');

    // A trainer is still refused on the student endpoint.
    const trainerToken = await login(trainer);
    const forbidden = await request(app)
      .get('/api/student/submissions')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(forbidden.status).toBe(403);
  });

  test('student assignment feed reflects the automatically recorded completion', async () => {
    const viewer = await createUser('STUDENT', 'viewer');
    const viewerToken = await login(viewer);
    await enroll(viewer, batchOne);
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-01-12') });

    const before = await request(app)
      .get(`/api/student/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data.completed).toBe(false);

    const submitRes = await submit(viewerToken, problem._id);
    expect(submitRes.body.data.verdict).toBe('ACCEPTED');

    const after = await request(app)
      .get(`/api/student/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(after.status).toBe(200);
    expect(after.body.data.completed).toBe(true);
    expect(after.body.data.completion.verdict).toBe('ACCEPTED');
  });
});