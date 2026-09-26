require('dotenv').config({ path: '.env' });

const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 3003;

async function shutdown(server, signal) {
  console.log(`[SERVER] ${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  // Force-exit if connections don't drain in time.
  setTimeout(() => {
    console.error('[SERVER] Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

connectDB()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`[SERVER] API running on http://localhost:${PORT}`);
    });

    server.on('error', (err) => {
      console.error('[SERVER] HTTP server error:', err);
      process.exit(1);
    });

    process.on('SIGINT', () => shutdown(server, 'SIGINT'));
    process.on('SIGTERM', () => shutdown(server, 'SIGTERM'));
  })
  .catch((err) => {
    console.error('[SERVER] Failed to start server due to DB error:', err);
    process.exit(1);
  });
