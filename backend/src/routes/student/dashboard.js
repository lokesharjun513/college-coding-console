const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const User = require('../../models/User');
const BatchStudent = require('../../models/BatchStudent');
const Problem = require('../../models/Problem');
const Submission = require('../../models/Submission');
const { visibleProblemQuery } = require('../../services/problemAccess');

router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // 1. Batch info
    // `trainer` is populated with a name-only projection so the dashboard can
    // name the trainer without exposing any trainer account fields. The batch
    // document itself carries startDate/endDate, which the dashboard shows as
    // batch metadata.
    const enrollment = await BatchStudent.findOne({ student: studentId, status: 'ACTIVE' })
      .populate({
        path: 'batch',
        select: 'name code status trainer startDate endDate',
        populate: { path: 'trainer', select: 'name' },
      });
    // `populate` resolves to null when the referenced batch was deleted, so the
    // membership record alone must not be treated as an active batch.
    const batchRecord = enrollment ? enrollment.batch : null;
    const batch = batchRecord ? {
      id: batchRecord._id,
      name: batchRecord.name,
      code: batchRecord.code,
      status: batchRecord.status,
      trainerName: batchRecord.trainer ? batchRecord.trainer.name : null,
      startDate: batchRecord.startDate || null,
      endDate: batchRecord.endDate || null,
    } : null;

    // 2. Problems
    const enrollments = await BatchStudent.find({ student: studentId, status: 'ACTIVE' }).select('batch').lean();
    const problemQuery = visibleProblemQuery(enrollments.map(item => item.batch));
    // `scope` is selected so BATCH and GLOBAL progress can be reported
    // separately instead of being mixed into one combined total.
    const problems = await Problem.find(problemQuery).select('_id scope');
    const totalProblems = problems.length;
    const batchProblemIds = new Set(problems.filter(p => p.scope === 'BATCH').map(p => p._id.toString()));
    const globalProblemIds = new Set(problems.filter(p => p.scope === 'GLOBAL').map(p => p._id.toString()));

    // 3. Submissions & Metrics
    const submissions = await Submission.find({ student: studentId }).populate('problem');
    const attemptedProblemIds = new Set();
    const solvedProblemIds = new Set();

    submissions.forEach(sub => {
      if (sub.problem) {
        attemptedProblemIds.add(sub.problem._id.toString());
        if (sub.verdict === 'ACCEPTED') solvedProblemIds.add(sub.problem._id.toString());
      }
    });

    const attemptedProblems = attemptedProblemIds.size;
    const solvedProblems = solvedProblemIds.size;
    const accuracy = attemptedProblems > 0 ? Math.round((solvedProblems / attemptedProblems) * 100) : 0;

    // Split counts are derived from the solved set, so a problem can only ever
    // be counted in the scope it actually belongs to.
    const countSolvedIn = (ids) => [...solvedProblemIds].filter(id => ids.has(id)).length;
    const assignedBatchProblems = batchProblemIds.size;
    const batchSolvedProblems = countSolvedIn(batchProblemIds);
    const globalSolvedProblems = countSolvedIn(globalProblemIds);

    // 4. Recent submissions
    // `problemId` and `scope` are included alongside the title so the client
    // can label the scope and link to the problem without a second request.
    const recentSubmissions = submissions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map(sub => ({
        id: sub._id,
        problem: sub.problem ? sub.problem.title : 'Deleted Problem',
        problemId: sub.problem ? sub.problem._id : null,
        scope: sub.problem ? sub.problem.scope : null,
        verdict: sub.verdict,
        createdAt: sub.createdAt
      }));

    return res.json({
      success: true,
      data: {
        student: {
          id: student._id,
          name: student.name,
          email: student.email,
          rollNumber: student.rollNumber,
          department: student.department,
          section: student.section,
          academicBatch: student.academicBatch
        },
        batch,
        metrics: {
          totalProblems,
          attemptedProblems,
          solvedProblems,
          accuracy,
          assignedBatchProblems,
          batchSolvedProblems,
          globalSolvedProblems,
        },
        recentSubmissions
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
