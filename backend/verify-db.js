const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://2026ns03062_db_user:rEaRHZeO0FKOz9z8@cluster0.brbgxbn.mongodb.net/';
const DB_NAME = 'tkk_festival';

async function verifyAndFixTokens() {
  const mongoOptions = {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 20000,
    maxPoolSize: 5,
  };

  const client = new MongoClient(MONGODB_URI, mongoOptions);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected successfully!');

    const db = client.db(DB_NAME);
    const tokensCollection = db.collection('tokens');

    // Check current tokens
    console.log('\n📊 Checking current tokens in database...');
    const allTokens = await tokensCollection.find({}).toArray();
    
    if (allTokens.length === 0) {
      console.log('❌ No tokens found in database');
      return;
    }

    console.log(`Found ${allTokens.length} tokens\n`);
    
    // Show first 5 tokens
    console.log('First 5 tokens:');
    allTokens.slice(0, 5).forEach(token => {
      console.log(`  - ${token.tokenCode} (status: ${token.status})`);
    });

    // Count by format
    const fourDigit = allTokens.filter(t => /^TKZ-\d{4}$/.test(t.tokenCode)).length;
    const threeDigit = allTokens.filter(t => /^TKZ-\d{3}$/.test(t.tokenCode)).length;

    console.log(`\n📈 Token Format Analysis:`);
    console.log(`  - 4-digit format (TKZ-0001): ${fourDigit} tokens`);
    console.log(`  - 3-digit format (TKZ-001): ${threeDigit} tokens`);

    // If there are 4-digit tokens, fix them
    if (fourDigit > 0) {
      console.log(`\n🔧 Found ${fourDigit} tokens in 4-digit format. Converting to 3-digit...`);
      
      const fourDigitTokens = allTokens.filter(t => /^TKZ-\d{4}$/.test(t.tokenCode));
      
      for (const token of fourDigitTokens) {
        const match = token.tokenCode.match(/^TKZ-(\d{4})$/);
        if (match) {
          const number = parseInt(match[1], 10);
          const newTokenCode = `TKZ-${String(number).padStart(3, '0')}`;
          
          const result = await tokensCollection.updateOne(
            { tokenCode: token.tokenCode },
            { $set: { tokenCode: newTokenCode } }
          );
          
          if (result.modifiedCount > 0) {
            console.log(`  ✅ ${token.tokenCode} → ${newTokenCode}`);
          }
        }
      }
      
      console.log(`\n✨ Migration completed!`);
    } else {
      console.log(`\n✅ All tokens are already in correct 3-digit format!`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Cannot connect to MongoDB. Check your internet connection and MONGODB_URI.');
    } else if (error.message.includes('SSL') || error.message.includes('TLS')) {
      console.log('\n⚠️  TLS/SSL connection error. This might be a network issue on Render.');
    }
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed');
  }
}

verifyAndFixTokens();
