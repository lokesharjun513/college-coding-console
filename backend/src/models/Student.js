const mongoose = require('mongoose');

// Student model stores persistent student profile data.
// Authentication credentials remain in the User collection.
// This model mirrors the required fields and enforces uniqueness and validation.

const studentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
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
  rollNumber: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true,
  },
  startYear: {
    type: Number,
    required: true,
  },
  endYear: {
    type: Number,
    required: true,
    validate: {
      validator: function(v) {
        // `this` refers to the document.
        return v >= this.startYear;
      },
      message: props => `End year (${props.value}) must be greater than or equal to start year (${props.instance.startYear})`,
    },
  },
  department: {
    type: String,
    required: true,
    enum: ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL'],
  },
  section: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

// Indexes for fast lookup and uniqueness enforcement.
// Explicit indexes removed; uniqueness enforced via field definitions.

module.exports = mongoose.model('Student', studentSchema);
