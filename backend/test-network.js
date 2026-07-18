#!/usr/bin/env node
/**
 * Quick network diagnostic - test if MongoDB network is accessible
 */

const dns = require('dns').promises;
const net = require('net');

async function testMongoDBConnectivity() {
  console.log('\n🔍 MongoDB Network Connectivity Diagnostic\n');
  console.log('═'.repeat(70));

  // Test 1: DNS Resolution
  console.log('\n📋 Step 1: DNS Resolution');
  console.log('─'.repeat(70));
  
  try {
    const addresses = await dns.resolveSrv('_mongodb._tcp.cluster0.brbgxbn.mongodb.net');
    console.log('✅ SRV DNS Resolution successful');
    console.log(`   Found ${addresses.length} MongoDB servers:`);
    addresses.slice(0, 3).forEach((addr, idx) => {
      console.log(`   ${idx + 1}. ${addr.name}:${addr.port}`);
    });
  } catch (error) {
    console.log(`❌ SRV DNS Resolution failed: ${error.message}`);
    return;
  }

  // Test 2: DNS A Record
  console.log('\n📋 Step 2: Cluster Hostname Resolution');
  console.log('─'.repeat(70));
  
  try {
    const addresses = await dns.resolve4('cluster0.brbgxbn.mongodb.net');
    console.log('✅ Hostname resolution successful');
    console.log(`   IP Addresses: ${addresses.join(', ')}`);
  } catch (error) {
    console.log(`❌ Hostname resolution failed: ${error.message}`);
  }

  // Test 3: TCP Connection Test
  console.log('\n📋 Step 3: TCP Connection Test (Port 27017)');
  console.log('─'.repeat(70));
  
  const testServers = [
    'cluster0-shard-00-00.brbgxbn.mongodb.net:27017',
    'cluster0-shard-00-01.brbgxbn.mongodb.net:27017',
  ];

  for (const server of testServers) {
    const [host, port] = server.split(':');
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection(
          { host, port: parseInt(port), timeout: 5000 },
          () => {
            socket.destroy();
            resolve(true);
          }
        );
        socket.on('error', reject);
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        });
      });
      console.log(`✅ ${server} - Connection successful`);
    } catch (error) {
      console.log(`❌ ${server} - ${error.message}`);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('\n📋 Interpretation:');
  console.log('   ✅ All tests passed: Network whitelist is working');
  console.log('   ❌ Tests failed: Network whitelist or firewall blocking');
  console.log('\n💡 Next steps:');
  console.log('   1. Verify 0.0.0.0/0 is in MongoDB Atlas Network Access');
  console.log('   2. Wait 5-10 minutes for changes to fully propagate');
  console.log('   3. Check if Render has outbound internet access');
  console.log('═'.repeat(70) + '\n');
}

testMongoDBConnectivity().catch(console.error);
