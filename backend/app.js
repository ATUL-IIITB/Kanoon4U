/**
 * Express Application Configuration
 * Middleware pipeline, routes, and error handling
 */
const express = require('express');
const app = express();

// Import middleware
const {
  securityMiddleware,
  authLimiter,
  chatLimiter,
} = require('./middleware/securityMiddleware');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// Apply security middleware (helmet, CORS, rate limiting, sanitization)
app.use(securityMiddleware);

// Request logging (must be after security middleware to capture requestId)
app.use(requestLogger);

// Body parsing with size limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Routes
const healthRoutes   = require('./routes/healthRoutes');
const dbStatusRoutes = require('./routes/dbStatusRoutes');
const authRoutes     = require('./routes/authRoutes');
const feedRoutes     = require('./routes/feedRoutes');
const chatRoutes     = require('./routes/chatRoutes');
const quizRoutes     = require('./routes/quizRoutes');
const activityRoutes = require('./routes/activityRoutes');
const interestRoutes = require('./routes/interestRoutes'); // ← ADDED

// Public routes (no rate limiting applied at router level)
app.use('/api/health',    healthRoutes);
app.use('/api/db-status', dbStatusRoutes);

// Auth routes with strict rate limiting
app.use('/api/auth', authLimiter, authRoutes);

// Chat routes with rate limiting (expensive OpenAI calls)
app.use('/api/chat', chatLimiter, chatRoutes);

// Standard routes
app.use('/api',           feedRoutes);
app.use('/api/quiz',      quizRoutes);
app.use('/api/activity',  activityRoutes);
app.use('/api/interests', interestRoutes); // ← ADDED

// 404 handler for undefined routes (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;