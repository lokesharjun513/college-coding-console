const express = require('express');
const router = express.Router();
const Setting = require('../../models/Setting');
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');

// Helper to get or create default settings
async function getOrCreateSettings() {
  let settings = await Setting.findOne({ key: 'platform' }).lean();
  if (!settings) {
    const created = await Setting.create({ key: 'platform' });
    settings = created.toObject();
  }
  delete settings.__v;
  return settings;
}

// GET /api/admin/settings
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch settings' });
  }
});

// PATCH /api/admin/settings
router.patch('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const allowedFields = [
      'platformTitle',
      'registrationEnabled',
      'maintenanceMode',
      'submissionsEnabled',
      'maxSubmissionsPerDay',
      'defaultTimeLimit',
      'defaultMemoryLimit',
    ];

    const updates = {};
    const bodyKeys = Object.keys(req.body);

    for (const key of bodyKeys) {
      if (!allowedFields.includes(key)) {
        return res.status(400).json({ success: false, message: `Unknown or unauthorized field: ${key}` });
      }
      updates[key] = req.body[key];
    }

    // Validation
    if (updates.platformTitle !== undefined) {
      if (typeof updates.platformTitle !== 'string' || !updates.platformTitle.trim() || updates.platformTitle.trim().length > 200) {
        return res.status(400).json({ success: false, message: 'Invalid platformTitle' });
      }
      updates.platformTitle = updates.platformTitle.trim();
    }

    const booleanFields = ['registrationEnabled', 'maintenanceMode', 'submissionsEnabled'];
    for (const field of booleanFields) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] !== 'boolean') {
          return res.status(400).json({ success: false, message: `Field ${field} must be a boolean` });
        }
      }
    }

    const numberFields = {
      maxSubmissionsPerDay: { min: 1, max: 1000 },
      defaultTimeLimit: { min: 100, max: 60000 },
      defaultMemoryLimit: { min: 16, max: 1048576 },
    };

    for (const [field, range] of Object.entries(numberFields)) {
      if (updates[field] !== undefined) {
        const val = updates[field];
        if (typeof val !== 'number' || !Number.isInteger(val) || val < range.min || val > range.max) {
          return res.status(400).json({ success: false, message: `Field ${field} must be an integer between ${range.min} and ${range.max}` });
        }
      }
    }

    let settingsDoc = await Setting.findOne({ key: 'platform' });
    if (!settingsDoc) {
      settingsDoc = new Setting({ key: 'platform' });
    }

    for (const [key, val] of Object.entries(updates)) {
      settingsDoc[key] = val;
    }

    await settingsDoc.save();

    const result = settingsDoc.toObject();
    delete result.__v;

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to update settings' });
  }
});

module.exports = router;
