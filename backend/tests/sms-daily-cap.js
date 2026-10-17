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
// این همان چیزی است که نسخه‌ی «بخوان، بعد بنویس» نمی‌گرفت. هر فرزند ۲۵ بار
// با کمی فاصله رزرو می‌کند تا پنجره‌ی مسابقه واقعاً باز بماند.
const CHILD_SRC = `
const db = require(process.env.PG_LIB_DB);
(async () => {
  let ok = 0;
  for (let i = 0; i < 25; i++) {
    if (db.reserveSmsSlot(Number(process.env.SMS_CAP)).ok) ok++;
    await new Promise(r => setTimeout(r, 3));
  }
  console.log('RESERVED:' + ok);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(2); });
`;

function runChild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', CHILD_SRC], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PG_DATA_DIR: SANDBOX,
        PG_LIB_DB: path.join(BACKEND_DIR, 'lib', 'db.js'),
        SMS_CAP: String(CAP),
      },
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', d => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

(async () => {
  resetCounter();
  const kids = await Promise.all([runChild(), runChild(), runChild(), runChild()]);
  const reserved = kids.map(k => Number((k.out.match(/RESERVED:(\d+)/) || [])[1] || -1));
  const total = reserved.reduce((a, b) => a + b, 0);
  check('چهار پروسهٔ هم‌زمان: همه سالم تمام شدند',
    kids.every(k => k.code === 0), JSON.stringify(kids.map(k => k.code)));
  check('چهار پروسهٔ هم‌زمان: مجموعِ رزروها از سقف رد نمی‌شود (اتمیک)',
    total <= CAP, `مجموع=${total} (${reserved.join('+')})`);
  check('چهار پروسهٔ هم‌زمان: سقف عملاً پر شد (۱۵۰ تقاضا برای ۴۰ ظرفیت)',
    total === CAP, `مجموع=${total}`);
  check('چهار پروسهٔ هم‌زمان: شمارندهٔ نهایی روی سقف نشسته است',
    smsCount() === CAP, `count=${smsCount()}`);

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
