/**
 * Feed Service — personalised, scored content feed
 *
 * Scoring (max 100 pts):
 *   Recency       40 pts  — linear decay over 30 days
 *   Verification  30 pts  — expert=30, reviewed=20, ai=10, unverified=0
 *   Tag Relevance 30 pts  — normalised against user's top interest count
 *
 * Personalisation:
 *   - Authenticated users: tag relevance drawn from user_interests (PostgreSQL)
 *   - Guests: tag relevance is always 0; feed degrades gracefully to recency+verification
 *   - No interests recorded yet: same graceful degradation (no errors, no empty feeds)
 *
 * Performance:
 *   - Fetches SCORE_POOL_MULTIPLIER × page_size docs for in-memory scoring
 *   - User interests fetched in parallel with posts via Promise.all
 *   - Interest lookup capped at 50 tags (sufficient for scoring, small payload)
 */

'use strict';

const Post = require('../models/mongo/Post');
const { logActivity } = require('./activityService');
const { getUserInterests } = require('./interestService');
const logger = require('../utils/logger');
const { NotFoundError, ValidationError } = require('../utils/AppError');

// ─── Verification priority lookup ──────────────────────────────────────────────

const VERIFICATION_PRIORITY = {
  expert: 3,
  reviewed: 2,
  ai: 1,
  unverified: 0,
};

// ─── Scoring weights (must sum to 100) ────────────────────────────────────────

const WEIGHTS = {
  recency: 40,
  verification: 30,
  tagRelevance: 30,
};

// ─── Individual scoring functions ─────────────────────────────────────────────

/**
 * Recency score — linear decay from 40 (brand new) → 0 (≥ 30 days old).
 * @param {Date|string} createdAt
 * @returns {number} 0–40
 */
const recencyScore = (createdAt) => {
  const DECAY_DAYS = 30;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  const ratio = Math.max(0, 1 - ageDays / DECAY_DAYS);
  return Math.round(ratio * WEIGHTS.recency * 100) / 100;
};

/**
 * Verification score — maps level to a share of 30 pts.
 * @param {boolean|string} verified
 * @param {string} verificationLevel
 * @returns {number} 0–30
 */
const verificationScore = (verified, verificationLevel) => {
  if (!verified) return 0;
  const level = VERIFICATION_PRIORITY[verificationLevel] ?? 0; // 0–3
  return Math.round((level / 3) * WEIGHTS.verification * 100) / 100;
};

/**
 * Tag relevance score — how well post tags match user's interest profile.
 *
 * Algorithm:
 *   1. Build { tag → interactionCount } map from user interests.
 *   2. For each post tag, sum normalised counts (each count / maxCount).
 *   3. Average across post tags → ratio in [0, 1].
 *   4. Scale to [0, 30].
 *
 * Returns 0 for guests or users with no recorded interests (safe fallback).
 *
 * @param {string[]} postTags
 * @param {Array<{ tag: string, interactionCount: number }>} userInterests
 * @returns {number} 0–30
 */
const tagRelevanceScore = (postTags = [], userInterests = []) => {
  if (!userInterests.length || !postTags.length) return 0;

  const interestMap = new Map(
    userInterests.map((i) => [i.tag.toLowerCase(), i.interactionCount])
  );

  const maxCount = Math.max(...userInterests.map((i) => i.interactionCount));
  if (maxCount === 0) return 0;

  let totalNorm = 0;
  for (const tag of postTags) {
    totalNorm += (interestMap.get(tag.toLowerCase()) ?? 0) / maxCount;
  }

  // Average normalised score, capped at 1
  const ratio = Math.min(totalNorm / postTags.length, 1);
  return Math.round(ratio * WEIGHTS.tagRelevance * 100) / 100;
};

/**
 * Composite score for a single post.
 * @param {Object} post
 * @param {Array}  userInterests
 * @returns {{ recency: number, verification: number, tagRelevance: number, total: number }}
 */
const computeScore = (post, userInterests) => {
  const recency      = recencyScore(post.createdAt);
  const verification = verificationScore(post.verified, post.verificationLevel);
  const tagRelevance = tagRelevanceScore(post.tags, userInterests);
  return { recency, verification, tagRelevance, total: recency + verification + tagRelevance };
};

// ─── Verification stats helper ─────────────────────────────────────────────────

const getVerificationStats = (posts) =>
  posts.reduce(
    (acc, post) => {
      acc.total++;
      if (post.verified) {
        acc.verified++;
        if (post.verificationLevel === 'expert') acc.expert++;
        else if (post.verificationLevel === 'reviewed') acc.reviewed++;
        else if (post.verificationLevel === 'ai') acc.ai++;
      } else {
        acc.unverified++;
      }
      return acc;
    },
    { total: 0, verified: 0, expert: 0, reviewed: 0, ai: 0, unverified: 0 }
  );

// ─── Main feed function ────────────────────────────────────────────────────────

/**
 * Personalised, paginated feed with composite scoring.
 *
 * @param {Object}      options
 * @param {number}      options.page
 * @param {number}      options.limit
 * @param {string}      [options.tag]               - Filter by tag
 * @param {boolean}     [options.verified]           - Filter by verified status
 * @param {string}      [options.verificationLevel]  - 'ai' | 'reviewed' | 'expert'
 * @param {string}      [options.select]             - Mongoose field projection
 * @param {string|null} [options.userId]             - null = guest (no personalisation)
 */
const getFeed = async ({
  page = 1,
  limit = 10,
  tag,
  verified,
  verificationLevel,
  select,
  userId = null,
} = {}) => {
  const skip = (page - 1) * limit;

  // ── Build MongoDB filter ────────────────────────────────────────────────
  const query = {};
  if (tag) query.tags = tag;

  if (verified !== undefined) {
    query.verified = verified === true || verified === 'true';
  }

  if (verificationLevel) {
    if (['ai', 'reviewed', 'expert'].includes(verificationLevel)) {
      query.verificationLevel = verificationLevel;
    } else {
      logger.warn('Invalid verificationLevel filter ignored', { verificationLevel });
    }
  }

  // ── Fetch in parallel ───────────────────────────────────────────────────
  // Over-fetch so in-memory sort is meaningful before we slice the page.
  const SCORE_POOL_MULTIPLIER = 5;
  const poolSize = skip + limit * SCORE_POOL_MULTIPLIER;

  const [rawPosts, total, userInterests] = await Promise.all([
    Post.find(query)
      .select(select || undefined)
      .sort({ createdAt: -1 }) // rough pre-sort: pool starts with freshest docs
      .limit(poolSize)
      .lean(),
    Post.countDocuments(query),
    userId
      ? getUserInterests(userId, { sortBy: 'count', limit: 50 }).catch((err) => {
          // Personalisation failure must never break the feed
          logger.warn('Could not load user interests — falling back to general feed', {
            userId,
            error: err.message,
          });
          return [];
        })
      : Promise.resolve([]),
  ]);

  const isPersonalised = userInterests.length > 0;

  // ── Score, sort, paginate ───────────────────────────────────────────────
  const scoredPosts = rawPosts
    .map((post) => {
      const scores = computeScore(post, userInterests);
      return {
        ...post,
        verificationPriority: VERIFICATION_PRIORITY[post.verificationLevel] ?? 0,
        isExpertVerified: post.verified && post.verificationLevel === 'expert',
        _score: scores,
      };
    })
    .sort((a, b) => b._score.total - a._score.total);

  const paginated = scoredPosts.slice(skip, skip + limit);

  logger.info('Feed generated', {
    userId: userId ?? 'guest',
    personalised: isPersonalised,
    interestTagCount: userInterests.length,
    postsFetched: rawPosts.length,
    postsReturned: paginated.length,
    page,
  });

  return {
    posts: paginated,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
    meta: {
      scoringWeights: WEIGHTS,
      personalised: isPersonalised,
      interestTagsUsed: userInterests.length,
      verificationStats: getVerificationStats(paginated),
    },
  };
};

// ─── Single post ───────────────────────────────────────────────────────────────

/**
 * Single post by ID. Increments view count, logs activity, tracks tags.
 * All side-effects are fire-and-forget.
 *
 * @param {string}      postId
 * @param {string|null} userId
 */
const getPostById = async (postId, userId = null) => {
  if (!postId) throw new ValidationError('postId is required');

  const post = await Post.findByIdAndUpdate(
    postId,
    { $inc: { views: 1 } },
    { new: true }
  )
    .populate('author', 'name email role')
    .populate('verifiedBy', 'name email role')
    .lean();

  if (!post) throw new NotFoundError('Post not found');

  post.verificationPriority = VERIFICATION_PRIORITY[post.verificationLevel] ?? 0;
  post.isExpertVerified = post.verified && post.verificationLevel === 'expert';

  if (userId) {
    // Fire-and-forget — never block the response
    logActivity(userId, 'post_viewed', {
      postId: post._id,
      postTitle: post.title,
      verificationLevel: post.verificationLevel,
    });

    if (post.tags?.length) {
      const { trackTagInteractions } = require('./interestService');
      trackTagInteractions(userId, post.tags);
    }
  }

  return post;
};

// ─── Verified posts ────────────────────────────────────────────────────────────

/**
 * Expert/reviewed posts via aggregation — used by GET /api/feed/verified.
 * @param {Object} options
 * @param {number} options.limit
 * @param {string} options.level
 */
const getPostsByVerificationLevel = async ({ limit = 10, level } = {}) => {
  const matchStage = { verified: true };
  if (level && ['ai', 'reviewed', 'expert'].includes(level)) {
    matchStage.verificationLevel = level;
  }

  return Post.aggregate([
    { $match: matchStage },
    {
      $addFields: {
        verificationPriority: {
          $switch: {
            branches: [
              { case: { $eq: ['$verificationLevel', 'expert'] }, then: 3 },
              { case: { $eq: ['$verificationLevel', 'reviewed'] }, then: 2 },
              { case: { $eq: ['$verificationLevel', 'ai'] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    },
    { $sort: { verificationPriority: -1, createdAt: -1 } },
    { $limit: limit },
  ]);
};

// ─── Verify a post ─────────────────────────────────────────────────────────────

/**
 * Mark a post as verified at a given level.
 * @param {string}   postId
 * @param {ObjectId} verifiedBy
 * @param {string}   level
 */
const verifyPost = async (postId, verifiedBy, level = 'reviewed') => {
  const post = await Post.findById(postId);
  if (!post) throw new NotFoundError('Post not found');

  await post.markAsVerified(verifiedBy, level);
  logger.info('Post verified', { postId: post._id, verifiedBy, level });

  return post;
};

module.exports = {
  getFeed,
  getPostById,
  getPostsByVerificationLevel,
  verifyPost,
  VERIFICATION_PRIORITY,
  // Exported for unit testing
  recencyScore,
  verificationScore,
  tagRelevanceScore,
  computeScore,
};