const { sequelize } = require('../config/postgres');
const { mongoose } = require('../config/mongo');
const logger = require('../utils/logger');

/**
 * Maps Mongoose's numeric readyState to a human-readable string.
 * 0 = disconnected | 1 = connected | 2 = connecting | 3 = disconnecting
 */
const mongoStateLabel = (state) =>
  ['disconnected', 'connected', 'connecting', 'disconnecting'][state] ?? 'unknown';

/**
 * getStatus()
 * Pings both databases and returns their live connection state.
 */
const getStatus = async () => {
  // ── PostgreSQL ping ──────────────────────────────────────
  let postgresStatus = { status: 'disconnected', error: null };
  try {
    await sequelize.authenticate(); // runs a lightweight SELECT 1
    postgresStatus = { status: 'connected', dialect: 'postgres' };
    logger.debug('PostgreSQL ping successful');
  } catch (err) {
    logger.error('PostgreSQL ping failed', { error: err.message });
    postgresStatus = { status: 'disconnected', error: err.message };
  }

  // ── MongoDB state ────────────────────────────────────────
  const mongoState = mongoose.connection.readyState;
  const mongoStatus = {
    status: mongoStateLabel(mongoState),
    ...(mongoState !== 1 && { error: 'Not connected' }),
  };

  if (mongoState !== 1) {
    logger.warn('MongoDB not connected', { readyState: mongoState });
  } else {
    logger.debug('MongoDB connected');
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    databases: {
      postgres: postgresStatus,
      mongo: mongoStatus,
    },
  };
};

module.exports = { getStatus };
