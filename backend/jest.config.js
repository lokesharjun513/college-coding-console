module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000,
  setupFilesAfterEnv: ['./test/setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'zzBare\\.test\\.js$',
    'zzDiagMem\\.test\\.js$',
  ],
};
