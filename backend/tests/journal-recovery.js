#!/usr/bin/env node
/* ============================================================
   tests/journal-recovery.js — «ابزارِ نگهبانی خودش خرابی جا نگذارد»

   ---------- چرا این آزمون وجود دارد ----------
   هارنسِ جهش، فایل‌های واقعیِ مخزن را عمداً می‌شکند. بازگردانیِ آن تا امروز
   فقط در حافظه بود: با `process.on('exit')` و چند سیگنال‌گیرنده. آن مکانیزم
   یک حالت را پوشش نمی‌دهد و همان یک حالت کافی است: **SIGKILL** (که قابلِ
   گرفتن نیست)، قطعِ برق، یا بستنِ پنجره از Task Manager. در آن حالت‌ها پروسه
   هیچ کدی اجرا نمی‌کند، پس فایل‌های تخریب‌شده روی دیسک می‌مانند — یعنی ابزاری
   که برای محافظت از کد ساخته شده، خودش منبعِ خرابی می‌شود.

   `tests/lib/journal.js` این را می‌بندد: پیش از هر جهش، بایت‌های اصلی روی
   دیسک می‌نشیند و اجرای بعدی، پیش از هر کاری، آن‌ها را برمی‌گرداند. این آزمون
   همان قرارداد را می‌سنجد — بی‌آنکه به مخزن دست بزند (در پوشهٔ موقت کار
   می‌کند) و بی‌آنکه به «killِ زمان‌بندی‌شده» تکیه کند (که آزمونِ لرزان است).

   ---------- و یک حالتِ ظریف که یک‌بار واقعاً خراب شد ----------
   «پاک‌سازیِ پایانِ اجرا» نباید سطرهای اجرای دیگری را ببرد. یک‌بار اجرایی با
   SIGKILL کشته شد، اجرای بعدی نتوانست بازیابی کند، ولی سرِ پایانِ *خودش*
   کلِ پوشه را پاک کرد — و تنها پشتیبانِ فایلِ تخریب‌شده با آن رفت. یعنی
   «موفقیت» یک خرابیِ بی‌ربط را دائمی کرد. سنجشِ مالکیت هم برای همین است.

   ---------- اجرا ----------
     node tests/journal-recovery.js      → ۰ سبز، ۱ قرمز
   ============================================================ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { makeJournal, pidAlive } = require('./lib/journal');

const BACKEND = path.join(__dirname, '..');
const HARNESS = path.join(__dirname, 'guard-mutations.js');
const harnessSrc = fs.readFileSync(HARNESS, 'utf8');

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

const tmpRoots = [];
function newRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-journal-'));
  tmpRoots.push(dir);
  return dir;
}
function cleanup() {
  for (const dir of tmpRoots) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* بی‌اهمیت */ }
  }
}

/** PIDِ یک پروسه که قطعاً مرده است (بچه‌ای که بلافاصله تمام می‌شود). */
function deadPid() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
    const childPid = child.pid;
    child.on('exit', () => resolve(childPid));
  });
}

/** PIDِ یک پروسه که تا وقتی خودمان نکشتیمش زنده می‌ماند. */
function livePid() {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  return child;
}

const quiet = () => {};

console.log('\n=== Journal recovery guard (a hard-killed run must not leave damage) ===\n');

(async () => {
/* ============================================================
   ۱) قاعدهٔ اصلی: اجرای کشته‌شده خرابی جا می‌گذارد، اجرای بعدی برمی‌گرداند
   ============================================================ */
section('۱) بازیابیِ پس از مرگِ سخت (بی‌واسطه روی قاعده، در پوشهٔ موقت)');

{
  const root = newRoot();
  const file = path.join(root, 'lib', 'thing.js');
  const original = Buffer.from('const x = 1; // بایتِ اصلی\n', 'utf8');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, original);

  // اجرای اول: بکاپ روی دیسک، بعد تخریب — و بعد «مرگ».
  const owner = await deadPid();
  const first = makeJournal({ root, pid: owner, log: quiet });
  first.journalize(file, original);
  fs.writeFileSync(file, 'const x = 999; // جهشِ باقی‌مانده\n');

  check('پیش از تخریب، پشتیبان روی دیسک نشسته (نه فقط در حافظه)',
    fs.existsSync(path.join(root, '.guard-mutation-journal', 'index.json'))
    && fs.existsSync(first.dir), 'ژورنال ساخته نشد');
  check('و فایل واقعاً تخریب شده (شبیه‌سازیِ SIGKILL)',
    !fs.readFileSync(file).equals(original));
  check('مالکِ ژورنال دیگر زنده نیست (پیش‌شرطِ بازیابی)',
    pidAlive(owner) === false, `pid=${owner}`);

  // اجرای دوم: پروسهٔ تازه، پیش از هر کاری بازیابی می‌کند.
  const second = makeJournal({ root, pid: process.pid, log: quiet });
  const out = second.recover();
  check('اجرای بعدی خودش فایل را بایت‌به‌بایت برگرداند',
    out.restored.length === 1 && fs.readFileSync(file).equals(original),
    `restored=${JSON.stringify(out.restored)}`);
  check('و ژورنال بسته شد (اجرای بعدی کارِ تکراری نمی‌کند)',
    !fs.existsSync(second.dir) && second.recover().restored.length === 0);
}

/* ============================================================
   ۲) فایلی که وجود نداشت: باید در بازگردانی حذف شود
   ============================================================ */
section('۲) فایلِ ساخته‌شده (که قبلاً نبود) حذف می‌شود، نه خالی رها');

{
  const root = newRoot();
  const file = path.join(root, 'created-by-mutation.txt');
  const dead = await deadPid();
  const first = makeJournal({ root, pid: dead, log: quiet });
  first.journalize(file, null); // از قبل نبود
  fs.writeFileSync(file, 'ساخته‌شده توسط جهش\n');

  const second = makeJournal({ root, pid: process.pid, log: quiet });
  const out = second.recover();
  check('فایلی که قبل از جهش وجود نداشت، بعد از بازیابی هم نیست',
    out.restored.length === 1 && !fs.existsSync(file), `exists=${fs.existsSync(file)}`);
}

/* ============================================================
   ۳) اجرای زنده: دست به فایل‌هایش نمی‌زنیم
   ============================================================ */
section('۳) دو اجرای موازی همدیگر را قربانی نمی‌کنند');

{
  const root = newRoot();
  const file = path.join(root, 'busy.js');
  const original = Buffer.from('const busy = true;\n', 'utf8');
  fs.writeFileSync(file, original);

  const child = livePid();
  const owner = makeJournal({ root, pid: child.pid, log: quiet });
  owner.journalize(file, original);
  fs.writeFileSync(file, 'const busy = false; // جهشِ اجرای زنده\n');

  const intruder = makeJournal({ root, pid: process.pid, log: quiet });
  const skipped = intruder.recover();
  check('ژورنالِ پروسهٔ زنده دست‌نخورده می‌ماند و بازگردانی نمی‌شود',
    skipped.skippedAlive === true && skipped.restored.length === 0
    && fs.readFileSync(file, 'utf8').includes('جهشِ اجرای زنده')
    && fs.existsSync(path.join(root, '.guard-mutation-journal', 'index.json')),
    JSON.stringify(skipped));

  // حالا آن پروسه را می‌کشیم و همان اجرا را «مرده» می‌سازیم.
  child.kill('SIGKILL');
  await new Promise((r) => { child.on('exit', r); setTimeout(r, 1500); });
  const after = makeJournal({ root, pid: process.pid, log: quiet }).recover();
  check('بعد از مرگِ آن پروسه، فایلش بازیابی می‌شود',
    after.restored.length === 1 && fs.readFileSync(file).equals(original),
    JSON.stringify(after));
}

/* ============================================================
   ۴) پاک‌سازیِ پایانِ اجرا، مالِ دیگری را نمی‌برد
   ============================================================ */
section('۴) مالکیتِ ژورنال (حادثه‌ای که یک‌بار پشتیبان را از بین برد)');

{
  const root = newRoot();
  const mine = path.join(root, 'mine.js');
  const theirs = path.join(root, 'theirs.js');
  const dead = await deadPid();

  const other = makeJournal({ root, pid: dead, log: quiet });
  other.journalize(theirs, Buffer.from('const theirs = 1;\n', 'utf8'));

  const own = makeJournal({ root, pid: process.pid, log: quiet });
  own.journalize(mine, Buffer.from('const mine = 1;\n', 'utf8'));

  own.clear();
  const left = own.read();
  check('پاک‌سازیِ خودی، سطرِ اجرای دیگر را نگه می‌دارد (پشتیبانش از بین نمی‌رود)',
    left.entries.length === 1 && left.entries[0].file === 'theirs.js',
    JSON.stringify(left.entries.map((e) => e.file)));

  const recovered = own.recover();
  check('و همان سطر بعداً قابلِ بازیابی است',
    recovered.restored.length === 1 && fs.readFileSync(theirs, 'utf8') === 'const theirs = 1;\n');

  // و پاک‌سازیِ مالک، پوشه را برمی‌دارد.
  own.journalize(mine, Buffer.from('const mine = 1;\n', 'utf8'));
  own.clear();
  check('پاک‌سازیِ مالک، پوشه را کامل برمی‌دارد', !fs.existsSync(root + '/.guard-mutation-journal'));
}

/* ============================================================
   ۵) حالت‌های خراب: پشتیبانِ گم‌شده، هشِ نامطابق، فهرستِ ناخوانا
   ============================================================ */
section('۵) خرابی‌ها پنهان نمی‌شوند (و بی‌پشتیبان دور نمی‌ریزیم)');

{
  const root = newRoot();
  const missing = path.join(root, 'missing.js');
  const tampered = path.join(root, 'tampered.js');
  const original = Buffer.from('const keep = true;\n', 'utf8');
  fs.writeFileSync(missing, 'جهش‌شده\n');
  fs.writeFileSync(tampered, 'جهش‌شده\n');

  const dead = await deadPid();
  const first = makeJournal({ root, pid: dead, log: quiet });
  first.journalize(missing, original);
  first.journalize(tampered, original);
  fs.rmSync(path.join(first.dir, sha0(first, 'missing.js')), { force: true }); // پشتیبانِ گم‌شده
  const tamperedBak = path.join(first.dir, sha0(first, 'tampered.js'));
  fs.writeFileSync(tamperedBak, 'پشتیبانِ دست‌کاری‌شده\n'); // هشِ نامطابق

  const out = makeJournal({ root, pid: process.pid, log: quiet }).recover();
  check('پشتیبانِ گم‌شده گزارش می‌شود (نه اینکه بی‌صدا رد شود)',
    out.problems.some((p) => p.includes('missing.js')), JSON.stringify(out.problems));
  check('هشِ نامطابق هم گزارش می‌شود (یعنی محتوا قابلِ اعتماد نیست)',
    out.problems.some((p) => p.includes('tampered.js')), JSON.stringify(out.problems));
  check('و سطرهای حل‌نشده در ژورنال می‌مانند تا برگرداندنِ دستی ممکن بماند',
    fs.existsSync(path.join(root, '.guard-mutation-journal', 'index.json')));
}

{
  const root = newRoot();
  fs.mkdirSync(path.join(root, '.guard-mutation-journal'), { recursive: true });
  fs.writeFileSync(path.join(root, '.guard-mutation-journal', 'index.json'), '{ نه JSON است');
  let threw = false;
  let out = null;
  try {
    out = makeJournal({ root, pid: process.pid, log: quiet }).recover();
  } catch (e) { threw = true; }
  check('فهرستِ ناخوانا باعثِ سقوط نمی‌شود (اجرای بعدی باید بالاخره بالا بیاید)',
    !threw && out && out.restored.length === 0, threw ? 'throw کرد' : JSON.stringify(out));
}

/* ============================================================
   ۶) خودآزمون: نگهبانِ خراب باید قرمز شود
   ============================================================ */
section('۶) خودآزمون: همین سنجش‌ها نمی‌توانند «سبزِ توخالی» باشند');

{
  // نمونه‌ای عمداً خراب: پروسهٔ زنده‌ای که قرار است زنده تشخیص داده شود.
  const child = livePid();
  check('خودآزمون: PIDِ زنده زنده تشخیص داده می‌شود', pidAlive(child.pid) === true);
  child.kill('SIGKILL');
  await new Promise((r) => { child.on('exit', r); setTimeout(r, 1500); });
  check('خودآزمون: PIDِ مرده مرده تشخیص داده می‌شود', pidAlive(child.pid) === false);
  check('خودآزمون: PIDِ صفر/نامعتبر زنده شمرده نمی‌شود', pidAlive(0) === false && pidAlive(null) === false);
}

/* ============================================================
   ۷) سیم‌کشیِ خودِ هارنس: این قاعده باید واقعاً وصل باشد، نه فقط موجود
   ============================================================ */
section('۷) هارنسِ جهش از همین قاعده استفاده می‌کند (سیم‌کشی، نه وجودِ فایل)');

{
  const usesModule = /require\('\.\/lib\/journal'\)/.test(harnessSrc);
  check('هارنس، ژورنالِ مشترک را وارد می‌کند (یک قاعده، دو مصرف‌کننده)',
    usesModule && /makeJournal\(\{ root: ROOT, pid: process\.pid \}\)/.test(harnessSrc));

  /*
   * و سنجش‌ها داخلِ **بدنهٔ همان تابع** انجام می‌شوند، نه روی کلِ متنِ فایل.
   *
   * چرا: رجیستریِ همین هارنس هم رشته‌های `journalize(abs, active.get(abs));` و
   * `recoverFromJournal();` را در `find:` نگه می‌دارد. جست‌وجو در کلِ فایل، با
   * *حذف‌شدنِ خودِ فراخوانی* هم سبز می‌ماند — یک نگهبانِ توخالی که فقط وجودِ
   * رشته را در جایی می‌بیند. (این را خودِ جهشِ همین بخش لو داد.)
   */
  const applyBody = functionBody(harnessSrc, 'applyMutation');
  const restoreBody = functionBody(harnessSrc, 'restoreOne');
  const mainBody = functionBody(harnessSrc, 'main');
  check('بدنهٔ سه تابعِ کلیدیِ هارنس خوانده شد (وگرنه سنجش‌های زیر بی‌معنی‌اند)',
    Boolean(applyBody && restoreBody && mainBody),
    `apply=${Boolean(applyBody)} restore=${Boolean(restoreBody)} main=${Boolean(mainBody)}`);

  if (applyBody && restoreBody && mainBody) {
    const jAt = applyBody.indexOf('journalize(abs, active.get(abs));');
    const wAt = applyBody.indexOf('fs.writeFileSync(abs, src.split(m.find).join(m.replace));');
    check('پشتیبان‌گیری *پیش از* نوشتنِ جهش است، نه بعدش',
      jAt !== -1 && wAt !== -1 && jAt < wAt, `journalize=${jAt} write=${wAt}`);

    check('بازگردانیِ هر فایل سطرش را از ژورنال هم برمی‌دارد (وگرنه اجرای بعدی کارِ تکراری می‌کند)',
      restoreBody.includes('dejournalize(abs);'));

    const recoverAt = mainBody.indexOf('recoverFromJournal();');
    const firstGuard = mainBody.indexOf('GUARDS.filter(');
    check('بازیابی، *پیش از* اولین جهش اجرا می‌شود (نه سرِ پایان)',
      recoverAt !== -1 && firstGuard !== -1 && recoverAt < firstGuard,
      `recover=${recoverAt} firstGuard=${firstGuard}`);

    check('پایانِ خوشِ اجرا هم ژورنال را می‌بندد',
      /clearJournal\(\);\s*\n\s*if \(failed > 0\) process\.exit\(1\);/.test(mainBody));
  }
}

/* ============================================================ */
console.log(`\nJournal recovery checks: ${pass} passed, ${fail} failed`);
cleanup();
process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(`\n❌ خطای غیرمنتظره: ${e.stack || e.message}`);
  cleanup();
  process.exit(2);
});

/** بدنهٔ یک تابع را از متنِ سورس بیرون می‌کشد (برای سنجشِ *محتوای* همان تابع). */
function functionBody(source, name) {
  const at = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (at === -1) return null;
  const open = source.indexOf('{', source.indexOf(')', at));
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** نامِ فایلِ پشتیبان از فهرستِ همان ژورنال — تا آزمون، قاعده را تکرار نکند. */
function sha0(journal, relFile) {
  const entry = journal.read().entries.find((e) => e.file === relFile);
  if (!entry) throw new Error(`سطرِ «${relFile}» در ژورنال نیست`);
  return entry.bak;
}
