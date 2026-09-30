// backend/src/models/ProblemTopic.js
const mongoose = require('mongoose');

const problemTopicSchema = new mongoose.Schema({
  problem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true,
    index: true,
  },
  collection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection',
    required: true,
    index: true,
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true,
    index: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

// Prevent duplicate problem+topic relationship
problemTopicSchema.index({ problem: 1, topic: 1 }, { unique: true });

module.exports = mongoose.model('ProblemTopic', problemTopicSchema);
