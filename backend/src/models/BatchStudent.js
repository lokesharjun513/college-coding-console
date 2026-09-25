const mongoose = require('mongoose');

const batchStudentSchema = new mongoose.Schema({
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true,
    index: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE',
  },
  enrolledAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Compound unique index to prevent duplicate enrollment
batchStudentSchema.index({ batch: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('BatchStudent', batchStudentSchema);
