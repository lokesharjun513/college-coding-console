const mongoose = require('mongoose');
const Assignment = require('../src/models/Assignment');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
const User = require('../src/models/User');
const uniqueSuffix = require('./utils/unique');

describe('Assignment Model', () => {
  let trainerId;
  const createdProblemIds = [];
  const createdBatchIds = [];

  // Every test gets its own Problem/Batch pair so that the compound unique
  // index under test can never be influenced by another test in this file.
  const createFixtures = async () => {
    const suffix = uniqueSuffix();

    const problem = await Problem.create({
      title: `Test Problem ${suffix}`,
      slug: `test-problem-${suffix}`,
      description: 'Test description',
      difficulty: 'EASY',
      scope: 'GLOBAL',
      status: 'PUBLISHED',
      createdBy: trainerId,
    });
    createdProblemIds.push(problem._id);

    const batch = await Batch.create({
      name: `Test Batch ${suffix}`,
      code: `TB-${suffix}`,
      description: 'Test batch description',
      trainer: trainerId,
    });
    createdBatchIds.push(batch._id);

    return { problemId: problem._id, batchId: batch._id };
  };

  beforeAll(async () => {
    const trainer = await User.create({
      name: 'Test Trainer',
      email: `trainer-${uniqueSuffix()}@test.com`,
      passwordHash: 'hashedpassword',
      role: 'TRAINER',
      status: 'ACTIVE',
      trainerId: `T-${uniqueSuffix()}`,
    });
    trainerId = trainer._id;

    // Make sure the compound unique index exists before asserting on it.
    await Assignment.init();
    await Assignment.deleteMany({ trainer: trainerId });
  });

  afterAll(async () => {
    await Assignment.deleteMany({ trainer: trainerId });
    await Problem.deleteMany({ _id: { $in: createdProblemIds } });
    await Batch.deleteMany({ _id: { $in: createdBatchIds } });
    await User.deleteMany({ _id: trainerId });
  });

  it('should create a valid assignment', async () => {
    const { problemId, batchId } = await createFixtures();

    const assignment = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      title: 'Test Assignment',
      availableFrom: new Date('2026-10-01'),
      status: 'ACTIVE',
    });

    expect(assignment._id).toBeDefined();
    expect(assignment.problem.toString()).toBe(problemId.toString());
    expect(assignment.batch.toString()).toBe(batchId.toString());
    expect(assignment.trainer.toString()).toBe(trainerId.toString());
    expect(assignment.title).toBe('Test Assignment');
    expect(assignment.availableFrom).toEqual(expect.any(Date));
    expect(assignment.status).toBe('ACTIVE');
    expect(assignment.deleted).toBe(false);
    expect(assignment.createdAt).toEqual(expect.any(Date));
    expect(assignment.updatedAt).toEqual(expect.any(Date));

    const stored = await Assignment.findById(assignment._id).lean();
    expect(stored.problem.toString()).toBe(problemId.toString());
    expect(stored.batch.toString()).toBe(batchId.toString());
    expect(stored.trainer.toString()).toBe(trainerId.toString());
  });

  it('should require problem reference', async () => {
    const { batchId } = await createFixtures();

    await expect(
      Assignment.create({
        batch: batchId,
        trainer: trainerId,
        title: 'Test Assignment',
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should require batch reference', async () => {
    const { problemId } = await createFixtures();

    await expect(
      Assignment.create({
        problem: problemId,
        trainer: trainerId,
        title: 'Test Assignment',
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should require trainer reference', async () => {
    const { problemId, batchId } = await createFixtures();

    await expect(
      Assignment.create({
        problem: problemId,
        batch: batchId,
        title: 'Test Assignment',
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should validate status enum', async () => {
    const { problemId, batchId } = await createFixtures();

    await expect(
      Assignment.create({
        problem: problemId,
        batch: batchId,
        trainer: trainerId,
        status: 'INVALID_STATUS',
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should accept every valid status value and default to ACTIVE', async () => {
    const { problemId, batchId } = await createFixtures();

    // Same problem/batch, different availableFrom on purpose: the compound
    // index must allow re-assignment on a different date.
    for (const [index, status] of ['ACTIVE', 'COMPLETED', 'CANCELLED'].entries()) {
      const assignment = await Assignment.create({
        problem: problemId,
        batch: batchId,
        trainer: trainerId,
        availableFrom: new Date(Date.UTC(2026, 0, 1 + index)),
        status,
      });
      expect(assignment.status).toBe(status);
    }

    const defaulted = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: new Date(Date.UTC(2026, 0, 10)),
    });
    expect(defaulted.status).toBe('ACTIVE');
  });

  // ---------------------------------------------------------------------------
  // Open-ended practice: no deadline, no time limit
  // ---------------------------------------------------------------------------

  it('should have no due date / deadline field at all', () => {
    expect(Assignment.schema.path('dueDate')).toBeUndefined();
    expect(Assignment.schema.path('deadline')).toBeUndefined();
    expect(Assignment.schema.path('expiresAt')).toBeUndefined();
    expect(Assignment.schema.path('timeLimit')).toBeUndefined();
  });

  it('should create an assignment that has been available for years', async () => {
    const { problemId, batchId } = await createFixtures();
    const longAgo = new Date('2019-01-01');

    const assignment = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: longAgo,
    });

    expect(assignment.availableFrom.getTime()).toBe(longAgo.getTime());
    expect(assignment.status).toBe('ACTIVE');
  });

  it('should not reject or auto-close an assignment because of elapsed time', async () => {
    const { problemId, batchId } = await createFixtures();

    const old = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: new Date('2015-06-01'),
    });

    // Still ACTIVE and still updatable long after availability started.
    expect(old.status).toBe('ACTIVE');
    old.status = 'COMPLETED';
    await old.save();

    const reloaded = await Assignment.findById(old._id).lean();
    expect(reloaded.status).toBe('COMPLETED');
  });

  it('should keep availability (availableFrom) separate from completion status (status)', async () => {
    const { problemId, batchId } = await createFixtures();

    // availableFrom in the past does not change the lifecycle status.
    const assignment = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: new Date('2020-01-01'),
    });

    expect(assignment.availableFrom).toEqual(expect.any(Date));
    expect(assignment.status).toBe('ACTIVE');

    // Status is only ever changed explicitly by a trainer, never derived.
    assignment.status = 'CANCELLED';
    await assignment.save();
    expect(assignment.availableFrom).toEqual(expect.any(Date));
    expect(assignment.status).toBe('CANCELLED');
  });

  it('should allow omitting availableFrom entirely', async () => {
    const { problemId, batchId } = await createFixtures();

    const assignment = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
    });

    expect(assignment.availableFrom).toBeNull();
    expect(assignment.status).toBe('ACTIVE');
  });

  // ---------------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------------

  it('should default deleted to false', async () => {
    const { problemId, batchId } = await createFixtures();

    const assignment = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
    });
    expect(assignment.deleted).toBe(false);
  });

  it('should allow setting deleted to true', async () => {
    const { problemId, batchId } = await createFixtures();

    const assignment = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      deleted: true,
    });
    expect(assignment.deleted).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Compound unique index: { batch, problem, availableFrom } (deleted: false)
  // ---------------------------------------------------------------------------

  it('should enforce unique index on batch, problem, availableFrom when not deleted', async () => {
    const { problemId, batchId } = await createFixtures();
    const date1 = new Date('2026-10-01');

    await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: date1,
    });

    await expect(
      Assignment.create({
        problem: problemId,
        batch: batchId,
        trainer: trainerId,
        availableFrom: date1,
      })
    ).rejects.toThrow(/duplicate key/);
  });

  it('should allow same batch and problem with different availableFrom', async () => {
    const { problemId, batchId } = await createFixtures();
    const date1 = new Date('2026-10-01');
    const date2 = new Date('2026-10-02');

    await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: date1,
    });

    const assignment2 = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: date2,
    });
    expect(assignment2.availableFrom).toEqual(date2);
  });

  it('should allow the same problem on the same availableFrom for a different batch', async () => {
    const suffix = uniqueSuffix();
    const problem = await Problem.create({
      title: `Shared Problem ${suffix}`,
      slug: `shared-problem-${suffix}`,
      description: 'Test description',
      difficulty: 'EASY',
      scope: 'GLOBAL',
      status: 'PUBLISHED',
      createdBy: trainerId,
    });
    createdProblemIds.push(problem._id);

    const batchA = await Batch.create({ name: `Batch A ${suffix}`, code: `TBA-${suffix}`, trainer: trainerId });
    const batchB = await Batch.create({ name: `Batch B ${suffix}`, code: `TBB-${suffix}`, trainer: trainerId });
    createdBatchIds.push(batchA._id, batchB._id);

    const date = new Date('2026-10-01');

    await Assignment.create({ problem: problem._id, batch: batchA._id, trainer: trainerId, availableFrom: date });
    const second = await Assignment.create({ problem: problem._id, batch: batchB._id, trainer: trainerId, availableFrom: date });

    expect(second.batch.toString()).toBe(batchB._id.toString());
  });

  it('should treat a date-less assignment as a single slot per batch+problem', async () => {
    const { problemId, batchId } = await createFixtures();

    await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
    });

    // availableFrom is null on both rows, so the compound index sees the same
    // key. Without a date there is nothing to distinguish two assignments.
    await expect(
      Assignment.create({
        problem: problemId,
        batch: batchId,
        trainer: trainerId,
      })
    ).rejects.toThrow(/duplicate key/);
  });

  it('should free the unique slot once the previous assignment is soft-deleted', async () => {
    const { problemId, batchId } = await createFixtures();
    const date1 = new Date('2026-10-01');

    const original = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: date1,
    });

    // Soft-deleting removes the document from the partial unique index.
    original.deleted = true;
    await original.save();

    const replacement = await Assignment.create({
      problem: problemId,
      batch: batchId,
      trainer: trainerId,
      availableFrom: date1,
    });
    expect(replacement.deleted).toBe(false);

    // The historic row is retained, not removed.
    expect(await Assignment.countDocuments({ problem: problemId, batch: batchId })).toBe(2);
    expect(await Assignment.countDocuments({ problem: problemId, batch: batchId, deleted: true })).toBe(1);
  });
});