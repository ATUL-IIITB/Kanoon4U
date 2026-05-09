/**
 * Quiz Controller
 * Handles quiz operations
 */
const { getQuizQuestions, submitQuiz, seedQuestions } = require('../services/quizService');
const { success } = require('../utils/apiResponse');
const { ForbiddenError } = require('../utils/AppError');

/**
 * GET /api/quiz
 * Query params: limit, difficulty, category, tags (comma-separated)
 */
const getQuiz = async (req, res, next) => {
  try {
    const { limit, difficulty, category, tags } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 10, 50);
    const parsedTags = tags ? tags.split(',').map((t) => t.trim()) : undefined;

    const data = await getQuizQuestions({
      limit: parsedLimit,
      difficulty,
      category,
      tags: parsedTags,
    });

    return success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/quiz/submit
 * Body: { submissions: [{ questionId, selectedOption }] }
 */
const submitQuizAnswers = async (req, res, next) => {
  try {
    const { submissions } = req.body;

    const result = await submitQuiz(submissions, req.user?.id);

    return success(res, result, 'Quiz submitted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/quiz/seed  (dev only)
 */
const seedQuiz = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenError('Seeding not allowed in production');
    }
    const result = await seedQuestions();
    return success(res, result, 'Quiz seeded successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = { getQuiz, submitQuizAnswers, seedQuiz };
