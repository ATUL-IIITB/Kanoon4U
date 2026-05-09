const mongoose = require('mongoose');

// ── Validate required env vars ───────────────────────────────
if (!process.env.MONGO_URI) {
  throw new Error('MongoDB config error — missing env var: MONGO_URI');
}

// ── Connection options ───────────────────────────────────────
const mongoOptions = {
  maxPoolSize: 10,          // max concurrent connections
  serverSelectionTimeoutMS: 5000, // timeout before giving up connecting
  socketTimeoutMS: 45000,   // close sockets after 45s of inactivity
};

/**
 * Connect to MongoDB.
 * Call once at app startup. Mongoose handles reconnections automatically.
 */
const connectMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, mongoOptions);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

// ── Lifecycle event hooks ─────────────────────────────────────
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected');
});

// Graceful shutdown — close the Mongoose connection when Node exits
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🛑 MongoDB connection closed (app termination)');
  process.exit(0);
});

module.exports = { mongoose, connectMongo };
