const { connectPostgres } = require('./postgres');
const { connectMongo } = require('./mongo');

/**
 * connectDatabases()
 * Initialises both PostgreSQL and MongoDB.
 * Failures are logged individually so one bad connection doesn't
 * silently swallow the other; the error is re-thrown so server.js
 * can decide whether to exit.
 */
const connectDatabases = async () => {
  const results = await Promise.allSettled([
    connectPostgres(),
    connectMongo(),
  ]);

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    failures.forEach((f) => console.error('DB init error:', f.reason?.message));
    throw new Error(`${failures.length} database connection(s) failed on startup`);
  }
};

module.exports = { connectDatabases };
