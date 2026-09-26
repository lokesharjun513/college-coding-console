const mongoose = require('mongoose');
const { disconnectDB } = require('../src/config/db');

// Cleanly disconnect the Mongoose connection within the worker process that
// opened it. `mongoose.disconnect()` closes the underlying MongoDB client/pool,
// so there is no need (and it would double-close) to also call client.close().
module.exports = async function teardownDB() {
  console.log(
    `[TEARDOWN] starting readyState=${mongoose.connection.readyState}`
  );

  try {
    if (mongoose.connection.readyState !== 0) {
      console.log('[TEARDOWN] closing mongoose connection');
      await disconnectDB();
    }

    console.log(
      `[TEARDOWN] mongoose disconnected readyState=${mongoose.connection.readyState}`
    );
  } catch (error) {
    console.error('[TEARDOWN] MongoDB disconnect error:', error);
  }

  console.log('[TEARDOWN] complete');
};
