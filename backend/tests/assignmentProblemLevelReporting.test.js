// backend/tests/assignmentProblemLevelReporting.test.js
//
// Regression coverage for problem-level reporting of Assignments.
//
// `availableFrom` is part of an Assignment's identity, so the same problem can
// hold several Assignment rows in one batch. Those rows are scheduling, not
// separate pieces of work — a student meets one problem once — and counting
// them individually showed a student the same problem on two cards and made
// trainer percentages read as 2/24 when the real figure is 1/12.
//
// The fix collapses at READ time only. These tests pin both halves:
//   - the collapse (one card / one progress row per problem, students counted
//     once, batches independent);
//   - and that nothing underneath moved — every Assignment and
//     AssignmentCompletion row still exists, re-scheduling still works, and the
//     uniqueness rule is unchanged.

const request = require('supertest');
const mongoose = require('mongoose');
const uniqueSuffix = require('./utils/unique');
const authService = require('../src/auth/authService');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const Problem = require('../src/models/Problem');
const Assignment = require('../src/models/Assignment');
const AssignmentCompletion = require('../src/models/AssignmentCompletion');

// The suites share one remote test database, so round trips are slow enough
// that the 30s default intermittently trips.
jest.setTimeout(120000);

const PASSWORD = 'StrongP@ssw0rd';

const created = {
  users: [],
  batches: [],
  problems: [],
  assignments: [],
  enrollments: [],
  completions: [],
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

async function createGlobalProblem(createdBy) {
  const suffix = uniqueSuffix();
  const problem = await Problem.create({
    title: `Problem ${suffix}`,
    slug: `problem-${suffix}`,
    description: 'Description',
    difficulty: 'EASY',
    scope: 'GLOBAL',
    createdBy,
    status: 'PUBLISHED',
  });
  created.problems.push(problem._id);
  return problem;
}

/**
 * A date already in the past, so the row is immediately visible to students.
 * `null` would also be visible; a distinct past date is what makes the row a
 * genuine duplicate of a `null` row for the same (batch, problem).
 */
const pastDate = (daysAgo = 30) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
const futureDate = (daysAhead = 30) => new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

const app = require('../src/app');

async function createAssignmentRow({ problem, batch, trainer, availableFrom = null, status = 'ACTIVE', deleted = false }) {
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

async function complete(assignment, student) {
  const completion = await AssignmentCompletion.create({
    assignment: assignment._id,
    student: student._id,
    verdict: 'ACCEPTED',
    acceptedSubmission: new mongoose.Types.ObjectId(),
  });
  created.completions.push(completion._id);
  return completion;
}

describe('Problem-level Assignment reporting', () => {
  let trainer;
  let trainerToken;
  let student;
  let studentToken;
  let batch;
  let otherBatch;

  beforeAll(async () => {
    trainer = await createUser('TRAINER');
    trainerToken = await login(trainer);
    student = await createUser('STUDENT');
    studentToken = await login(student);

    batch = await createBatch(trainer._id);
    otherBatch = await createBatch(trainer._id);

    for (const b of [batch, otherBatch]) {
      const enrollment = await BatchStudent.create({ batch: b._id, student: student._id, status: 'ACTIVE' });
      created.enrollments.push(enrollment._id);
    }
  });

  afterAll(async () => {
    await AssignmentCompletion.deleteMany({ _id: { $in: created.completions } });
    await Assignment.deleteMany({ _id: { $in: created.assignments } });
    await Problem.deleteMany({ _id: { $in: created.problems } });
    await BatchStudent.deleteMany({ _id: { $in: created.enrollments } });
    await Batch.deleteMany({ _id: { $in: created.batches } });
    await User.deleteMany({ _id: { $in: created.users } });
  });

  const feed = () => request(app).get('/api/student/assignments').set('Authorization', `Bearer ${studentToken}`);
  const monitoring = (batchId, token = trainerToken) =>
    request(app).get(`/api/trainer/batches/${batchId}/assignments`).set('Authorization', `Bearer ${token}`);

  // ------------------------------------------------------------- student feed

  describe('student feed collapses to one card per problem', () => {
    test('two Assignment rows for one problem produce one card', async () => {
      const problem = await createGlobalProblem(trainer);
      const immediate = await createAssignmentRow({ problem, batch, trainer, availableFrom: null });
      const scheduled = await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(10) });

      const res = await feed();
      expect(res.status).toBe(200);

      const cards = res.body.data.filter((a) => a.problem.id === problem._id.toString());
      expect(cards).toHaveLength(1);

      // The null-available row is the representative, matching the feed's
      // existing { availableFrom: 1 } ordering.
      expect(cards[0].id).toBe(immediate._id.toString());
      expect(cards[0].batch.id).toBe(batch._id.toString());

      // Both rows still exist: this is a read-time collapse, not a merge.
      expect(await Assignment.countDocuments({
        batch: batch._id,
        problem: problem._id,
        deleted: false,
      })).toBe(2);
      void scheduled;
    });

    test('meta counts problems, not records', async () => {
      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer, availableFrom: null });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(20) });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(5) });

      const res = await feed();
      const cards = res.body.data.filter((a) => a.problem.id === problem._id.toString());

      expect(cards).toHaveLength(1);
      // One problem contributes exactly one unit to total/completed/pending.
      const forProblem = res.body.data.length - res.body.data.filter((a) => a.problem.id !== problem._id.toString()).length;
      expect(forProblem).toBe(1);
      expect(res.body.meta.total).toBe(res.body.data.length);
      expect(res.body.meta.completed + res.body.meta.pending).toBe(res.body.meta.total);
    });

    test('distinct problems remain distinct cards', async () => {
      const first = await createGlobalProblem(trainer);
      const second = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem: first, batch, trainer });
      await createAssignmentRow({ problem: second, batch, trainer });

      const res = await feed();
      const wanted = [first._id.toString(), second._id.toString()];
      const ids = res.body.data.filter((a) => wanted.includes(a.problem.id)).map((a) => a.problem.id);
      expect(new Set(ids).size).toBe(2);
    });

    test('a future-dated duplicate never reveals the problem early', async () => {
      const problem = await createGlobalProblem(trainer);
      // Only a future-dated row exists: the problem must stay hidden.
      await createAssignmentRow({ problem, batch, trainer, availableFrom: futureDate(7) });

      const res = await feed();
      expect(res.body.data.some((a) => a.problem.id === problem._id.toString())).toBe(false);
      expect(res.body.data.some((a) => a.problem.id === problem._id.toString())).toBe(false);
    });

    test('a past-dated row is visible even when a future sibling exists', async () => {
      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(3) });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: futureDate(9) });

      const res = await feed();
      const cards = res.body.data.filter((a) => a.problem.id === problem._id.toString());
      expect(cards).toHaveLength(1);
      // The visible past date is what the card reports, not the hidden one.
      expect(new Date(cards[0].availableFrom).getTime()).toBeLessThan(Date.now());
    });

    test('cancelled and soft-deleted siblings never surface, and do not hide the problem', async () => {
      const problem = await createGlobalProblem(trainer);
      const live = await createAssignmentRow({ problem, batch, trainer });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(1), status: 'CANCELLED' });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(2), status: 'ACTIVE', deleted: true });

      const res = await feed();
      const cards = res.body.data.filter((a) => a.problem.id === problem._id.toString());
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe(live._id.toString());

      // A problem whose only rows are cancelled/deleted is not shown at all.
      const hidden = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem: hidden, batch, trainer, availableFrom: pastDate(1), status: 'CANCELLED' });
      await createAssignmentRow({ problem: hidden, batch, trainer, availableFrom: pastDate(2), status: 'ACTIVE', deleted: true });
      const after = await feed();
      expect(after.body.data.some((a) => a.problem.id === hidden._id.toString())).toBe(false);
    });

    test('completion on any sibling completes the problem once', async () => {
      const problem = await createGlobalProblem(trainer);
      const first = await createAssignmentRow({ problem, batch, trainer, availableFrom: null });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(4) });

      expect((await feed()).body.data.find((a) => a.problem.id === problem._id.toString()).completed).toBe(false);

      // Completing only the non-representative row still completes the problem.
      const others = await Assignment.find({ batch: batch._id, problem: problem._id, _id: { $ne: first._id } });
      await complete(others[0], student);

      const card = (await feed()).body.data.find((a) => a.problem.id === problem._id.toString());
      expect(card.completed).toBe(true);
      expect(card.completion.verdict).toBe('ACCEPTED');
    });

    test('different batches keep independent completion state for one problem', async () => {
      const problem = await createGlobalProblem(trainer);
      const inBatch = await createAssignmentRow({ problem, batch, trainer });
      const inOtherBatch = await createAssignmentRow({ problem, batch: otherBatch, trainer });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(2) });

      await complete(inBatch, student);

      const res = await feed();
      const cards = res.body.data.filter((a) => a.problem.id === problem._id.toString());
      expect(cards).toHaveLength(2);

      const mine = cards.find((c) => c.batch.id === batch._id.toString());
      const theirs = cards.find((c) => c.batch.id === otherBatch._id.toString());
      expect(mine.completed).toBe(true);
      expect(theirs.completed).toBe(false);
      expect(theirs.completion).toBeNull();
      expect(theirs.id).toBe(inOtherBatch._id.toString());
    });

    test('the detail route agrees with the feed for a non-representative row', async () => {
      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer, availableFrom: null });
      const duplicate = await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(6) });

      const siblings = await Assignment.find({ batch: batch._id, problem: problem._id });
      await complete(siblings.find((s) => s._id.toString() === duplicate._id.toString()), student);

      // Bookmarked duplicate must not report "not completed".
      const detail = await request(app)
        .get(`/api/student/assignments/${duplicate._id}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.completed).toBe(true);
    });
  });

  // -------------------------------------------------------- trainer monitoring

  describe('trainer monitoring counts a student once per problem', () => {
    test('three duplicate rows produce one progress row', async () => {
      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(10) });
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(5) });

      const res = await monitoring(batch._id);
      expect(res.status).toBe(200);
      const rows = res.body.data.filter((r) => r.problem.id === problem._id.toString());
      expect(rows).toHaveLength(1);

      // All three records survive.
      expect(await Assignment.countDocuments({ batch: batch._id, problem: problem._id, deleted: false })).toBe(3);
    });

    test('a student holding completions on every duplicate row is counted once', async () => {
      const problem = await createGlobalProblem(trainer);
      const rows = [
        await createAssignmentRow({ problem, batch, trainer }),
        await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(10) }),
      ];
      // recordAssignmentCompletion completes every eligible row, so a real
      // submission leaves one completion on each.
      for (const row of rows) await complete(row, student);

      const res = await monitoring(batch._id);
      const entry = res.body.data.find((r) => r.problem.id === problem._id.toString());
      expect(entry.monitoring.completed).toBe(1);
      expect(entry.monitoring.pending).toBe(
        Math.max(entry.monitoring.enrolledStudents - 1, 0)
      );
    });

    test('distinct students are each counted once', async () => {
      const second = await createUser('STUDENT');
      const problem = await createGlobalProblem(trainer);
      const first = await createAssignmentRow({ problem, batch, trainer });
      const duplicate = await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(8) });

      await complete(first, student);
      await complete(duplicate, student);
      await complete(duplicate, second);

      const res = await monitoring(batch._id);
      const entry = res.body.data.find((r) => r.problem.id === problem._id.toString());
      expect(entry.monitoring.completed).toBe(2);
    });

    test('distinct problems each get their own progress row', async () => {
      const a = await createGlobalProblem(trainer);
      const b = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem: a, batch, trainer });
      await createAssignmentRow({ problem: b, batch, trainer });

      const res = await monitoring(batch._id);
      const rows = res.body.data.filter((r) => [a._id.toString(), b._id.toString()].includes(r.problem.id));
      expect(rows).toHaveLength(2);
    });

    test('monitoring stays scoped to the requested batch', async () => {
      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer });
      await createAssignmentRow({ problem, batch: otherBatch, trainer });

      const res = await monitoring(otherBatch._id);
      const rows = res.body.data.filter((r) => r.problem.id === problem._id.toString());
      expect(rows).toHaveLength(1);
      expect(rows[0].id).not.toBeNull();
      expect(await Assignment.countDocuments({ batch: otherBatch._id, problem: problem._id })).toBe(1);
    });

    test('the monitoring payload keeps its existing shape', async () => {
      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer });

      const res = await monitoring(batch._id);
      const entry = res.body.data.find((r) => r.problem.id === problem._id.toString());
      expect(Object.keys(entry).sort()).toEqual([
        'availableFrom', 'batch', 'createdAt', 'deleted', 'id',
        'monitoring', 'problem', 'status', 'title', 'updatedAt',
      ]);
      expect(Object.keys(entry.monitoring).sort()).toEqual(['completed', 'enrolledStudents', 'pending']);
    });
  });

  // ------------------------------------------------- behaviour left untouched

  describe('existing behaviour is unchanged', () => {
    test('the unique index still rejects the same problem on the same date', async () => {
      const problem = await createGlobalProblem(trainer);
      // Compute the date ONCE: calling pastDate(3) twice would produce two
      // timestamps a few milliseconds apart and miss the index entirely.
      const when = new Date('2026-05-01T00:00:00.000Z');
      await createAssignmentRow({ problem, batch, trainer, availableFrom: when });

      await expect(
        Assignment.create({
          problem: problem._id,
          batch: batch._id,
          trainer: trainer._id,
          availableFrom: when,
        })
      ).rejects.toThrow(/duplicate key/i);
    });

    test('re-scheduling on a different availableFrom still succeeds', async () => {
      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(3) });
      const later = await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(1) });
      expect(later).not.toBeNull();
    });

    test('soft delete still removes the row from both surfaces and frees the slot', async () => {
      const problem = await createGlobalProblem(trainer);
      const row = await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(3) });

      await Assignment.updateOne({ _id: row._id }, { $set: { deleted: true } });

      expect((await feed()).body.data.some((a) => a.problem.id === problem._id.toString())).toBe(false);
      expect((await monitoring(batch._id)).body.data.some((r) => r.problem.id === problem._id.toString())).toBe(false);

      // The freed slot accepts a new row for the same (batch, problem, date).
      const replacement = await createAssignmentRow({ problem, batch, trainer, availableFrom: pastDate(3) });
      expect(replacement).not.toBeNull();
    });
  });

  // ------------------------------------------------------- authorization guard

  describe('authorization and enrollment are intact', () => {
    test('the feed still requires authentication', async () => {
      expect((await request(app).get('/api/student/assignments')).status).toBe(401);
    });

    test('the feed still refuses a non-student role', async () => {
      const res = await request(app)
        .get('/api/student/assignments')
        .set('Authorization', `Bearer ${trainerToken}`);
      expect(res.status).toBe(403);
    });

    test('the feed hides batches the student is not enrolled in', async () => {
      const outsider = await createUser('STUDENT');
      const outsiderToken = await login(outsider);

      const problem = await createGlobalProblem(trainer);
      await createAssignmentRow({ problem, batch, trainer });

      const res = await request(app)
        .get('/api/student/assignments')
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((a) => a.problem.id === problem._id.toString())).toBe(false);
    });

    test('monitoring still refuses another trainer’s batch', async () => {
      const other = await createUser('TRAINER');
      const otherToken = await login(other);
      const foreign = await createBatch(other._id);

      const res = await monitoring(foreign._id, trainerToken);
      expect(res.status).toBe(403);
    });

    test('monitoring still requires authentication', async () => {
      expect((await request(app).get(`/api/trainer/batches/${batch._id}/assignments`)).status).toBe(401);
    });
  });
});