// backend/src/routes/admin/compilerKeys.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const verifyAdminPassword = require('../../middleware/verifyPassword');
const { compilerKeyManager } = require('../../services/CompilerKeyManager');

/**
 * GET /api/admin/compiler-keys
 * Get status of all compiler keys
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const keys = await compilerKeyManager.getAllKeysStatus();
    const activeKey = await compilerKeyManager.getActiveKey();

    // Calculate summary stats
    const totalSubmissions = keys.reduce((sum, key) => sum + key.totalSubmissions, 0);
    const totalRequestsUsed = keys.reduce((sum, key) => sum + key.currentRequestCount, 0);
    const totalRemainingCapacity = keys.reduce((sum, key) => sum + key.remainingRequests, 0);

    const response = {
      success: true,
      data: {
        activeKeyIndex: activeKey ? activeKey.keyIndex : null,
        keys: keys.map(key => ({
          keyIndex: key.keyIndex,
          displayName: key.displayName,
          maskedKey: key.maskedKey,
          currentRequestCount: key.currentRequestCount,
          maxRequestLimit: key.maxRequestLimit,
          remainingRequests: key.remainingRequests,
          usagePercentage: key.usagePercentage,
          status: key.status,
          exhaustionNotified: key.exhaustionNotified,
          lastUsedAt: key.lastUsedAt,
          lastRotatedAt: key.lastRotatedAt,
          totalSubmissions: key.totalSubmissions,
          totalOutboundAttempts: key.totalOutboundAttempts,
          updatedAt: key.updatedAt
        })),
        summary: {
          totalSubmissions,
          totalRequestsUsed,
          totalRemainingCapacity
        },
        timestamp: new Date()
      }
    };

    return res.json(response);
  } catch (error) {
    console.error('Error fetching compiler keys status:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/compiler-keys/:keyIndex
 * Replace a key's secret and optionally its limit
 */
router.patch('/:keyIndex', requireAuth, requireRole('ADMIN'), verifyAdminPassword, async (req, res) => {
  try {
    const keyIndex = parseInt(req.params.keyIndex, 10);
    const { newKey, limit, displayName } = req.body;

    if (isNaN(keyIndex)) {
      return res.status(400).json({ success: false, message: 'Invalid key index' });
    }

    const updatedKey = await compilerKeyManager.replaceKey(
        keyIndex,
        newKey,
        limit ? parseInt(limit, 10) : null,
        displayName,
        req.user.id
    );

    return res.json({
      success: true,
      data: {
        keyIndex: updatedKey.keyIndex,
        displayName: updatedKey.displayName,
        maskedKey: updatedKey.maskedKey,
        currentRequestCount: updatedKey.currentRequestCount,
        maxRequestLimit: updatedKey.maxRequestLimit,
        remainingRequests: updatedKey.remainingRequests,
        usagePercentage: updatedKey.usagePercentage,
        status: updatedKey.status,
        exhaustionNotified: updatedKey.exhaustionNotified,
        lastUsedAt: updatedKey.lastUsedAt,
        updatedAt: updatedKey.updatedAt
      }
    });
  } catch (error) {
    console.error('Error replacing compiler key:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/compiler-keys/:keyIndex/limit
 * Update a key's maximum request limit
 */
router.patch('/:keyIndex/limit', requireAuth, requireRole('ADMIN'), verifyAdminPassword, async (req, res) => {
  try {
    const keyIndex = parseInt(req.params.keyIndex, 10);
    const { limit } = req.body;
    const parsedLimit = limit ? parseInt(limit, 10) : null;

    if (isNaN(keyIndex)) {
      return res.status(400).json({ success: false, message: 'Invalid key index' });
    }

    const updatedKey = await compilerKeyManager.updateLimit(keyIndex, parsedLimit, req.user ? req.user.id : null);

    return res.json({
      success: true,
      data: {
        keyIndex: updatedKey.keyIndex,
        displayName: updatedKey.displayName,
        maskedKey: updatedKey.maskedKey,
        currentRequestCount: updatedKey.currentRequestCount,
        maxRequestLimit: updatedKey.maxRequestLimit,
        remainingRequests: updatedKey.remainingRequests,
        usagePercentage: updatedKey.usagePercentage,
        status: updatedKey.status,
        exhaustionNotified: updatedKey.exhaustionNotified,
        lastUsedAt: updatedKey.lastUsedAt,
        updatedAt: updatedKey.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating compiler key limit:', error);
    if (error.message.includes('must be between 1 and 5') ||
        error.message.includes('Limit must be a positive integer') ||
        error.message.includes('Limit cannot exceed')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * POST /api/admin/compiler-keys/:keyIndex/reset
 * Reset an individual key's usage counter
 */
router.post('/:keyIndex/reset', requireAuth, requireRole('ADMIN'), verifyAdminPassword, async (req, res) => {
  try {
    const keyIndex = parseInt(req.params.keyIndex, 10);

    if (isNaN(keyIndex)) {
      return res.status(400).json({ success: false, message: 'Invalid key index' });
    }

    const resetKey = await compilerKeyManager.resetKey(keyIndex, req.user ? req.user.id : null);

    return res.json({
      success: true,
      data: {
        keyIndex: resetKey.keyIndex,
        displayName: resetKey.displayName,
        maskedKey: resetKey.maskedKey,
        currentRequestCount: resetKey.currentRequestCount,
        maxRequestLimit: resetKey.maxRequestLimit,
        remainingRequests: resetKey.remainingRequests,
        usagePercentage: resetKey.usagePercentage,
        status: resetKey.status,
        exhaustionNotified: resetKey.exhaustionNotified,
        lastUsedAt: resetKey.lastUsedAt,
        updatedAt: resetKey.updatedAt
      }
    });
  } catch (error) {
    console.error('Error resetting compiler key:', error);
    if (error.message.includes('must be between 1 and 5')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * POST /api/admin/compiler-keys/reset-all
 * Reset all keys' usage counters
 */
router.post('/reset-all', requireAuth, requireRole('ADMIN'), verifyAdminPassword, async (req, res) => {
  try {
    // Require explicit confirmation
    const { confirm } = req.body;
    if (confirm !== true && confirm !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Explicit confirmation required to reset all keys'
      });
    }

    const resetKeys = await compilerKeyManager.resetAllKeys(confirm, req.user ? req.user.id : null);

    return res.json({
      success: true,
      data: {
        keys: resetKeys.map(key => ({
          keyIndex: key.keyIndex,
          displayName: key.displayName,
          maskedKey: key.maskedKey,
          currentRequestCount: key.currentRequestCount,
          maxRequestLimit: key.maxRequestLimit,
          remainingRequests: key.remainingRequests,
          usagePercentage: key.usagePercentage,
          status: key.status,
          exhaustionNotified: key.exhaustionNotified,
          lastUsedAt: key.lastUsedAt,
          updatedAt: key.updatedAt
        })),
        message: 'All compiler keys have been reset. Historical submission totals preserved.'
      }
    });
  } catch (error) {
    console.error('Error resetting all compiler keys:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/compiler-keys/logs
 * Get historical logs for compiler key activity
 */
router.get('/logs', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const logsData = await compilerKeyManager.getLogs({ page: parseInt(page), limit: parseInt(limit) });

    return res.json({
      success: true,
      data: logsData
    });
  } catch (error) {
    console.error('Error fetching compiler keys logs:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;