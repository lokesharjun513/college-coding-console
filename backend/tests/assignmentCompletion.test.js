const mongoose = require('mongoose');
const AssignmentCompletion = require('../src/models/AssignmentCompletion');
const Assignment = require('../src/models/Assignment');
const Problem = require('../src/models/Problem');
const Batch = require('../src/models/Batch');
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const Submission = require('../src/models/Submission');
const uniqueSuffix = require('./utils/unique');

describe('AssignmentCompletion Model', () => {
  const createdProblemIds = [];
  const createdBatchIds = [];
  const createdUserIds = [];
  const createdStudentIds = [];
  const createdSubmissionIds = [];
  const createdAssignmentIds = [];

  const createUser = async ({ role, extra = {} }) => {
    const suffix = uniqueSuffix();
    const user = await User.create({
      name: `Test ${role} ${suffix}`,
      email: `${role.toLowerCase()}-${suffix}@test.com`,
      passwordHash: 'hashedpassword',
      role,
      status: 'ACTIVE',
      ...extra,
    });
    createdUserIds.push(user._id);
    return user;
  };

  const createStudentProfile = async user => {
    const suffix = uniqueSuffix();
    const profile = await Student.create({
      userId: user._id,
      name: user.name,
      email: user.email,
      rollNumber: `R-${suffix}`,
      startYear: 2024,
      endYear: 2028,
      department: 'CSE',
      section: 'A',
    });
    createdStudentIds.push(profile._id);
    return profile;
  };

  // Each test builds a complete, isolated world (problem + batch + trainer +
  // student + Student profile + submission + assignment) so that the unique
  // (assignment, student) index is never influenced by another test.
  const createWorld = async () => {
    const suffix = uniqueSuffix();

    const trainer = await createUser({ role: 'TRAINER', extra: { trainerId: `T-${suffix}` } });
    const studentUser = await createUser({ role: 'STUDENT', extra: { rollNumber: `R-${suffix}` } });
    await createStudentProfile(studentUser);

    const problem = await Problem.create({
      title: `Test Problem ${suffix}`,
      slug: `test-problem-${suffix}`,
      description: 'Test description',
      difficulty: 'EASY',
      scope: 'GLOBAL',
      status: 'PUBLISHED',
      createdBy: trainer._id,
    });
    createdProblemIds.push(problem._id);

    const makeBatch = async (label = 'Test Batch') => {
      const batch = await Batch.create({
        name: `${label} ${uniqueSuffix()}`,
        code: `TB-${uniqueSuffix()}`,
        description: 'Test batch description',
        trainer: trainer._id,
      });
      createdBatchIds.push(batch._id);
      return batch;
    };

    const batch = await makeBatch();

    const makeSubmission = async (userId, verdict = 'ACCEPTED') => {
      const submission = await Submission.create({
        student: userId,
        problem: problem._id,
        code: '#include <iostream>\nint main(){return 0;}',
        language: 'cpp',
        verdict,
      });
      createdSubmissionIds.push(submission._id);
      return submission;
    };

    // Open-ended practice: availableFrom is the only date on an assignment.
    const makeAssignment = async (batchId, problemId = problem._id, availableFrom = new Date('2026-10-01')) => {
      const assignment = await Assignment.create({
        problem: problemId,
        batch: batchId,
        trainer: trainer._id,
        title: 'Test Assignment',
        availableFrom,
        status: 'ACTIVE',
      });
      createdAssignmentIds.push(assignment._id);
      return assignment;
    };

    const makeStudent = async () => {
      const user = await createUser({ role: 'STUDENT', extra: { rollNumber: `R-${uniqueSuffix()}` } });
      await createStudentProfile(user);
      return user;
    };

    const submission = await makeSubmission(studentUser._id);
    const assignment = await makeAssignment(batch._id);

    return {
      trainerId: trainer._id,
      studentId: studentUser._id,
      problemId: problem._id,
      batchId: batch._id,
      submission,
      assignmentId: assignment._id,
      makeBatch,
      makeStudent,
      makeSubmission,
      makeAssignment,
    };
  };

  beforeAll(async () => {
    await AssignmentCompletion.init();
    await Assignment.init();
  });

  afterAll(async () => {
    await AssignmentCompletion.deleteMany({ assignment: { $in: createdAssignmentIds } });
    await Assignment.deleteMany({ _id: { $in: createdAssignmentIds } });
    await Submission.deleteMany({ _id: { $in: createdSubmissionIds } });
    await Problem.deleteMany({ _id: { $in: createdProblemIds } });
    await Batch.deleteMany({ _id: { $in: createdBatchIds } });
    await Student.deleteMany({ _id: { $in: createdStudentIds } });
    await User.deleteMany({ _id: { $in: createdUserIds } });
  });

  it('should create a valid assignment completion', async () => {
    const { assignmentId, studentId, submission } = await createWorld();

    const completion = await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission._id,
    });

    expect(completion._id).toBeDefined();
    expect(completion.assignment.toString()).toBe(assignmentId.toString());
    expect(completion.student.toString()).toBe(studentId.toString());
    expect(completion.verdict).toBe('ACCEPTED');
    expect(completion.acceptedSubmission.toString()).toBe(submission._id.toString());
    expect(completion.completedAt).toEqual(expect.any(Date));
    expect(completion.createdAt).toEqual(expect.any(Date));
    expect(completion.updatedAt).toEqual(expect.any(Date));

    const stored = await AssignmentCompletion.findById(completion._id).lean();
    expect(stored.assignment.toString()).toBe(assignmentId.toString());
    expect(stored.student.toString()).toBe(studentId.toString());
    expect(stored.acceptedSubmission.toString()).toBe(submission._id.toString());
  });

  it('should resolve assignment, student and submission references', async () => {
    const { assignmentId, studentId, submission } = await createWorld();

    const completion = await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission._id,
    });

    const populated = await AssignmentCompletion.findById(completion._id)
      .populate('assignment')
      .populate('student')
      .populate('acceptedSubmission')
      .lean();

    expect(populated.assignment._id.toString()).toBe(assignmentId.toString());
    expect(populated.assignment.batch).toBeDefined();
    expect(populated.student._id.toString()).toBe(studentId.toString());
    expect(populated.student.role).toBe('STUDENT');
    expect(populated.acceptedSubmission._id.toString()).toBe(submission._id.toString());
    expect(populated.acceptedSubmission.verdict).toBe('ACCEPTED');
  });

  it('should require assignment reference', async () => {
    const { studentId, submission } = await createWorld();

    await expect(
      AssignmentCompletion.create({
        student: studentId,
        verdict: 'ACCEPTED',
        acceptedSubmission: submission._id,
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should require student reference', async () => {
    const { assignmentId, submission } = await createWorld();

    await expect(
      AssignmentCompletion.create({
        assignment: assignmentId,
        verdict: 'ACCEPTED',
        acceptedSubmission: submission._id,
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should require verdict', async () => {
    const { assignmentId, studentId, submission } = await createWorld();

    await expect(
      AssignmentCompletion.create({
        assignment: assignmentId,
        student: studentId,
        acceptedSubmission: submission._id,
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should require acceptedSubmission reference', async () => {
    const { assignmentId, studentId } = await createWorld();

    await expect(
      AssignmentCompletion.create({
        assignment: assignmentId,
        student: studentId,
        verdict: 'ACCEPTED',
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should validate verdict enum', async () => {
    const { assignmentId, studentId, submission } = await createWorld();

    await expect(
      AssignmentCompletion.create({
        assignment: assignmentId,
        student: studentId,
        verdict: 'INVALID_VERDICT',
        acceptedSubmission: submission._id,
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('should accept every valid verdict value', async () => {
    const { assignmentId, makeSubmission, makeStudent } = await createWorld();

    for (const verdict of ['ACCEPTED', 'WRONG_ANSWER']) {
      // Each verdict needs its own (assignment, student) pair.
      const studentUser = await makeStudent();
      const submission = await makeSubmission(studentUser._id, 'ACCEPTED');

      const completion = await AssignmentCompletion.create({
        assignment: assignmentId,
        student: studentUser._id,
        verdict,
        acceptedSubmission: submission._id,
      });
      expect(completion.verdict).toBe(verdict);
    }
  });

  it('should reject the retired PARTIAL verdict', async () => {
    // 'PARTIAL' was never a real Submission verdict; the enum is now a strict
    // subset of Submission.verdict so the two can never disagree.
    const { assignmentId, studentId, submission } = await createWorld();

    await expect(
      AssignmentCompletion.create({
        assignment: assignmentId,
        student: studentId,
        verdict: 'PARTIAL',
        acceptedSubmission: submission._id,
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);

    expect(AssignmentCompletion.schema.path('verdict').enumValues.sort())
      .toEqual(['ACCEPTED', 'WRONG_ANSWER']);
    // Every completion verdict must be a real submission verdict.
    const submissionVerdicts = require('../src/models/Submission').schema.path('verdict').enumValues;
    for (const verdict of AssignmentCompletion.schema.path('verdict').enumValues) {
      expect(submissionVerdicts).toContain(verdict);
    }
  });

  it('should allow an explicit completedAt', async () => {
    const { assignmentId, studentId, submission } = await createWorld();
    const completedAt = new Date('2026-10-20T10:30:00.000Z');

    const completion = await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission._id,
      completedAt,
    });

    expect(completion.completedAt.getTime()).toBe(completedAt.getTime());
  });

  // ---------------------------------------------------------------------------
  // Completion tracking is per (assignment, student) in an open-ended model.
  // ---------------------------------------------------------------------------

  it('should mark the assignment complete for a student whose solution is accepted', async () => {
    const { assignmentId, studentId, problemId, makeSubmission } = await createWorld();

    const acceptedSubmission = await makeSubmission(studentId, 'ACCEPTED');

    const completion = await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: acceptedSubmission._id,
    });

    // The completion is the "complete" marker a trainer counts against.
    const found = await AssignmentCompletion.findOne({
      assignment: assignmentId,
      student: studentId,
    }).lean();
    expect(found).not.toBeNull();
    expect(found._id.toString()).toBe(completion._id.toString());
    expect(found.verdict).toBe('ACCEPTED');

    // Completion state lives in AssignmentCompletion; the Assignment lifecycle
    // status is independent and must not be mutated as a side effect.
    const assignment = await Assignment.findById(assignmentId).lean();
    expect(assignment.problem.toString()).toBe(problemId.toString());
    expect(assignment.status).toBe('ACTIVE');
    expect(assignment.deleted).toBe(false);
  });

  it('should let a trainer count completed and pending students for an assignment', async () => {
    const { assignmentId, studentId, makeStudent, makeSubmission } = await createWorld();

    const pending = await makeStudent();
    const alsoPending = await makeStudent();

    await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: await makeSubmission(studentId, 'ACCEPTED').then(s => s._id),
    });

    const enrolled = [studentId, pending._id, alsoPending._id];
    const completedCount = await AssignmentCompletion.countDocuments({
      assignment: assignmentId,
      student: { $in: enrolled },
    });
    const pendingCount = enrolled.length - completedCount;

    expect(completedCount).toBe(1);
    expect(pendingCount).toBe(2);
  });

  it('should track completion per assignment, not per problem', async () => {
    const { studentId, problemId, batchId, assignmentId, makeBatch, makeAssignment, makeSubmission } = await createWorld();

    // Same problem, same student, two different batches => two assignments.
    const otherBatch = await makeBatch('Second Batch');
    const assignmentB = await makeAssignment(otherBatch._id, problemId);

    const assignmentA = await Assignment.findById(assignmentId).lean();
    expect(assignmentA.problem.toString()).toBe(problemId.toString());
    expect(assignmentA.problem.toString()).toBe(assignmentB.problem.toString());
    expect(assignmentA.batch.toString()).toBe(batchId.toString());
    expect(assignmentA.batch.toString()).not.toBe(assignmentB.batch.toString());

    const submissionA = await makeSubmission(studentId, 'ACCEPTED');
    await AssignmentCompletion.create({
      assignment: assignmentA._id,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submissionA._id,
    });

    // The second batch's assignment has its own, empty completion history.
    const forA = await AssignmentCompletion.find({ assignment: assignmentA._id }).lean();
    const forB = await AssignmentCompletion.find({ assignment: assignmentB._id }).lean();
    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(0);
  });

  it('should not complete the same problem in another batch when one batch completes', async () => {
    const { studentId, problemId, batchId, assignmentId, makeBatch, makeAssignment, makeSubmission } = await createWorld();

    const otherBatch = await makeBatch('Other Batch');
    const assignmentA = await Assignment.findById(assignmentId).lean();
    const assignmentB = await makeAssignment(otherBatch._id, problemId);

    expect(assignmentA.problem.toString()).toBe(assignmentB.problem.toString());
    expect(assignmentA.batch.toString()).toBe(batchId.toString());
    expect(assignmentA.batch.toString()).not.toBe(assignmentB.batch.toString());

    await AssignmentCompletion.create({
      assignment: assignmentA._id,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: await makeSubmission(studentId, 'ACCEPTED').then(s => s._id),
    });

    expect(await AssignmentCompletion.findOne({ assignment: assignmentB._id, student: studentId })).toBeNull();
    expect(await AssignmentCompletion.countDocuments({ student: studentId })).toBe(1);

    // Both assignments stay ACTIVE - no automatic cross-batch completion.
    const reloadedA = await Assignment.findById(assignmentA._id).lean();
    const reloadedB = await Assignment.findById(assignmentB._id).lean();
    expect(reloadedA.status).toBe('ACTIVE');
    expect(reloadedB.status).toBe('ACTIVE');

    // The other batch's assignment is completed independently, on its own
    // accepted submission.
    await AssignmentCompletion.create({
      assignment: assignmentB._id,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: await makeSubmission(studentId, 'ACCEPTED').then(s => s._id),
    });

    expect(await AssignmentCompletion.countDocuments({ student: studentId })).toBe(2);
    expect(await AssignmentCompletion.countDocuments({ assignment: assignmentB._id })).toBe(1);
  });

  it('should allow a student to submit more solutions after completing the assignment', async () => {
    const { assignmentId, studentId, problemId, submission, makeSubmission } = await createWorld();

    await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission._id,
    });

    // Practice is open-ended: further attempts are still accepted afterwards.
    const later1 = await makeSubmission(studentId, 'WRONG_ANSWER');
    const later2 = await makeSubmission(studentId, 'ACCEPTED');

    expect(later1._id).toBeDefined();
    expect(later2._id).toBeDefined();

    const all = await Submission.find({ student: studentId, problem: problemId }).sort({ createdAt: 1 }).lean();
    expect(all).toHaveLength(3);

    // The completion record is unchanged and still points at the first
    // accepted submission.
    const completion = await AssignmentCompletion.findOne({ assignment: assignmentId, student: studentId }).lean();
    expect(completion.acceptedSubmission.toString()).toBe(submission._id.toString());
    expect(await AssignmentCompletion.countDocuments({ assignment: assignmentId, student: studentId })).toBe(1);
  });

  it('should enforce unique index on assignment and student', async () => {
    const { assignmentId, studentId, submission } = await createWorld();

    await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission._id,
    });

    await expect(
      AssignmentCompletion.create({
        assignment: assignmentId,
        student: studentId,
        verdict: 'ACCEPTED',
        acceptedSubmission: submission._id,
      })
    ).rejects.toThrow(/duplicate key/);
  });

  it('should allow different student for same assignment', async () => {
    const { assignmentId, makeStudent, makeSubmission } = await createWorld();

    const student2 = await makeStudent();
    const submission2 = await makeSubmission(student2._id, 'ACCEPTED');

    const completion = await AssignmentCompletion.create({
      assignment: assignmentId,
      student: student2._id,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission2._id,
    });

    expect(completion.student.toString()).toBe(student2._id.toString());
    expect(completion.assignment.toString()).toBe(assignmentId.toString());
    expect(await AssignmentCompletion.countDocuments({ assignment: assignmentId })).toBe(1);
  });

  it('should allow same student for different assignment', async () => {
    const { assignmentId, studentId, batchId, problemId, submission, makeAssignment } = await createWorld();

    await AssignmentCompletion.create({
      assignment: assignmentId,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission._id,
    });

    // A second assignment of the same problem to the same batch on a
    // different date is a separate trackable unit of work.
    const assignment2 = await makeAssignment(batchId, problemId, new Date('2026-10-08'));

    const completion = await AssignmentCompletion.create({
      assignment: assignment2._id,
      student: studentId,
      verdict: 'ACCEPTED',
      acceptedSubmission: submission._id,
    });

    expect(completion.assignment.toString()).toBe(assignment2._id.toString());
    expect(completion.student.toString()).toBe(studentId.toString());
    expect(await AssignmentCompletion.countDocuments({ student: studentId })).toBe(2);
  });
});