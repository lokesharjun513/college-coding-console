const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  description: {
    type: String,
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['EASY', 'MEDIUM', 'HARD'],
    required: true,
  },
  constraints: {
    type: String,
  },
  inputFormat: {
    type: String,
  },
  outputFormat: {
    type: String,
  },
  examples: [{
    input: String,
    output: String,
    explanation: String,
  }],
  starterCode: {
    c: String,
    cpp: String,
    java: String,
    python: String,
    javascript: String,
  },
  allowedLanguages: [{
    type: String,
    enum: ['c', 'cpp', 'java', 'python', 'javascript'],
  }],
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    default: 'DRAFT',
  },
}, { timestamps: true });

// Index for faster lookup by batch and status
problemSchema.index({ batch: 1, status: 1 });
// Index for slug uniqueness (already unique, but explicit)
problemSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Problem', problemSchema);