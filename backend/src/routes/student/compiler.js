// backend/src/routes/student/compiler.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireAnyRole } = require('../../middleware/role');
const { getCompilers } = require('../../services/compilerRegistry');

// GET /api/student/compilers
router.get('/', requireAuth, requireAnyRole('STUDENT'), async (req, res) => {
  try {
    const compilers = await getCompilers();
    return res.json({ success: true, data: compilers });
  } catch (err) {
    console.error('Failed to get compilers:', err);
    return res.status(500).json({ success: false, message: 'Unable to fetch compilers' });
  }
});

module.exports = router;
