#!/usr/bin/env node
// tests/rate-limit-degrade.js — نگهبانِ «سقفِ نرخِ مشترکِ cluster زیرِ خرابیِ DB»
//
// ---------- چرا این آزمون وجود دارد ----------
// `lib/rate-limit-sqlite.js` تنها سقفِ نرخِ مشترکِ بین workerهاست (نسخه‌ی
// درون‌حافظه‌ای در cluster بی‌معنی است: هر worker جدا می‌شمارد). ولی هر
// کوئری‌اش می‌تواند خطا بدهد — جدولِ پاک‌شده، فایلِ قفل، دیسکِ خراب. رفتارِ
// خطا این بود که فقط ناشناس `next()` می‌شد: یعنی از آن لحظه **هیچ سقفی اعمال
// نمی‌شود و هیچ‌کس نمی‌فهمد**. مسیرِ ورود با رمز، ثبت‌نام، و نوشتن — همه
// بی‌سقف می‌شدند و تنها نشانه‌اش هیچ بود.
//
// حالا: عبور همچنان (قفل‌کردنِ کلِ سایت بدتر از نبودِ سقفِ لحظه‌ای است)، ولی
// هر خطا شمرده می‌شود (`degraded`), با throttle لاگ می‌شود، و از
// `getRateLimitStats` بیرون می‌زند تا `/api/health?full=1` دیده شود. این
// مجموعه همان سه چیز را روی دیتابیسِ سندباکسِ واقعی می‌سنجد:
//   ۱) سقف در حالتِ سالم واقعاً اعمال می‌شود (429 و هدرها)،
//   ۲) زیرِ خرابیِ واقعیِ SQLite (DROP TABLE) درخواست‌ها عبور می‌کنند،
//   ۳) بعد از بازگشتِ جدول، سقف خودش برمی‌گردد و شمارنده خاموش می‌ماند.
//
// سنجشِ زنده است نه الگو، چون همه‌ی این‌ها در **اجرای واقعیِ** میان‌افزار روی
// یک فایلِ واقعی اتفاق می‌افتد؛ «جدول در فایل هست» یا «next() در catch هست»
// هیچ‌کدام مسیرِ خرابی را اثبات نمی‌کنند.

'use strict';

const path = require('path');
const { makeSandboxData, removeSandboxData } = require('./sandbox');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ` - ${detail}` : ''}`);
}

// --- سندباکس: دیتابیسِ کپی‌شده، پیش از هر requireی که مسیر را می‌خواند ---
const SANDBOX = makeSandboxData();
process.env.PG_DATA_DIR = SANDBOX;
process.env.PG_PICTURE_DIR = path.join(SANDBOX, 'picture');

const { db } = require('../lib/db');
const { rateLimitSqlite, getRateLimitStats } = require('../lib/rate-limit-sqlite');

// --- req/res جعلیِ حداقلی: همان چیزهایی که میان‌افزار لمس می‌کند ---
function fakeRes() {
  const res = {
    statusCode: 200,
    _headers: {},
    setHeader(k, v) { res._headers[k] = v; },
    getHeader(k) { return res._headers[k]; },
    status(code) { res.statusCode = code; return res; },
    json(body) { res._body = body; res._sent = true; return res; },
    on(event, fn) { if (event === 'finish') res._finish = fn; return res; },
  };
  return res;
}
// فراخوانیِ همگامِ میان‌افزار (SQLite هم همگام است): هرچه اتفاق بیفتد همین‌جا
// رخ می‌دهد، پس بدون Promise نتیجه را برمی‌گردانیم.
function call(mw, ip = '10.9.9.9') {
  const req = { ip, session: {} };
  const res = fakeRes();
  let nexted = false;
  mw(req, res, () => {
    nexted = true;
    if (res._finish) res._finish(); // شبیه‌سازیِ پاسخِ موفق برای skipSuccessها
  });
  return { res, nexted };
}

const limiter = rateLimitSqlite({ windowMs: 60 * 1000, max: 2, message: 'زیاد شد' });

console.log(`\n[rate-limit-degrade] سندباکس: ${SANDBOX}\n`);

// ---------- ۱) حالتِ سالم: سقف واقعاً اعمال می‌شود ----------
{
  const a = call(limiter);
  const b = call(limiter);
  const c = call(limiter);
  check('حالتِ سالم: دو درخواست اول عبور می‌کنند و سوم ۴۲۹ می‌گیرد',
    a.nexted && b.nexted && !c.nexted && c.res.statusCode === 429,
    `nexted=${a.nexted},${b.nexted},${c.nexted} status=${c.res.statusCode}`);
  check('حالتِ سالم: هدرهای X-RateLimit و Retry-After ست می‌شوند',
    a.res.getHeader('X-RateLimit-Limit') === '2' &&
    a.res.getHeader('X-RateLimit-Remaining') === '1' &&
    Number(c.res.getHeader('Retry-After')) >= 0,
    JSON.stringify({ limit: a.res.getHeader('X-RateLimit-Limit'), retry: c.res.getHeader('Retry-After') }));
}

const stats0 = getRateLimitStats();
check('آمارِ اولیه: degraded صفر است', stats0.degraded === 0, JSON.stringify(stats0));

// ---------- ۲) خرابیِ واقعیِ SQLite: جدول پاک شود ----------
// میان‌افزار باید (الف) خطا ندهد، (ب) درخواست را عبور دهد، (ج) شمارنده بالا برود.
db.exec('DROP TABLE rate_limits');
{
  const d1 = call(limiter);
  check('خرابیِ DB: درخواست به‌جای خطا/۴۲۹ عبور می‌کند (fail-open)',
    d1.nexted && d1.res.statusCode === 200 && !d1.res._sent,
    `nexted=${d1.nexted} status=${d1.res.statusCode}`);
  const d2 = call(limiter);
  check('خرابیِ DB: عبور پایدار است (درخواست دوم هم عبور می‌کند)',
    d2.nexted === true);
  const stats1 = getRateLimitStats();
  check('خرابیِ DB: شمارندهٔ degraded بالا رفت (سلامت می‌بیند)',
    stats1.degraded >= 2, `degraded=${stats1.degraded}`);
}

// ---------- ۳) بازگشتِ جدول: سقف خودش برمی‌گردد، شمارنده خاموش می‌ماند ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    key   TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL
  )
`);
{
  const degBefore = getRateLimitStats().degraded;
  const r1 = call(limiter);
  const r2 = call(limiter);
  const r3 = call(limiter);
  check('بازگشتِ جدول: سقف بدون ری‌استارت دوباره اعمال می‌شود',
    r1.nexted && r2.nexted && !r3.nexted && r3.res.statusCode === 429,
    `status=${r3.res.statusCode}`);
  check('بازگشتِ جدول: شمارندهٔ degraded دیگر بالا نمی‌رود',
    getRateLimitStats().degraded === degBefore,
    `degraded=${getRateLimitStats().degraded}`);
}

// ---------- پاک‌سازی ----------
// این آزمون و دیتابیسش در همین پروسه باز است؛ روی ویندوز فایلِ قفل‌شده پاک
// نمی‌شود، پس فقط پاک‌سازیِ اجباری می‌کنیم و «حذف واقعی» را نمی‌سنجیم (خودِ
// os.tmpdir سیستمی تمیز می‌شود). سنجیدنِ حذف، آزمون را به رفتارِ فایل‌سیستمِ
// ویندوز گره می‌زند نه به منطقِ rate limit.
removeSandboxData(SANDBOX);

const pass = results.filter(r => r.ok).length;
const fail = results.length - pass;
console.log('\n------------------------------------------------------------');
console.log(`  Total: ${results.length} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
console.log('------------------------------------------------------------\n');
process.exit(fail === 0 ? 0 : 1);
