// backend/src/models/Collection.js
const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  description: {
    type: String,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'ARCHIVED'],
    default: 'ACTIVE',
  },
  // Scope decides who may see this curriculum at all:
  //   GLOBAL — platform curriculum owned by an admin, visible to everyone.
  //   BATCH  — a trainer's curriculum for exactly one of their batches.
  // A Collection is the only place scope lives; Topics inherit it through their
  // parent collection, so the two can never disagree.
  scope: {
    type: String,
    enum: ['GLOBAL', 'BATCH'],
    // Defaults to GLOBAL so pre-existing admin curriculum keeps working without
    // a migration, and so an admin can never accidentally create a BATCH one.
    default: 'GLOBAL',
    index: true,
  },
  // Required for BATCH scope, always null for GLOBAL.
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    default: null,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// A BATCH collection without a batch has no authorization meaning at all, so it
// is rejected at the model rather than trusted at every call site. Mongoose 9
// middleware is promise-based (no `next` callback).
collectionSchema.pre('validate', function enforceBatchScope() {
  if (this.scope === 'GLOBAL') {
    this.batch = null;
    return;
  }
  if (this.scope === 'BATCH' && !this.batch) {
    throw new Error('A BATCH collection requires a batch');
  }
});

module.exports = mongoose.model('Collection', collectionSchema);
