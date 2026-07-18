const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { USERS } = require('./config/users');

const app = express();
const port = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'tkk_festival';
const useMongo = Boolean(process.env.MONGODB_URI);

app.use(cors());
app.use(express.json());

const sessions = new Map();
let client;
let db;
const fallbackUsers = USERS.map((user) => ({ ...user }));

const defaultTokens = Array.from({ length: 20 }, (_, index) => ({
  tokenCode: `TKZ-${String(index + 1).padStart(3, '0')}`,
  status: 'pending',
  redeemedAt: null,
  redeemedBy: null,
  createdAt: new Date(),
}));
const fallbackTokens = new Map(defaultTokens.map((t) => [t.tokenCode, t]));

async function connectToMongo() {
  if (!useMongo) {
    console.warn('MongoDB URI not set; running without database persistence');
    db = null;
    return;
  }

  console.log('📡 MongoDB Connection Diagnostics:');
  console.log(`   URI configured: ${MONGODB_URI ? 'Yes' : 'No'}`);
  console.log(`   Database: ${DB_NAME}`);

  // Try multiple connection strategies with increasing flexibility
  const strategies = [
    {
      name: 'SRV Standard TLS',
      uri: MONGODB_URI,
      options: {
        serverSelectionTimeoutMS: 25000,
        connectTimeoutMS: 25000,
        socketTimeoutMS: 30000,
        maxPoolSize: 5,
        retryWrites: true,
        tls: true,
      },
    },
    {
      name: 'SRV with minimal TLS',
      uri: MONGODB_URI,
      options: {
        serverSelectionTimeoutMS: 25000,
        connectTimeoutMS: 25000,
        socketTimeoutMS: 30000,
        maxPoolSize: 3,
        retryWrites: false,
        tls: true,
        tlsInsecure: true,
      },
    },
    {
      name: 'Direct connection (no SRV)',
      uri: MONGODB_URI.replace('mongodb+srv://', 'mongodb://'),
      options: {
        serverSelectionTimeoutMS: 25000,
        connectTimeoutMS: 25000,
        socketTimeoutMS: 30000,
        maxPoolSize: 3,
        retryWrites: false,
      },
    },
    {
      name: 'Direct TLS Disabled (emergency)',
      uri: MONGODB_URI.replace('mongodb+srv://', 'mongodb://'),
      options: {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 35000,
        maxPoolSize: 2,
        retryWrites: false,
        tls: false,
      },
    },
  ];

  for (const strategy of strategies) {
    try {
      console.log(`\n🔄 [${strategy.name}] Attempting connection...`);
      const attemptClient = new MongoClient(strategy.uri, strategy.options);
      await attemptClient.connect();
      client = attemptClient;
      db = client.db(DB_NAME);
      console.log(`✅ [${strategy.name}] Connected successfully!`);
      console.log(`   Database ready: ${DB_NAME}`);
      break;
    } catch (error) {
      console.warn(`❌ [${strategy.name}] Failed`);
      console.warn(`   Error Type: ${error.name}`);
      console.warn(`   Message: ${error.message}`);
      console.warn(`   Code: ${error.code || 'N/A'}`);
      if (client) {
        try {
          await client.close();
        } catch (e) {}
      }
      client = null;
      db = null;
      continue;
    }
  }

  // If still no connection, log detailed diagnostics
  if (!db) {
    console.error('\n⚠️  ⚠️  ⚠️  CRITICAL: MongoDB Connection Failed');
    console.error('━'.repeat(70));
    console.error('All connection strategies failed. This is NOT suitable for live event!');
    console.error('\n🔍 Troubleshooting Checklist:');
    console.error('   1. ✓ MONGODB_URI environment variable is set');
    console.error('   2. ☐ MongoDB Atlas Network Access whitelist includes 0.0.0.0/0');
    console.error('   3. ☐ Cluster is in Running status (not paused)');
    console.error('   4. ☐ Cluster credentials are correct');
    console.error('   5. ☐ Internet connectivity from Render to MongoDB');
    console.error('\n📋 Next Steps:');
    console.error('   • Verify Network Access at https://cloud.mongodb.com');
    console.error('   • Wait 2-3 minutes for whitelist changes to propagate');
    console.error('   • Trigger Render redeploy after 5 minutes');
    console.error('━'.repeat(70));
    return;
  }

  await db.collection('tokens').createIndex({ tokenCode: 1 }, { unique: true });
  await db.collection('volunteers').createIndex({ username: 1 }, { unique: true });
  await db.collection('redemption_logs').createIndex({ tokenCode: 1 });

  const tokenCount = await db.collection('tokens').countDocuments();
  if (tokenCount === 0) {
    const seedTokens = Array.from({ length: 20 }, (_, index) => ({
      tokenCode: `TKZ-${String(index + 1).padStart(3, '0')}`,
      status: 'pending',
      redeemedAt: null,
      redeemedBy: null,
      createdAt: new Date(),
    }));
    await db.collection('tokens').insertMany(seedTokens);
  } else {
    // Migration: Fix existing tokens with 4-digit format to 3-digit format
    const oldFormatTokens = await db.collection('tokens').find({ tokenCode: /^TKZ-\d{4}$/ }).toArray();
    if (oldFormatTokens.length > 0) {
      console.log(`Migrating ${oldFormatTokens.length} tokens from 4-digit to 3-digit format...`);
      for (const token of oldFormatTokens) {
        const match = token.tokenCode.match(/^TKZ-(\d{4})$/);
        if (match) {
          const number = parseInt(match[1], 10);
          const newTokenCode = `TKZ-${String(number).padStart(3, '0')}`;
          await db.collection('tokens').updateOne(
            { tokenCode: token.tokenCode },
            { $set: { tokenCode: newTokenCode } }
          );
        }
      }
      console.log('Token migration completed');
    }
  }

  const volunteerCount = await db.collection('volunteers').countDocuments();
  if (volunteerCount === 0) {
    const volunteerDocs = USERS.map((user) => ({
      username: user.username,
      pin: user.pin,
      role: user.role,
      name: user.name,
      createdAt: new Date(),
    }));
    await db.collection('volunteers').insertMany(volunteerDocs);
  }
}

function createSession(username, role, name) {
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, { username, role, name, createdAt: new Date().toISOString() });
  return token;
}

function authenticate(req, res, next) {
  const token = req.headers['x-auth-token'] || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  const user = sessions.get(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  req.user = user;
  next();
}

app.get('/health', (req, res) => {
  const dbStatus = db ? 'connected' : 'disconnected';
  const message = db 
    ? '✅ Database connected - Ready for live event'
    : '❌ Database disconnected - **CRITICAL: Using fallback memory storage (NOT SUITABLE FOR LIVE EVENT)**';
  
  res.json({ 
    status: 'ok', 
    service: 'tkk-token-api',
    database: dbStatus,
    message,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/login', async (req, res) => {
  const { username, pin } = req.body || {};
  if (!username || !pin) {
    return res.status(400).json({ error: 'Username and PIN are required' });
  }

  try {
    if (db) {
      const volunteer = await db.collection('volunteers').findOne({ username, pin });
      if (volunteer) {
        const token = createSession(volunteer.username, volunteer.role, volunteer.name);
        return res.json({ token, user: { username: volunteer.username, role: volunteer.role, name: volunteer.name } });
      }
    }

    const fallbackVolunteer = fallbackUsers.find((user) => user.username === username && user.pin === pin);
    if (!fallbackVolunteer) {
      return res.status(401).json({ error: 'Invalid username or PIN' });
    }

    const token = createSession(fallbackVolunteer.username, fallbackVolunteer.role, fallbackVolunteer.name);
    return res.json({ token, user: { username: fallbackVolunteer.username, role: fallbackVolunteer.role, name: fallbackVolunteer.name } });
  } catch (error) {
    console.error('Login error', error);
    return res.status(500).json({ error: 'Unable to authenticate user' });
  }
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/tokens', authenticate, async (req, res) => {
  try {
    const list = await db.collection('tokens').find({}).sort({ createdAt: 1 }).toArray();
    res.json({ tokens: list.map(({ _id, ...rest }) => rest) });
  } catch (error) {
    console.error('List tokens error', error);
    res.status(500).json({ error: 'Unable to load tokens' });
  }
});

app.post('/api/redeem', authenticate, async (req, res) => {
  const { tokenCode } = req.body || {};
  if (!tokenCode) {
    return res.status(400).json({ error: 'tokenCode is required' });
  }

  try {
    if (db) {
      const updatedToken = await db.collection('tokens').findOneAndUpdate(
        { tokenCode, status: 'pending' },
        { $set: { status: 'redeemed', redeemedAt: new Date(), redeemedBy: req.user.username } },
        { returnDocument: 'after' }
      );

      if (updatedToken) {
        await db.collection('redemption_logs').insertOne({
          tokenCode,
          volunteer: req.user.username,
          timestamp: new Date(),
          deviceInfo: 'backend-sample',
        });
        return res.json({ success: true, token: updatedToken });
      }

      const existingToken = await db.collection('tokens').findOne({ tokenCode });
      if (existingToken && existingToken.status === 'redeemed') {
        return res.status(409).json({
          success: false,
          error: 'Token already redeemed',
          token: existingToken,
        });
      }
    }

    const fallbackToken = fallbackTokens.get(tokenCode);
    if (!fallbackToken) {
      return res.status(404).json({ error: 'Unknown token' });
    }

    if (fallbackToken.status === 'redeemed') {
      return res.status(409).json({
        success: false,
        error: 'Token already redeemed',
        token: fallbackToken,
      });
    }

    fallbackToken.status = 'redeemed';
    fallbackToken.redeemedAt = new Date().toISOString();
    fallbackToken.redeemedBy = req.user.username;

    return res.json({ success: true, token: fallbackToken });
  } catch (error) {
    console.error('Redeem error', error);
    return res.status(500).json({ error: 'Unable to redeem token' });
  }
});

app.get('/api/admin/summary', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const list = await db.collection('tokens').find({}).toArray();
    const redeemed = list.filter((item) => item.status === 'redeemed').length;
    const pending = list.length - redeemed;

    return res.json({
      totalTokens: list.length,
      redeemed,
      pending,
      redemptionRate: list.length ? (redeemed / list.length) * 100 : 0,
    });
  } catch (error) {
    console.error('Admin summary error', error);
    return res.status(500).json({ error: 'Unable to load summary' });
  }
});

app.get('/api/admin/tokens', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const list = await db.collection('tokens').find({}).sort({ createdAt: 1 }).toArray();
    return res.json({ tokens: list.map(({ _id, ...rest }) => rest) });
  } catch (error) {
    console.error('Admin tokens error', error);
    return res.status(500).json({ error: 'Unable to load tokens' });
  }
});

app.post('/api/admin/tokens/generate', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const count = Number(req.body?.count || 20);
    const nextTokenNumber = await db.collection('tokens').countDocuments();
    const docs = Array.from({ length: count }, (_, index) => ({
      tokenCode: `TKZ-${String(nextTokenNumber + index + 1).padStart(3, '0')}`,
      status: 'pending',
      redeemedAt: null,
      redeemedBy: null,
      createdAt: new Date(),
    }));

    await db.collection('tokens').insertMany(docs);
    return res.json({ created: count, totalTokens: nextTokenNumber + count });
  } catch (error) {
    console.error('Generate tokens error', error);
    return res.status(500).json({ error: 'Unable to generate tokens' });
  }
});

app.get('/api/admin/logs', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const logs = await db.collection('redemption_logs').find({}).sort({ timestamp: -1 }).toArray();
    return res.json({ logs });
  } catch (error) {
    console.error('Admin logs error', error);
    return res.status(500).json({ error: 'Unable to load logs' });
  }
});

// Sync fallback tokens to database (for when MongoDB connection is restored)
app.post('/api/admin/sync-fallback-to-db', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!db) {
    return res.status(503).json({ error: 'Database connection not available' });
  }

  try {
    const redeemedTokens = Array.from(fallbackTokens.values()).filter(
      (t) => t.status === 'redeemed'
    );

    if (redeemedTokens.length === 0) {
      return res.json({ success: true, message: 'No pending redemptions to sync', synced: 0 });
    }

    let syncedCount = 0;
    for (const token of redeemedTokens) {
      const result = await db.collection('tokens').updateOne(
        { tokenCode: token.tokenCode },
        {
          $set: {
            status: 'redeemed',
            redeemedAt: new Date(token.redeemedAt),
            redeemedBy: token.redeemedBy,
          },
        }
      );

      if (result.modifiedCount > 0) {
        syncedCount++;
      }
    }

    return res.json({
      success: true,
      message: `Synced ${syncedCount} redeemed tokens to database`,
      synced: syncedCount,
      total: redeemedTokens.length,
    });
  } catch (error) {
    console.error('Sync fallback error', error);
    return res.status(500).json({ error: 'Unable to sync fallback tokens' });
  }
});

async function startServer() {
  try {
    await connectToMongo();
  } catch (error) {
    console.error('MongoDB connection failed, continuing without DB persistence:', error.message);
  }

  app.listen(port, () => {
    console.log(`TKK redemption API listening on port ${port}`);
  });
}

startServer();
