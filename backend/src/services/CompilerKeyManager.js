// backend/src/services/CompilerKeyManager.js
// Service for managing rotation of 5 OnlineCompiler API keys with persistent state

const mongoose = require('mongoose');
const logger = require('../config/logger');
const { encrypt, decrypt } = require('../utils/encryption');
const CompilerKeyEvent = require('../models/CompilerKeyEvent');
const CompilerKeyPointer = require('../models/CompilerKeyPointer');
const { emailService } = require('./emailService');


/**
 * Compiler Key Schema for persistent storage
 */
const compilerKeySchema = new mongoose.Schema({
  keyIndex: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    unique: true
  },
  displayName: {
    type: String,
    required: true,
    default: function() { return `Key ${this.keyIndex}`; }
  },
  // Encrypted key value for storage
  encryptedKey: {
    type: String,
    required: true
  },
  // Masked key value for display (last 4 chars only)
  maskedKey: {
    type: String,
    required: true
  },
  currentRequestCount: {
    type: Number,
    required: true,
    default: 0
  },
  maxRequestLimit: {
    type: Number,
    required: true,
    default: 1000
  },
  remainingRequests: {
    type: Number,
    required: true,
    default: 1000
  },
  usagePercentage: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'waiting', 'exhausted'],
    default: 'waiting'
  },
  // Track if exhaustion notification has been sent for the current exhaustion cycle
  exhaustionNotified: {
    type: Boolean,
    required: true,
    default: false
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  lastRotatedAt: {
    type: Date,
    default: null
  },
  totalSubmissions: {
    type: Number,
    required: true,
    default: 0
  },
  totalOutboundAttempts: {
    type: Number,
    required: true,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

compilerKeySchema.index({ status: 1 });

const CompilerKey = mongoose.model('CompilerKey', compilerKeySchema);

/**
 * Compiler Key Manager Service
 */
class CompilerKeyManager {
  constructor() {
    this.keys = [];
    this.initialized = false;
  }

  /**
   * Helper to record a persistent audit event
   */
  async _recordEvent(eventType, description, keyIndex, details = {}, actorId = null) {
    try {
      await CompilerKeyEvent.create({
        eventType,
        description,
        keyIndex,
        details,
        actorId,
        timestamp: new Date()
      });
    } catch (error) {
      // Don't fail the operation if audit logging fails, just log it
      logger.error('Failed to record compiler key audit event', { error: error.message, eventType });
    }
  }

  /**
   * Initialize the compiler key manager
   * Loads keys from environment variables and creates/updates MongoDB records
   */
  async initialize() {
    try {
      // Load keys from environment variables
      const keyCount = 5;
      const envKeys = [];

      for (let i = 1; i <= keyCount; i++) {
        const key = process.env[`ONLINE_COMPILER_API_KEY_${i}`];
        if (key) {
          envKeys.push({
            index: i,
            key: key,
            displayName: `Key ${i}`
          });
        } else {
          logger.warn(`Environment variable ONLINE_COMPILER_API_KEY_${i} not found`);
        }
      }

      // If no keys found in indexed format, fall back to single key
      if (envKeys.length === 0) {
        const singleKey = process.env.ONLINE_COMPILER_API_KEY;
        if (singleKey) {
          envKeys.push({
            index: 1,
            key: singleKey,
            displayName: 'Key 1'
          });
          logger.warn('Only single compiler key found in ONLINE_COMPILER_API_KEY, using as Key 1');
        } else {
          throw new Error('No compiler API keys found in environment variables');
        }
      }

      // Initialize or update MongoDB records
      const configuredIndices = envKeys.map(k => k.index);
      await CompilerKey.deleteMany({ keyIndex: { $nin: configuredIndices } }); // Remove stale keys

      for (const keyInfo of envKeys) {
        await this._upsertKeyRecord(keyInfo);
      }

      // Load all configured keys from database
      this.keys = await CompilerKey.find({ keyIndex: { $in: configuredIndices } }).sort('keyIndex');
      this.initialized = true;

      logger.info('Compiler key manager initialized', { keyCount: this.keys.length });
    } catch (error) {
      logger.error('Failed to initialize compiler key manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Upsert a key record in MongoDB
   */
  async _upsertKeyRecord(keyInfo) {
    const maskedKey = this._maskKey(keyInfo.key);
    const encryptedKey = encrypt(keyInfo.key);

    await CompilerKey.findOneAndUpdate(
      { keyIndex: keyInfo.index },
      {
        keyIndex: keyInfo.index,
        displayName: keyInfo.displayName,
        maskedKey: maskedKey,
        encryptedKey: encryptedKey,
        // Only set initial values on insert, preserve existing usage stats
        $setOnInsert: {
          currentRequestCount: 0,
          maxRequestLimit: parseInt(process.env.DEFAULT_COMPILER_KEY_LIMIT) || 1000,
          remainingRequests: parseInt(process.env.DEFAULT_COMPILER_KEY_LIMIT) || 1000,
          usagePercentage: 0,
          status: 'waiting',
          totalSubmissions: 0,
          totalOutboundAttempts: 0,
          createdAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
  }

  /**
   * Mask an API key for display (show only last 4 characters)
   */
  _maskKey(key) {
    if (!key) return '****';
    if (key.length <= 4) return '*'.repeat(key.length);
    return '*'.repeat(key.length - 4) + key.substring(key.length - 4);
  }

  /**
   * Get the currently active key based on persistent sequential pointer
   */
  async getActiveKey() {
    if (!this.initialized) await this.initialize();

    const pointer = await CompilerKeyPointer.getSingleton();
    const currentIdx = pointer.currentKeyIndex;

    const keys = await CompilerKey.find().sort('keyIndex');
    if (keys.length === 0) return null;

    // Find the first non-exhausted key starting from currentIdx sequentially
    let eligibleKey = null;
    let foundIndex = currentIdx;

    for (let i = 0; i < keys.length; i++) {
      const targetIndex = ((currentIdx - 1 + i) % keys.length) + 1;
      const key = keys.find(k => k.keyIndex === targetIndex);

      if (key && key.status !== 'exhausted' && key.currentRequestCount < key.maxRequestLimit) {
        eligibleKey = key;
        foundIndex = key.keyIndex;
        break;
      }
    }

    if (eligibleKey && foundIndex !== currentIdx) {
      await CompilerKeyPointer.updatePointer(foundIndex);
    }

    return eligibleKey;
  }

  /**
   * Reserve a request against the active sequential key atomically
   * Returns the key object if successful, null if no keys available
   */
  async reserveRequest() {
    if (!this.initialized) await this.initialize();

    try {
      const pointer = await CompilerKeyPointer.getSingleton();
      let currentIdx = pointer.currentKeyIndex;

      const keys = await CompilerKey.find().sort('keyIndex');
      if (keys.length === 0) return null;

      // Find the active key
      let key = keys.find(k => k.keyIndex === currentIdx);
      if (!key) {
        key = keys[0];
        currentIdx = key.keyIndex;
        await CompilerKeyPointer.updatePointer(currentIdx);
      }

      // Refresh key status from database to get latest state
      let keyDoc = await CompilerKey.findOne({ _id: key._id });
      if (!keyDoc) {
        this.keys = await CompilerKey.find().sort('keyIndex');
        return await this.reserveRequest();
      }

      Object.assign(key, keyDoc.toObject());

      // Check if current key is exhausted or has reached limit
      if (key.status === 'exhausted' || key.currentRequestCount >= key.maxRequestLimit) {
        if (key.status !== 'exhausted') {
          await CompilerKey.updateOne(
            { _id: key._id },
            {
              status: 'exhausted',
              currentRequestCount: key.maxRequestLimit,
              remainingRequests: 0,
              usagePercentage: 100,
              updatedAt: new Date()
            }
          );
          await compilerKeyManager._recordEvent('quota_exhausted', `Key ${key.keyIndex} exhausted`, key.keyIndex, {}, null);
          if (!keyDoc.exhaustionNotified) {
            const serviceStatus = {
              hasAlternate: await CompilerKey.exists({
                _id: { $ne: key._id },
                status: { $ne: 'exhausted' }
              }),
              status: 'active'
            };
            const sent = await emailService.sendExhaustionNotification(keyDoc, serviceStatus);
            if (sent) {
              await CompilerKey.updateOne({ _id: key._id }, { exhaustionNotified: true });
            }
          }
        }

        // Find next eligible key sequentially
        let nextKey = null;
        for (const k of keys) {
          if (k.keyIndex > currentIdx && k.status !== 'exhausted' && k.currentRequestCount < k.maxRequestLimit) {
            nextKey = k;
            break;
          }
        }
        if (!nextKey) {
          for (const k of keys) {
            if (k.status !== 'exhausted' && k.currentRequestCount < k.maxRequestLimit) {
              nextKey = k;
              break;
            }
          }
        }

        if (!nextKey) {
          return null; // All keys exhausted
        }

        await CompilerKeyPointer.updatePointer(nextKey.keyIndex);
        return await this.reserveRequest();
      }

      // Found an eligible key - reserve the request
      const newCount = key.currentRequestCount + 1;
      const newRemaining = Math.max(0, key.maxRequestLimit - newCount);
      const usagePercentage = (newCount / key.maxRequestLimit) * 100;

      let newStatus = newRemaining > 0 ? 'waiting' : 'exhausted';
      let shouldNotify = false;

      if (newStatus === 'exhausted' && !keyDoc.exhaustionNotified) {
        shouldNotify = true;
      }

      const updatedKey = await CompilerKey.findOneAndUpdate(
        { _id: key._id, currentRequestCount: key.currentRequestCount },
        {
          currentRequestCount: newCount,
          remainingRequests: newRemaining,
          usagePercentage: usagePercentage,
          status: newStatus,
          ...(shouldNotify ? { exhaustionNotified: true } : {}),
          lastUsedAt: new Date(),
          updatedAt: new Date()
        },
        { returnDocument: 'after', runValidators: false }
      );

      if (!updatedKey) {
        // Concurrency conflict - retry
        return await this.reserveRequest();
      }

      if (shouldNotify) {
        await this._recordEvent('quota_exhausted', `Key ${key.keyIndex} exhausted`, key.keyIndex, {}, null);
        const serviceStatus = {
          hasAlternate: await CompilerKey.exists({
            _id: { $ne: key._id },
            status: { $ne: 'exhausted' }
          }),
          status: 'active'
        };
        await emailService.sendExhaustionNotification(updatedKey, serviceStatus);
      }

      // If this request exhausted the key, advance pointer immediately for next requests
      if (newStatus === 'exhausted') {
        let nextKey = null;
        for (const k of keys) {
          if (k.keyIndex > key.keyIndex && k.status !== 'exhausted' && k.currentRequestCount < k.maxRequestLimit) {
            nextKey = k;
            break;
          }
        }
        if (!nextKey) {
          for (const k of keys) {
            if (k.status !== 'exhausted' && k.currentRequestCount < k.maxRequestLimit) {
              nextKey = k;
              break;
            }
          }
        }
        if (nextKey) {
          await CompilerKeyPointer.updatePointer(nextKey.keyIndex);
        }
      }

      await CompilerKey.updateOne(
        { _id: key._id },
        { $inc: { totalOutboundAttempts: 1 }, updatedAt: new Date() }
      );
      updatedKey.totalOutboundAttempts += 1;

      return updatedKey;
    } catch (error) {
      logger.error('Failed to reserve request for compiler key', { error: error.message });
      throw error;
    }
  }

  /**
   * Record a successful submission (separate from outbound API attempts)
   */
  async recordSubmission(keyIndex) {
    if (!this.initialized) await this.initialize();

    try {
      await CompilerKey.updateOne(
        { keyIndex: keyIndex },
        { $inc: { totalSubmissions: 1 }, updatedAt: new Date() }
      );

      // Update local cache
      const key = this.keys.find(k => k.keyIndex === keyIndex);
      if (key) {
        key.totalSubmissions += 1;
        key.updatedAt = new Date();
      }
    } catch (error) {
      logger.error('Failed to record submission for compiler key', {
        keyIndex,
        error: error.message
      });
    }
  }

  /**
   * Get decrypted key for execution
   */
  async getDecryptedKey(keyIndex) {
    const keyDoc = await CompilerKey.findOne({ keyIndex });
    if (keyDoc && keyDoc.encryptedKey) {
      try {
        return decrypt(keyDoc.encryptedKey);
      } catch (e) {
        logger.error('Failed to decrypt key from DB, falling back to env', { keyIndex, error: e.message });
      }
    }
    return process.env[`ONLINE_COMPILER_API_KEY_${keyIndex}`] ||
           (keyIndex === 1 ? process.env.ONLINE_COMPILER_API_KEY : undefined);
  }

  /**
   * Replace a compiler key's secret and optionally its limit/name
   * @param {number} keyIndex - The key index (1-5)
   * @param {string} newKeyVal - The new API key plaintext
   * @param {number} [newLimit] - Optional new request limit
   * @param {string} [displayName] - Optional new display name
   * @param {ObjectId} [actorId] - The ID of the admin user performing the action
   */
  async replaceKey(keyIndex, newKeyVal, newLimit = null, displayName = null, actorId = null) {
    if (!this.initialized) await this.initialize();

    if (keyIndex < 1 || keyIndex > 5) {
      throw new Error('Key index must be between 1 and 5');
    }

    if (!newKeyVal || typeof newKeyVal !== 'string' || newKeyVal.trim() === '') {
      throw new Error('New API key must be a valid non-empty string');
    }

    try {
      const key = await CompilerKey.findOne({ keyIndex });
      if (!key) {
        throw new Error(`Compiler key ${keyIndex} not found`);
      }

      const encryptedKey = encrypt(newKeyVal);
      const maskedKey = this._maskKey(newKeyVal);

      const updateData = {
        encryptedKey,
        maskedKey,
        currentRequestCount: 0,
        status: 'waiting',
        exhaustionNotified: false,
        lastUsedAt: null,
        updatedAt: new Date()
      };

      if (newLimit !== null && newLimit !== undefined) {
        if (!Number.isInteger(newLimit) || newLimit <= 0) {
          throw new Error('Limit must be a positive integer');
        }
        updateData.maxRequestLimit = newLimit;
        updateData.remainingRequests = newLimit;
        updateData.usagePercentage = 0;
      } else {
        updateData.remainingRequests = key.maxRequestLimit;
        updateData.usagePercentage = 0;
      }

      if (displayName) {
        updateData.displayName = displayName;
      }

      const updatedKey = await CompilerKey.findOneAndUpdate(
        { keyIndex },
        updateData,
        { returnDocument: 'after' }
      );

      process.env[`ONLINE_COMPILER_API_KEY_${keyIndex}`] = newKeyVal;
      if (keyIndex === 1) {
        process.env.ONLINE_COMPILER_API_KEY = newKeyVal;
      }

      const cachedKey = this.keys.find(k => k.keyIndex === keyIndex);
      if (cachedKey) {
        Object.assign(cachedKey, updatedKey.toObject());
      } else {
        this.keys = await CompilerKey.find().sort('keyIndex');
      }

      logger.info(`Compiler key ${keyIndex} replaced successfully`);
      await this._recordEvent('key_replaced', `Key ${keyIndex} was replaced with a new secret`, keyIndex, {}, actorId);

      return updatedKey;
    } catch (error) {
      logger.error('Failed to replace compiler key', { keyIndex, error: error.message });
      throw error;
    }
  }

  /**
   * Update the maximum request limit for a key
   * @param {number} keyIndex - The key index (1-5)
   * @param {number} newLimit - The new request limit
   * @param {ObjectId} [actorId] - The ID of the admin user performing the action (optional)
   */
  async updateLimit(keyIndex, newLimit, actorId = null) {
    if (!this.initialized) await this.initialize();

    // Validate input
    if (keyIndex < 1 || keyIndex > 5) {
      throw new Error('Key index must be between 1 and 5');
    }

    if (!Number.isInteger(newLimit) || newLimit <= 0) {
      throw new Error('Limit must be a positive integer');
    }

    // Apply reasonable upper bound (e.g., 1,000,000 requests)
    const MAX_LIMIT = 1000000;
    if (newLimit > MAX_LIMIT) {
      throw new Error(`Limit cannot exceed ${MAX_LIMIT}`);
    }

    try {
      const key = await CompilerKey.findOne({ keyIndex: keyIndex });
      if (!key) {
        throw new Error(`Compiler key ${keyIndex} not found`);
      }

      const oldLimit = key.maxRequestLimit;
      key.maxRequestLimit = newLimit;

      // Recalculate remaining requests and usage percentage
      if (key.currentRequestCount >= newLimit) {
        // Current usage exceeds new limit - mark as exhausted
        key.remainingRequests = 0;
        key.usagePercentage = 100;
        key.status = 'exhausted';
        // If we weren't already exhausted, we might need a notification
        if (!key.exhaustionNotified) {
          key.exhaustionNotified = true;
          // Record exhaustion event
          await this._recordEvent('quota_exhausted', `Key ${keyIndex} exhausted due to limit update`, keyIndex, {}, actorId);
          const serviceStatus = {
            hasAlternate: await CompilerKey.exists({
              keyIndex: { $ne: keyIndex },
              status: { $ne: 'exhausted' }
            }),
            status: 'active'
          };
          await emailService.sendExhaustionNotification(key, serviceStatus);
        }
      } else {
        key.remainingRequests = newLimit - key.currentRequestCount;
        key.usagePercentage = ((key.currentRequestCount / newLimit) * 100).toFixed(2);

        // Update status based on remaining requests
        if (key.remainingRequests === 0) {
          key.status = 'exhausted';
        } else if (key.status === 'exhausted') {
          // Was exhausted, now has capacity - set to waiting, reset notified status
          key.status = 'waiting';
          key.exhaustionNotified = false;
        }
      }

      // Save to database
      const updatedKey = await CompilerKey.findOneAndUpdate(
        { keyIndex: keyIndex },
        {
          maxRequestLimit: newLimit,
          remainingRequests: key.remainingRequests,
          usagePercentage: parseFloat(key.usagePercentage),
          status: key.status,
          exhaustionNotified: key.exhaustionNotified,
          updatedAt: new Date()
        },
        { returnDocument: 'after', runValidators: false }
      );

      // Update local cache
      const cachedKey = this.keys.find(k => k.keyIndex === keyIndex);
      if (cachedKey) {
        Object.assign(cachedKey, updatedKey.toObject());
      }

      logger.info(`Compiler key ${keyIndex} limit updated`, {
        oldLimit,
        newLimit,
        currentUsage: key.currentRequestCount
      });

      await this._recordEvent('limit_updated', `Key ${keyIndex} limit updated from ${oldLimit} to ${newLimit}`, keyIndex, { oldLimit, newLimit }, actorId);

      return updatedKey;
    } catch (error) {
      logger.error('Failed to update compiler key limit', {
        keyIndex,
        newLimit,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reset an individual key's usage counter
   * @param {number} keyIndex - The key index (1-5)
   * @param {ObjectId} [actorId] - The ID of the admin user performing the action (optional)
   */
  async resetKey(keyIndex, actorId = null) {
    if (!this.initialized) await this.initialize();

    // Validate input
    if (keyIndex < 1 || keyIndex > 5) {
      throw new Error('Key index must be between 1 and 5');
    }

    try {
      const key = await CompilerKey.findOne({ keyIndex: keyIndex });
      if (!key) {
        throw new Error(`Compiler key ${keyIndex} not found`);
      }

      // Reset counters but preserve historical totals
      await CompilerKey.updateOne(
        { keyIndex: keyIndex },
        {
          currentRequestCount: 0,
          remainingRequests: key.maxRequestLimit,
          usagePercentage: 0,
          status: 'waiting',
          lastUsedAt: null,
          updatedAt: new Date()
        }
      );

      // Update local cache
      const cachedKey = this.keys.find(k => k.keyIndex === keyIndex);
      if (cachedKey) {
        cachedKey.currentRequestCount = 0;
        cachedKey.remainingRequests = key.maxRequestLimit;
        cachedKey.usagePercentage = 0;
        cachedKey.status = 'waiting';
        cachedKey.lastUsedAt = null;
        cachedKey.updatedAt = new Date();
      }

      logger.info(`Compiler key ${keyIndex} reset`);
      await this._recordEvent('key_reset', `Key ${keyIndex} usage counter reset`, keyIndex);

      // Return updated key
      return await CompilerKey.findOne({ keyIndex: keyIndex });
    } catch (error) {
      logger.error('Failed to reset compiler key', {
        keyIndex,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reset all keys' usage counters
   * @param {boolean} confirm - Confirmation flag
   * @param {ObjectId} [actorId] - The ID of the admin user performing the action (optional)
   */
  async resetAllKeys(confirm = false, actorId = null) {
    if (!confirm) {
      throw new Error('Confirmation required to reset all keys');
    }

    if (!this.initialized) await this.initialize();

    try {
      const limit = parseInt(process.env.DEFAULT_COMPILER_KEY_LIMIT) || 1000;
      // Use bulk operation to reset all keys
      const result = await CompilerKey.updateMany(
        {},
        {
          currentRequestCount: 0,
          remainingRequests: limit,
          usagePercentage: 0,
          status: 'waiting',
          lastUsedAt: null,
          updatedAt: new Date()
        }
      );

      // Update local cache
      for (const key of this.keys) {
        key.currentRequestCount = 0;
        key.remainingRequests = limit;
        key.usagePercentage = 0;
        key.status = 'waiting';
        key.lastUsedAt = null;
        key.updatedAt = new Date();
      }

      logger.info('All compiler keys reset', { modifiedCount: result.modifiedCount });
      await this._recordEvent('all_keys_reset', 'All compiler keys usage counters reset', null, { modifiedCount: result.modifiedCount });

      return await CompilerKey.find().sort('keyIndex');
    } catch (error) {
      logger.error('Failed to reset all compiler keys', { error: error.message });
      throw error;
    }
  }

  /**
   * Get status of all keys
   */
  async getAllKeysStatus() {
    if (!this.initialized) await this.initialize();

    // Return fresh data from database
    return await CompilerKey.find().sort('keyIndex');
  }

  /**
   * Get rotation logs
   */
  async getLogs(options = {}) {
    if (!this.initialized) await this.initialize();

    const limit = options.limit || 50;
    const page = options.page || 1;
    const skip = (page - 1) * limit;

    const total = await CompilerKeyEvent.countDocuments();
    const logs = await CompilerKeyEvent.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

// Export singleton instance
const compilerKeyManager = new CompilerKeyManager();
module.exports = { compilerKeyManager, CompilerKey };