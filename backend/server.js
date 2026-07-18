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
  tokenCode: `TKZ-${String(index + 1).padStart(4, '0')}`,
  status: 'pending',
  redeemedAt: null,
  redeemedBy: null,
  createdAt: new Date(),
}));
const fallbackTokens = new Map(defaultTokens.map((t) => [t.tokenCode, t]));

async function connectToMongo() {
  if (!useMongo) {
    console.warn('MongoDB URI not set; running without database persistence');
    return;
  }

  const mongoOptions = {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 20000,
    maxPoolSize: 5,
  };

  client = new MongoClient(MONGODB_URI, mongoOptions);
  await client.connect();
  db = client.db(DB_NAME);

  await db.collection('tokens').createIndex({ tokenCode: 1 }, { unique: true });
  await db.collection('volunteers').createIndex({ username: 1 }, { unique: true });
  await db.collection('redemption_logs').createIndex({ tokenCode: 1 });

  const tokenCount = await db.collection('tokens').countDocuments();
  if (tokenCount === 0) {
    const seedTokens = Array.from({ length: 20 }, (_, index) => ({
      tokenCode: `TKZ-${String(index + 1).padStart(4, '0')}`,
      status: 'pending',
      redeemedAt: null,
      redeemedBy: null,
      createdAt: new Date(),
    }));
    await db.collection('tokens').insertMany(seedTokens);
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
  res.json({ status: 'ok', service: 'tkk-token-api' });
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
      tokenCode: `TKZ-${String(nextTokenNumber + index + 1).padStart(4, '0')}`,
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
