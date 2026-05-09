/**
 * Activity Routes
 * Protected routes - require authentication
 */
const express = require('express');
const router = express.Router();
const { getActivity, getSummary } = require('../controllers/activityController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * GET /api/activity/:userId
 * All activity for a user. Query: ?type=post_viewed&page=1&limit=20
 * Protected - requires valid JWT
 */
router.get('/:userId', authenticateToken, getActivity);

/**
 * GET /api/activity/:userId/summary
 * Aggregated stats: posts viewed, quiz attempts, avg score
 * Protected - requires valid JWT
 */
router.get('/:userId/summary', authenticateToken, getSummary);

module.exports = router;
