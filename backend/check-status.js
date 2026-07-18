#!/usr/bin/env node
/**
 * TKK Token System - MongoDB Connection Diagnostic
 * 
 * This script checks if the database is properly connected and ready for the live event.
 */

const http = require('http');

console.log('\n🔍 TKK Token Redemption System - Database Status Check\n');
console.log('═'.repeat(60));

// Check local backend
function checkLocal() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: 'success', data: json });
        } catch (e) {
          resolve({ status: 'error', error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ status: 'error', error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'error', error: 'Connection timeout' });
    });

    req.end();
  });
}

// Check Render backend
function checkRender() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'tkk-token-backend.onrender.com',
      path: '/health',
      method: 'GET',
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: 'success', data: json });
        } catch (e) {
          resolve({ status: 'error', error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ status: 'error', error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'error', error: 'Connection timeout' });
    });

    req.end();
  });
}

async function runDiagnostics() {
  console.log('\n📍 Local Backend (localhost:3000)');
  console.log('─'.repeat(60));
  const local = await checkLocal();

  if (local.status === 'success') {
    const isDbConnected = local.data.database === 'connected';
    console.log(`Status: ${local.data.status}`);
    console.log(`Database: ${local.data.database} ${isDbConnected ? '✅' : '❌'}`);
    console.log(`Message: ${local.data.message}`);
    console.log(`Timestamp: ${local.data.timestamp}`);
  } else {
    console.log(`❌ Error: ${local.error}`);
    console.log('   Make sure: npm start or node server.js is running');
  }

  console.log('\n📍 Render Backend (tkk-token-backend.onrender.com)');
  console.log('─'.repeat(60));
  const render = await checkRender();

  if (render.status === 'success') {
    const isDbConnected = render.data.database === 'connected';
    console.log(`Status: ${render.data.status}`);
    console.log(`Database: ${render.data.database} ${isDbConnected ? '✅' : '❌'}`);
    console.log(`Message: ${render.data.message}`);
    console.log(`Timestamp: ${render.data.timestamp}`);
  } else {
    console.log(`❌ Error: ${render.error}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 ACTION ITEMS:\n');

  const localDbOk = local.status === 'success' && local.data.database === 'connected';
  const renderDbOk = render.status === 'success' && render.data.database === 'connected';

  if (!localDbOk) {
    console.log('❌ Local database connection failed!');
    console.log('   → Check MongoDB Atlas Network Access whitelist');
    console.log('   → See MONGODB_SETUP.md for detailed instructions\n');
  } else {
    console.log('✅ Local database connected\n');
  }

  if (!renderDbOk) {
    console.log('❌ Render database connection failed!');
    console.log('   → This is CRITICAL for live temple event');
    console.log('   → Check MongoDB Atlas Network Access whitelist');
    console.log('   → Add 0.0.0.0/0 or Render IP address');
    console.log('   → See MONGODB_SETUP.md for step-by-step guide\n');
  } else {
    console.log('✅ Render database connected\n');
  }

  if (localDbOk && renderDbOk) {
    console.log('🎉 SYSTEM READY FOR LIVE EVENT!');
    console.log('   All database connections working correctly\n');
  } else {
    console.log('⚠️  SYSTEM NOT READY FOR LIVE EVENT');
    console.log('   Fix the above issues before proceeding\n');
  }
}

runDiagnostics().catch(console.error);
