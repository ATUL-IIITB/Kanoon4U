/**
 * Feed Controller
 * Handles content feed operations with verification support
 */
const feedService = require('../services/feedService');
const { paginated, success, created } = require('../utils/apiResponse');
const { ValidationError } = require('../utils/AppError');

/**
 * GET /api/feed
 * Get paginated feed of posts with verification filtering
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 * - tag: Filter by tag
 * - verified: Filter by verified status (true/false)
 * - verificationLevel: Filter by level ('ai', 'reviewed', 'expert')
 * - prioritizeVerified: Sort verified content first (true/false)
 * - select: Field projection (e.g., "title summary tags")
 */
const getFeed = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      tag,
      verified,
      verificationLevel,
      prioritizeVerified,
      select,
    } = req.query;

    const result = await feedService.getFeed({
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 10, 100),
      tag,
      verified: verified !== undefined ? verified === 'true' : undefined,
      verificationLevel,
      prioritizeVerified: prioritizeVerified === 'true',
      select,
    });

    return paginated(res, result.posts, {
      page: result.pagination.currentPage,
      limit: 10,
      total: result.pagination.totalPosts,
      totalPages: result.pagination.totalPages,
    }, 'Feed retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/post/:id
 * Get a single post by ID with verification details
 */
const getPostById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id; // From auth middleware if protected

    const post = await feedService.getPostById(id, userId);

    return success(res, post, 'Post retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/feed/verified
 * Get only verified posts, prioritized by verification level
 *
 * Query params:
 * - limit: Max results (default: 10)
 * - level: Specific verification level ('ai', 'reviewed', 'expert')
 */
const getVerifiedPosts = async (req, res, next) => {
  try {
    const { limit, level } = req.query;

    const posts = await feedService.getPostsByVerificationLevel({
      limit: Math.min(parseInt(limit) || 10, 50),
      level,
    });

    return success(res, posts, 'Verified posts retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/post/:id/verify
 * Mark a post as verified (requires expert/admin role)
 *
 * Body:
 * - level: Verification level ('ai', 'reviewed', 'expert')
 */
const verifyPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { level = 'reviewed' } = req.body;

    // Validate verification level
    if (!['ai', 'reviewed', 'expert'].includes(level)) {
      throw new ValidationError(
        'Invalid verification level. Must be one of: ai, reviewed, expert'
      );
    }

    // Require expert role for expert verification
    if (level === 'expert' && req.user?.role !== 'expert') {
      const { ForbiddenError } = require('../utils/AppError');
      throw new ForbiddenError('Expert verification requires expert role');
    }

    const post = await feedService.verifyPost(id, req.user?.id, level);

    return created(res, post, `Post verified as ${level}`);
  } catch (error) {
    next(error);
  }
};

module.exports = { getFeed, getPostById, getVerifiedPosts, verifyPost };
