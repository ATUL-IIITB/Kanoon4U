const { Sequelize } = require('sequelize');

// ── Validate required env vars ───────────────────────────────
const required = ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`PostgreSQL config error — missing env vars: ${missing.join(', ')}`);
}

// ── Create Sequelize instance ────────────────────────────────
const sequelize = new Sequelize(
  process.env.POSTGRES_DB,
  process.env.POSTGRES_USER,
  process.env.POSTGRES_PASSWORD,
  {
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,       // max connections in pool
      min: 0,        // min connections in pool
      acquire: 30000, // ms before throwing a timeout error
      idle: 10000,   // ms a connection can be idle before release
    },
  }
);

/**
 * Connect to PostgreSQL.
 * Call once at app startup; safe to call multiple times (no-op if already connected).
 */
const connectPostgres = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL connected successfully');

    // Sync models in development (use migrations in production)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('📦 PostgreSQL models synced');
    }
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    throw error; // Let the caller decide whether to exit
  }
};

module.exports = { sequelize, connectPostgres };
