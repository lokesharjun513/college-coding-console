const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { requireRole, requireAnyRole } = require('../middleware/role');

// ADMIN only
router.get('/admin', requireAuth, requireRole('ADMIN'), (req, res) => {
  res.json({ success: true, message: 'admin access granted' });
});

// TRAINER only
router.get('/trainer', requireAuth, requireRole('TRAINER'), (req, res) => {
  res.json({ success: true, message: 'trainer access granted' });
});

// STUDENT only
router.get('/student', requireAuth, requireRole('STUDENT'), (req, res) => {
  res.json({ success: true, message: 'student access granted' });
});

// ADMIN or TRAINER (staff)
router.get('/staff', requireAuth, requireAnyRole('ADMIN', 'TRAINER'), (req, res) => {
  res.json({ success: true, message: 'staff access granted' });
});

module.exports = router;
