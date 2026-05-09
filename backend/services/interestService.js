/**
 * Interest Service
 * Tracks and retrieves user tag interest profiles stored in PostgreSQL.
 *
 * user_interests schema:
 *   userId           UUID  → references Users(id) ON DELETE CASCADE
 *   tag              VARCHAR(100)
 *   interactionCount INTEGER  (incremented on every post_viewed)
 *   lastInteractedAt TIMESTAMPTZ
 *   UNIQUE (userId, tag)
 */
const UserInterest = require('../models/postgres/UserInterest');
const logger = require('../utils/logger');

/**
 * Upsert tag interactions for a user.
 * Fire-and-forget safe — errors are swallowed so they never break the feed.
 *
 * @param {string}   userId
 * @param {string[]} tags   - Tags from the post the user interacted with
 */
async function trackTagInteractions(userId, tags = []) {
  if (!userId || !tags.length) return;

  try {
    const now = new Date();

    await Promise.all(
      tags.map((tag) =>
        UserInterest.upsert(
          {
            userId,
            tag: tag.toLowerCase().trim(),
            interactionCount: 1,
            lastInteractedAt: now,
          },
          { conflictFields: ['userId', 'tag'], returning: false }
        ).then(() =>
          UserInterest.increment('interactionCount', {
            where: { userId, tag: tag.toLowerCase().trim() },
          })
        )
      )
    );

    logger.debug('Tag interactions tracked', { userId, tags });
  } catch (err) {
    logger.error('Failed to track tag interactions', {
      userId,
      tags,
      error: err.message,
    });
  }
}

/**
 * Return a user's ranked interest profile.
 *
 * @param {string} userId
 * @param {Object} options
 * @param {'count'|'recent'} options.sortBy - Rank by count (default) or recency
 * @param {number}           options.limit  - Max tags (default 20, capped at 100)
 * @returns {Promise<Array<{ tag: string, interactionCount: number, lastInteractedAt: Date }>>}
 */
async function getUserInterests(userId, { sortBy = 'count', limit = 20 } = {}) {
  const order =
    sortBy === 'recent'
      ? [['lastInteractedAt', 'DESC']]
      : [
          ['interactionCount', 'DESC'],
          ['lastInteractedAt', 'DESC'],
        ];

  const rows = await UserInterest.findAll({
    where: { userId },
    attributes: ['tag', 'interactionCount', 'lastInteractedAt'],
    order,
    limit: Math.min(limit, 100),
  });

  return rows.map((r) => r.toJSON());
}

module.exports = { trackTagInteractions, getUserInterests };
