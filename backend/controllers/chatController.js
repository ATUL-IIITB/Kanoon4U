/**
 * Chat Controller
 * Handles AI chat with RAG
 */
const chatService = require('../services/chatService');
const { success } = require('../utils/apiResponse');

/**
 * POST /api/chat
 * Get AI response for a legal question with retrieval-augmented generation
 */
const chat = async (req, res, next) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      const { ValidationError } = require('../utils/AppError');
      throw new ValidationError('Question is required');
    }

    const { answer, sources } = await chatService.getChatResponse(question.trim());

    return success(res, {
      question: question.trim(),
      answer,
      sources: sources.length > 0 ? sources : undefined,
      retrievedContext: sources.length > 0,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { chat };
