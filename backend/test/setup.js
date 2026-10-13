// Load test environment variables first (before any other imports)
require('dotenv').config({ path: '.env.test', quiet: true });

// Set test environment variables (override if needed)
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'testencryptionkey01234567890123';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.NODE_ENV = 'test';

// Suppress SMTP verification errors in test environment
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.SMTP_PORT = process.env.SMTP_PORT || '587';
process.env.SMTP_USER = process.env.SMTP_USER || 'test';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test';
process.env.SMTP_FROM = process.env.SMTP_FROM || 'test@example.com';

// Connect to MongoDB before any tests run
const { connectDB } = require('../src/config/db');
beforeAll(async () => {
  await connectDB();
});

// Disconnect from MongoDB after all tests complete
const { disconnectDB } = require('../src/config/db');
afterAll(async () => {
  await disconnectDB();
});

let originalConsoleError;

// Suppress console.error during tests
beforeAll(async () => {
  originalConsoleError = console.error;
  console.error = function (...args) {
    // Suppress error logs in test environment
    return;
  };
});

afterAll(async () => {
  if (originalConsoleError) {
    console.error = originalConsoleError;
  }
});
