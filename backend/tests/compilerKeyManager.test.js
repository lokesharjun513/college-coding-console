// backend/tests/compilerKeyManager.test.js
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
const { compilerKeyManager, CompilerKey } = require('../src/services/CompilerKeyManager');
const CompilerKeyPointer = require('../src/models/CompilerKeyPointer');


// Mock environment variables for testing
process.env.ONLINE_COMPILER_API_KEY_1 = 'test-key-1';
process.env.ONLINE_COMPILER_API_KEY_2 = 'test-key-2';
process.env.ONLINE_COMPILER_API_KEY_3 = 'test-key-3';
process.env.ONLINE_COMPILER_API_KEY_4 = 'test-key-4';
process.env.ONLINE_COMPILER_API_KEY_5 = 'test-key-5';
process.env.DEFAULT_COMPILER_KEY_LIMIT = '100';

describe('CompilerKeyManager', () => {
  // Note: Database connection is managed by the global test setup (test/setup.js)
  // This test reuses the shared connection to avoid connection conflicts

  beforeEach(async () => {
    await CompilerKey.deleteMany({});
    await CompilerKeyPointer.deleteMany({});
    // Reset the manager instance
    compilerKeyManager.keys = [];
    compilerKeyManager.initialized = false;

    // Reset env vars for keys
    for (let i = 1; i <= 5; i++) {
      process.env[`ONLINE_COMPILER_API_KEY_${i}`] = `test-key-${i}`;
    }
  });

  describe('Initialization', () => {
    test('should initialize with 5 keys from environment variables', async () => {
      await compilerKeyManager.initialize();

      expect(compilerKeyManager.initialized).toBe(true);
      expect(compilerKeyManager.keys.length).toBe(5);

      // Check that keys are properly indexed
      for (let i = 0; i < 5; i++) {
        expect(compilerKeyManager.keys[i].keyIndex).toBe(i + 1);
        expect(compilerKeyManager.keys[i].displayName).toBe(`Key ${i + 1}`);
        expect(compilerKeyManager.keys[i].maskedKey).toBeDefined();
        expect(compilerKeyManager.keys[i].maxRequestLimit).toBe(100);
        expect(compilerKeyManager.keys[i].currentRequestCount).toBe(0);
        expect(compilerKeyManager.keys[i].status).toBe('waiting');
      }
    });
  });

  describe('Key Reservation', () => {
    test('should reserve a request against the first available key', async () => {
      await compilerKeyManager.initialize();

      const key = await compilerKeyManager.reserveRequest();

      expect(key).toBeDefined();
      expect(key.keyIndex).toBe(1); // Should be first key
      expect(key.currentRequestCount).toBe(1);
      expect(key.remainingRequests).toBe(99);
      expect(key.status).toBe('waiting'); // Still has remaining requests
    });

    test('should use one key continuously until exhausted', async () => {
      await compilerKeyManager.initialize();

      // Reserve multiple requests - all should go to key 1 until it hits its limit
      const key1 = await compilerKeyManager.reserveRequest();
      const key2 = await compilerKeyManager.reserveRequest();
      const key3 = await compilerKeyManager.reserveRequest();

      expect(key1.keyIndex).toBe(1);
      expect(key2.keyIndex).toBe(1);
      expect(key3.keyIndex).toBe(1);
      expect(key3.currentRequestCount).toBe(3);
    });

    test('should move sequentially to next key when current is exhausted', async () => {
      await compilerKeyManager.initialize();

      // Exhaust key 1 manually
      await CompilerKey.updateOne(
        { keyIndex: 1 },
        {
          currentRequestCount: 100,
          remainingRequests: 0,
          usagePercentage: 100,
          status: 'exhausted'
        }
      );

      // Next request should go to key 2
      const key = await compilerKeyManager.reserveRequest();
      expect(key.keyIndex).toBe(2);
      expect(key.currentRequestCount).toBe(1);
    });

    test('should reflect sequential active key in getActiveKey', async () => {
      await compilerKeyManager.initialize();

      let activeKey = await compilerKeyManager.getActiveKey();
      expect(activeKey.keyIndex).toBe(1);

      // Exhaust key 1
      await CompilerKey.updateOne(
        { keyIndex: 1 },
        {
          currentRequestCount: 100,
          remainingRequests: 0,
          usagePercentage: 100,
          status: 'exhausted'
        }
      );

      activeKey = await compilerKeyManager.getActiveKey();
      expect(activeKey.keyIndex).toBe(2);
    });

    test('getActiveKey should skip exhausted keys sequentially', async () => {
      await compilerKeyManager.initialize();

      // Exhaust keys 1 and 2 manually
      await CompilerKey.updateOne({ keyIndex: 1 }, { status: 'exhausted', currentRequestCount: 100, remainingRequests: 0 });
      await CompilerKey.updateOne({ keyIndex: 2 }, { status: 'exhausted', currentRequestCount: 100, remainingRequests: 0 });

      const activeKey = await compilerKeyManager.getActiveKey();
      expect(activeKey).toBeDefined();
      expect(activeKey.keyIndex).toBe(3);
    });

    test('should skip exhausted keys sequentially when current key exhausts', async () => {
      await compilerKeyManager.initialize();

      // Exhaust keys 1 and 2
      await CompilerKey.updateOne({ keyIndex: 1 }, { status: 'exhausted', currentRequestCount: 100, remainingRequests: 0 });
      await CompilerKey.updateOne({ keyIndex: 2 }, { status: 'exhausted', currentRequestCount: 100, remainingRequests: 0 });

      // Next request should land on key 3
      const key = await compilerKeyManager.reserveRequest();
      expect(key.keyIndex).toBe(3);
    });
  });

  describe('Limit Updates', () => {
    test('should update key limit correctly', async () => {
      await compilerKeyManager.initialize();

      // Use some requests from key 1
      await compilerKeyManager.reserveRequest();
      await compilerKeyManager.reserveRequest();

      // Update limit for key 1
      const updatedKey = await compilerKeyManager.updateLimit(1, 200);

      expect(updatedKey.maxRequestLimit).toBe(200);
      expect(updatedKey.currentRequestCount).toBe(2); // Should preserve usage (2 requests used on key 1)
      expect(updatedKey.remainingRequests).toBe(198); // 200 - 2
      expect(updatedKey.usagePercentage).toBeCloseTo(1.0); // 2/200*100
      expect(updatedKey.status).toBe('waiting');
    });

    test('should mark key as exhausted if new limit is below current usage', async () => {
      await compilerKeyManager.initialize();

      // Set key 1 to have 50 requests used (manually)
      await CompilerKey.updateOne(
        { keyIndex: 1 },
        {
          currentRequestCount: 50,
          remainingRequests: 50,
          usagePercentage: 50,
        }
      );

      // Update limit to 25 (below current usage)
      const updatedKey = await compilerKeyManager.updateLimit(1, 25);

      expect(updatedKey.maxRequestLimit).toBe(25);
      expect(updatedKey.currentRequestCount).toBe(50); // Usage preserved
      expect(updatedKey.remainingRequests).toBe(0);
      expect(updatedKey.usagePercentage).toBe(100);
      expect(updatedKey.status).toBe('exhausted');
    });

    test('should restore exhausted key if limit is increased above usage', async () => {
      await compilerKeyManager.initialize();

      // Exhaust key 1 manually
      await CompilerKey.updateOne(
        { keyIndex: 1 },
        {
          currentRequestCount: 100,
          remainingRequests: 0,
          usagePercentage: 100,
          status: 'exhausted'
        }
      );

      // Verify key is exhausted
      let key = await CompilerKey.findOne({ keyIndex: 1 });
      expect(key.status).toBe('exhausted');

      // Increase limit to 150
      const updatedKey = await compilerKeyManager.updateLimit(1, 150);

      expect(updatedKey.maxRequestLimit).toBe(150);
      expect(updatedKey.currentRequestCount).toBe(100); // Usage preserved
      expect(updatedKey.remainingRequests).toBe(50); // 150 - 100
      expect(updatedKey.usagePercentage).toBeCloseTo(66.67); // 100/150*100
      expect(updatedKey.status).toBe('waiting'); // Should be waiting now
    });

    test('should reject invalid key index', async () => {
      await compilerKeyManager.initialize();

      await expect(compilerKeyManager.updateLimit(0, 100)).rejects.toThrow('Key index must be between 1 and 5');
      await expect(compilerKeyManager.updateLimit(6, 100)).rejects.toThrow('Key index must be between 1 and 5');
    });

    test('should reject invalid limit values', async () => {
      await compilerKeyManager.initialize();

      await expect(compilerKeyManager.updateLimit(1, -10)).rejects.toThrow('Limit must be a positive integer');
      await expect(compilerKeyManager.updateLimit(1, 0)).rejects.toThrow('Limit must be a positive integer');
      await expect(compilerKeyManager.updateLimit(1, 1.5)).rejects.toThrow('Limit must be a positive integer');
    });
  });

  describe('Key Reset', () => {
    test('should reset individual key usage counter', async () => {
      await compilerKeyManager.initialize();

      // Set usage manually
      await CompilerKey.updateOne({ keyIndex: 1 }, { currentRequestCount: 2, remainingRequests: 98 });

      // Verify key 1 has 2 requests used
      let key = await CompilerKey.findOne({ keyIndex: 1 });
      expect(key.currentRequestCount).toBe(2);
      expect(key.remainingRequests).toBe(98);

      // Reset key 1
      const resetKey = await compilerKeyManager.resetKey(1);

      expect(resetKey.currentRequestCount).toBe(0);
      expect(resetKey.remainingRequests).toBe(100);
      expect(resetKey.status).toBe('waiting');
      expect(resetKey.totalSubmissions).toBe(0); // Historical totals preserved
    });

    test('should reset all keys usage counters', async () => {
      await compilerKeyManager.initialize();

      // Set some usage across keys manually
      await CompilerKey.updateOne({ keyIndex: 1 }, { currentRequestCount: 1, remainingRequests: 99 });
      await CompilerKey.updateOne({ keyIndex: 2 }, { currentRequestCount: 1, remainingRequests: 99 });
      await CompilerKey.updateOne({ keyIndex: 3 }, { currentRequestCount: 1, remainingRequests: 99 });

      // Verify usage
      let key1 = await CompilerKey.findOne({ keyIndex: 1 });
      let key2 = await CompilerKey.findOne({ keyIndex: 2 });
      let key3 = await CompilerKey.findOne({ keyIndex: 3 });
      expect(key1.currentRequestCount).toBe(1);
      expect(key2.currentRequestCount).toBe(1);
      expect(key3.currentRequestCount).toBe(1);

      // Reset all keys
      const resetKeys = await compilerKeyManager.resetAllKeys(true);

      // Verify all keys reset
      for (const key of resetKeys) {
        expect(key.currentRequestCount).toBe(0);
        expect(key.remainingRequests).toBe(100);
        expect(key.status).toBe('waiting');
        // Historical totals should be preserved (they're 0 since we didn't record submissions)
      }
    });

    test('should require confirmation for reset all keys', async () => {
      await compilerKeyManager.initialize();

      // Try to reset all without confirmation - should fail
      await expect(
        compilerKeyManager.resetAllKeys()
      ).rejects.toThrow(); // Our implementation throws when confirm is not true

      // Reset all with confirmation should work
      const resetKeys = await compilerKeyManager.resetAllKeys(true);
      expect(resetKeys.length).toBe(5);
      resetKeys.forEach(key => {
        expect(key.currentRequestCount).toBe(0);
      });
    });
  });

  describe('Status Reporting', () => {
    test('should return correct status for all keys', async () => {
      await compilerKeyManager.initialize();

      const status = await compilerKeyManager.getAllKeysStatus();

      expect(status.length).toBe(5);
      status.forEach((key, index) => {
        expect(key.keyIndex).toBe(index + 1);
        expect(key.displayName).toBe(`Key ${index + 1}`);
        expect(key.maxRequestLimit).toBe(100);
        expect(key.currentRequestCount).toBe(0);
        expect(key.status).toBe('waiting');
      });
    });

    test('should return active key correctly', async () => {
      await compilerKeyManager.initialize();

      // Initially first non-exhausted key is active
      let activeKey = await compilerKeyManager.getActiveKey();
      expect(activeKey.keyIndex).toBe(1);

      // Exhaust key 1 manually
      await CompilerKey.updateOne(
        { keyIndex: 1 },
        {
          currentRequestCount: 100,
          remainingRequests: 0,
          usagePercentage: 100,
          status: 'exhausted'
        }
      );

      // Key 2 should now be active
      activeKey = await compilerKeyManager.getActiveKey();
      expect(activeKey.keyIndex).toBe(2);
    });

    test('should replace key successfully with correct password', async () => {
      await compilerKeyManager.initialize();
      const mockAdminId = 'mock-admin-id';

      const keyIndex = 1;
      const newKey = 'new-secure-key';
      const newLimit = 200;
      const displayName = 'New Key Name';

      const updatedKey = await compilerKeyManager.replaceKey(
        keyIndex,
        newKey,
        newLimit,
        displayName,
        null
      );

      expect(updatedKey.keyIndex).toBe(keyIndex);
      expect(updatedKey.displayName).toBe(displayName);
      expect(updatedKey.maxRequestLimit).toBe(newLimit);
      expect(updatedKey.status).toBe('waiting');
      expect(updatedKey.currentRequestCount).toBe(0);

      // Verify decryption works
      const decrypted = await compilerKeyManager.getDecryptedKey(keyIndex);
      expect(decrypted).toBe(newKey);
    });

    test('should fail to replace key with invalid index', async () => {
      await compilerKeyManager.initialize();
      await expect(
        compilerKeyManager.replaceKey(99, 'key', 100, 'name', 'admin')
      ).rejects.toThrow('Key index must be between 1 and 5');
    });
  });
});
