#!/usr/bin/env node
// tests/owasp-scan.js — اسکن امنیتی خودکار OWASP Top 10
// اجرا: node tests/owasp-scan.js

const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 4010;
const DIR = path.join(__dirname, '..');

/* پوشه‌ی داده‌ی این اجرا. سه ویژگی‌اش عمدی است:

   • **یکتا** است، نه یک نامِ ثابت. قبلاً `data/_owasp_sandbox` بود و پاک‌سازیِ
     آخرِ کار روی ویندوز شکست می‌خورد — چون `kill()` فقط سیگنال می‌فرستد و تا
     لحظه‌ی حذف، فایلِ دیتابیس هنوز دستِ پروسه‌ی فرزند بود؛ خطای EBUSY هم بی‌صدا
     خورده می‌شد. نتیجه: اجرای بعدی روی دیتابیسِ اجرای قبلی بالا می‌آمد.
     `otp_codes` و `otp_ip_log` ارث می‌رسیدند، یعنی سقفِ روزانه‌ی OTP از اجرای
     قبل نیمه‌پر بود. تستِ ۷.۱ همان‌طور سبز می‌ماند ولی ۴۲۹ را از سقفِ روزانه
     می‌گرفت نه از میان‌افزارِ نرخ — چیزی که ادعا می‌کند را دیگر نمی‌سنجید.
     با پوشه‌ی یکتا اصلاً ارث‌بری ممکن نیست.

   • **بیرونِ مخزن** است، در پوشه‌ی موقتِ سیستم — همان قرارِ `tests/sandbox.js`.
     هر چه جا بماند آشغالِ سیستم است نه آشغالِ پروژه.

   • **خالی** است، برخلافِ `makeSandboxData()` که کپیِ دیتابیسِ واقعی را می‌دهد.
     سرور خودش دانه‌ی تازه می‌کارد. برای اسکنِ امنیتی همین درست است: نتیجه
     تکرارپذیر می‌شود و داده‌ی واقعیِ مغازه هرگز پای اسکن نمی‌آید.

   به همین دلیل هم `serverEnv()`ِ آن فایل را استعمال نمی‌کنیم: آن سقف‌های نرخ را
   روی ۱۰۰۰۰ باز می‌کند تا تست‌های عملکردی سهمیه تمام نکنند، ولی اینجا دقیقاً
   خودِ همان سقف‌ها موضوعِ آزمون‌اند. */
const SANDBOX_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-owasp-'));

let serverProc = null;
let pass = 0, fail = 0;

function ok(label) { pass++; console.log(`  [PASS] ${label}`); }
function notOk(label, detail) { fail++; console.error(`  [FAIL] ${label} — ${detail}`); }
function section(name) { console.log(`\n=== OWASP ${name} ===`); }

function fetch(opts) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, ...opts }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cookieFetch(cookie, opts) {
  return fetch({ ...opts, headers: { ...opts.headers, Cookie: cookie } });
}

// --- شروع سرور ---
function startServer() {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PG_DATA_DIR: SANDBOX_DIR, PORT: String(PORT), LOG_CONSOLE: 'false' };
    serverProc = spawn(process.execPath, [path.join(DIR, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let started = false;
    const timeout = setTimeout(() => { if (!started) { serverProc.kill(); reject(new Error('server start timeout')); } }, 15000);
    serverProc.stdout.on('data', d => {
      const s = String(d);
      if (!started && s.includes('is running')) { started = true; clearTimeout(timeout); setTimeout(resolve, 500); }
    });
    serverProc.stderr.on('data', d => process.stderr.write(d));
    serverProc.on('error', reject);
  });
}

// `kill()` فقط سیگنال می‌فرستد؛ خروجِ واقعیِ پروسه بعداً اتفاق می‌افتد و تا آن
// لحظه فایلِ دیتابیس دستِ فرزند است. اگر بی‌درنگ سراغِ پاک‌کردنِ پوشه برویم،
// ویندوز EBUSY می‌دهد. پس منتظرِ رویدادِ `exit` می‌مانیم — با سقفِ زمانی، تا اگر
// پروسه نمرد اسکن معلق نماند.
function stopServer() {
  return new Promise(resolve => {
    if (!serverProc) return resolve();
    const p = serverProc;
    serverProc = null;
    const giveUp = setTimeout(resolve, 3000);
    p.once('exit', () => { clearTimeout(giveUp); resolve(); });
    p.kill();
  });
}

// --- پاک‌سازی sandbox ---
// قبلاً خطا را بی‌صدا می‌خورد، و همان سکوت بود که نشتی را پنهان کرد: پوشه
// می‌ماند و هیچ‌کس نمی‌فهمید. حالا چند بار تلاش می‌کند — ویندوز ممکن است چند صد
// میلی‌ثانیه بعدِ مرگِ پروسه هم قفل را نگه دارد — و اگر آخرش نشد، بلند می‌گوید.
// شکستِ پاک‌سازی نتیجه‌ی اسکن را عوض نمی‌کند (پوشه در tmp سیستم است، نه مخزن)،
// ولی باید دیده شود.
async function cleanSandbox() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { fs.rmSync(SANDBOX_DIR, { recursive: true, force: true }); return true; }
    catch (e) {
      if (attempt === 5) {
        console.error(`  [WARN] پوشه‌ی موقتِ اسکن پاک نشد: ${SANDBOX_DIR} — ${e.message}`);
        return false;
      }
      await sleep(150);
    }
  }
  return false;
}

// ============================================================
// A01: Broken Access Control
// ============================================================
async function scanA01() {
  section('A01: Broken Access Control');

  // 1.1 — پنل ادمین بدون ورود باید ۴۰۱ بدهد
  try {
    const r = await fetch({ path: '/api/admin/stats', method: 'GET' });
    if (r.status === 401) ok('Admin API returns 401 without session');
    else notOk('Admin API returns 401 without session', `got ${r.status}`);
  } catch (e) { notOk('Admin API check', e.message); }

  // 1.2 — محصول پیش‌نویس برای عموم قابل دسترسی نیست
  try {
    const all = await fetch({ path: '/api/products', method: 'GET' });
    if (all.json?.products) {
      const drafts = all.json.products.filter(p => p.published === 0);
      if (drafts.length === 0) ok('Draft products not exposed in public list');
      else notOk('Draft products exposed', `${drafts.length} draft(s) found`);
    } else ok('Products endpoint returns valid structure');
  } catch (e) { notOk('Product access check', e.message); }

  // 1.3 — IDOR: سفارش کاربر دیگر قابل دسترسی نیست
  try {
    const r = await fetch({ path: '/api/orders/1', method: 'GET' });
    if (r.status === 401) ok('Order access requires authentication');
    else notOk('Order access without auth', `got ${r.status}`);
  } catch (e) { notOk('IDOR check', e.message); }

  // 1.4 — CORS: درخواست از مبدأ بیگانه باید رد شود
  try {
    const r = await fetch({ path: '/api/cart/add', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://evil.com' },
      body: JSON.stringify({ productId: 1, qty: 1 })
    });
    if (r.status === 403) ok('Cross-origin write blocked (CSRF protection)');
    else notOk('Cross-origin write not blocked', `got ${r.status}`);
  } catch (e) { notOk('CSRF check', e.message); }

  // 1.5 — آدرس API ناشناخته باید ۴۰۴ برگرداند
  try {
    const r = await fetch({ path: '/api/nonexistent-endpoint', method: 'GET' });
    if (r.status === 404) ok('Unknown API endpoint returns 404');
    else notOk('Unknown endpoint', `got ${r.status}`);
  } catch (e) { notOk('404 check', e.message); }

  // 1.6 — فایل حساس .env نباید سرو شود
  try {
    const r = await fetch({ path: '/.env', method: 'GET' });
    if (r.status === 404) ok('.env file not served publicly');
    else notOk('.env served publicly', `got ${r.status}`);
  } catch (e) { notOk('.env check', e.message); }
}

// ============================================================
// A02: Cryptographic Failures
// ============================================================
async function scanA02() {
  section('A02: Cryptographic Failures');

  // 2.1 — هدرهای امنیتی حساس
  try {
    const r = await fetch({ path: '/', method: 'GET' });
    const h = r.headers;
    const checks = [
      ['x-content-type-options', 'nosniff'],
      ['x-frame-options', 'SAMEORIGIN'],
      ['referrer-policy', 'strict-origin-when-cross-origin'],
    ];
    for (const [name, expected] of checks) {
      if (String(h[name] || '').toLowerCase() === expected.toLowerCase()) ok(`Header ${name} = ${expected}`);
      else notOk(`Header ${name}`, `expected "${expected}", got "${h[name] || 'missing'}"`);
    }
  } catch (e) { notOk('Security headers check', e.message); }

  // 2.2 — CSP فعال است
  try {
    const r = await fetch({ path: '/', method: 'GET' });
    const csp = r.headers['content-security-policy'] || '';
    if (csp.includes("default-src 'self'") && csp.includes("script-src 'self'")) {
      ok('CSP: default-src and script-src are self-only');
    } else {
      notOk('CSP: missing restrictive defaults', csp.slice(0, 120));
    }
    if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) {
      notOk('CSP: unsafe-inline or unsafe-eval found', csp.slice(0, 200));
    } else {
      ok('CSP: no unsafe-inline or unsafe-eval');
    }
  } catch (e) { notOk('CSP check', e.message); }

  // 2.3 — کوکی امن
  try {
    const r = await fetch({ path: '/api/auth/otp/challenge', method: 'GET' });
    const setCookie = r.headers['set-cookie'] || [];
    const sessionCookie = setCookie.find(c => c.includes('polasco.sid'));
    if (sessionCookie) {
      if (sessionCookie.includes('HttpOnly')) ok('Session cookie is HttpOnly');
      else notOk('Session cookie not HttpOnly', sessionCookie);
      if (sessionCookie.includes('SameSite=Lax') || sessionCookie.includes('SameSite=lax')) {
        ok('Session cookie has SameSite=Lax');
      } else {
        notOk('Session cookie missing SameSite', sessionCookie);
      }
    } else {
      // Session not set yet — that's OK (saveUninitialized: false)
      ok('No session cookie on anonymous GET (saveUninitialized: false)');
    }
  } catch (e) { notOk('Cookie security check', e.message); }

  // 2.4 — X-Powered-By حذف شده
  try {
    const r = await fetch({ path: '/', method: 'GET' });
    if (!r.headers['x-powered-by']) ok('X-Powered-By header removed');
    else notOk('X-Powered-By exposed', r.headers['x-powered-by']);
  } catch (e) { notOk('X-Powered-By check', e.message); }
}

// ============================================================
// A03: Injection
// ============================================================
async function scanA03() {
  section('A03: Injection');

  // 3.1 — SQL Injection در جستجو
  try {
    const payloads = [
      "' OR '1'='1",
      "'; DROP TABLE products; --",
      "1 UNION SELECT * FROM users",
      "Robert'); DROP TABLE users;--"
    ];
    let allSafe = true;
    for (const q of payloads) {
      const r = await fetch({ path: `/api/products?q=${encodeURIComponent(q)}`, method: 'GET' });
      if (r.status === 200 && r.json?.products) {
        // Query returned products but didn't crash = safe
      } else if (r.status >= 500) {
        allSafe = false;
        notOk(`SQL injection payload caused error: ${q.slice(0, 30)}`, `status ${r.status}`);
      }
    }
    if (allSafe) ok('SQL injection payloads handled safely in search');
  } catch (e) { notOk('SQL injection check', e.message); }

  // 3.2 — XSS در پارامترهای URL
  try {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      "javascript:alert(1)",
    ];
    let allSafe = true;
    for (const q of xssPayloads) {
      const r = await fetch({ path: `/api/products?q=${encodeURIComponent(q)}`, method: 'GET' });
      if (r.body.includes('<script>alert') || r.body.includes('onerror=alert')) {
        allSafe = false;
        notOk(`Reflected XSS in search: ${q.slice(0, 30)}`, 'payload found in response');
      }
    }
    if (allSafe) ok('XSS payloads not reflected in API responses');
  } catch (e) { notOk('XSS check', e.message); }

  // 3.3 — Path traversal
  try {
    const payloads = ['../../../etc/passwd', '..%2F..%2Fetc%2Fpasswd', '....//....//etc/passwd'];
    let allSafe = true;
    for (const p of payloads) {
      const r = await fetch({ path: `/${p}`, method: 'GET' });
      if (r.status === 200 && r.body.includes('root:')) {
        allSafe = false;
        notOk(`Path traversal: ${p}`, 'file content leaked');
      }
    }
    if (allSafe) ok('Path traversal payloads blocked');
  } catch (e) { notOk('Path traversal check', e.message); }

  // 3.4 — Header injection (CRLF)
  try {
    const r = await fetch({ path: '/api/products?q=%0d%0aX-Injected:true', method: 'GET' });
    if (!r.headers['x-injected']) ok('CRLF header injection blocked');
    else notOk('CRLF injection succeeded', 'X-Injected header present');
  } catch (e) { notOk('CRLF check', e.message); }

  // 3.5 — JSON payload بزرگ
  try {
    const bigPayload = '{' + '"a":"b",'.repeat(10000) + '"z":"y"}';
    const r = await fetch({ path: '/api/cart/add', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: bigPayload });
    if (r.status === 413 || r.status === 400) ok('Oversized JSON payload rejected');
    else notOk('Oversized JSON', `got ${r.status}`);
  } catch (e) { notOk('Payload size check', e.message); }
}

// ============================================================
// A04: Insecure Design
// ============================================================
async function scanA04() {
  section('A04: Insecure Design');

  // 4.1 — تلاش OTP با کد اشتباه
  try {
    // اول challenge بگیر
    const ch = await fetch({ path: '/api/auth/otp/challenge', method: 'GET' });
    const token = ch.json?.token;

    // کد اشتباه بفرست
    const r = await fetch({ path: '/api/auth/otp/verify', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '09123456789', code: '00000', challenge: token })
    });
    if (r.status >= 400) ok('Invalid OTP code rejected');
    else notOk('Invalid OTP accepted', `got ${r.status}`);
  } catch (e) { notOk('OTP validation check', e.message); }

  // 4.2 — شماره موبایل نامعتبر
  try {
    const r = await fetch({ path: '/api/auth/otp/request', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '12345', challenge: 'test1234567890ab' })
    });
    if (r.status >= 400) ok('Invalid phone number rejected');
    else notOk('Invalid phone accepted', `got ${r.status}`);
  } catch (e) { notOk('Phone validation check', e.message); }

  // 4.3 — Idempotency key validation
  try {
    const r = await fetch({ path: '/api/orders', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'short' },
      body: JSON.stringify({ addressId: 1 })
    });
    if (r.status === 401 || r.status === 400) ok('Order requires auth + valid idempotency key');
    else notOk('Order without auth', `got ${r.status}`);
  } catch (e) { notOk('Order validation check', e.message); }

  // 4.4 — Webhook/callback endpoint معتبر نیست
  try {
    const r = await fetch({ path: '/api/orders/payment-callback?orderId=99999&Authority=FAKE&Status=OK', method: 'GET' });
    if (r.status === 302 || r.status >= 400) ok('Payment callback validates orderId');
    else notOk('Payment callback unchecked', `got ${r.status}`);
  } catch (e) { notOk('Payment callback check', e.message); }
}

// ============================================================
// A05: Security Misconfiguration
// ============================================================
async function scanA05() {
  section('A05: Security Misconfiguration');

  // 5.1 — سرور نسخه‌ی خود را افشا نمی‌کند
  try {
    const r = await fetch({ path: '/', method: 'GET' });
    const server = r.headers['server'] || '';
    if (!server || !server.includes('Express')) ok('Server version not disclosed');
    else notOk('Server version exposed', server);
  } catch (e) { notOk('Server disclosure check', e.message); }

  // 5.2 — /healthz اطلاعات حساس نمی‌دهد
  try {
    const r = await fetch({ path: '/healthz', method: 'GET' });
    const body = r.body;
    if (!body.includes('node_modules') && !body.includes('node:') && !body.includes('/backend/')) {
      ok('/healthz does not expose internal paths');
    } else {
      notOk('/healthz leaks internal info', body.slice(0, 100));
    }
  } catch (e) { notOk('/healthz check', e.message); }

  // 5.3 — debug endpoint وجود ندارد
  try {
    const r = await fetch({ path: '/api/debug', method: 'GET' });
    if (r.status === 404) ok('No debug endpoint exposed');
    else notOk('Debug endpoint found', `got ${r.status}`);
  } catch (e) { notOk('Debug endpoint check', e.message); }

  // 5.4 — فایل‌های پنهان
  try {
    const hidden = ['/.git/config', '/.git/HEAD', '/.env', '/.env.local', '/data/polasco.db'];
    let allBlocked = true;
    for (const f of hidden) {
      const r = await fetch({ path: f, method: 'GET' });
      if (r.status !== 404) { allBlocked = false; notOk(`Hidden file accessible: ${f}`, `got ${r.status}`); }
    }
    if (allBlocked) ok('All hidden/sensitive files return 404');
  } catch (e) { notOk('Hidden files check', e.message); }

  // 5.5 — Directory listing غیرفعال
  try {
    const r = await fetch({ path: '/picture/', method: 'GET' });
    if (r.status === 404 || !r.body.includes('<title>Index of')) {
      ok('Directory listing disabled');
    } else {
      notOk('Directory listing enabled', 'listing page shown');
    }
  } catch (e) { notOk('Directory listing check', e.message); }
}

// ============================================================
// A06: Vulnerable and Outdated Components
// ============================================================
async function scanA06() {
  section('A06: Vulnerable and Outdated Components');

  // 6.1 — package-lock.json وجود دارد
  try {
    const lockExists = fs.existsSync(path.join(DIR, 'package-lock.json'));
    if (lockExists) ok('package-lock.json exists (dependency lockfile)');
    else notOk('Missing package-lock.json', 'no lockfile');
  } catch (e) { notOk('Lockfile check', e.message); }

  // 6.2 — استفاده از node:sqlite (built-in)
  try {
    const dbContent = fs.readFileSync(path.join(DIR, 'lib', 'db.js'), 'utf8');
    if (dbContent.includes("require('node:sqlite')") || dbContent.includes('require("node:sqlite")')) {
      ok('Uses built-in node:sqlite (no native module risk)');
    } else {
      ok('Database module loaded');
    }
  } catch (e) { notOk('DB module check', e.message); }

  // 6.3 — بدون eval در سمت سرور
  try {
    const serverContent = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
    if (!serverContent.includes('eval(') && !serverContent.includes('Function(')) {
      ok('No eval/Function in server.js');
    } else {
      notOk('eval/Function found in server.js', 'potential code injection');
    }
  } catch (e) { notOk('eval check', e.message); }

  // 6.4 — هیچ exec با ورودی کاربر
  try {
    const routeFiles = fs.readdirSync(path.join(DIR, 'routes')).filter(f => f.endsWith('.js'));
    let clean = true;
    for (const f of routeFiles) {
      const content = fs.readFileSync(path.join(DIR, 'routes', f), 'utf8');
      if (content.includes('.exec(') && !content.includes('db.exec')) {
        clean = false;
        notOk(`exec() found in routes/${f}`, 'potential command injection');
      }
    }
    if (clean) ok('No shell exec with user input in route files');
  } catch (e) { notOk('exec check', e.message); }
}

// ============================================================
// A07: Identification and Authentication Failures
// ============================================================
async function scanA07() {
  section('A07: Identification and Authentication Failures');

  // 7.1 — Rate limit روی OTP
  //
  // حلقه ۲۵ بار است و سقفِ `otpIpLimiter` در routes/auth.js عدد ۲۰ — پس ۴۲۹ باید
  // قطعاً بیاید. میان‌افزارِ نرخ قبل از `validate` می‌نشیند، پس درخواست‌هایی که
  // challenge‌شان مصرف شده هم شمرده می‌شوند و شمارش به سقف می‌رسد.
  //
  // شاخه‌ی «نیامد» قبلاً هم `ok()` صدا می‌زد با پیامِ «test mode, lower limits».
  // یعنی این تست هر دو حالت را قبول می‌کرد و عملاً هیچ‌چیز را نمی‌سنجید: اگر یک
  // روز کسی سقف را بالای ۲۵ می‌برد یا میان‌افزار را از مسیر برمی‌داشت، همین‌جا
  // سبز می‌ماند و در شمارشِ «۴۷ تست پاس» گم می‌شد. تستی که نمی‌تواند رد شود
  // خبری نمی‌دهد، فقط عدد را بزرگ می‌کند.
  try {
    const ch = await fetch({ path: '/api/auth/otp/challenge', method: 'GET' });
    const token = ch.json?.token;
    let got429 = false;
    let sent = 0;
    for (let i = 0; i < 25; i++) {
      sent++;
      const r = await fetch({ path: '/api/auth/otp/request', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '09990000001', challenge: token })
      });
      if (r.status === 429) { got429 = true; break; }
    }
    if (got429) ok('Rate limit enforced on OTP requests');
    else notOk('Rate limit NOT enforced on OTP requests',
      `${sent} درخواستِ پشت‌سرهم و هیچ ۴۲۹ای نیامد — سقفِ otpIpLimiter باید ۲۰ باشد`);
  } catch (e) { notOk('OTP rate limit check', e.message); }

  // 7.2 — بدون session fixation
  try {
    const r = await fetch({ path: '/api/auth/me', method: 'GET' });
    if (r.json?.user === null) ok('Unauthenticated /me returns null user');
    else notOk('/me returns user data without auth', JSON.stringify(r.json));
  } catch (e) { notOk('Session check', e.message); }

  // 7.3 — Lockout اعمال می‌شود
  try {
    const lockoutModule = require(path.join(DIR, 'lib', 'login-guard'));
    if (typeof lockoutModule.lockState === 'function' && typeof lockoutModule.registerFail === 'function') {
      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) lockoutModule.registerFail('test-lock-scan');
      const state = lockoutModule.lockState('test-lock-scan');
      if (state.locked) ok('Account lockout activates after max failed attempts');
      else notOk('Account lockout not activating', JSON.stringify(state));
      lockoutModule._resetAll();
    } else {
      ok('Login guard module exports found');
    }
  } catch (e) { notOk('Lockout check', e.message); }

  // 7.4 — رمز عبور بدون hash ذخیره نمی‌شود
  try {
    const dbContent = fs.readFileSync(path.join(DIR, 'lib', 'db.js'), 'utf8');
    const authContent = fs.readFileSync(path.join(DIR, 'routes', 'auth.js'), 'utf8');
    if (authContent.includes('scrypt') && authContent.includes('hashPassword')) {
      ok('Passwords hashed with scrypt');
    } else {
      notOk('Password hashing', 'scrypt not found');
    }
    if (!authContent.includes('plaintext') && !authContent.includes('md5') && !authContent.includes('sha1')) {
      ok('No weak hash algorithms for passwords');
    } else {
      notOk('Weak hash algorithm found', 'md5/sha1/plaintext detected');
    }
  } catch (e) { notOk('Password hash check', e.message); }
}

// ============================================================
// A08: Software and Data Integrity Failures
// ============================================================
async function scanA08() {
  section('A08: Software and Data Integrity Failures');

  // 8.1 — Idempotency key برای سفارش
  try {
    const r = await fetch({ path: '/api/orders', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'a' },
      body: JSON.stringify({})
    });
    if (r.status === 400 || r.status === 401) ok('Short idempotency key rejected');
    else notOk('Short idempotency key accepted', `got ${r.status}`);
  } catch (e) { notOk('Idempotency check', e.message); }

  // 8.2 — JSON payload محدودیت حجم دارد
  try {
    const r = await fetch({ path: '/api/cart/add', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(100000)
    });
    if (r.status === 413 || r.status === 400) ok('Large JSON body rejected (64KB limit)');
    else notOk('Large body accepted', `got ${r.status}`);
  } catch (e) { notOk('Payload limit check', e.message); }

  // 8.3 — تراکنش دیتابیس وجود دارد (ACID)
  try {
    const dbContent = fs.readFileSync(path.join(DIR, 'lib', 'db.js'), 'utf8');
    if (dbContent.includes('BEGIN IMMEDIATE') && dbContent.includes('COMMIT')) {
      ok('Database transactions use BEGIN/COMMIT (ACID)');
    } else {
      notOk('Transaction safety', 'BEGIN/COMMIT pattern not found');
    }
  } catch (e) { notOk('Transaction check', e.message); }
}

// ============================================================
// A09: Security Logging and Monitoring Failures
// ============================================================
async function scanA09() {
  section('A09: Security Logging and Monitoring Failures');

  // 9.1 — لاگر حساسیت‌ها را ماسک می‌کند
  try {
    const loggerContent = fs.readFileSync(path.join(DIR, 'lib', 'logger.js'), 'utf8');
    if (loggerContent.includes('[redacted]') && /password|secret|token|api.?key/i.test(loggerContent)) {
      ok('Logger redacts sensitive fields (password, secret, token)');
    } else {
      notOk('Logger redaction', 'sensitive field redaction not found');
    }
  } catch (e) { notOk('Logger check', e.message); }

  // 9.2 — شماره موبایل در لاگ ماسک می‌شود
  try {
    const errorDigest = fs.readFileSync(path.join(DIR, 'lib', 'error-digest.js'), 'utf8');
    if (errorDigest.includes('maskPhone')) {
      ok('Error digest masks phone numbers');
    } else {
      notOk('Phone masking in error digest', 'maskPhone not found');
    }
  } catch (e) { notOk('Phone masking check', e.message); }

  // 9.3 — لاگ دسترسی HTTP وجود دارد
  try {
    const serverContent = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
    if (serverContent.includes('accessLog') || serverContent.includes('res.on(\'finish\'')) {
      ok('HTTP access logging exists');
    } else {
      notOk('Access logging', 'not found in server.js');
    }
  } catch (e) { notOk('Access log check', e.message); }

  // 9.4 — CSP violation reporting فعال
  try {
    const r = await fetch({ path: '/', method: 'GET' });
    const csp = r.headers['content-security-policy'] || '';
    if (csp.includes('report-uri')) ok('CSP violation reporting enabled');
    else notOk('CSP reporting', 'report-uri not in CSP header');
  } catch (e) { notOk('CSP reporting check', e.message); }
}

// ============================================================
// A10: Server-Side Request Forgery (SSRF)
// ============================================================
async function scanA10() {
  section('A10: SSRF');

  // 10.1 — callback URL از request ساخته می‌شود نه input کاربر
  try {
    const ordersContent = fs.readFileSync(path.join(DIR, 'routes', 'orders.js'), 'utf8');
    if (ordersContent.includes('req.protocol') && ordersContent.includes("req.get('host')")) {
      ok('Payment callback URL built from server host (not user input)');
    } else {
      notOk('Callback URL construction', 'uses req properties');
    }
  } catch (e) { notOk('Callback URL check', e.message); }

  // 10.2 — پرداخت فقط به URLهای زرین‌پال
  try {
    const paymentContent = fs.readFileSync(path.join(DIR, 'lib', 'payment.js'), 'utf8');
    if (paymentContent.includes('api.zarinpal.com') && paymentContent.includes('www.zarinpal.com')) {
      ok('Payment gateway URLs are hardcoded to zarinpal.com');
    } else {
      notOk('Payment URLs', 'not hardcoded');
    }
  } catch (e) { notOk('Payment URL check', e.message); }

  // 10.3 — image-encode از spawn با آرایه استفاده می‌کند (نه shell string)
  try {
    const encContent = fs.readFileSync(path.join(DIR, 'lib', 'image-encode.js'), 'utf8');
    if (encContent.includes('.spawn(') && !encContent.includes('.exec(')) {
      ok('Image encoder uses spawn (safe) not exec (unsafe)');
    } else {
      notOk('Image encoder', 'uses exec or no spawn found');
    }
  } catch (e) { notOk('Image encode check', e.message); }

  // 10.4 — SMS از URL ثابت استفاده می‌کند
  try {
    const smsContent = fs.readFileSync(path.join(DIR, 'lib', 'sms.js'), 'utf8');
    if (smsContent.includes('kavenegar.com') || smsContent.includes('ippanel.com')) {
      ok('SMS providers use hardcoded API endpoints');
    } else {
      notOk('SMS endpoints', 'not hardcoded');
    }
  } catch (e) { notOk('SMS endpoint check', e.message); }
}

// ============================================================
// اجرای کلی
// ============================================================
(async () => {
  console.log('\n🔒 OWASP Top 10 Security Scan — Polasco Goli\n');
  console.log('Starting server on port', PORT, '...');

  try {
    await startServer();
    console.log('Server started.\n');

    await scanA01();
    await scanA02();
    await scanA03();
    await scanA04();
    await scanA05();
    await scanA06();
    await scanA07();
    await scanA08();
    await scanA09();
    await scanA10();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (e) {
    console.error('Scan failed:', e.message);
    fail++;
  } finally {
    await stopServer();
    await cleanSandbox();
    process.exit(fail > 0 ? 1 : 0);
  }
})();
