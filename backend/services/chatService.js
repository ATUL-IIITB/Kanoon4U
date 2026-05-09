/**
 * Chat Service — RAG-enhanced legal education assistant
 *
 * Improvements over original:
 *  - Full-text search ranked by MongoDB textScore (relevance-first)
 *  - Verified posts boosted in result selection
 *  - Top 3–5 docs only, with content truncated cleanly per doc
 *  - Context block formatted with source index, verification badge, tags
 *  - Safety filter imported from shared util (single source of truth)
 *  - safetyBlocked flag + category in response for frontend handling
 *  - sources always returned as array (never undefined)
 *  - Disclaimer constant — cannot be forgotten or skipped
 */

'use strict';

const Groq = require('groq-sdk');
const Post = require('../models/mongo/Post');
const logger = require('../utils/logger');
const { BadGatewayError } = require('../utils/AppError');
const { checkQuerySafety } = require('../utils/chatSafetyFilter');

// ─── Groq client ──────────────────────────────────────────────────────────────

if (!process.env.GROQ_API_KEY) {
  logger.error('GROQ_API_KEY is not configured');
  throw new Error('GROQ_API_KEY environment variable is required');
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Constants ────────────────────────────────────────────────────────────────

const RAG_CONFIG = {
  MIN_RESULTS: 3,
  MAX_RESULTS: 5,
  CONTENT_PREVIEW_CHARS: 600,   // chars of post.content included per doc
  SUMMARY_MAX_CHARS: 300,       // chars of post.summary included per doc
};

const DISCLAIMER =
  '\n\n---\n⚠️ *Educational content only.* This response does not constitute legal advice. ' +
  'For guidance on your specific situation, consult a qualified advocate.';

const SYSTEM_PROMPT = `You are Kanoon Tutor, an AI legal education assistant for the Kanoon 4 U platform.

Your role is to EDUCATE users about Indian law — explaining concepts, statutes, and constitutional provisions in clear, accessible language.

Rules you must always follow:
1. Provide EDUCATIONAL INFORMATION only. Never give advice tailored to a personal legal situation.
2. If asked about the user's own case ("should I sue?", "will I win?"), politely decline and direct them to a licensed advocate.
3. Ground every answer in the context documents provided. Cite [Source N] inline where relevant. If context is insufficient, say so — never fabricate statutes or case law.
4. Define legal terms when you introduce them.
5. Never guarantee legal outcomes.
6. Be concise. Prefer bullet points for multi-part answers.`;

// ─── Keyword extraction ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'what', 'is', 'are', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'how', 'why', 'when', 'where', 'which', 'that',
  'this', 'and', 'or', 'but', 'if', 'then', 'else', 'can', 'could',
  'would', 'should', 'will', 'shall', 'may', 'might', 'must', 'does',
  'do', 'did', 'has', 'have', 'had', 'was', 'were', 'been', 'being',
  'get', 'got', 'let', 'us', 'its', 'their', 'there', 'about',
]);

/**
 * Extract meaningful keywords from a question for MongoDB $text search.
 * @param {string} question
 * @returns {string[]}
 */
const extractKeywords = (question) =>
  question
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

// ─── RAG retrieval ────────────────────────────────────────────────────────────

/**
 * Search MongoDB using full-text search ranked by textScore.
 *
 * Strategy:
 *  1. Run $text search — MongoDB scores each doc by keyword frequency/position.
 *  2. Project the textScore alongside fields we need.
 *  3. Sort: primary = textScore DESC (relevance), secondary = verified DESC (trust).
 *  4. Clamp results to RAG_CONFIG.MAX_RESULTS.
 *  5. Drop any result with textScore < MIN_SCORE to avoid noise.
 *
 * Falls back gracefully if the text index doesn't exist yet.
 *
 * @param {string} question
 * @returns {Promise<Array>}
 */
const searchRelevantContent = async (question) => {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];

  const searchQuery = keywords.join(' ');
  const MIN_SCORE = 0.5; // Discard very weakly matching docs

  try {
    const posts = await Post.find(
      { $text: { $search: searchQuery } },
      {
        score: { $meta: 'textScore' }, // relevance score from MongoDB
        title: 1,
        summary: 1,
        content: 1,
        tags: 1,
        verified: 1,
        verificationLevel: 1,
        createdAt: 1,
      }
    )
      .sort({
        score: { $meta: 'textScore' }, // primary: relevance
        verified: -1,                  // secondary: verified first
      })
      .limit(RAG_CONFIG.MAX_RESULTS)
      .lean();

    // Filter out noise
    const relevant = posts.filter(
      (p) => typeof p.score === 'number' && p.score >= MIN_SCORE
    );

    // Always return at least MIN_RESULTS if we have them (pre-filter)
    const result = relevant.length > 0 ? relevant : posts.slice(0, RAG_CONFIG.MIN_RESULTS);

    logger.info('RAG retrieval complete', {
      keywords: keywords.length,
      docsFound: posts.length,
      docsUsed: result.length,
      topScore: result[0]?.score?.toFixed(2) ?? 'n/a',
    });

    return result;
  } catch (err) {
    // Text index missing or search failure — degrade gracefully
    logger.warn('MongoDB text search failed — continuing without context', {
      error: err.message,
      code: err.code,
    });
    return [];
  }
};

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Format retrieved documents into a clean, structured context block
 * ready to be injected into the AI prompt.
 *
 * Format per source:
 *   [Source N] (Verified — Expert) | Tags: tag1, tag2
 *   Title: ...
 *   Summary: ...
 *   Content: ... (truncated)
 *
 * @param {Array} posts
 * @returns {string}
 */
const buildContext = (posts) => {
  if (!posts || posts.length === 0) {
    return (
      'No specific legal documents found in the knowledge base. ' +
      'Answer from general knowledge of Indian law and clearly state any uncertainty.'
    );
  }

  return posts
    .map((post, i) => {
      // Verification badge
      const verBadge = post.verified
        ? `✓ Verified${post.verificationLevel ? ` — ${post.verificationLevel}` : ''}`
        : '⚠ Unverified';

      // Tags (max 5 to keep prompt lean)
      const tagLine =
        Array.isArray(post.tags) && post.tags.length
          ? `Tags: ${post.tags.slice(0, 5).join(', ')}`
          : '';

      // Relevance score (helps model weight sources — omit if unavailable)
      const scoreLine =
        typeof post.score === 'number'
          ? `Relevance score: ${post.score.toFixed(2)}`
          : '';

      // Summary — trimmed to avoid bloat
      const summary = post.summary
        ? post.summary.slice(0, RAG_CONFIG.SUMMARY_MAX_CHARS)
        : '';

      // Content preview — only included when available
      const contentPreview = post.content
        ? `\nContent excerpt: ${post.content.slice(0, RAG_CONFIG.CONTENT_PREVIEW_CHARS)}${post.content.length > RAG_CONFIG.CONTENT_PREVIEW_CHARS ? '…' : ''}`
        : '';

      const header = [
        `[Source ${i + 1}] ${verBadge}`,
        tagLine,
        scoreLine,
      ]
        .filter(Boolean)
        .join(' | ');

      return `${header}\nTitle: ${post.title}\nSummary: ${summary}${contentPreview}`;
    })
    .join('\n\n---\n\n');
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Get AI response for a legal question using RAG.
 *
 * @param {string} question - Pre-validated by middleware (10–500 chars)
 * @returns {Promise<{
 *   answer: string,
 *   sources: Array<{ title: string, verified: boolean|string, verificationLevel: string, relevanceScore: number }>,
 *   safetyBlocked: boolean,
 *   safetyCategory?: string,
 * }>}
 */
const getChatResponse = async (question) => {
  // ── 1. Safety gate — zero API cost if blocked ───────────────────────────
  const safety = checkQuerySafety(question);
  if (!safety.safe) {
    logger.info('Chat query blocked by safety filter', {
      category: safety.category,
      reason: safety.reason,
    });
    return {
      answer: `I'm unable to answer that question. ${safety.reason}${DISCLAIMER}`,
      sources: [],
      safetyBlocked: true,
      safetyCategory: safety.category,
    };
  }

  try {
    // ── 2. Retrieve relevant posts ────────────────────────────────────────
    const relevantPosts = await searchRelevantContent(question);
    const context = buildContext(relevantPosts);

    // ── 3. Build prompt ───────────────────────────────────────────────────
    const userPrompt =
      `Context from legal knowledge base:\n\n${context}\n\n` +
      `---\n\nUser question: ${question}\n\n` +
      `Please answer using the context above where relevant, citing [Source N] inline.`;

    // ── 4. Call Groq ──────────────────────────────────────────────────────
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.4, // lower = more factual, less hallucination
    });

    const rawAnswer = completion.choices[0]?.message?.content ?? '';

    logger.info('Chat response generated', {
      keywordsUsed: extractKeywords(question).length,
      sourcesFound: relevantPosts.length,
      tokensUsed: completion.usage?.total_tokens,
    });

    // ── 5. Return ─────────────────────────────────────────────────────────
    return {
      answer: rawAnswer + DISCLAIMER,
      sources: relevantPosts.map((post) => ({
        title: post.title,
        verified: post.verified,
        verificationLevel: post.verificationLevel ?? 'unverified',
        relevanceScore: typeof post.score === 'number'
          ? Math.round(post.score * 100) / 100
          : null,
      })),
      safetyBlocked: false,
    };
  } catch (error) {
    logger.error('Chat service error', {
      message: error.message,
      status: error.status,
      code: error.code,
    });

    if (error.status === 401 || error.status === 403)
      throw new BadGatewayError('Invalid Groq API key — check GROQ_API_KEY in .env');
    if (error.status === 429)
      throw new BadGatewayError('Groq rate limit reached — please retry shortly');
    if (error.status >= 500)
      throw new BadGatewayError('Groq service is temporarily unavailable');

    throw new BadGatewayError(error.message || 'AI service temporarily unavailable');
  }
};

module.exports = { getChatResponse, searchRelevantContent, extractKeywords, buildContext };