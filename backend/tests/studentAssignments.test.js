// backend/tests/studentAssignments.test.js
//
// Focused API coverage for the student assignment endpoints:
//   GET /api/student/assignments
//   GET /api/student/assignments/:assignmentId
// plus the idempotency contract of the assignment completion service that
// Phase 3 will call from the submission flow.

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const authService = require('../src/auth/authService');
const uniqueSuffix = require('./utils/unique');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const Submission = require('../src/models/Submission');
const Assignment = require('../src/models/Assignment');
const AssignmentCompletion = require('../src/models/AssignmentCompletion');
const { recordAssignmentCompletion } = require('../src/services/assignmentCompletion');

const PASSWORD = 'StrongP@ssw0rd';
const HIDDEN_OUTPUT = 'SECRET-HIDDEN-OUTPUT-9f3a';

const created = {
  users: [], batches: [], problems: [], testCases: [],
  assignments: [], completions: [], submissions: [], enrollments: [],
};

async function createTestUser(role, label) {
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

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function createBatch(trainer) {
  const batch = await Batch.create({
    name: `Batch ${uniqueSuffix()}`,
    code: `B${uniqueSuffix()}`,
    trainer: trainer ? trainer._id : undefined,
  });
  created.batches.push(batch._id);
  return batch;
}

async function createProblem({ scope = 'GLOBAL', batch, createdBy }) {
  const suffix = uniqueSuffix();
  const problem = await Problem.create({
    title: `Problem ${suffix}`,
    slug: `problem-${suffix}`,
    description: 'Problem description',
    difficulty: 'EASY',
    constraints: 'n <= 100',
    inputFormat: 'n',
    outputFormat: 'result',
    examples: [{ input: '1 2', output: '3', explanation: 'sample' }],
    starterCode: { cpp: 'int main(){}' },
    allowedLanguages: ['cpp'],
    scope,
    batch: scope === 'BATCH' ? batch._id : undefined,
    createdBy: createdBy._id,
    status: 'PUBLISHED',
  });
  created.problems.push(problem._id);

  const hidden = await TestCase.create({
    problem: problem._id,
    input: '9 9',
    expectedOutput: HIDDEN_OUTPUT,
    isHidden: true,
    order: 0,
  });
  created.testCases.push(hidden._id);

  return problem;
}

async function createAssignment({ problem, batch, trainer, availableFrom, status = 'ACTIVE', deleted = false }) {
  const assignment = await Assignment.create({
    problem: problem._id,
    batch: batch._id,
    trainer: trainer._id,
    availableFrom: availableFrom === undefined ? null : availableFrom,
    status,
    deleted,
  });
  created.assignments.push(assignment._id);
  return assignment;
}

async function enroll(student, batch, status = 'ACTIVE') {
  const enrollment = await BatchStudent.create({ batch: batch._id, student: student._id, status });
  created.enrollments.push(enrollment._id);
  return enrollment;
}

describe('Student assignment routes', () => {
  let trainer;
  let studentA;
  let studentAToken;
  let studentB;
  let batchOne;
  let batchTwo;
  let problem;
  let visibleAssignment;

  beforeAll(async () => {
    trainer = await createTestUser('TRAINER', 'trainer');
    studentA = await createTestUser('STUDENT', 'student-a');
    studentAToken = await login(studentA.email);
    studentB = await createTestUser('STUDENT', 'student-b');

    batchOne = await createBatch(trainer);
    batchTwo = await createBatch(trainer);

    problem = await createProblem({ createdBy: trainer });
    visibleAssignment = await createAssignment({ problem, batch: batchOne, trainer });
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

  // ---------- auth / role ----------
  test('requires authentication', async () => {
    expect((await request(app).get('/api/student/assignments')).status).toBe(401);
    expect((await request(app).get(`/api/student/assignments/${visibleAssignment._id}`)).status).toBe(401);
  });

  test('refuses a non-student role', async () => {
    const trainerToken = await login(trainer.email);
    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  // ---------- enrollment ----------
  test('returns an empty list for a student with no active enrollment', async () => {
    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.enrolled).toBe(false);
  });

  test('lists active assignments for actively enrolled batches', async () => {
    await enroll(studentA, batchOne);

    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.enrolled).toBe(true);
    expect(res.body.data.some((a) => a.id === visibleAssignment._id.toString())).toBe(true);

    const item = res.body.data.find((a) => a.id === visibleAssignment._id.toString());
    expect(item.completed).toBe(false);
    expect(item.completion).toBeNull();
    expect(item.batch.name).toBe(batchOne.name);
  });

  test('hides assignments from batches the student is not enrolled in', async () => {
    const other = await createAssignment({ problem, batch: batchTwo, trainer, availableFrom: new Date('2026-10-01') });

    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((a) => a.id === other._id.toString())).toBe(false);

    const detail = await request(app)
      .get(`/api/student/assignments/${other._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(detail.status).toBe(404);
  });

  test('hides assignments when the enrollment is not active', async () => {
    await BatchStudent.updateOne({ student: studentA._id, batch: batchOne._id }, { $set: { status: 'INACTIVE' } });

    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);

    await BatchStudent.updateOne({ student: studentA._id, batch: batchOne._id }, { $set: { status: 'ACTIVE' } });
  });

  // ---------- availability / lifecycle ----------
  test('hides assignments whose availableFrom is in the future', async () => {
    const future = await createAssignment({
      problem, batch: batchOne, trainer,
      availableFrom: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.body.data.some((a) => a.id === future._id.toString())).toBe(false);

    const detail = await request(app)
      .get(`/api/student/assignments/${future._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(detail.status).toBe(404);
  });

  test('shows assignments that became available in the past', async () => {
    const past = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2015-01-01') });

    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.body.data.some((a) => a.id === past._id.toString())).toBe(true);
  });

  test('hides cancelled and soft-deleted assignments', async () => {
    const cancelled = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-10-05'), status: 'CANCELLED' });
    const deleted = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-10-06'), deleted: true });

    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.body.data.some((a) => a.id === cancelled._id.toString())).toBe(false);
    expect(res.body.data.some((a) => a.id === deleted._id.toString())).toBe(false);

    const cancelledDetail = await request(app)
      .get(`/api/student/assignments/${cancelled._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(cancelledDetail.status).toBe(404);
  });

  test('rejects an invalid assignment id', async () => {
    const res = await request(app)
      .get('/api/student/assignments/not-an-id')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(400);
  });

  test('returns 404 for an unknown assignment id', async () => {
    const res = await request(app)
      .get('/api/student/assignments/000000000000000000000004')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(404);
  });

  // ---------- completion status ----------
  test('reports completion status per assignment', async () => {
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-10-07') });

    let res = await request(app)
      .get(`/api/student/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.completed).toBe(false);

    const completion = await AssignmentCompletion.create({
      assignment: assignment._id,
      student: studentA._id,
      verdict: 'ACCEPTED',
      acceptedSubmission: new mongoose.Types.ObjectId(),
    });
    created.completions.push(completion._id);

    res = await request(app)
      .get(`/api/student/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(res.body.data.completed).toBe(true);
    expect(res.body.data.completion.verdict).toBe('ACCEPTED');
    expect(res.body.data.completion.completedAt).toBeDefined();
  });

  test('completion in one batch never marks another batch complete', async () => {
    await enroll(studentA, batchTwo);
    const batchOneAssignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-10-08') });
    const batchTwoAssignment = await createAssignment({ problem, batch: batchTwo, trainer, availableFrom: new Date('2026-10-08') });

    const completion = await AssignmentCompletion.create({
      assignment: batchOneAssignment._id,
      student: studentA._id,
      verdict: 'ACCEPTED',
      acceptedSubmission: new mongoose.Types.ObjectId(),
    });
    created.completions.push(completion._id);

    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    const inOne = res.body.data.find((a) => a.id === batchOneAssignment._id.toString());
    const inTwo = res.body.data.find((a) => a.id === batchTwoAssignment._id.toString());

    expect(inOne.completed).toBe(true);
    expect(inTwo).toBeDefined();
    expect(inTwo.completed).toBe(false);
    expect(inTwo.completion).toBeNull();
  });

  test('global problem submission history is not assignment completion', async () => {
    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-10-09') });

    const submission = await Submission.create({
      student: studentA._id,
      problem: problem._id,
      code: 'int main(){}',
      language: 'cpp',
      verdict: 'ACCEPTED',
    });
    created.submissions.push(submission._id);

    const res = await request(app)
      .get(`/api/student/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.completed).toBe(false);
    expect(res.body.data.completion).toBeNull();
  });

  test('another student\'s completion is never visible', async () => {
    const studentBToken = await login(studentB.email);
    await enroll(studentB, batchOne);

    const assignment = await createAssignment({ problem, batch: batchOne, trainer, availableFrom: new Date('2026-10-10') });
    const completion = await AssignmentCompletion.create({
      assignment: assignment._id,
      student: studentB._id,
      verdict: 'ACCEPTED',
      acceptedSubmission: new mongoose.Types.ObjectId(),
    });
    created.completions.push(completion._id);

    const mine = await request(app)
      .get(`/api/student/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(mine.body.data.completed).toBe(false);

    const theirs = await request(app)
      .get(`/api/student/assignments/${assignment._id}`)
      .set('Authorization', `Bearer ${studentBToken}`);
    expect(theirs.body.data.completed).toBe(true);

    // Identity comes from the token: a client cannot query another student's view.
    const spoof = await request(app)
      .get(`/api/student/assignments/${assignment._id}?studentId=${studentB._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(spoof.body.data.completed).toBe(false);
  });

  // ---------- data protection ----------
  test('never exposes hidden test-case outputs or private problem data', async () => {
    const res = await request(app)
      .get(`/api/student/assignments/${visibleAssignment._id}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(HIDDEN_OUTPUT);
    expect(serialized).not.toContain('expectedOutput');
    expect(serialized).not.toContain('isHidden');
    expect(serialized).not.toContain('testCases');
    // Trainer identity and account details are not part of the student payload.
    expect(serialized).not.toContain('createdBy');
    expect(serialized).not.toContain(trainer.email);
    expect(serialized).not.toContain('passwordHash');

    // Only the allow-listed problem fields are present.
    expect(Object.keys(res.body.data.problem).sort()).toEqual([
      'allowedLanguages', 'constraints', 'description', 'difficulty', 'examples',
      'id', 'inputFormat', 'outputFormat', 'practiceDate', 'scope',
      'slug', 'starterCode', 'status', 'title',
    ].sort());
  });

  test('list response is equally free of hidden test-case data', async () => {
    const res = await request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(HIDDEN_OUTPUT);
  });
});

describe('Assignment completion service', () => {
  let trainer;
  let student;
  let batch;
  let problem;
  let assignment;

  beforeAll(async () => {
    trainer = await createTestUser('TRAINER', 'svc-trainer');
    student = await createTestUser('STUDENT', 'svc-student');
    batch = await createBatch(trainer);
    problem = await createProblem({ createdBy: trainer });
    assignment = await createAssignment({ problem, batch, trainer });
    await enroll(student, batch);
  });

  test('records a completion for the enrolled batch only', async () => {
    const otherBatch = await createBatch(trainer);
    const otherAssignment = await createAssignment({ problem, batch: otherBatch, trainer });
    const submission = await Submission.create({
      student: student._id, problem: problem._id, code: 'int main(){}', language: 'cpp', verdict: 'ACCEPTED',
    });
    created.submissions.push(submission._id);

    const result = await recordAssignmentCompletion({
      studentId: student._id,
      submissionId: submission._id,
    });

    expect(result.matched).toBe(1);
    expect(result.recorded).toHaveLength(1);
    expect(result.recorded[0].assignment.toString()).toBe(assignment._id.toString());
    expect(result.recorded[0].verdict).toBe('ACCEPTED');
    expect(await AssignmentCompletion.countDocuments({ assignment: otherAssignment._id })).toBe(0);
  });

  test('is idempotent and preserves the first accepted submission', async () => {
    const first = await AssignmentCompletion.findOne({ assignment: assignment._id, student: student._id }).lean();
    const later = await Submission.create({
      student: student._id, problem: problem._id, code: 'int main(){return 1;}', language: 'cpp', verdict: 'ACCEPTED',
    });
    created.submissions.push(later._id);

    const result = await recordAssignmentCompletion({
      studentId: student._id,
      submissionId: later._id,
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.recorded).toHaveLength(1);
    expect(await AssignmentCompletion.countDocuments({ assignment: assignment._id, student: student._id })).toBe(1);

    const current = await AssignmentCompletion.findOne({ assignment: assignment._id, student: student._id }).lean();
    expect(current.acceptedSubmission.toString()).toBe(first.acceptedSubmission.toString());
  });

  test('rejects invalid ids', async () => {
    await expect(
      recordAssignmentCompletion({ studentId: 'nope', submissionId: 'nope' })
    ).rejects.toThrow(/valid ids/i);
  });

  // ---------- acceptedSubmission validation invariants ----------

  test('refuses a submission that does not exist', async () => {
    const result = await recordAssignmentCompletion({
      studentId: student._id,
      submissionId: new mongoose.Types.ObjectId(),
    });
    expect(result.reason).toBe('SUBMISSION_NOT_FOUND');
    expect(result.recorded).toHaveLength(0);
  });

  test('refuses a submission whose verdict is not ACCEPTED', async () => {
    const otherAssignment = await createAssignment({ problem, batch, trainer, availableFrom: new Date('2026-02-01') });
    for (const verdict of ['WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED']) {
      const submission = await Submission.create({
        student: student._id, problem: problem._id, code: 'x', language: 'cpp', verdict,
      });
      created.submissions.push(submission._id);

      const result = await recordAssignmentCompletion({ studentId: student._id, submissionId: submission._id });
      expect(result.reason).toBe('SUBMISSION_NOT_ACCEPTED');
      expect(result.recorded).toHaveLength(0);
    }
    expect(await AssignmentCompletion.countDocuments({ assignment: otherAssignment._id })).toBe(0);
  });

  test('refuses a submission that belongs to another student', async () => {
    const otherStudent = await createTestUser('STUDENT', 'svc-other');
    await enroll(otherStudent, batch);
    const otherAssignment = await createAssignment({ problem, batch, trainer, availableFrom: new Date('2026-02-02') });

    const submission = await Submission.create({
      student: otherStudent._id, problem: problem._id, code: 'x', language: 'cpp', verdict: 'ACCEPTED',
    });
    created.submissions.push(submission._id);

    const result = await recordAssignmentCompletion({ studentId: student._id, submissionId: submission._id });
    expect(result.reason).toBe('SUBMISSION_STUDENT_MISMATCH');
    expect(result.recorded).toHaveLength(0);
    expect(await AssignmentCompletion.countDocuments({ assignment: otherAssignment._id })).toBe(0);
  });

  test('refuses a problem that disagrees with the submission', async () => {
    const unrelated = await createProblem({ createdBy: trainer });
    const submission = await Submission.create({
      student: student._id, problem: problem._id, code: 'x', language: 'cpp', verdict: 'ACCEPTED',
    });
    created.submissions.push(submission._id);

    const result = await recordAssignmentCompletion({
      studentId: student._id,
      submissionId: submission._id,
      problemId: unrelated._id,
    });
    expect(result.reason).toBe('PROBLEM_MISMATCH');
    expect(result.recorded).toHaveLength(0);
  });

  test('refuses an unenrolled student', async () => {
    const stranger = await createTestUser('STUDENT', 'svc-stranger');
    const submission = await Submission.create({
      student: stranger._id, problem: problem._id, code: 'x', language: 'cpp', verdict: 'ACCEPTED',
    });
    created.submissions.push(submission._id);

    const result = await recordAssignmentCompletion({ studentId: stranger._id, submissionId: submission._id });
    expect(result.reason).toBe('NO_ENROLLMENT');
    expect(result.recorded).toHaveLength(0);
  });
});