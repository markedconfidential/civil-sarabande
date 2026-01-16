#!/usr/bin/env node
/**
 * Helper script to get the server wallet address from a private key
 * Usage: node get-server-address.js <private-key>
 */

const { privateKeyToAccount } = require('viem/accounts');

const privateKey = process.argv[2];

if (!privateKey) {
  console.error('Usage: node get-server-address.js <private-key>');
  console.error('Example: node get-server-address.js 0x1234...');
  process.exit(1);
}

try {
  const account = privateKeyToAccount(privateKey);
  console.log('Server wallet address:', account.address);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
