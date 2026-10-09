const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Batch = require('../../models/Batch');
const Problem = require('../../models/Problem');

/**
 * GET /admin/recent-activity
 * Returns recent platform activities from various sources
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Fetch activities from different sources
    const [batches, problems, students, trainers] = await Promise.all([
      // Batches
      Batch.find({}, { name: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .then(docs => docs.map(doc => ({
          id: doc._id.toString(),
          type: 'batch_created',
          title: `New batch "${doc.name}" created`,
          timestamp: doc.createdAt
        }))),
      // Problems
      Problem.find({}, { name: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .then(docs => docs.map(doc => ({
          id: doc._id.toString(),
          type: 'problem_created',
          title: 'New problem added',
          timestamp: doc.createdAt
        }))),
      // Students (users with role STUDENT)
      User.find({ role: 'STUDENT' }, { name: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .then(docs => docs.map(doc => ({
          id: doc._id.toString(),
          type: 'student_registered',
          title: 'Student registration completed',
          timestamp: doc.createdAt
        }))),
      // Trainers (users with role TRAINER)
      User.find({ role: 'TRAINER' }, { name: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .then(docs => docs.map(doc => ({
          id: doc._id.toString(),
          type: 'trainer_registered',
          title: 'Trainer registered',
          timestamp: doc.createdAt
        })))
    ]);

    // Combine and sort by timestamp descending
    const allActivities = [...batches, ...problems, ...students, ...trainers]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    // Format timestamp to ISO string (already is Date, but lean() returns Date)
    const activities = allActivities.map(activity => ({
      ...activity,
      timestamp: activity.timestamp.toISOString()
    }));

    res.json({ success: true, activities });
  } catch (err) {
    console.error('Error fetching recent activity:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;