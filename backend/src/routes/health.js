const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const success = dbState === 'connected';
  res.json({
    success,
    message: 'API is healthy',
    database: dbState,
  });
});

module.exports = router;
