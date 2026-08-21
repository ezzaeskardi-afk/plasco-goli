#!/usr/bin/env node

const path = require('path');
const { errorDigest } = require('../lib/error-digest');
const { LOG_DIR } = require('../lib/logger');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const match = String(process.argv[i]).match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
}

const days = Math.min(Math.max(Number(args.get('days') || 7) || 7, 1), 14);
const digest = errorDigest({
  logDir: path.resolve(args.get('dir') || LOG_DIR),
  rootDir: path.join(__dirname, '..'),
  days
});

process.stdout.write(JSON.stringify(digest, null, 2) + '\n');
