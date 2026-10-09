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

    // Set transaction support flag based on topology
    if (mongoose.connection.topology) {
      const topology = mongoose.connection.topology;
      mongoose.__transactionSupport = topology.isReplicaSetName || topology.isSharded;
    } else {
      // Fallback: assume no transaction support if topology not available
      mongoose.__transactionSupport = false;
    }

    if (process.env.NODE_ENV !== 'test') {
      logger.info('MongoDB connected', {
        event: 'database.connected',
        readyState: mongoose.connection.readyState,
        transactionSupport: mongoose.__transactionSupport,
      });
    }

    return mongoose.connection;
  } catch (error) {
    logger.error('MongoDB connection error', {
      event: 'database.error',
      message: error.message,
    });
    // If DNS SRV lookup fails, fallback to a direct localhost connection for tests
    if (isTest && error.message && error.message.includes('querySrv')) {
      // Extract DB name from original URI (after the last slash)
      const dbNameMatch = mongoUri.match(/\/([^\/]+)$/);
      const dbName = dbNameMatch ? dbNameMatch[1] : 'test';
      const fallbackUri = `mongodb://localhost:27017/${dbName}`;
      try {
        await mongoose.connect(fallbackUri, options);
        logger.info('MongoDB fallback connection succeeded', { fallbackUri });
        return mongoose.connection;
      } catch (fallbackError) {
        logger.error('MongoDB fallback connection error', { message: fallbackError.message });
        throw fallbackError;
      }
    }
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
