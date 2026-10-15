#!/usr/bin/env node
// ============================================================
// نگهبانِ کارنامهٔ اوراکل — «فایلِ مرجعِ برابری نباید بی‌سروصدا عوض شود»
// ============================================================
//
// ---------- چرا این فایل جدا از اجراکنندهٔ برابری لازم شد ----------
// اوراکلِ منجمد (`next-frontend/tests/fixtures/legacy-oracle/*.html`) **مرجعِ
// حقیقت** پنج خانوادهٔ نگهبانِ برابری است: `copyParity`, `seoParity`,
// `shellParity`, `socialParity` و `parityManifest` متنِ Express را از همین
// فایل‌ها می‌خوانند. یعنی اگر کسی یک فایلِ اوراکل را دست بزند، آن نگهبان‌ها
// **با یک مرجعِ دست‌کاری‌شده** مقایسه می‌کنند و همه سبز می‌مانند — دقیقاً همان
// جنسی از «سبزِ دروغ» که هر نگهبان این مخزن برای بستنش نوشته شده است.
//
// پیش از این، فقط اجراکنندهٔ زندهٔ برابری هش را می‌سنجید
// (`scripts/parity-storefront.mjs` → «sha با کارنامه») و آن هم **دو سرورِ بالا**
// لازم دارد. پس در CI، جایی که فقط `npm test` اجرا می‌شود، مرجعِ همهٔ آن
// نگهبان‌ها بی‌سنجش بود: کافی بود یک نفر یک جمله به `terms.html` اضافه کند و
// `copyParity` همان جمله را «موجود» ببیند.
//
// این فایل همان سنجش را **آفلاین** و روی *خودِ دیسک* انجام می‌دهد: هیچ سروری
// لازم نیست، پس در همان stepِ `npm test` هم می‌تواند باشد.
//
// ---------- چرا «کارنامه» کافی نیست، باید قفل هم داشته باشد ----------
// هشِ ردیفِ کارنامه فقط وقتی معنا دارد که خودِ کارنامه بی‌اجازه بازنویسی نشود.
// وگرنه چرخه این است: فایل را عوض کن → ابزارِ انجماد را با `--force` اجرا کن →
// کارنامه هم با همان اجرا به‌روز شود → همه سبز. پس دو طرف قفل می‌شود:
//
//   ۱. **کارنامه حافظه دارد**: هر ردیف `originalSha256` (هشِ اولین انجماد) و
//      فهرستِ `rewrites[]` را نگه می‌دارد. هر بازنویسی باید در کارنامه ثبت
//      شده باشد، با دلیلِ نوشته‌شده — وگرنه این نگهبان قرمز می‌شود.
//   ۲. **خودِ ابزار قفل است**: `scripts/freeze-legacy-oracle.mjs` بدونِ
//      `--force --reason="…"` روی اوراکلِ موجود نمی‌نویسد. این نگهبان *متنِ
//      خودِ ابزار* را هم می‌خواند تا برداشتنِ این قفل یک قرمزِ فوری باشد، نه
//      یک تغییرِ بی‌صدا.
//
// ---------- دو طرفِ پوشش، نه یک طرف ----------
// «هر فایل هشِ درست دارد» نصفِ کار است؛ نصفِ دیگر «هیچ فایلِ بی‌کارنامه‌ای
// نیست». فایلِ تازه‌ای که کسی در همان پوشه بگذارد (مثلاً نسخهٔ دست‌کاری‌شدهٔ
// `cart.html` کنارِ اصل) از سمتِ کارنامه دیده نمی‌شود ولی از سمتِ پوشه دیده
// می‌شود — و اگر نگهبانِ برابری روزی آن را بخواند، مرجع عوض شده است.
//
// اجرا:  cd backend && node tests/oracle-ledger.js
// کدِ خروج: ۰ = سالم · ۱ = تخلف · ۲ = پیش‌شرط (فایلِ مرجع نیست ⇒ نمی‌شود نسنجید)

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKEND = path.join(__dirname, '..');
const ROOT = path.join(BACKEND, '..');
const NEXT = path.join(ROOT, 'next-frontend');
const ORACLE_DIR = path.join(NEXT, 'tests', 'fixtures', 'legacy-oracle');
const LEDGER = path.join(ORACLE_DIR, 'provenance.json');
const SRC_DIR = path.join(NEXT, 'tests', 'fixtures', 'legacy-src');
const SRC_LEDGER = path.join(SRC_DIR, 'provenance.json');
const FREEZE_TOOL = path.join(NEXT, 'scripts', 'freeze-legacy-oracle.mjs');

let pass = 0, fail = 0;
const ok = (label) => { pass++; console.log(`  [PASS] ${label}`); };
const notOk = (label, detail) => { fail++; console.error(`  [FAIL] ${label} — ${detail}`); };

console.log('\n=== Oracle ledger (frozen parity reference vs SHA-256 ledger) ===\n');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ---------- ۰) پیش‌شرط: بدونِ مرجع، «نسنجیدن» با «سبز» قاطی می‌شود ----------
for (const [label, file] of [
  ['کارنامهٔ اوراکل', LEDGER],
  ['کارنامهٔ پوستهٔ قدیمی', SRC_LEDGER],
  ['ابزارِ انجماد', FREEZE_TOOL],
  ['پوشهٔ اوراکل', ORACLE_DIR],
]) {
  if (!fs.existsSync(file)) {
    console.error(`✖ ${label} پیدا نشد: ${path.relative(ROOT, file)}`);
    console.error('   نمی‌شود مرجعی را که نیست سنجید؛ سبزِ خالی خطرناک‌تر از قرمز است.\n');
    process.exit(2);
  }
}
ok('کارنامه‌ها، ابزارِ انجماد و پوشهٔ اوراکل همه سرِ جایشان‌اند');

// ---------- خودآزمون: یک مقایسه‌گرِ همیشه‌سبز، مقایسه‌گر نیست ----------
// (همان سیاقِ `picture-self-sufficiency.js`: اگر تابعِ هش خراب شود، نگهبان
//  باید خودش بفهمد، نه اینکه همه‌ی ردیف‌ها را «درست» ببیند.)
if (sha256(Buffer.from('a')) !== sha256(Buffer.from('b')) && sha256(Buffer.from('a')).length === 64) {
  ok('خودآزمون: هشِ دو محتوای متفاوت فرق می‌کند و طولش ۶۴ نویسه است');
} else {
  notOk('self-test', 'تابعِ هش قابلِ اعتماد نیست — هر سنجشی که با آن انجام شود بی‌معناست');
}

// ---------- ۱) اوراکل: هر ردیفِ کارنامه ↔ همان بایت‌های روی دیسک ----------
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
if (!entries.length) {
  notOk('کارنامه خالی است', 'بدونِ ردیف، هیچ اوراکلی سنجیده نمی‌شود');
} else {
  ok(`کارنامه ${entries.length} ردیف دارد`);
}

let mismatched = 0, missing = 0, rewritten = 0;

for (const e of entries) {
  const rel = `tests/fixtures/legacy-oracle/${e.id}.html`;
  const file = path.join(ORACLE_DIR, `${e.id}.html`);
  if (!fs.existsSync(file)) {
    missing++;
    notOk(`اوراکلِ «${e.id}» سرِ جایش نیست`, `${rel} روی دیسک نیست — نگهبان‌های برابری بی‌مرجع می‌مانند`);
    continue;
  }
  const buf = fs.readFileSync(file);
  const got = sha256(buf);

  // طولِ بایت هم سنجیده می‌شود: هشِ یکسان با طولِ متفاوت یعنی یکی از دو طرف
  // (کارنامه یا فایل) دربارهٔ شکلِ ذخیره‌سازی دروغ می‌گوید — معمولاً نشانیِ
  // تبدیلِ خط‌پایانِ ویندوزی.
  if (e.bytes !== buf.length) {
    mismatched++;
    notOk(
      `طولِ بایتِ «${e.id}» با کارنامه نمی‌خواند`,
      `کارنامه ${e.bytes} بایت می‌گوید، روی دیسک ${buf.length} بایت است`,
    );
  } else if (e.sha256 !== got) {
    mismatched++;
    notOk(
      `هشِ «${e.id}» با کارنامه نمی‌خواند`,
      `کارنامه ${String(e.sha256).slice(0, 12)}… می‌گوید، روی دیسک ${got.slice(0, 12)}… است —`
      + ' یعنی مرجعِ نگهبان‌های برابری عوض شده است',
    );
  }

  // ---------- بازنویسی: ممنوع نیست، ولی باید ثبت و دلیل داشته باشد ----------
  const original = e.originalSha256 || e.sha256;   // ردیف‌های قدیمی: هنوز بازنویسی نشده‌اند
  if (original !== e.sha256) {
    rewritten++;
    const list = Array.isArray(e.rewrites) ? e.rewrites : [];
    const bad = list.filter((r) => typeof r?.reason !== 'string' || r.reason.trim().length < 10);
    if (!list.length) {
      notOk(
        `اوراکلِ «${e.id}» بازنویسی شده ولی هیچ رکوردی ندارد`,
        `هشِ اصلی ${String(original).slice(0, 12)}… است و فعلی ${String(e.sha256).slice(0, 12)}… —`
        + ' یعنی کسی مرجع را عوض کرده و کارنامه را هم با آن جلو برده',
      );
    } else if (bad.length) {
      notOk(
        `رکوردِ بازنویسیِ «${e.id}» دلیلِ کافی ندارد`,
        `${bad.length} رکورد با دلیلِ خالی/کمتر از ۱۰ نویسه — بازنویسیِ بی‌دلیل همان بازتولیدِ بی‌اجازه است`,
      );
    }
  }
}

if (entries.length && !missing && !mismatched) {
  ok(`هر ${entries.length} اوراکل با همان بایت‌ها و همان هشِ کارنامه سرو می‌شود`);
}

// ---------- ۲) طرفِ دیگر: هیچ فایلِ بی‌کارنامه‌ای نباشد ----------
const htmlOnDisk = fs.readdirSync(ORACLE_DIR).filter((f) => f.endsWith('.html'));
const known = new Set(entries.map((e) => `${e.id}.html`));
const orphans = htmlOnDisk.filter((f) => !known.has(f));
if (!orphans.length) {
  ok(`هیچ فایلِ بی‌کارنامه‌ای در پوشهٔ اوراکل نیست (${htmlOnDisk.length} فایل = ${entries.length} ردیف)`);
} else {
  notOk(
    'فایلِ اوراکلِ بی‌کارنامه',
    `${orphans.join('، ')} در پوشه هست ولی در کارنامه نیست — مرجعی که هش ندارد، مرجع نیست`,
  );
}

// ---------- ۳) قفلِ خودِ ابزار: بازتولید باید اجازه بخواهد ----------
// این نگهبان متنِ ابزار را می‌خواند، نه رفتارش را؛ چون رفتارش Expressِ زنده
// می‌خواهد و در CI نیست. اگر کسی قفل را بردارد، این‌جا قرمز می‌شود.
const tool = fs.readFileSync(FREEZE_TOOL, 'utf8');

// الگوها عمداً «معنایی»اند، نه «وجودِ نام». نسخهٔ اولِ همین سنجش فقط می‌گفت
// «واژهٔ REASON در فایل هست» — و یک جهشِ واقعی نشان داد که این کافی نیست:
// شرط را به `if (false)` عوض کردیم و نگهبان چون همان واژه را پایین‌تر در
// گزارش‌ها می‌دید، سبز ماند. پس هر الگو همان *نگهبانی* را می‌خواهد که ادعا
// می‌کند: قیدِ پرچم، مقایسهٔ دلیل با کفِ ۱۰ نویسه و همان رفتن به exit(1).
const gates = [
  [
    'بازنویسیِ اوراکلِ موجود فقط با --force',
    /if\s*\(\s*FORCE\s*&&\s*overridesFrozenOracle\s*\)/,
  ],
  [
    'و فقط با دلیلِ دستِ‌کم ۱۰ نویسه‌ای (وگرنه رد می‌کند)',
    /REASON\.length\s*<\s*\d+[\s\S]{0,600}?process\.exit\(1\)/,
  ],
  ['ردیف‌ها هشِ اولین انجماد را نگه می‌دارند (originalSha256)', /originalSha256/],
  ['و هر بازنویسی را با دلیل در کارنامه ثبت می‌کنند', /rewrites\.push\(\{[\s\S]{0,400}?reason:\s*REASON/],
];
for (const [label, re] of gates) {
  if (re.test(tool)) ok(`قفلِ ابزارِ انجماد: ${label}`);
  else notOk('ابزارِ انجماد قفل ندارد', `${label} — الگوی ${re} در scripts/freeze-legacy-oracle.mjs نیست`);
}

// ---------- ۴) پوستهٔ قدیمی: فهرستِ فایل‌ها دوطرفه بخواند ----------
const srcLedger = JSON.parse(fs.readFileSync(SRC_LEDGER, 'utf8'));
const listed = Array.isArray(srcLedger.files) ? srcLedger.files : [];
if (listed.length) {
  ok(`کارنامهٔ پوستهٔ قدیمی ${listed.length} فایل را فهرست کرده (commit ${String(srcLedger.source?.commit).slice(0, 8)}…)`);
} else {
  notOk('فهرستِ پوستهٔ قدیمی', 'کارنامه هیچ فایلی فهرست نکرده — پوشش سنجیده نمی‌شود');
}

const walk = (dir, base = '') =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'provenance.json') return [];
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel];
  });
const onDiskSrc = walk(SRC_DIR);
const notLied = listed.filter((f) => !fs.existsSync(path.join(SRC_DIR, f)));
const notListed = onDiskSrc.filter((f) => !listed.includes(f));
if (!notLied.length && !notListed.length) {
  ok(`پوستهٔ قدیمی دوطرفه می‌خواند (${onDiskSrc.length} فایلِ روی دیسک = ${listed.length} ردیف)`);
} else {
  if (notLied.length) notOk('فایلِ فهرست‌شده‌ای که روی دیسک نیست', notLied.slice(0, 5).join('، '));
  if (notListed.length) notOk('فایلِ روی دیسکی که فهرست نشده', notListed.slice(0, 5).join('، '));
}

if (rewritten) {
  console.log(`\n  ⓘ ${rewritten} اوراکل تا امروز بازنویسی شده و همه دلیلِ ثبت‌شده دارند.`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
console.log(`${'='.repeat(60)}\n`);

if (fail > 0) process.exit(1);
