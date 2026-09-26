module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  // Runs in each worker process. Connect + disconnect here (per worker) so the
  // process that opens a Mongo connection is the same process that closes it.
  // Do NOT use globalSetup/globalTeardown: they run in a separate Jest process,
  // so they cannot close the worker connections and Jest would hang on open TLS
  // sockets.
  setupFilesAfterEnv: ['./test/setup.js'],
};
