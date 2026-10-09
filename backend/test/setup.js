// Suppress dotenv injected env debug messages
const originalConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('injected env')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

const path = require('path');
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
require('dotenv').config({ path: path.join(__dirname, '..', envFile), silent: true, debug: false });

const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');

async function cleanCollections() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    try {
      await collections[key].deleteMany({});
    } catch (error) {
      console.error(`[TEST SETUP] Failed cleaning ${key}:`, error.message);
    }
  }
}

// Single connection managed per Jest worker
let connectionPromise = null;

beforeAll(async () => {
  // Use worker-specific database to avoid collisions during parallel runs
  if (process.env.JEST_WORKER_ID) {
    const dbName = `CodingConsoleTest_${process.env.JEST_WORKER_ID}`;
    process.env.MONGO_URI = process.env.MONGO_URI.replace(/\/CodingConsoleTest$/, `/${dbName}`);
  }

  if (!connectionPromise) {
    connectionPromise = connectDB();
  }
  try {
    await connectionPromise;
  } catch (error) {
    // Reset so a re-run in this worker can retry; fail the hook cleanly.
    connectionPromise = null;
    throw new Error(`[TEST SETUP] MongoDB connection failed: ${error.message}`);
  }
  // Cleanup only after a confirmed connection, fully awaited.
  await cleanCollections();
});

afterAll(async () => {
  await disconnectDB();
});


