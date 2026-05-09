/**
 * Interest Routes
 * GET /api/interests/:userId  — ranked tag interest profile
 */
const express = require('express');
const router = express.Router();
const { getInterests } = require('../controllers/interestController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Protected — must be logged in to view interest profiles
router.get('/:userId', authenticateToken, getInterests);

module.exports = router;