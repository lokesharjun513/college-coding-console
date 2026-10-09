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
    typescript: String,
    php: String,
    ruby: String,
    haskell: String,
    go: String,
    rust: String,
    csharp: String,
    fsharp: String,
  },
  // Allowed languages
  allowedLanguages: [{
    type: String,
    enum: ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'],
  }],
  // Authoritative compiler mapping: { lang: compilerId }
  compilers: {
    type: Map,
    of: String,
  },
  // Legacy single compiler (deprecated, to be removed)
  compiler: {
    type: String,
  },
  scope: {
    type: String,
    enum: ['GLOBAL', 'BATCH'],
    default: 'GLOBAL',
  },
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
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
  archivedFrom: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED'],
    default: null,
  },
  practiceDate: {
    type: Date,
    default: null,
    index: true,
  },
}, { timestamps: true });

problemSchema.index({ createdAt: -1 });

problemSchema.index({ batch: 1, status: 1 });
problemSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Problem', problemSchema);
