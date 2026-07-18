#!/usr/bin/env node
/**
 * Debug MongoDB connection attempts from Render
 * This script helps diagnose why Render can't connect to MongoDB Atlas
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'tkk_festival';

console.log('\n═══════════════════════════════════════════════════════════');
console.log('🔧 MongoDB Connection Debugger for Render');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📋 Environment Configuration:');
console.log(`   MONGODB_URI: ${MONGODB_URI ? '✅ Set' : '❌ NOT SET'}`);
console.log(`   MONGODB_DB_NAME: ${DB_NAME}`);
console.log(`   Node.js version: ${process.version}`);
console.log(`   Platform: ${process.platform}`);
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

if (!MONGODB_URI) {
  console.error('\n❌ MONGODB_URI is not set!');
  console.error('   Set this environment variable on Render dashboard');
  process.exit(1);
}

// Parse the connection string to extract details
const srvMatch = MONGODB_URI.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)/);
if (srvMatch) {
  const [, user, pass, host] = srvMatch;
  console.log(`\n📊 Parsed Connection Details:`);
  console.log(`   Username: ${user}`);
  console.log(`   Password: ${pass ? '***' + pass.slice(-4) : 'EMPTY'}`);
  console.log(`   Host: ${host}`);
} else {
  console.log('\n⚠️  Could not parse SRV connection string');
}

// Test each strategy with detailed timing
const strategies = [
  {
    name: 'Strategy 1: SRV Standard TLS',
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
    name: 'Strategy 2: SRV Minimal TLS',
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
    name: 'Strategy 3: Direct No SRV',
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
    name: 'Strategy 4: Direct No TLS',
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

(async () => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🧪 Testing Connection Strategies\n');

  let successCount = 0;
  let failureCount = 0;

  for (const strategy of strategies) {
    const startTime = Date.now();
    console.log(`\n📌 ${strategy.name}`);
    console.log(`   Timeout: ${strategy.options.connectTimeoutMS}ms`);

    try {
      const client = new MongoClient(strategy.uri, strategy.options);
      await client.connect();
      const elapsed = Date.now() - startTime;

      console.log(`   ✅ SUCCESS (${elapsed}ms)`);
      console.log(`   Database: ${DB_NAME}`);

      // Verify we can access the database
      const db = client.db(DB_NAME);
      const adminDb = db.admin();
      const status = await adminDb.ping();
      console.log(`   Ping: ${status.ok ? '✅ OK' : '❌ Failed'}`);

      await client.close();
      successCount++;
      console.log(`\n   🎉 Strategy ${strategy.name.split(':')[0]} is WORKING!`);
      break;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      failureCount++;
      console.log(`   ❌ FAILED (${elapsed}ms)`);
      console.log(`   Error Name: ${error.name}`);
      console.log(`   Error Code: ${error.code || 'N/A'}`);
      console.log(`   Error Message: ${error.message.substring(0, 150)}`);

      if (error.message.includes('certificate')) {
        console.log(`   💡 Tip: TLS certificate issue - try next strategy`);
      } else if (error.message.includes('ECONNREFUSED')) {
        console.log(`   💡 Tip: Connection refused - server not reachable`);
      } else if (error.message.includes('ENOTFOUND')) {
        console.log(`   💡 Tip: DNS resolution failed - check hostname`);
      } else if (error.message.includes('ETIMEDOUT')) {
        console.log(`   💡 Tip: Connection timeout - network may be blocked`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 Results: ${successCount} success, ${failureCount} failures`);

  if (successCount > 0) {
    console.log('✅ Connection is working! System is ready for production.');
  } else {
    console.log('\n❌ All connection strategies failed.');
    console.log('\n🔍 Troubleshooting Steps:');
    console.log('   1. Verify MONGODB_URI on Render dashboard');
    console.log('   2. Check MongoDB Atlas Network Access whitelist');
    console.log('      → Should include 0.0.0.0/0');
    console.log('   3. Wait 5-10 minutes for whitelist to propagate');
    console.log('   4. Verify cluster is running (not paused)');
    console.log('   5. Try redeploying Render app after waiting');
    console.log('\n💡 Quick Fix: Delete and recreate 0.0.0.0/0 whitelist entry');
  }

  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(successCount > 0 ? 0 : 1);
})();
