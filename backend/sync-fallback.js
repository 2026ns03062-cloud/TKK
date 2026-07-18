#!/usr/bin/env node
const http = require('http');

// Call the sync endpoint locally
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/sync-fallback-to-db',
  method: 'POST',
  headers: {
    'x-auth-token': 'dummy-token', // Will need actual token
    'Content-Type': 'application/json',
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response:', JSON.parse(data));
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();
