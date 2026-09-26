const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI not set');
  }

  // Already connected
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const isTest = process.env.NODE_ENV === 'test';

  const options = {
    serverSelectionTimeoutMS: isTest ? 10000 : 30000,
    connectTimeoutMS: isTest ? 10000 : 30000,
    socketTimeoutMS: 60000,

    // Keep the test connection pool very small.
    maxPoolSize: isTest ? 5 : 10,
    minPoolSize: 0,

    // Don't keep idle connections around in tests.
    maxIdleTimeMS: isTest ? 1000 : 300000,

    retryWrites: true,
  };

  try {
    await mongoose.connect(mongoUri, options);

    console.log(
      `[DB] MongoDB connected readyState=${mongoose.connection.readyState}`
    );

    return mongoose.connection;
  } catch (error) {
    console.error('[DB] MongoDB connection error:', error.message);
    throw error;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  console.log(
    `[DB] Disconnecting MongoDB readyState=${mongoose.connection.readyState}`
  );

  // mongoose.disconnect() closes the underlying MongoDB client/pool.
  await mongoose.disconnect();

  console.log(
    `[DB] MongoDB disconnected readyState=${mongoose.connection.readyState}`
  );
}

module.exports = {
  connectDB,
  disconnectDB,
};