// backend/src/models/CompilerKeyEvent.js
// Mongoose model for persistent audit events related to compiler key activity

const mongoose = require('mongoose');

/**
 * CompilerKeyEvent schema
 *
 * eventType: string identifier of the event (e.g., 'request_reserved', 'quota_exhausted',
 *            'limit_updated', 'key_reset', 'all_keys_reset', 'key_rotated')
 * keyIndex: the numeric index of the compiler key the event relates to (optional)
 * timestamp: when the event occurred (defaults to now)
 * actorId: reference to the admin user who performed the action (optional, for admin actions)
 * description: human‑readable description of the event
 * details: arbitrary JSON storing previous and new values, without exposing raw keys
 */
const compilerKeyEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      'request_reserved',
      'quota_exhausted',
      'limit_updated',
      'key_reset',
      'all_keys_reset',
      'key_rotated',
      'key_replaced',
      'status_changed'
    ]
  },
  keyIndex: {
    type: Number,
    min: 1,
    max: 5,
    required: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  description: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  }
}, {
  // No automatic timestamps – we store timestamp explicitly
});

// Index for fast retrieval of recent events, filtered by keyIndex if needed
compilerKeyEventSchema.index({ timestamp: -1 });
compilerKeyEventSchema.index({ keyIndex: 1, timestamp: -1 });

module.exports = mongoose.model('CompilerKeyEvent', compilerKeyEventSchema);
