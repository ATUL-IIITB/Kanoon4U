/**
 * Server Entry Point
 * Initializes databases, starts Express server, handles graceful shutdown
 */
process.on('uncaughtException', (err) => { console.error('UNCAUGHT:', err); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('UNHANDLED:', err); process.exit(1); });
process.on('exit', (code) => { console.log('Process exiting with code:', code); });
require('dotenv').config();
const app = require('./app');
const { connectDatabases } = require('./config/db');
const { sequelize } = require('./config/postgres');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { handleUncaughtExceptions } = require('./middleware/errorHandler');

const PORT = process.env.PORT || 3000;

let server;

/**
 * Graceful shutdown handler
 * Closes HTTP server and database connections cleanly
 */
const gracefulShutdown = async (signal) => {
  logger.info(`Graceful shutdown initiated (${signal})`);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        // Close PostgreSQL connection
        await sequelize.close();
        logger.info('PostgreSQL connection closed');
      } catch (err) {
        logger.error('Error closing PostgreSQL:', err.message);
      }

      try {
        // Close MongoDB connection
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error('Error closing MongoDB:', err.message);
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
handleUncaughtExceptions();

/**
 * Start the server
 */
const startServer = async () => {
  try {
    // Connect to all databases before accepting traffic
    await connectDatabases();

    server = app.listen(PORT, () => {
      logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
  } catch (error) {
    logger.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
