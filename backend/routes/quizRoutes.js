const express = require('express');
const router = express.Router();
const { getQuiz, submitQuizAnswers, seedQuiz } = require('../controllers/quizController');
// Uncomment below to protect quiz routes with JWT auth:
// const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * GET /api/quiz
 * Fetch randomized quiz questions.
 * Query: ?limit=10&difficulty=medium&category=Constitutional+Law&tags=writs,equality
 */
router.get('/', /* authenticateToken, */ getQuiz);

/**
 * POST /api/quiz/submit
 * Submit answers and receive score + explanations.
 * Body: { submissions: [{ questionId: string, selectedOption: string }] }
 */
router.post('/submit', /* authenticateToken, */ submitQuizAnswers);

/**
 * POST /api/quiz/seed  — development only
 */
router.post('/seed', seedQuiz);

module.exports = router;
