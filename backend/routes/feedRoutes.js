const express = require('express');
const router = express.Router();
const {
  getFeed,
  getPostById,
  getVerifiedPosts,
  verifyPost,
} = require('../controllers/feedController');
const {
  authenticateToken,
  optionalAuth,
} = require('../middleware/authMiddleware');

router.get('/feed', optionalAuth, getFeed);
router.get('/feed/verified', getVerifiedPosts);
router.get('/post/:id', optionalAuth, getPostById);
router.post('/post/:id/verify', authenticateToken, verifyPost);

module.exports = router;