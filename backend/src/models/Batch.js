const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true,
  },
  description: {
    type: String,
    trim: true,
  },
  trainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'COMPLETED'],
    default: 'ACTIVE',
  },
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model('Batch', batchSchema);
