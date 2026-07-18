const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://2026ns03062_db_user:rEaRHZeO0FKOz9z8@cluster0.brbgxbn.mongodb.net/';
const DB_NAME = process.env.MONGODB_DB_NAME || 'tkk_festival';
const TOKEN_COUNT = 500;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is required.');
  process.exit(1);
}

async function seedTokens() {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 20000,
    maxPoolSize: 5,
  });

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);
    const tokensCollection = db.collection('tokens');

    await tokensCollection.createIndex({ tokenCode: 1 }, { unique: true });

    const tokens = Array.from({ length: 500 }, (_, idx) => ({
      tokenCode: `TKZ-${String(idx + 1).padStart(3, '0')}`,
      status: 'pending',
      redeemedAt: null,
      redeemedBy: null,
      createdAt: new Date(),
    }));

    console.log('⚠️ Resetting tokens collection to TKZ-001 through TKZ-500...');
    await tokensCollection.deleteMany({});
    const result = await tokensCollection.insertMany(tokens, { ordered: false });

    console.log(`\n✅ Seed complete: ${result.insertedCount} token(s) inserted.`);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

seedTokens();
