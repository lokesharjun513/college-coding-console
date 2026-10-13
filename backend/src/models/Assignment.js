const mongoose = require('mongoose');

// Open-ended practice assignment.
//
// There is NO due date and NO time limit: a student may start (once
// `availableFrom` has passed) and finish at any later point. Nothing in this
// schema derives or enforces a deadline, and nothing here is computed from
// elapsed time.
//
// `availableFrom` is *availability*; `status` is the *lifecycle/completion*
// state. The two are deliberately independent: an assignment that has been
// available for years is still ACTIVE until a trainer changes its status.
const assignmentSchema = new mongoose.Schema(
  {
    // Problem being assigned (GLOBAL or BATCH‑scoped)
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    // Batch that receives the assignment
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
    // Trainer who created the assignment – derived from batch.trainer for audit
    trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional human‑readable title (defaults to problem.title)
    title: { type: String },
    // When students can start working on it. Availability only – no deadline.
    availableFrom: { type: Date, default: null },
    // Assignment lifecycle status (independent of availableFrom)
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    // Soft‑delete flag – keeps historic data safe
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Allow the same problem to be assigned to the same batch on different dates.
// Unique per batch+problem+availableFrom when not deleted.
assignmentSchema.index(
  { batch: 1, problem: 1, availableFrom: 1 },
  { unique: true, partialFilterExpression: { deleted: false } }
);

module.exports = mongoose.model('Assignment', assignmentSchema);