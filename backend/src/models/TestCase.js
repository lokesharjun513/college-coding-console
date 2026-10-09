const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema({
  problem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true,
    index: true,
  },
  input: {
    type: String,
    required: true,
  },
  expectedOutput: {
    type: String,
    validate: {
      validator: function(v) {
        return v !== null && v !== undefined;
      },
      message: 'expectedOutput is required'
    }
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
  sampleExplanation: {
    type: String,
    default: '',
  },
  order: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

testCaseSchema.index({ problem: 1, order: 1, createdAt: 1 });

module.exports = mongoose.model('TestCase', testCaseSchema);
