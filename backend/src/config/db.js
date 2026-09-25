const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('[DB] MONGO_URI not set in environment');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);

    console.log('[DB] MongoDB connected');
  } catch (error) {
    console.error('[DB] MongoDB connection error:', error.message);
    process.exit(1);
  }
}

module.exports = { connectDB };