
const mongoose = require('mongoose');

let memoryServerInstance = null;

const connectDB = async () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const mongoURI = process.env.MONGODB_URI;

  // Production must use MongoDB Atlas or another persistent database.
  if (isProduction && !mongoURI) {
    throw new Error(
      'MONGODB_URI is missing. Configure it in your environment variables.'
    );
  }

  // Local MongoDB is the development default.
  const uri =
    mongoURI || 'mongodb://127.0.0.1:27017/saas_dashboard';

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('[Database] MongoDB connected successfully.');
    console.log(`[Database] Database: ${mongoose.connection.name}`);

  } catch (error) {
    console.error('[Database] Connection failed:', error.message);

    // Never fall back to a temporary database in production.
    if (isProduction) {
      throw error;
    }

    // Development-only fallback.
    console.warn(
      '[Database] Starting temporary in-memory MongoDB for development.'
    );

    const { MongoMemoryServer } = require('mongodb-memory-server');

    memoryServerInstance = await MongoMemoryServer.create();

    await mongoose.connect(memoryServerInstance.getUri());

    console.log(
      '[Database] In-memory MongoDB connected (development only).'
    );
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();

    if (memoryServerInstance) {
      await memoryServerInstance.stop();
      memoryServerInstance = null;
    }

    console.log('[Database] Disconnected successfully.');
  } catch (error) {
    console.error('[Database] Disconnect failed:', error.message);
  }
};

module.exports = { connectDB, disconnectDB };
