const crypto = require('crypto');

function boolEnv(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function boundedIntEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function validateProductionConfig({ isProduction, cookieSecure, sessionSecret }) {
  if (!isProduction) return;
  if (cookieSecure !== true) throw new Error('COOKIE_SECURE must be true in production');
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }
}

function newRequestId() {
  return crypto.randomBytes(6).toString('hex');
}

function validateRuntimeConfig({ isProduction, siteUrl }) {
  if (!isProduction) return;
  if (!/^https:\/\/[^\s/]+$/.test(String(siteUrl || ''))) {
    throw new Error('SITE_URL must be a valid https:// URL in production');
  }
}

module.exports = { boolEnv, boundedIntEnv, validateProductionConfig, validateRuntimeConfig, newRequestId };
