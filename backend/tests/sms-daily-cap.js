#!/usr/bin/env node
// tests/sms-daily-cap.js — نگهبانِ سقفِ روزانه‌ی پیامکِ ورود
//
// ---------- چرا این آزمون وجود دارد ----------
// سقفِ روزانه‌ی پیامک سدِ هزینه است: بدونِ آن، هر کسی با هزاران درخواستِ کد،
// قبض پیامکِ فروشگاه را نجومی می‌کند. آیا سد، سد است؟
//
// ۱) نسخه‌ی اولِ سقف «بخوان، بعد بنویس» بود (`getSmsCount` و بعد
//    `bumpSmsCounter`) و در حالت cluster — که خودِ سقف برای همان حالت نوشته
//    شده — هیچ سدی نبود: چند worker هم‌زمان تعداد را پیش از بالا رفتنِ بقیه
//    می‌خواندند و همه با هم می‌نوشتند. مثلاً ۴ پروسه با سقفِ ۴۰ می‌توانستند
//    ده‌ها پیامکِ اضافه بفرستند. حالا رزرو اتمیک است و همین آزمون با چهار
//    پروسه‌ی هم‌زمانِ واقعی می‌سنجد که مجموعِ رزروها **هرگز** از سقف رد نشود.
//
// ۲) قراردادِ دوم: «پیامکِ ناموفق ظرفیت را نمی‌سوزاند». اگر ارسال به سرویس
//    شکست بخورد، اسلاتِ رزرو‌شده باید برگردد — وگرنه چند روز قطعیِ سرویس
//    یعنی خالی‌شدنِ ظرفیت بدونِ حتی یک کدِ رسیده. این‌جا fetch جعلی می‌شود:
//    یکی موفق، یکی شکست‌خورده، و اثرشان روی شمارنده سنجیده می‌شود.
//
// سنجشِ زنده روی سندباکس است: «جملهٔ SQL شرط دارد» به‌تنهایی اثباتِ اتمیک‌بودن
// نیست؛ چیزی که اثبات می‌کند، چهار پروسهٔ واقعی و یک شمارندهٔ مشترک است.

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { makeSandboxData, removeSandboxData } = require('./sandbox');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ` - ${detail}` : ''}`);
}

const BACKEND_DIR = path.join(__dirname, '..');
const SANDBOX = makeSandboxData();
process.env.PG_DATA_DIR = SANDBOX;
process.env.PG_PICTURE_DIR = path.join(SANDBOX, 'picture');
const CAP = 40;
process.env.SMS_DAILY_CAP = String(CAP);
process.env.SMS_API_KEY = 'test-key-not-real';
process.env.SMS_PROVIDER = 'kavenegar';

const dbm = require('../lib/db');
const sms = require('../lib/sms');

const resetCounter = () =>
  dbm.db.prepare("DELETE FROM settings WHERE key = 'sms_counter'").run();
const smsCount = () => dbm.getSmsCount();

console.log(`\n[sms-daily-cap] سندباکس: ${SANDBOX} (cap=${CAP})\n`);

// ---------- ۱) رزروِ درون‌پروسه‌ای: دقیقاً cap تا ----------
{
  resetCounter();
  let okCount = 0;
  for (let i = 0; i < CAP + 5; i++) if (dbm.reserveSmsSlot(CAP).ok) okCount++;
  check('رزروِ ساده: دقیقاً به‌اندازه‌ی سقف رزرو می‌شود، نه یکی بیشتر',
    okCount === CAP && smsCount() === CAP,
    `ok=${okCount} count=${smsCount()}`);
}

// ---------- ۲) پس‌دادنِ یک اسلات (پیامکِ ناموفق نباید بسوزاند) ----------
{
  const back = dbm.releaseSmsSlot();
  check('پس‌دادن: یک اسلات برمی‌گردد و دوباره قابل رزرو است',
    back === true && dbm.reserveSmsSlot(CAP).ok === true && smsCount() === CAP,
    `count=${smsCount()}`);
}

// ---------- ۳) پس‌دادن روی شمارندهٔ خالی نباید منفی کند ----------
{
  resetCounter();
  const back = dbm.releaseSmsSlot();
  check('پس‌دادنِ بی‌رزرو: بی‌اثر است (شمارنده منفی نمی‌شود)',
    back === false && smsCount() === 0, `count=${smsCount()}`);
}

// ---------- ۴) عبور از روز: شمارندهٔ دیروز سقفِ امروز را نمی‌بندد ----------
{
  dbm.db.prepare(
    "UPDATE settings SET value = json_object('d', date('now','localtime','-1 day'), 'n', 999) WHERE key = 'sms_counter'"
  ).run();
  const slot = dbm.reserveSmsSlot(CAP);
  check('روزِ جدید: شمارندهٔ دیروز سقفِ امروز را نمی‌بندد',
    slot.ok === true && slot.count === 1, JSON.stringify(slot));
}

// ---------- ۵) چهار پروسهٔ هم‌زمان: مجموع رزروها از سقف رد نمی‌شود ----------
// این همان چیزی است که نسخه‌ی «بخوان، بعد بنویس» نمی‌گیرد. دو درسِ گران از CI
// و از اجرای محلی (پوش ۱۴۰۵/۰۷):
//
//  ۱) اسپاونِ خام کافی نیست — در CI راه‌اندازیِ پروسه‌ها پله‌ای است و فرزندها
//     عملاً سریال می‌شدند؛ جهشِ «غیرِاتمیک» بی‌صدا رد می‌شد (جهش ۱/۲). سدِ
//     زمانیِ ساعت‌محور هم درست کار نمی‌کرد.
//  ۲) سدِ کانال‌محورِ stdin مسئله را حل می‌کند: هر فرزند بعد از require
//     می‌گوید READY و روی stdin منتظر می‌ماند؛ والد وقتی هر چهار READY را
//     دید، در یک حلقه به همه خطِ شلیک می‌فرستد (اختلاف در حدِ میکروثانیه،
//     مستقل از ساعت و از کندیِ راه‌اندازی).
//  ۳) ولی هم‌زمانیِ شلیک هم کافی نبود: با ظرفیتِ کوچک، فرزندِ اول کلِ سقف را
//     در ~۱۰ms تنهایی پر می‌کرد و دیررسیِ چند-میلی‌ثانیه‌ایِ برنامه‌ریزِ OS
//     کافی بود بقیه پنجره‌ی پر‌شدن را از دست بدهند (ویندوز: 40+0+0+0). حالا
//     ظرفیت عمداً **بزرگ‌تر از سهمِ هر فرزند** است (۱۵۰۰ > ۸۰۰): هیچ فرزندی
//     نمی‌تواند تنها پرش کند، پس «پر شدن» مجبوراً چندپروسهای می‌شود و
//     پنجرهٔ get→bump زیرِ رگبارِ ۳۲۰۰ تقاضایی حتماً هم‌پوشانی می‌کند.
//
// هر فرزند ۸۰۰ تقاضای بدونِ وقفه می‌زند؛ ظرفیتِ این مرحله ۱۵۰۰ است و شمارنده
// پیش از آن ریست می‌شود (مستقل از سقفِ ۴۰ مرحله‌های بالاتر). اگر این سدها را
// برداری یا ظرفیت را کوچک کنی، نگهبان دوباره غیرِقطعی می‌شود و روی CI خاموش
// می‌ماند.
const RACE_CAP = 1500;
const CHILD_SRC = `
const db = require(process.env.PG_LIB_DB);
(async () => {
  process.stdout.write('READY\\n');
  await new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', resolve);
    process.stdin.resume();
  });
  let ok = 0;
  for (let i = 0; i < 800; i++) {
    if (db.reserveSmsSlot(Number(process.env.SMS_CAP)).ok) ok++;
  }
  console.log('RESERVED:' + ok);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(2); });
`;

function runChild() {
  const child = spawn(process.execPath, ['-e', CHILD_SRC], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PG_DATA_DIR: SANDBOX,
      PG_LIB_DB: path.join(BACKEND_DIR, 'lib', 'db.js'),
      SMS_CAP: String(RACE_CAP),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', d => { out += d; });
  const ready = new Promise((resolve) => {
    let settled = false;
    const settle = () => { if (!settled) { settled = true; clearInterval(timer); resolve(); } };
    // اگر فرزند پیش از READY بمیرد، منتظر نمی‌مانیم؛ کدِ خروجِ غیرِصفرش
    // را بررسیِ «همه سالم» می‌گیرد و آزمون با گزارشِ روشن تمام می‌شود.
    const timer = setInterval(() => { if (out.includes('READY')) settle(); }, 5);
    child.on('exit', settle);
  });
  const done = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, ready, done, out: () => out };
}

(async () => {
  resetCounter();
  const kids = [runChild(), runChild(), runChild(), runChild()];
  // تا هر چهار فرزند پشتِ سد نرسند شلیک نمی‌شود؛ بعد خطِ شلیک در یک حلقه
  // به همه‌شان می‌رود — نزدیک‌ترین چیز به «هم‌زمانِ واقعی» که از بیرونِ
  // پروسه‌ها قابلِ ساخت است.
  await Promise.all(kids.map(k => k.ready));
  for (const k of kids) k.child.stdin.write('\n');
  const codes = await Promise.all(kids.map(k => k.done));
  const reserved = kids.map(k => Number((k.out().match(/RESERVED:(\d+)/) || [])[1] || -1));
  const total = reserved.reduce((a, b) => a + b, 0);
  check('چهار پروسهٔ هم‌زمان: همه سالم تمام شدند',
    codes.every(c => c === 0), JSON.stringify(codes));
  check('چهار پروسهٔ هم‌زمان: مجموعِ رزروها از سقف رد نمی‌شود (اتمیک)',
    total <= RACE_CAP, `مجموع=${total} (${reserved.join('+')})`);
  check('چهار پروسهٔ هم‌زمان: سقف عملاً پر شد (۳۲۰۰ تقاضا برای ۱۵۰۰ ظرفیت)',
    total === RACE_CAP, `مجموع=${total}`);
  check('چهار پروسهٔ هم‌زمان: شمارندهٔ نهایی روی سقف نشسته است',
    smsCount() === RACE_CAP, `count=${smsCount()}`);

  // ---------- ۶) مسیرِ واقعیِ sendOtpSms: موفق می‌سوزاند، ناموفق برمی‌گرداند ----------
  resetCounter();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return { ok: true, text: async () => JSON.stringify({ return: { status: 200, message: 'ok' } }) };
  };
  const sent = await sms.sendOtpSms('09120000000', '12345');
  check('ارسالِ موفق: رزرو می‌سوزاند (count=1) و ok برمی‌گردد',
    sent.ok === true && sent.mode === 'live' && smsCount() === 1 && fetchCalls === 1,
    JSON.stringify(sent) + ` count=${smsCount()}`);

  globalThis.fetch = async () => { throw new Error('network down'); };
  const failed = await sms.sendOtpSms('09120000000', '12345');
  check('ارسالِ ناموفق: اسلات برمی‌گردد و ظرفیت نمی‌سوزد (count=1)',
    failed.ok === false && failed.mode === 'live' && smsCount() === 1,
    JSON.stringify(failed) + ` count=${smsCount()}`);

  // سقفِ پر: هیچ درخواستی هم به سرویس نرود
  for (let i = 0; i < CAP; i++) dbm.reserveSmsSlot(CAP);
  fetchCalls = 0;
  const capped = await sms.sendOtpSms('09120000000', '99999');
  check('سقفِ پر: ارسال انجام نمی‌شود و به سرویسِ پیامک هم درخواستی نمی‌رود',
    capped.ok === false && capped.mode === 'live' && fetchCalls === 0 && smsCount() === CAP,
    JSON.stringify(capped) + ` fetch=${fetchCalls}`);

  // ---------- پاک‌سازی ----------
  removeSandboxData(SANDBOX); // بهترین‌تلاش؛ فایلِ باز روی ویندوز قفل است

  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log('\n------------------------------------------------------------');
  console.log(`  Total: ${results.length} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
  console.log('------------------------------------------------------------\n');
  process.exit(fail === 0 ? 0 : 1);
})();
