// backend/src/models/Submission.js
// Submission model for student code execution results

const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  problem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true,
    index: true,
  },
  code: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    required: true,
    // Normalized languages derived from compilerRegistry (OnlineCompiler compiler IDs).
    // No 'javascript': provider has no JS compiler; typescript-deno normalizes to 'typescript'.
    enum: ['c', 'cpp', 'java', 'python', 'csharp', 'fsharp', 'php', 'ruby', 'haskell', 'go', 'rust', 'typescript'],
  },
  // Results per test case
  testResults: [
    {
      testCase: { type: mongoose.Schema.Types.ObjectId, ref: 'TestCase' },
      passed: { type: Boolean },
      output: { type: String },
      error: { type: String },
    },
  ],
  verdict: {
    type: String,
    required: true,
    enum: [
      'ACCEPTED',
      'WRONG_ANSWER',
      'COMPILATION_ERROR',
      'RUNTIME_ERROR',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
      'EXECUTION_ERROR',
    ],
  },
  // Raw execution result from Judge0 (last executed test case)
  executionResult: {
    type: Object,
    default: {},
  },
  runtime: Number,
  memory: Number,
}, { timestamps: true });

submissionSchema.index({ createdAt: -1 });
submissionSchema.index({ verdict: 1, createdAt: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
