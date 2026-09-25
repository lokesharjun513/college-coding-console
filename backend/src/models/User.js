const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: ['ADMIN', 'TRAINER', 'STUDENT'],
    required: true,
    default: 'STUDENT',
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    required: true,
    default: 'ACTIVE',
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
