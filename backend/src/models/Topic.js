// backend/src/models/Topic.js
const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  name: {
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
  },
  collection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection',
    required: true,
    index: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'ARCHIVED'],
    default: 'ACTIVE',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// Ensure unique topic name/slug within a collection
topicSchema.index({ collection: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Topic', topicSchema);
