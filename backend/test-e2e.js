#!/usr/bin/env node
/**
 * TKK Token Redemption - End-to-End Test
 * Tests the complete flow: login, redeem, verify
 */

const http = require('http');
const { MongoClient } = require('mongodb');

const BASE_URL = 'http://localhost:3001';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://2026ns03062_db_user:rEaRHZeO0FKOz9z8@cluster0.brbgxbn.mongodb.net/';
const DB_NAME = 'tkk_festival';

let authToken = null;
let testResults = {
  passed: 0,
  failed: 0,
};

console.log('\n🧪 TKK Token Redemption - End-to-End Test\n');
console.log('═'.repeat(70));

// Helper functions
function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function checkDB(tokenCode) {
  return new Promise(async (resolve, reject) => {
    try {
      const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      await client.connect();
      const db = client.db(DB_NAME);
      const token = await db.collection('tokens').findOne({ tokenCode });
      await client.close();
      resolve(token);
    } catch (error) {
      reject(error);
    }
  });
}

function logTest(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${details ? ` - ${details}` : ''}`);
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

// Test suite
async function runTests() {
  try {
    // Test 1: Health Check
    console.log('\n📋 TEST 1: Health Check');
    console.log('─'.repeat(70));
    try {
      const health = await makeRequest('GET', '/health');
      logTest(
        'Health endpoint responsive',
        health.status === 200,
        `status=${health.data.status}`
      );
      const isDbConnected = health.data.database === 'connected';
      logTest(
        'Database connected',
        isDbConnected,
        `db=${health.data.database}`
      );
      if (!isDbConnected) {
        console.log('⚠️  WARNING: Database not connected! Tests may use fallback storage.');
      }
    } catch (error) {
      logTest('Health endpoint accessible', false, error.message);
      return;
    }

    // Test 2: Login
    console.log('\n📋 TEST 2: Login');
    console.log('─'.repeat(70));
    try {
      const login = await makeRequest('POST', '/api/login', {
        username: 'volunteer1',
        pin: '1234',
      });
      logTest(
        'Login successful',
        login.status === 200,
        `status=${login.status}`
      );
      if (login.status === 200) {
        authToken = login.data.token;
        logTest(
          'Auth token received',
          !!authToken,
          `token=${authToken.substring(0, 10)}...`
        );
      }
    } catch (error) {
      logTest('Login request', false, error.message);
      return;
    }

    // Test 3: Check initial token status
    console.log('\n📋 TEST 3: Initial Token Status');
    console.log('─'.repeat(70));
    try {
      const dbToken = await checkDB('TKZ-003');
      logTest(
        'Token exists in database',
        !!dbToken,
        `TKZ-003 status=${dbToken?.status}`
      );
      logTest(
        'Token initially pending',
        dbToken?.status === 'pending',
        `status=${dbToken?.status}`
      );
    } catch (error) {
      logTest('Read initial token status', false, error.message);
    }

    // Test 4: Redeem Token
    console.log('\n📋 TEST 4: Token Redemption');
    console.log('─'.repeat(70));
    try {
      const redeem = await makeRequest(
        'POST',
        '/api/redeem',
        { tokenCode: 'TKZ-003' },
        { 'x-auth-token': authToken }
      );
      logTest(
        'Redemption accepted',
        redeem.status === 200,
        `status=${redeem.status}`
      );
      logTest(
        'Redemption response has success flag',
        redeem.data.success === true,
        `success=${redeem.data.success}`
      );
    } catch (error) {
      logTest('Token redemption', false, error.message);
    }

    // Test 5: Verify database update
    console.log('\n📋 TEST 5: Database Verification');
    console.log('─'.repeat(70));
    try {
      // Wait a moment for database to be updated
      await new Promise((resolve) => setTimeout(resolve, 500));

      const dbToken = await checkDB('TKZ-003');
      logTest(
        'Token status updated to redeemed',
        dbToken?.status === 'redeemed',
        `status=${dbToken?.status}`
      );
      logTest(
        'Token has redeemed timestamp',
        !!dbToken?.redeemedAt,
        `timestamp=${dbToken?.redeemedAt}`
      );
      logTest(
        'Token shows redeemed by volunteer',
        dbToken?.redeemedBy === 'volunteer1',
        `redeemedBy=${dbToken?.redeemedBy}`
      );
    } catch (error) {
      logTest('Database verification', false, error.message);
    }

    // Test 6: Prevent duplicate redemption
    console.log('\n📋 TEST 6: Duplicate Redemption Protection');
    console.log('─'.repeat(70));
    try {
      const redeem2 = await makeRequest(
        'POST',
        '/api/redeem',
        { tokenCode: 'TKZ-003' },
        { 'x-auth-token': authToken }
      );
      logTest(
        'Duplicate redemption rejected',
        redeem2.status === 409,
        `status=${redeem2.status}`
      );
      logTest(
        'Error message indicates already redeemed',
        redeem2.data.error?.includes('already redeemed'),
        `error=${redeem2.data.error}`
      );
    } catch (error) {
      logTest('Duplicate redemption test', false, error.message);
    }

    // Test 7: Admin summary
    console.log('\n📋 TEST 7: Admin Summary');
    console.log('─'.repeat(70));
    try {
      const summary = await makeRequest(
        'GET',
        '/api/admin/summary',
        null,
        { 'x-auth-token': authToken }
      );
      logTest(
        'Admin summary accessible',
        summary.status === 200,
        `status=${summary.status}`
      );
      logTest(
        'Summary shows redeemed count',
        summary.data.redeemed >= 1,
        `redeemed=${summary.data.redeemed}`
      );
      console.log(`   → Total tokens: ${summary.data.totalTokens}`);
      console.log(`   → Redeemed: ${summary.data.redeemed}`);
      console.log(`   → Pending: ${summary.data.pending}`);
    } catch (error) {
      logTest('Admin summary', false, error.message);
    }
  } catch (error) {
    console.error('Fatal error:', error);
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log(
    `\n📊 Test Results: ${testResults.passed} passed, ${testResults.failed} failed\n`
  );

  if (testResults.failed === 0) {
    console.log('🎉 ALL TESTS PASSED! System ready for live event!\n');
  } else {
    console.log('⚠️  Some tests failed. Review results above.\n');
  }
}

runTests().catch(console.error);
