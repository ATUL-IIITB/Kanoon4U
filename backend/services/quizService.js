/**
 * Quiz Service
 *
 * Improvements over original:
 *  - After submission, generates a single AI explanation for all wrong answers
 *    using Groq (batched — one API call regardless of how many questions were wrong)
 *  - AI explanations are generated async AFTER scoring, so correct-answer
 *    explanations from the DB are returned instantly for correct answers
 *  - AI explanation call is best-effort: if Groq fails the static DB
 *    explanation is used as fallback — quiz never breaks
 *  - Performance: only wrong answers are sent to AI (not the full submission)
 */

'use strict';

const Groq = require('groq-sdk');
const Quiz = require('../models/mongo/Quiz');
const { logActivity } = require('./activityService');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/AppError');

// ─── Groq client (shared instance) ───────────────────────────────────────────

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// ─── Grade helper ─────────────────────────────────────────────────────────────

const getGrade = (percentage) => {
  if (percentage >= 90) return 'A';
  if (percentage >= 75) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
};

// ─── AI explanation generator ─────────────────────────────────────────────────

/**
 * Generate AI explanations for incorrect answers — ONE Groq call for all.
 *
 * @param {Array<{ question, correctAnswer, selectedOption, staticExplanation }>} wrongItems
 * @returns {Promise<Map<string, string>>} Map of question text → AI explanation
 */
const generateAIExplanations = async (wrongItems) => {
  const explanationMap = new Map();

  if (!groq || wrongItems.length === 0) return explanationMap;

  // Build a compact JSON prompt so AI returns structured data we can parse
  const promptItems = wrongItems.map((item, i) => ({
    index: i + 1,
    question: item.question,
    correctAnswer: item.correctAnswer,
    userSelected: item.selectedOption,
  }));

  const systemPrompt =
    'You are a concise legal education assistant. ' +
    'For each question, explain in 2–3 sentences why the correct answer is right ' +
    'and why the user\'s selected answer is wrong. ' +
    'Respond ONLY with a JSON array: [{ "index": 1, "explanation": "..." }, ...]. ' +
    'No preamble, no markdown, no trailing text.';

  const userPrompt = JSON.stringify(promptItems, null, 2);

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.3, // low temp for factual, predictable output
    });

    const raw = completion.choices[0]?.message?.content ?? '[]';

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      parsed.forEach(({ index, explanation }) => {
        const item = wrongItems[index - 1];
        if (item && explanation) {
          explanationMap.set(item.question, explanation);
        }
      });
    }

    logger.info('AI explanations generated', {
      requested: wrongItems.length,
      received: explanationMap.size,
    });
  } catch (err) {
    // Non-fatal — static explanations from DB will be used as fallback
    logger.warn('AI explanation generation failed — using static explanations', {
      error: err.message,
    });
  }

  return explanationMap;
};

// ─── Get quiz questions ───────────────────────────────────────────────────────

/**
 * Fetch randomised quiz questions.
 * @param {Object} options
 * @param {number} options.limit
 * @param {string} options.difficulty
 * @param {string} options.category
 * @param {string|string[]} options.tags
 */
const getQuizQuestions = async ({ limit = 10, difficulty, category, tags } = {}) => {
  const query = { isActive: true };
  if (difficulty) query.difficulty = difficulty;
  if (category) query.category = category;
  if (tags) query.tags = { $in: Array.isArray(tags) ? tags : [tags] };

  const total = await Quiz.countDocuments(query);
  const questions = await Quiz.aggregate([
    { $match: query },
    { $sample: { size: Math.min(limit, total) } },
    { $project: { question: 1, options: 1, difficulty: 1, category: 1, tags: 1 } },
  ]);

  return { questions, meta: { total, returned: questions.length } };
};

// ─── Submit + score + AI explanations ────────────────────────────────────────

/**
 * Score a quiz submission and enrich wrong answers with AI explanations.
 *
 * Flow:
 *   1. Validate submissions array
 *   2. Fetch questions from MongoDB
 *   3. Score each submission
 *   4. Collect wrong answers
 *   5. Generate AI explanations for wrong answers (one Groq call)
 *   6. Merge AI explanations into results (DB explanation as fallback)
 *   7. Log activity fire-and-forget
 *   8. Return enriched results
 *
 * @param {Array<{ questionId: string, selectedOption: string }>} submissions
 * @param {string|null} userId - Optional, for activity logging
 * @returns {Promise<Object>}
 */
const submitQuiz = async (submissions, userId = null) => {
  // ── Validate ──────────────────────────────────────────────────────────────
  if (!Array.isArray(submissions) || submissions.length === 0) {
    throw new ValidationError('Submissions must be a non-empty array');
  }

  const invalidSubmission = submissions.find((s) => !s.questionId || !s.selectedOption);
  if (invalidSubmission) {
    throw new ValidationError('Each submission must have questionId and selectedOption');
  }

  // ── Fetch questions ───────────────────────────────────────────────────────
  const ids = submissions.map((s) => s.questionId);
  const questions = await Quiz.find({ _id: { $in: ids } }).lean();

  const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 0;
  const wrongItems = []; // items needing AI explanation

  const results = submissions.map((sub) => {
    const { questionId, selectedOption } = sub;
    const question = questionMap.get(questionId);

    if (!question) return { questionId, status: 'not_found' };

    const isCorrect = question.answer === selectedOption;
    if (isCorrect) score++;

    const result = {
      questionId,
      question: question.question,
      selectedOption,
      correctAnswer: question.answer,
      isCorrect,
      explanation: question.explanation || null, // static DB explanation
      aiExplanation: null,                        // populated below if wrong
      difficulty: question.difficulty,
      category: question.category,
    };

    if (!isCorrect) {
      wrongItems.push({
        question: question.question,
        correctAnswer: question.answer,
        selectedOption,
        staticExplanation: question.explanation,
        _resultRef: result, // direct reference so we can write into it
      });
    }

    return result;
  });

  // ── AI explanations for wrong answers ────────────────────────────────────
  if (wrongItems.length > 0) {
    const aiExplanations = await generateAIExplanations(wrongItems);

    wrongItems.forEach((item) => {
      const aiText = aiExplanations.get(item.question);
      if (aiText) {
        // Write AI explanation into the result object (by reference)
        item._resultRef.aiExplanation = aiText;
      }
    });
  }

  // ── Compute summary ───────────────────────────────────────────────────────
  const attempted = results.filter((r) => r.status !== 'not_found').length;
  const percentage = attempted > 0 ? Math.round((score / attempted) * 100) : 0;
  const grade = getGrade(percentage);

  // ── Activity log (fire-and-forget) ───────────────────────────────────────
  if (userId) {
    logActivity(userId, 'quiz_attempted', {
      score,
      total: attempted,
      percentage,
      grade,
    });
  }

  return {
    score,
    total: attempted,
    percentage,
    grade,
    results,
    aiExplanationsGenerated: wrongItems.length > 0,
  };
};

// ─── Seed ─────────────────────────────────────────────────────────────────────

const seedQuestions = async () => {
  const count = await Quiz.countDocuments();
  if (count > 0) {
    logger.info('Quiz already seeded', { count });
    return { message: 'Already seeded', count };
  }

  const sampleQuestions = [
    {
      question: 'What is the foundational principle behind the rule of law?',
      options: [
        'The government has unlimited authority',
        'No one is above the law, including the government',
        'Laws apply only to citizens, not officials',
        'Courts can override any legislation',
      ],
      answer: 'No one is above the law, including the government',
      explanation:
        'The rule of law means that everyone — individuals and government alike — must follow established laws applied fairly and equally.',
      difficulty: 'easy',
      category: 'Constitutional Law',
      tags: ['rule-of-law', 'constitution'],
    },
    {
      question: 'Which Article of the Indian Constitution deals with the Right to Equality?',
      options: ['Article 12', 'Article 14', 'Article 19', 'Article 21'],
      answer: 'Article 14',
      explanation:
        'Article 14 guarantees equality before the law and equal protection of laws to all persons within India.',
      difficulty: 'easy',
      category: 'Constitutional Law',
      tags: ['fundamental-rights', 'equality'],
    },
    {
      question: 'What distinguishes a civil case from a criminal case?',
      options: [
        'Civil cases involve violence; criminal cases do not',
        'Civil cases resolve disputes between private parties; criminal cases involve state prosecution',
        'Criminal cases always result in jail; civil cases do not',
        'Civil cases require a jury; criminal cases do not',
      ],
      answer:
        'Civil cases resolve disputes between private parties; criminal cases involve state prosecution',
      explanation:
        'In civil law, one party sues another for compensation or remedy. In criminal law, the state prosecutes an individual for offenses against society.',
      difficulty: 'medium',
      category: 'General Law',
      tags: ['civil-law', 'criminal-law'],
    },
    {
      question: 'Which writ is issued to release a person from unlawful detention?',
      options: ['Mandamus', 'Certiorari', 'Habeas Corpus', 'Quo Warranto'],
      answer: 'Habeas Corpus',
      explanation:
        'Habeas Corpus (Latin: "you shall have the body") orders the detaining authority to produce the detained person before a court to examine the legality of the detention.',
      difficulty: 'easy',
      category: 'Constitutional Law',
      tags: ['writs', 'fundamental-rights', 'habeas-corpus'],
    },
    {
      question: 'Under the Indian Penal Code, what is the punishment for murder (Section 302)?',
      options: [
        'Up to 7 years imprisonment',
        'Life imprisonment or death penalty',
        'Up to 14 years imprisonment',
        'Fine only',
      ],
      answer: 'Life imprisonment or death penalty',
      explanation:
        'Section 302 IPC prescribes death or life imprisonment, plus a fine, for whoever commits murder. The death penalty is reserved for the "rarest of rare" cases.',
      difficulty: 'medium',
      category: 'Criminal Law',
      tags: ['ipc', 'murder', 'punishment'],
    },
  ];

  const inserted = await Quiz.insertMany(sampleQuestions);
  logger.info('Quiz seeded successfully', { count: inserted.length });
  return { message: 'Seeded successfully', count: inserted.length };
};

module.exports = { getQuizQuestions, submitQuiz, seedQuestions };