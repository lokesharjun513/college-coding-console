const mongoose = require('mongoose');
const logger = require('./logger');

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

    if (process.env.NODE_ENV !== 'test') {
      logger.info('MongoDB connected', {
        event: 'database.connected',
        readyState: mongoose.connection.readyState,
      });
    }

    return mongoose.connection;
  } catch (error) {
    logger.error('MongoDB connection error', {
      event: 'database.error',
      message: error.message,
    });
    throw error;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  if (process.env.NODE_ENV !== 'test') {
    logger.info('Disconnecting MongoDB', {
      event: 'database.disconnecting',
      readyState: mongoose.connection.readyState,
    });
  }

  await mongoose.disconnect();

  if (process.env.NODE_ENV !== 'test') {
    logger.info('MongoDB disconnected', {
      event: 'database.disconnected',
      readyState: mongoose.connection.readyState,
    });
  }
}

module.exports = {
  connectDB,
  disconnectDB,
};
