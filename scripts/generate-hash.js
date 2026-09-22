#!/usr/bin/env node
// Generates a bcrypt hash for a password, to paste into supabase/seed.sql
// (or use whenever you need to rotate the Superadmin password by hand).
//
// Usage:
//   npm run hash -- "YourStrongPassword"

const bcrypt = require("bcryptjs");

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash -- "YourStrongPassword"');
  process.exit(1);
}

const SALT_ROUNDS = 12;
const hash = bcrypt.hashSync(password, SALT_ROUNDS);

console.log(hash);
