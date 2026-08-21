const fs = require('fs');
const path = require('path');
const { safeValue } = require('../lib/logger');

const root = path.resolve(__dirname, '..', '..');
const frontend = path.join(root, 'frontend');
const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(frontend).filter((f) => /\.(html|js|css|json|webmanifest|svg)$/i.test(f));
const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
if (/ZARINPAL_MERCHANT_ID\s*=|SMS_API_KEY\s*=|SESSION_SECRET\s*=|Authorization:\s*AccessKey/i.test(text)) {
  throw new Error('A server secret/config assignment appears in frontend files');
}
if (/^\s*(ZARINPAL_MERCHANT_ID|SMS_API_KEY|SESSION_SECRET)\s*=\s*[^\s#]+/m.test(envExample)
  && !/REPLACE_WITH_A_RANDOM_SECRET/.test(envExample)) {
  throw new Error('The environment template contains a non-placeholder secret');
}
const masked = safeValue({ password: 'secret', token: 'token', phone: '09120000000', ok: 'visible' });
if (JSON.stringify(masked).includes('secret') || JSON.stringify(masked).includes('09120000000')) {
  throw new Error('Sensitive values were not redacted by the logger');
}
console.log(`Secret boundary checks passed (${files.length} frontend files scanned)`);
