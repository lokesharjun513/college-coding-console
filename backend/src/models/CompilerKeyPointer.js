// backend/src/models/CompilerKeyPointer.js
const mongoose = require('mongoose');

/**
 * Compiler Key Pointer Schema for tracking the current active key index
 */
const compilerKeyPointerSchema = new mongoose.Schema({
  currentKeyIndex: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 1
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure only one document exists (singleton pattern)
compilerKeyPointerSchema.statics.getSingleton = async function() {
  let pointer = await this.findOne();
  if (!pointer) {
    pointer = await this.create({ currentKeyIndex: 1 });
  }
  return pointer;
};

compilerKeyPointerSchema.statics.updatePointer = async function(newIndex) {
  const pointer = await this.getSingleton();
  pointer.currentKeyIndex = newIndex;
  pointer.updatedAt = new Date();
  return await pointer.save();
};

const CompilerKeyPointer = mongoose.model('CompilerKeyPointer', compilerKeyPointerSchema);

module.exports = CompilerKeyPointer;