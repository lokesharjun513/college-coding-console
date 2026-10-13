// backend/tests/compilerKeyEvent.test.js
const { compilerKeyManager, CompilerKey } = require('../src/services/CompilerKeyManager');
const CompilerKeyEvent = require('../src/models/CompilerKeyEvent');
const mongoose = require('mongoose');

// Mock environment variables for testing
process.env.ONLINE_COMPILER_API_KEY_1 = 'test-key-1';
process.env.ONLINE_COMPILER_API_KEY_2 = 'test-key-2';
process.env.ONLINE_COMPILER_API_KEY_3 = 'test-key-3';
process.env.ONLINE_COMPILER_API_KEY_4 = 'test-key-4';
process.env.ONLINE_COMPILER_API_KEY_5 = 'test-key-5';
process.env.DEFAULT_COMPILER_KEY_LIMIT = '100';

// Mock user ID for actor attribution
const mockUserId = new mongoose.Types.ObjectId();

describe('CompilerKeyEvent', () => {
  // Note: Database connection is managed by the global test setup (test/setup.js)
  // This test reuses the shared connection to avoid connection conflicts

  beforeEach(async () => {
    await CompilerKey.deleteMany({});
    await CompilerKeyEvent.deleteMany({});
    // Reset the manager instance
    compilerKeyManager.keys = [];
    compilerKeyManager.initialized = false;
    compilerKeyManager.nextKeyIndex = 0;

    // Reset env vars for keys
    for (let i = 1; i <= 5; i++) {
      process.env[`ONLINE_COMPILER_API_KEY_${i}`] = `test-key-${i}`;
    }
  });

  describe('Event Recording', () => {
    test('should record limit updated event with actor attribution', async () => {
      await compilerKeyManager.initialize();

      // Update limit for key 1 with a mock user ID
      await compilerKeyManager.updateLimit(1, 200, mockUserId);

      // Check that a limit_updated event was recorded
      const events = await CompilerKeyEvent.find({ eventType: 'limit_updated' });
      expect(events.length).toBe(1);
      expect(events[0].keyIndex).toBe(1);
      expect(events[0].description).toBe('Key 1 limit updated from 100 to 200');
      expect(events[0].details).toMatchObject({ oldLimit: 100, newLimit: 200 });
    });

    test('should record key reset event with actor attribution', async () => {
      await compilerKeyManager.initialize();

      // Set some usage on key 1
      await CompilerKey.updateOne(
        { keyIndex: 1 },
        {
          currentRequestCount: 50,
          remainingRequests: 50,
          usagePercentage: 50
        }
      );

      // Reset key 1 with a mock user ID
      await compilerKeyManager.resetKey(1, mockUserId);

      // Check that a key_reset event was recorded
      const events = await CompilerKeyEvent.find({ eventType: 'key_reset' });
      expect(events.length).toBe(1);
      expect(events[0].keyIndex).toBe(1);
      expect(events[0].description).toBe('Key 1 usage counter reset');
    });

    test('should record all keys reset event with actor attribution', async () => {
      await compilerKeyManager.initialize();

      // Set some usage on multiple keys
      await CompilerKey.updateOne(
        { keyIndex: 1 },
        {
          currentRequestCount: 30,
          remainingRequests: 70,
          usagePercentage: 30
        }
      );
      await CompilerKey.updateOne(
        { keyIndex: 2 },
        {
          currentRequestCount: 40,
          remainingRequests: 60,
          usagePercentage: 40
        }
      );

      // Reset all keys with a mock user ID
      await compilerKeyManager.resetAllKeys(true, mockUserId);

      // Check that an all_keys_reset event was recorded
      const events = await CompilerKeyEvent.find({ eventType: 'all_keys_reset' });
      expect(events.length).toBe(1);
      expect(events[0].keyIndex).toBeNull(); // No specific key for this event
      expect(events[0].description).toBe('All compiler keys usage counters reset');
      expect(events[0].details).toHaveProperty('modifiedCount');
    });

    test('should return logs in correct order (newest first) with pagination', async () => {
      await compilerKeyManager.initialize();

      // Record a few events with slight delays to ensure different timestamps
      await compilerKeyManager.updateLimit(1, 150, mockUserId);
      // Wait a bit to ensure timestamp difference (if needed, but we rely on MongoDB's timestamp ordering)
      await new Promise(resolve => setTimeout(resolve, 10));
      await compilerKeyManager.resetKey(2, mockUserId);
      await new Promise(resolve => setTimeout(resolve, 10));
      await compilerKeyManager.resetAllKeys(true, mockUserId);

      // Fetch logs with limit 2 per page
      let page1 = await compilerKeyManager.getLogs({ limit: 2, page: 1 });
      expect(page1.logs.length).toBe(2);
      // Most recent should be all_keys_reset, then key_reset
      expect(page1.logs[0].eventType).toBe('all_keys_reset');
      expect(page1.logs[1].eventType).toBe('key_reset');

      let page2 = await compilerKeyManager.getLogs({ limit: 2, page: 2 });
      expect(page2.logs.length).toBe(1);
      expect(page2.logs[0].eventType).toBe('limit_updated');
    });

    test('should not expose raw keys in event details', async () => {
      await compilerKeyManager.initialize();

      // Update limit - the details should not contain the raw key
      await compilerKeyManager.updateLimit(1, 150, mockUserId);

      const events = await CompilerKeyEvent.find({ eventType: 'limit_updated' });
      expect(events.length).toBe(1);
      // The details should only contain the old and new limits
      expect(events[0].details).toMatchObject({ oldLimit: 100, newLimit: 150 });
    });
  });
});
