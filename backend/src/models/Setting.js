const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: 'platform',
    },
    platformTitle: {
      type: String,
      required: true,
      trim: true,
      default: 'BTech Coding Platform',
    },
    registrationEnabled: {
      type: Boolean,
      default: true,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    submissionsEnabled: {
      type: Boolean,
      default: true,
    },
    maxSubmissionsPerDay: {
      type: Number,
      min: 1,
      max: 1000,
      default: 50,
    },
    defaultTimeLimit: {
      type: Number,
      min: 100,
      max: 60000,
      default: 2000,
    },
    defaultMemoryLimit: {
      type: Number,
      min: 16,
      max: 1048576,
      default: 128,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Setting', settingSchema);
