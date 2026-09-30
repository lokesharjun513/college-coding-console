require('dotenv').config({ path: '.env' });

const logger = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 3000;

async function shutdown(server, signal) {
  logger.info(`Server shutting down due to signal`, { event: 'server.shutdown', signal });
  server.close(async () => {
    await disconnectDB();
    logger.info('Server shutdown complete', { event: 'server.shutdown.complete' });
    process.exit(0);
  });
  // Force-exit if connections don't drain in time.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout', { event: 'server.shutdown.timeout' });
    process.exit(1);
  }, 10000).unref();
}

connectDB()
  .then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`API running on http://localhost:${PORT}`, { event: 'server.started', port: PORT });
    });

    server.on('error', (err) => {
      logger.error('HTTP server error', { event: 'server.error', message: err.message });
      process.exit(1);
    });

    process.on('SIGINT', () => shutdown(server, 'SIGINT'));
    process.on('SIGTERM', () => shutdown(server, 'SIGTERM'));
  })
  .catch((err) => {
    logger.error('Failed to start server due to DB error', { event: 'server.start.error', message: err.message });
    process.exit(1);
  });
