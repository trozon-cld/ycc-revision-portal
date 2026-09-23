#!/usr/bin/env node
// Usage: npm run hash -- "YourStrongPassword"

const bcrypt = require("bcryptjs");

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash -- "YourStrongPassword"');
  process.exit(1);
}

const SALT_ROUNDS = 12;
const hash = bcrypt.hashSync(password, SALT_ROUNDS);

console.log(hash);
