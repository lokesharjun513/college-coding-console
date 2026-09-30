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
  trainerId: {
    type: String,
    sparse: true,
    unique: true,
    index: true,
  },
  rollNumber: {
    type: String,
    sparse: true,
    unique: true,
    index: true,
  },
  department: {
    type: String,
    enum: ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL'],
  },
  section: {
    type: String,
    trim: true,
  },
  academicBatch: {
    startYear: { type: Number },
    endYear: { type: Number },
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
