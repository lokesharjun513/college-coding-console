const mongoose = require('mongoose');

// A completion is recorded per (assignment, student) – NOT per (problem,
// student). The same problem assigned to two different batches produces two
// independent assignments, and completing one must never complete the other.
//
// `verdict` is a strict subset of the real `Submission.verdict` enum
// (ACCEPTED, WRONG_ANSWER, COMPILATION_ERROR, RUNTIME_ERROR,
// TIME_LIMIT_EXCEEDED, MEMORY_LIMIT_EXCEEDED, EXECUTION_ERROR). The previous
// 'PARTIAL' value was invented — it exists nowhere else in the codebase and no
// code path can produce it — so it was removed. The automatic completion path
// only ever writes 'ACCEPTED'; 'WRONG_ANSWER' is retained because it is a real
// submission verdict and existing completion semantics depend on it.
//
// `acceptedSubmission` must reference a PERSISTED, ACCEPTED Submission that
// belongs to the same student and the same problem as the assignment. That is
// enforced in services/assignmentCompletion.js, which is the only writer of
// this collection.
const completionSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Verdict that satisfied the assignment (normally ACCEPTED)
    verdict: { type: String, enum: ['ACCEPTED', 'WRONG_ANSWER'], required: true },
    // Reference to the accepted submission (useful for audit)
    acceptedSubmission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One completion per (assignment, student)
completionSchema.index({ assignment: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('AssignmentCompletion', completionSchema);