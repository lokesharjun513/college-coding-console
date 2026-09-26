require('dotenv').config({ path: '.env' });

const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const teardownDB = require('./teardown');

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

// Runs in each worker (see jest.config.js). The worker owns its Mongoose
// connection, so it connects before the tests and disconnects after them.
beforeAll(async () => {
  await connectDB();
  await cleanCollections();
});

afterAll(async () => {
  await teardownDB();
});
