#!/usr/bin/env node
/* ============================================================
   هارنسِ تخریبیِ نگهبان‌ها — «خودِ نگهبان را با شکستِ عمدی بیازما»

   ---------- چرا این فایل وجود دارد ----------
   پروژه یک خانواده‌ی کامل نگهبان دارد: نگهبان‌های سبکِ بک‌اند (پنلِ بازنشسته،
   پنجره‌ی صبر، پنجره‌ی ارسال مجدد، مرزِ راز، یکپارچگیِ گزارشِ بنچمارک، عددهای
   README) و نگهبان‌های متنی/ساختاریِ Next (برابریِ متن، سئو، پوسته، سوشال،
   مسیرها، محصولِ ۴۱۰، خوش‌آمد، …). معیارِ ورود به این رجیستری همان معیارِ
   خودِ پروژه است: آزمون‌هایی که یک **قراردادِ بین‌فایلی/بین‌دوفرانت‌اندانه** را
   قفل می‌کنند و اگر کسی یک طرف را عوض کند بی‌صدا سبز می‌مانند. آزمون‌های
   رفتاریِ معمولی (کامپوننت‌ها و واحدها) اینجا نیستند: آن‌ها رفتار را مستقیم
   اجرا می‌کنند و شکستنشان بدیهی است. همه‌ی نگهبان‌ها یک نقطه‌ی ضعفِ مشترک دارند:

       نگهبانی که هیچ نمی‌گیرد، از نبودنش بدتر است — چون به‌جای نبودِ محافظ،
       اطمینانِ قلابی می‌دهد.

   تا امروز هیچ‌چیز تضمین نمی‌کرد که خودِ این نگهبان‌ها واقعاً کار می‌کنند.
   یک نگهبان می‌تواند با یک `includes`ِ اشتباه، یک مسیرِ عوض‌شده، یا یک الگوی
   عقب‌مانده از واقعیت، بی‌صدا سبز بماند. این هارنس همان کارِ `mutation testing`
   را دستی انجام می‌دهد، ولی برعکس: برای **هر نگهبان** یک تا سه خرابیِ عمدی
   می‌سازد و انتظار دارد نگهبان **قرمز شود**. اگر نشد، خودِ نگهبان خراب است.

   ---------- چطور کار می‌کند (و چرا بی‌خطر است) ----------
   برای هر جهش:
     ۱. فایلِ قربانی بایت‌به‌بایت در حافظه نسخه‌برداری می‌شود.
     ۲. یک تغییرِ کوچک و معنادار اعمال می‌شود (نه غلطِ نحوی — غلطِ رفتاری).
     ۳. نگهبان اجرا می‌شود؛ باید با کدِ خروجِ ناموفق و **دلیلِ درست** رد کند.
     ۴. فایل از همان نسخه‌ی حافظه‌ای بازنویسی و با هشِ SHA-256 تأیید می‌شود که
        مو‌به‌مو‌ همان چیزی است که بود.

   صورت‌های جهش: `find`/`replace` (با `all` برای چندتایی)، `append`، `create`،
   و `delete`. آخری برای «داراییِ ناپدیدشده» است: حذفِ یک فایل هم یک خرابیِ
   رفتاری است، نه یک متنِ عوض‌شده — و بایت‌های اصلی در همان حافظه می‌مانند، پس
   بازگردانی مثل بقیه است.

   هیچ جهشی با `git stash`، `git checkout` یا پشتیبانِ روی دیسک کار نمی‌کند:
   فقط حافظه. اگر پروسه وسطِ راه بمیرد (Ctrl-C، سیگنال، استثنا)، همان لحظه
   فایل‌ها بازگردانده می‌شوند — یک `process.on('exit')` و چند سیگنال‌گیرنده
   همین‌جا برای همین هستند.

   ---------- چرا «دلیلِ درست» هم سنجیده می‌شود ----------
   «قرمز شد» به‌تنهایی بی‌ارزش است: یک غلطِ نگارشی هم هر آزمونی را قرمز می‌کند.
   پس هر جهش یک `expect` دارد که باید در خروجیِ نگهبان پیدا شود (مثلاً
   «کوتاه‌تر» در پیامِ نگهبانِ پنجره‌ی صبر). برای نگهبان‌های Vitest، به‌جای
   متنِ خروجی، گزارشِ JSON خوانده می‌شود و *نامِ آزمونِ شکست‌خورده* باید همان
   آزمونی باشد که این جهش باید بزند.

   ---------- اجرا و دامنه‌ها ----------
     node tests/guard-mutations.js                    # نگهبان‌های بدونِ سرور
     node tests/guard-mutations.js --scope=backend    # فقط سبک‌های بک‌اند
     node tests/guard-mutations.js --scope=frontend   # فقط Vitest/اسکریپت‌های Next
     node tests/guard-mutations.js --scope=live       # فقط برابریِ زنده (هر دو سرور لازم است)
     node tests/guard-mutations.js --scope=static     # فقط سنجشِ زنده‌ی دارایی‌ها (Next بالا، بک‌اند خواب)
     node tests/guard-mutations.js --scope=all        # همه‌ی دامنه‌های سازگار
     node tests/guard-mutations.js --only=panel       # فقط نگهبان‌هایی که نامشان این را دارد
     node tests/guard-mutations.js --list             # فهرستِ نگهبان‌ها و جهش‌ها بدونِ اجرا
     node tests/guard-mutations.js --registry         # رجیستری به‌صورتِ JSON (برای نگهبانِ پوشش)
     node tests/guard-mutations.js --self-test      # خودآزمونِ لنگرهای مشتق‌شده‌ی README

   `--registry` تنها خروجیِ ماشین‌خوانِ همین فایل است و دامنه (`--scope`) را نادیده
   می‌گیرد: پرسشِ «چه کسی در رجیستری هست» دامنه‌ای نیست. مصرف‌کننده‌اش تنها یک
   نگهبان است — `tests/guard-anchors.js` — که می‌پرسد «آیا هر فایلِ آزمون/نگهبان
   در همین رجیستری لنگر دارد؟». پس این خروجی یک *قرارداد* است، نه لاگِ انسانی:
   نام، دامنه، عنوان، نوعِ اجرا، مسیرِ فایلِ خودِ نگهبان و شمارشِ جهش‌ها. شمارشِ
   جهش‌ها عمداً هست: عضویتِ خالی (نگهبانی در رجیستری با صفر جهش) هم یک حفره است
   و آن نگهبان باید بگیردش.

   برای همین، نگاشتِ «نگهبان → فایلِ خودش» یک‌جا و مشتق می‌شود (`guardFileOf`)
   نه دستی؛ و `preflight` هم همان را می‌سنجد تا اگر روزی نگهبانی به فایلی
   اشاره کند که نیست، پیامِ روشن بدهیم و نه یک اسپاونِ خاموشِ ناموفق.

   `live` هر دو سرور را می‌خواهد: Express روی ۳۰۰۰ و Next روی ۳۰۰۱. اگر بالا
   نباشند، با پیامِ روشن رد می‌شود — نه اینکه بی‌صدا رد شود.

   `static` عمداً دامنه‌ی جدا است، چون محیطش با `live` **در تضاد** است: خودِ
   نگهبانِ `static-paths-live` رد می‌کند اگر بک‌اند بالا باشد (چون آن‌وقت
   مسیرها می‌توانند از پروکسی سیر شوند و سنجش همان چیزی را که ادعا می‌کند
   نمی‌سنجد). پس `static` می‌خواهد Next بالا و بک‌اند **خواب** باشد — و همین
   دلیلِ نبودنش در `all` است: یک پروسه نمی‌تواند هر دو محیط را هم‌زمان داشته
   باشد. اگر پیش‌شرط برقرار نباشد، با پیامِ روشن و کدِ ۲ رد می‌شود.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const HERE = __dirname;                       // backend/tests
const BACKEND = path.join(HERE, '..');        // backend
const ROOT = path.join(BACKEND, '..');        // ریشه‌ی مخزن
const NEXT = path.join(ROOT, 'next-frontend');

const EXPRESS_ORIGIN = process.env.GUARD_MUTATIONS_EXPRESS || 'http://127.0.0.1:3000';
const NEXT_ORIGIN = process.env.GUARD_MUTATIONS_NEXT || 'http://127.0.0.1:3001';

// ---------- خطِ فرمان ----------
const argv = process.argv.slice(2);
const flagValue = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const SCOPE = flagValue('scope') || 'offline';
const ONLY = flagValue('only');
const LIST = argv.includes('--list');
const REGISTRY = argv.includes('--registry');

const SCOPES = {
  backend: ['backend'],
  frontend: ['frontend'],
  live: ['live'],
  static: ['static'],
  offline: ['backend', 'frontend'],
  // `static` عمداً اینجا نیست: `live` بک‌اندِ بالا می‌خواهد و `static` بک‌اندِ
  // خواب — جمع‌کردنشان یعنی یک محیطِ غیرِقابلِ‌برآورده و یک شکستِ ساختگی.
  all: ['backend', 'frontend', 'live'],
};
if (!SCOPES[SCOPE]) {
  console.error(`دامنه‌ی ناشناخته: ${SCOPE} — یکی از ${Object.keys(SCOPES).join('، ')}`);
  process.exit(2);
}
const ACTIVE_SCOPES = new Set(SCOPES[SCOPE]);
// ============================================================
// لنگرهای README: از خودِ README خوانده می‌شوند
// ============================================================
// چرا: عددهای README با هر تغییرِ تعدادِ آزمون‌ها عوض می‌شوند. تا امروز لنگرِ
// جهشِ همین عددها **ثابت** بود («۱۳۶۳»، «۲۹۰») و با اولین تغییرِ عدد، خودِ
// هارنس می‌شکست: پیامش «لنگر پیدا نشد» بود، یعنی نگهبان به‌جای گرفتنِ خطا
// خودش خراب می‌شد و آدم دنبالِ ایرادِ کد می‌رفت — یک‌بار هم همین شد.
//
// حالا عدد را از خودِ README می‌خوانیم: هر چه آن‌جا باشد همان را جهش می‌دهیم.
// اگر الگو پیدا نشد، **بلند** و با پیامِ روشن می‌شکند (کدِ خروج ۲) و می‌گوید
// کدام الگو و چه چیزی انتظار می‌رفت — نه اینکه ته‌ی اجرا معلوم شود.
const README_PATH = path.join(ROOT, 'README.md');

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faToEn = (s) => [...s].map((c) => FA_DIGITS.indexOf(c)).join('');
const enToFa = (n) => [...String(n)].map((c) => FA_DIGITS[Number(c)]).join('');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// بدونِ خروج از پروسه برمی‌گرداند، تا خودآزمون هم بتواند همین منطق را روی
// متنِ ساختگی بیازماید — وگرنه «با تغییرِ عدد نمی‌شکند» یک ادعای بی‌شاهد است.
function deriveReadmeAnchor({ pattern, src, findFrom = (n) => enToFa(n), replaceFrom = (n) => enToFa(n - 1) }) {
  const m = src.match(pattern);
  if (!m) return { ok: false, why: 'الگو در متن پیدا نشد' };
  const n = Number(faToEn(m[1]));
  if (!Number.isInteger(n) || n < 2) return { ok: false, why: `عددِ «${m[1]}» معنی ندارد` };

  const find = findFrom(n);
  const replace = replaceFrom(n);
  if (find === replace) return { ok: false, why: 'جایگزین با لنگر یکی است' };

  // با `all: true` رشته همه‌جا عوض می‌شود، پس لنگر نباید به عددِ دیگری چسبیده
  // باشد وگرنه عددِ بی‌گناهِ دیگری هم خراب می‌شود («۲۹۰» داخلِ «۱۲۹۰»).
  const lead = /[۰-۹]/.test(find[0]) ? '(?<![۰-۹])' : '';
  const tail = /[۰-۹]/.test(find[find.length - 1]) ? '(?![۰-۹])' : '';
  const bound = (src.match(new RegExp(lead + escapeRe(find) + tail, 'g')) || []).length;
  const loose = countOccurrences(src, find);
  if (bound !== loose) {
    return { ok: false, why: `لنگرِ «${find}» به عددِ دیگری چسبیده (${loose} تطبیق، ${bound} مستقل)` };
  }
  return { ok: true, anchor: { find, replace, value: n, occurrences: bound } };
}

function readmeAnchor(spec) {
  const r = deriveReadmeAnchor({ pattern: spec.pattern, src: README_SRC, findFrom: spec.findFrom, replaceFrom: spec.replaceFrom });
  if (r.ok) return r.anchor;
  console.error('');
  console.error(`✖ لنگرِ README خوانده نشد: ${spec.what}`);
  console.error(`   الگو: ${spec.pattern}`);
  console.error(`   دلیل: ${r.why}`);
  if (spec.hint) console.error(`   ${spec.hint}`);
  console.error('   یعنی متنِ README عوض شده. یا همان الگو را این‌جا به‌روز کن، یا اگر آن');
  console.error('   عدد دیگر در README نیست این جهش را بازنویسی کن — ولی بی‌صدا رد نشو.');
  process.exit(2);
}

// ---------- خودآزمونِ همین منطق ----------
// با متنِ ساختگی می‌سنجیم که (الف) عددِ جابه‌جاشده دنبال می‌شود و (ب) الگوی
// غایب بلند رد می‌شود. بدونِ این، سازوکارِ تازه خودش می‌تواند دامِ بعدی شود.
function runAnchorSelfTest() {
  const cases = [];
  const check = (label, cond, detail) => cases.push({ label, cond, detail });
  const zwnj = '\u200c';
  const kasra = '\u0650';
  const TOTAL = /\*\*([۰-۹]+) تست خودکار/;

  const t1 = deriveReadmeAnchor({ pattern: TOTAL, src: '> وضعیت: **۱۳۶۳ تست خودکار، همه سبز**' });
  check('عددِ جمع از خطِ وضعیت خوانده می‌شود', t1.ok && t1.anchor.value === 1363, JSON.stringify(t1.anchor || t1.why));
  check('و یکی کم می‌شود تا با جمعِ اجزا نخواند', t1.ok && t1.anchor.replace === '۱۳۶۲', t1.ok ? t1.anchor.replace : '');

  // قلبِ ماجرا: عدد را جابه‌جا کن؛ لنگر باید با آن بیاید، نه اینکه بشکند.
  const t2 = deriveReadmeAnchor({ pattern: TOTAL, src: '> وضعیت: **۱۴۰۰ تست خودکار، همه سبز**' });
  check('عددِ جابه‌جاشده هم دنبال می‌شود', t2.ok && t2.anchor.value === 1400 && t2.anchor.replace === '۱۳۹۹', JSON.stringify(t2.anchor || t2.why));

  const t3 = deriveReadmeAnchor({ pattern: TOTAL, src: 'خطی که هیچ عددی ندارد' });
  check('الگویِ غایب بلند رد می‌شود', t3.ok === false && /پیدا نشد/.test(t3.why || ''), JSON.stringify(t3));

  const t4 = deriveReadmeAnchor({
    pattern: new RegExp('([۰-۹]+) آزمون' + kasra + ' فرانت' + zwnj + 'اند'),
    src: '… + ۲۹۰ آزمون' + kasra + ' فرانت' + zwnj + 'اند (…)',
  });
  check('شمارشِ فرانت‌اند با کسره و نیم‌فاصله خوانده می‌شود', t4.ok && t4.anchor.value === 290, JSON.stringify(t4.anchor || t4.why));

  const t5 = deriveReadmeAnchor({
    pattern: /([۰-۹]+) تایش/,
    src: 'npm test  # ۲۰ تایش رفتارِ صفحه',
    findFrom: (n) => enToFa(n) + ' تایش',
    replaceFrom: (n) => enToFa(n - 1) + ' تایش',
  });
  check('ادعای «N تایش» با کلمه‌اش خوانده می‌شود', t5.ok && t5.anchor.find === '۲۰ تایش' && t5.anchor.replace === '۱۹ تایش', JSON.stringify(t5.anchor || t5.why));

  const t6 = deriveReadmeAnchor({ pattern: TOTAL, src: '**۱۳۶۳ تست خودکار … و آن یکی ۱۳۶۳۴' });
  check('لنگرِ چسبیده به عددِ دیگر رد می‌شود', t6.ok === false && /چسبیده/.test(t6.why || ''), JSON.stringify(t6));

  console.log('\nخودآزمونِ لنگرهای README:');
  let pass = 0;
  for (const c of cases) {
    if (c.cond) pass++;
    console.log(`  ${c.cond ? '✔' : '✖'} ${c.label}${c.cond ? '' : '   ← ' + c.detail}`);
  }
  console.log('');
  if (pass === cases.length) { console.log(`SUCCESS: ${pass} خودآزمون گذشت`); process.exit(0); }
  console.error(`FAILURE: ${cases.length - pass} از ${cases.length} خودآزمون رد شد`);
  process.exit(1);
}

// خودآزمون عمداً **پیش از** خواندنِ READMEِ واقعی است: به آن وابسته نیست.
if (argv.includes('--self-test')) runAnchorSelfTest();

if (!fs.existsSync(README_PATH)) {
  console.error('✖ README.md پیدا نشد — لنگرهای جهش از خودِ آن خوانده می‌شوند.');
  process.exit(2);
}
const README_SRC = fs.readFileSync(README_PATH, 'utf8');

// سه لنگرِ README که تا امروز دستی به‌روز می‌شدند.
const README_ANCHORS = {
  total: readmeAnchor({
    what: 'جمعِ کلِ تست‌ها در خطِ وضعیت',
    pattern: /\*\*([۰-۹]+) تست خودکار/,
    hint: 'خطِ وضعیت باید «**N تست خودکار» داشته باشد.',
  }),
  frontend: readmeAnchor({
    what: 'شمارشِ آزمون‌های فرانت‌اند',
    pattern: /([۰-۹]+) آزمون\u0650 فرانت\u200cاند/,
    hint: 'خطِ وضعیت باید «N آزمونِ فرانت‌اند» داشته باشد.',
  }),
  suiteNote: readmeAnchor({
    what: 'ادعای «N تایش» در کامنتِ دستورِ npm test',
    pattern: /([۰-۹]+) تایش/,
    hint: 'کامنتِ دستورِ «npm test» باید «N تایش» داشته باشد.',
    findFrom: (n) => enToFa(n) + ' تایش',
    replaceFrom: (n) => enToFa(n - 1) + ' تایش',
  }),
};


// ============================================================
// ۱) رجیستریِ نگهبان‌ها و جهش‌ها
// ============================================================
// قواعدِ نوشتنِ یک جهش:
//   • `find` باید در فایل **یکتا** باشد (یا با `all: true` صریحاً همه‌جا).
//   • تغییر باید *رفتاری* باشد، نه غلطِ نگارشی؛ وگرنه هر چیزی قرمز می‌شود.
//   • `failedTest` (برای Vitest) باید زیررشته‌ی نامِ همان آزمونی باشد که این
//     جهش باید زمین بزند؛ نه «یکی از آزمون‌ها».
//   • `expect` (برای نگهبان‌های متنی) باید پیامِ همان شکست را بگوید.
const GUARDS = [
  // ----------------------------------------------------------
  // نگهبان‌های سبکِ بک‌اند
  // ----------------------------------------------------------
  {
    name: 'panel-retired',
    scope: 'backend',
    title: 'پنلِ Express برنگشته و ارجاعش جا نمانده',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/panel-retired.js'] },
    mutations: [
      {
        // مقصدِ جهش عمداً `next-frontend/public` است، نه پوشه‌ی حذف‌شده‌ی
        // `frontend/`: آن مسیرِ دارایی هنوز هست و همان درس را می‌دهد («فایلِ
        // بازنشسته هرجا سرو شود باید گرفته شود»). ساختنِ پوشه‌ی `frontend/`
        // برای این جهش یک عارضه‌ی جانبی داشت: پوشه‌ی خالیِ جامانده بعد از
        // بازگردانی، نگهبان‌های «frontend/ برنگشته» را در اجراهای بعدی قرمز
        // می‌کرد — یعنی هارنس خودش برای بقیه خرابی می‌ساخت.
        label: 'فایلِ پنل دوباره سرِ جایش گذاشته شود',
        file: 'next-frontend/public/admin.html',
        create: '<!doctype html><html lang="fa"><body><h1>panel mutation</h1></body></html>\n',
        expect: /برگشته|resurrect/i,
      },
      {
        label: 'لینکی دوباره به admin.html اضافه شود',
        file: 'next-frontend/public/offline.html',
        append: '\n<a href="/admin.html">mutation</a>\n',
        expect: /ارجاع به پنل/,
      },
      {
        label: 'یک استایلِ پنل دوباره ارجاع داده شود',
        file: 'backend/server.js',
        append: '\nconst mutationAssetRef = "invoice.css";\n',
        expect: /ارجاع به پنل/,
      },
    ],
  },
  {
    name: 'order-window-integrity',
    scope: 'backend',
    title: 'پنجره‌ی صبرِ فرانت‌اند به مهلت/تیکِ بک‌اند گره خورده',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/order-window-integrity.js'] },
    mutations: [
      {
        label: 'مهلتِ پرداخت بلندتر شود تا پنجره‌ی صبر نرسد',
        file: 'backend/lib/db.js',
        find: 'const ORDER_TTL_MS = 30 * 60 * 1000;',
        replace: 'const ORDER_TTL_MS = 45 * 60 * 1000;',
        expect: /کوتاه‌تر/,
      },
      {
        label: 'فاصله‌ی تیکِ تطبیق بلندتر شود',
        file: 'backend/lib/reconcile.js',
        find: 'const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;',
        replace: 'const RECONCILE_INTERVAL_MS = 15 * 60 * 1000;',
        expect: /کوتاه‌تر/,
      },
      {
        label: 'سقفِ بررسیِ فرانت‌اند نصف شود',
        file: 'next-frontend/src/components/OrderSuccessContent.tsx',
        find: 'const POLL_CHECKS_TOTAL = 47;',
        replace: 'const POLL_CHECKS_TOTAL = 30;',
        expect: /کوتاه‌تر/,
      },
    ],
  },
  {
    name: 'otp-resend-window',
    scope: 'backend',
    title: 'ثانیه‌شمارِ ارسال مجدد «مهلتِ مطلق» ذخیره می‌کند',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/otp-resend-window.js'] },
    mutations: [
      {
        // سمتِ Expressِ این نگهبان از اوراکلِ منجمد می‌خواند (`frontend/`
        // حذف شده)، پس جهش هم همان‌جا زده می‌شود: «اگر مرجع عوض شود،
        // نگهبان می‌گیرد».
        label: 'مهلتِ مطلق به شمارنده‌ی خام برگردد (اوراکلِ Express)',
        file: 'next-frontend/tests/fixtures/legacy-src/js/login.js',
        find: 'resendAt: Date.now() + retry * 1000',
        replace: 'resendAt: retry * 1000',
        expect: /مهلت را با/,
      },
      {
        label: 'کلیدِ وضعیت عوض شود (اوراکلِ Express)',
        file: 'next-frontend/tests/fixtures/legacy-src/js/login.js',
        find: "const STATE_KEY = 'pg_otp_state';",
        replace: "const STATE_KEY = 'pg_otp_state_mutation';",
        expect: /وضعیت از یک کلید/,
      },
      {
        label: 'مهلتِ Next بدونِ شماره ذخیره شود',
        file: 'next-frontend/src/components/LoginForm.tsx',
        find: 'localStorage.setItem(RESEND_KEY, JSON.stringify({ phone, until }))',
        replace: 'localStorage.setItem(RESEND_KEY, JSON.stringify({ until }))',
        expect: /کدام شماره/,
      },
      {
        // همان باگی که همین امروز بسته شد: پنجره‌ی Next با عددِ هاردکد باز شود.
        label: 'پنجرهٔ Next دوباره عددِ هاردکد بگیرد (نه مهلتِ سرور)',
        file: 'next-frontend/src/components/LoginForm.tsx',
        find: 'const res = await requestOtp(phone.trim(), ch.token);\n      startCooldown(serverResendSeconds(res));',
        replace: 'await requestOtp(phone.trim(), ch.token);\n      startCooldown(30);',
        expect: /هاردکد/,
      },
      {
        // و همان باگِ دیگر: سرور در ۴۲۹ مهلتِ کامل بدهد به‌جای باقی‌مانده —
        // یعنی عددی که کاربر می‌شمارد با عددی که سرور اعمال می‌کند یکی نباشد.
        label: 'سرور در ۴۲۹ مهلتِ کامل بدهد، نه مهلتِ باقی‌مانده',
        file: 'backend/routes/auth.js',
        find: 'retryAfter: wait });',
        replace: 'retryAfter: Math.ceil(RESEND_COOLDOWN_MS / 1000) });',
        expect: /باقی/,
      },
      {
        label: 'پشتیبانِ Express از پشتیبانِ Next جدا شود',
        file: 'next-frontend/tests/fixtures/legacy-src/js/login.js',
        find: 'const FALLBACK_RESEND_SECONDS = 30;',
        replace: 'const FALLBACK_RESEND_SECONDS = 60;',
        expect: /پشتیبان/,
      },
      {
        // این جهش عمداً از چشمِ نیمه‌ی ایستا پنهان است: عبارتِ `wait`
        // دست‌نخورده می‌ماند و فقط مُهرِ زمانیِ نوشته‌شده به دیتابیس عقب
        // می‌افتد. نتیجه‌اش یک باگِ واقعی است — قیدِ فاصله‌ی دو پیامک دور زده
        // می‌شود و هر دو درخواست ۲۰۰ می‌گیرند (آزارِ پیامکی با هزینه‌ی مغازه).
        // فقط آزمونِ زنده می‌تواند ببیند که مُهرِ دیسک با لحظه‌ی درخواست نمی‌خواند.
        label: 'مُهرِ last_sent_at در دیتابیس یک دقیقه عقب نوشته شود (تنها آزمونِ زنده می‌گیرد)',
        file: 'backend/routes/auth.js',
        find: 'code_hash: hashCode(code), expires_at: now + OTP_TTL_MS, now, day',
        replace: 'code_hash: hashCode(code), expires_at: now + OTP_TTL_MS, now: now - 60000, day',
        expect: /مُهرِ زمانی/,
      },
    ],
  },
  {
    name: 'otp-attempt-cap',
    scope: 'backend',
    title: 'مرزِ پنج‌تاییِ کدِ پیامکی + پیامِ باقی‌مانده + ردِ امنیتیِ سوختن',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/otp-attempt-cap.js'] },
    mutations: [
      {
        label: 'شمارشِ تلاش یک واحد جلو بیفتد (عددِ باقی‌مانده دروغ می‌شود)',
        file: 'backend/routes/auth.js',
        find: 'const attemptsUsed = record.attempts + 1;',
        replace: 'const attemptsUsed = record.attempts + 2;',
        expect: /تلاشِ اول روی ردیفِ تازه/,
      },
      {
        label: 'مرز از `>` به `>=` برگردد (تلاشِ پنجمِ کاربر بی‌دلیل قربانی شود)',
        file: 'backend/routes/auth.js',
        find: 'if (attemptsUsed > MAX_ATTEMPTS) {',
        replace: 'if (attemptsUsed >= MAX_ATTEMPTS) {',
        expect: /دروازه یکتاست/,
      },
      {
        label: 'عددِ باقی‌مانده از جمله‌ی کاربر حذف شود (فقط فیلدِ ماشین‌خوان بماند)',
        file: 'backend/routes/auth.js',
        find: '? `کد وارد شده اشتباه است؛ ${faDigits(remaining)} تلاش دیگر مانده`',
        replace: "? 'کد وارد شده اشتباه است'",
        expect: /فیلد و هم داخلِ جمله/,
      },
      {
        // این جهش عمداً از چشمِ نیمه‌ی ایستا پنهان است: امضای `logAdminAction`
        // دست‌نخورده می‌ماند و فقط حسابِ خودِ `clientFingerprint` خراب می‌شود.
        // فقط آزمونِ زنده می‌تواند ببیند که سطرِ دفتر بی‌اثرِ انگشت مانده است.
        label: 'اثرِ انگشتِ درخواست خالی برگردد (تنها آزمونِ زنده می‌گیرد)',
        file: 'backend/routes/auth.js',
        find: "return `IP ${req.ip || '?'} — ${br} روی ${os}`;",
        replace: "return `IP ${req.ip || '?'} — ${os}`;",
        expect: /اثرِ انگشتِ مهاجم/,
      },
      {
        label: 'رویدادِ امنیتیِ سوختن دیگر در دفتر ثبت نشود',
        file: 'backend/routes/auth.js',
        find: "logAdminAction(null, 'otp_code_burned', maskPhone(phone), clientFingerprint(req));",
        replace: 'void 0;',
        expect: /otp_code_burned/,
      },
    ],
  },
  {
    name: 'secrets',
    scope: 'backend',
    title: 'مرزِ راز: هیچ رازی در سمتِ کلاینت و .env.example نمی‌ماند',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/secrets.js'] },
    mutations: [
      {
        label: 'placeholderِ .env.example با مقدارِ واقعی عوض شود',
        file: 'backend/.env.example',
        find: 'SESSION_SECRET=REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
        replace: 'SESSION_SECRET=mutation-real-secret-value-32-chars',
        expect: /جای\u200cنگهدار/,
      },
      {
        // مرزِ کلاینت امروز `next-frontend/` است (دارایی‌های `public/` و سورسی
        // که باندل می‌شود)، نه پوشه‌ی حذف‌شده‌ی `frontend/`.
        label: 'رازی داخلِ داراییِ کلاینتی جا بماند',
        file: 'next-frontend/public/offline.html',
        append: '\n<script>SESSION_SECRET = leaked-mutation-value</script>\n',
        expect: /سمتِ کلاینت نیست/,
      },
      {
        label: 'هدرِ احرازِ هویت داخلِ سورسِ کلاینتی جا بماند',
        file: 'next-frontend/src/lib/site.ts',
        append: '\n// Authorization: AccessKey mutation\n',
        expect: /سمتِ کلاینت نیست/,
      },
    ],
  },
  {
    name: 'bench-report-integrity',
    scope: 'backend',
    title: 'گزارشِ بنچمارک فقط append می‌شود و بخش‌هایش می‌مانند',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/bench-report-integrity.js'] },
    mutations: [
      {
        label: 'یک بخشِ گزارش حذف/تغییرنام شود',
        file: 'backend/benchmark-report.md',
        find: '## ۴. تحلیل',
        replace: '## ۴. جمع‌بندی',
        expect: /Section missing/,
      },
      {
        label: 'بنچمارک به‌جای append بازنویسی کند',
        file: 'backend/bench-report.sh',
        find: 'echo "$BLOCK" >> "$REPORT"',
        replace: 'echo "$BLOCK" > "$REPORT"',
        expect: /write mode|append operator/,
      },
    ],
  },
  {
    name: 'readme-counts-backend',
    scope: 'backend',
    title: 'عددهای README با خودِ مخزن می‌خوانند',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/readme-counts.js'] },
    mutations: [
      {
        label: 'جمعِ کلِ README از جمعِ اجزا جدا بیفتد',
        file: 'README.md',
        // عدد از خودِ README خوانده می‌شود (`README_ANCHORS.total`)
        derived: 'جمعِ کلِ تست‌ها',
        find: README_ANCHORS.total.find,
        replace: README_ANCHORS.total.replace,
        all: true,
        expect: /جمع/,
      },
      {
        label: 'یک خط به db.js اضافه شود تا ادعای «خط‌ها» غلط شود',
        file: 'backend/lib/db.js',
        append: '\n// mutation-tests\n',
        expect: /خط/,
      },
    ],
  },
  {
    name: 'service-worker-strategy',
    scope: 'backend',
    title: 'صفحه‌ی کاربرِ برگشته هرگز کهنه نباشد (تازه‌سازیِ پس‌زمینه)',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/service-worker-strategy.js'] },
    mutations: [
      {
        // همان رگرسیونی که این نگهبان برای گرفتنش نوشته شده: یک کپیِ کهنه که
        // بی‌سروصدا جلوتر از شبکه می‌نشیند.
        label: 'کش-اول جای شبکه بنشیند (کپیِ کهنه به کاربر برسد)',
        file: 'next-frontend/public/sw.js',
        find: '  return fetch(req, { cache: \'no-cache\' })',
        replace:
          '  return caches.open(PAGE_CACHE).then((c) => c.match(req.url)).then((hit) => hit || fetch(req))',
        expect: /تازه/,
      },
      {
        label: 'درخواستِ ناوبری بدونِ `no-cache` برود (واسطه می‌تواند پاسخِ کهنه بدهد)',
        file: 'next-frontend/public/sw.js',
        // عبارتِ کد، نه شکلِ داخلِ کامنت — وگرنه لنگر یکتا نیست (هر دو را
        // شمرده می‌شود) و جهش بی‌دلیل می‌شکند.
        find: "return fetch(req, { cache: 'no-cache' })",
        replace: 'return fetch(req)',
        expect: /no-cache/,
      },
      {
        label: 'تازه‌سازیِ پس‌زمینه حذف شود (کپیِ کش همیشه کهنه می‌ماند)',
        file: 'next-frontend/public/sw.js',
        find: '      cachePageInBackground(req, res);\n',
        replace: '',
        expect: /پس‌زمینه/,
      },
      {
        label: 'نسخه‌ی کشِ صفحه‌ها جدا از کشِ دارایی‌ها بامپ شود',
        file: 'next-frontend/public/sw.js',
        find: "const PAGE_CACHE = 'pg-pages-v9';",
        replace: "const PAGE_CACHE = 'pg-pages-v8';",
        expect: /نسخه/,
      },
    ],
  },
  {
    name: 'static-compress-cache',
    scope: 'backend',
    title: 'کشِ فشرده‌سازی با محتوا تازه شود، نه با (mtime، اندازه) یا هشِ ۳۲ بیتی',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/static-compress-cache.js'] },
    mutations: [
      {
        // دقیقاً همان باگی که این نگهبان برای گرفتنش نوشته شد: اعتبارِ کش
        // محتوا را نبیند و نسخه‌ی کهنه — با وجود تغییرِ بایت — زنده بماند.
        // (روی ویندوز و لینوکس یکسان کار می‌کند، چون به فایل‌سیستم وابسته نیست.)
        label: 'اعتبارِ کش دیگر محتوا را نبیند (بدنه‌ی کهنه بماند)',
        file: 'backend/lib/static-compress.js',
        find: 'if (!hit || hit.hash !== hash) {',
        replace: 'if (!hit) {',
        expect: /کهنه/,
      },
      {
        label: 'ETag از (اندازه، mtime) ساخته شود (کلاینت ۳۰۴ِ کهنه بگیرد)',
        file: 'backend/lib/static-compress.js',
        find: 'const etag = `W/"${hash}-${encoding}"`;',
        replace: 'const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}-${encoding}"`;',
        expect: /ETag/,
      },
      {
        // کشِ HTML دوباره با همان کلیدِ قدیمی: هشِ ۳۲ بیتیِ FNV-1a + طولِ
        // *بایتِ* متن. چون هش روی واحدهای کدِ UTF-16 می‌گردد، دو سندِ هم‌اندازه
        // ولی با طولِ واحدِ کدِ متفاوت هم‌کلید می‌شوند و سندِ جابه‌جا سرو می‌شود.
        label: 'هشِ کشِ HTML دوباره ۳۲ بیتی شود (سندِ جابه‌جا سرو شود)',
        file: 'backend/lib/static-compress.js',
        find: 'const key = `${encoding}|${contentHash(buf0)}`;',
        replace: 'const key = `${encoding}|${buf0.length}|${(function(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(36);})(html)}`;',
        expect: /جابه/,
      },
    ],
  },
  {
    name: 'event-labels',
    scope: 'backend',
    title: 'هر رویدادِ دفترِ رویدادها برچسبِ فارسی دارد',
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/event-labels.js'] },
    mutations: [
      {
        // دقیقاً همان بدهیِ تاریخی: رویدادی به بک‌اند اضافه می‌شود و کسی
        // نگاشتِ پنل را به‌روز نمی‌کند، پس مدیر کلیدِ خام می‌بیند.
        label: 'رویدادِ تازه‌ای در بک‌اند ثبت شود و برچسبش جا بماند',
        file: 'backend/routes/admin.js',
        find: "  note(req, 'backup', path.basename(file));",
        replace: "  note(req, 'backup', path.basename(file));\n  note(req, 'panel_note_added', 'تست');",
        expect: /بدونِ برچسب/,
      },
      {
        // پشتیبانِ کلیدِ خام اگر برود، رویدادِ ناشناس بی‌صدا از دفتر ناپدید
        // می‌شود — بی‌هیچ خطایی، که بدترین حالتِ گم‌شدنِ اطلاعات است.
        label: 'رویدادِ ناشناس در دفتر پنهان شود (کلیدِ خام نماند)',
        file: 'next-frontend/src/components/admin/ActivityContent.tsx',
        find: 'ACTION_FA[entry.action] ?? entry.action',
        replace: 'ACTION_FA[entry.action] ?? ""',
        expect: /پنهان/,
      },
      {
        // جهتِ برعکس: کلید در بک‌اند تغییر نام می‌دهد و برچسبِ قدیمی جا می‌ماند،
        // پس یک برچسب داریم که هیچ رویدادی پشتش نیست.
        label: 'برچسبی در پنل بماند که رویدادی پشتش نیست (کلیدِ تغییرنام‌داده)',
        file: 'next-frontend/src/components/admin/ActivityContent.tsx',
        find: '  order_note: "یادداشت سفارش",',
        replace: '  order_note: "یادداشت سفارش",\n  order_notes: "یادداشت‌های سفارش",',
        expect: /بی‌صاحب/,
      },
    ],
  },

  {
    name: 'guard-anchors',
    scope: 'backend',
    title: 'هیچ آزمون/نگهبانی بی‌لنگرِ جهش نمی‌ماند (هر فایل لنگر یا دلیلِ مستند دارد)',
    // چرا این نگهبان لنگر می‌خواهد: خودش حفره‌ی «دستی‌بودنِ رجیستری» را می‌بندد،
    // پس اگر خودش کار نکند همان حفره با یک لایه اطمینانِ قلابی برمی‌گردد.
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/guard-anchors.js'] },
    mutations: [
      {
        // حفره‌ی اصلی: نگهبانی تازه به مخزن می‌آید و هیچ‌کس به رجیستری اضافه‌اش
        // نمی‌کند. این جهش همان اتفاق را می‌سازد (فایلِ آزمونِ بی‌آزار، بی‌لنگر
        // و بی‌دلیل) و انتظار دارد نگهبان اسمِ همان فایل را قرمز کند.
        label: 'یک آزمونِ تازه بدونِ لنگر و بدونِ دلیل اضافه شود',
        file: 'next-frontend/src/lib/orphan-mutation.test.ts',
        create: 'import { expect, it } from "vitest";\n\nit("فقط برای جهش", () => {\n  expect(1).toBe(1);\n});\n',
        expect: /orphan-mutation\.test\.ts/,
      },
      {
        // «معافیت» نباید راهِ فرار باشد: ردیفِ بی‌دلیل یعنی «نمی‌دانیم چرا
        // این‌جاست» — همان چیزی که این نگهبان برای کشفش نوشته شده.
        label: 'دلیلِ یک معافیت خالی شود',
        file: 'backend/tests/guard-anchors.js',
        find: "why: 'ساختِ PNGِ معتبر با ابعادِ دلخواه برای آزمونِ آپلود — فیکسچر، نه سنجش.',",
        replace: "why: '   ',",
        expect: /دلیل ندارد/,
      },
      {
        // جهتِ برعکس: لنگرِ سرگردان. نگاشتِ حرکتیِ رجیستری به فایلی می‌رسد که
        // نیست، یعنی هارنس دارد چیزی را می‌سنجد که وجود ندارد — و خودش هم هیچ
        // چیز دیگری از این فایل را نمی‌فهمد.
        label: 'لنگرِ یک نگهبان به فایلی برود که وجود ندارد',
        file: 'backend/tests/guard-mutations.js',
        // `all` اینجا اجباری است و دلیلش خودِ همان چیزی است که این جهش می‌سنجد:
        // هدف، خودِ همین فایل است و هر لنگرِ متنی‌ای که بنویسیم، در تعریف همین
        // جهش هم تکرار می‌شود. پس هر دو جا عوض می‌شوند؛ آن‌که مهم است خطِ ۲۷۸
        // (ورودیِ رجیستریِ panel-retired) است و بازگردانی بایت‌به‌بایت از حافظه
        // انجام می‌شود. لنگرِ کوتاه‌تر هم امتحان شد: به دو تطبیق می‌رسید و
        // پیش‌پروازِ هارنس همان را گرفت.
        find: "runner: { kind: 'node', cwd: BACKEND, args: ['tests/panel-retired.js'] },",
        // جایگزین عمداً پسوندِ `.js` را نگه می‌دارد: نگاشتِ نگهبان→فایل باید فایلِ
        // بی‌وجود را ببیند (کد ۱)، نه اینکه خودِ مشتق‌گیری رد شود (کد ۲).
        replace: "runner: { kind: 'node', cwd: BACKEND, args: ['tests/panel-retired-hazf-shode.js'] },",
        all: true,
        expect: /روی دیسک نیست/,
      },
      {
        // فرمِ گروهی شمارشِ صریح دارد؛ این جهش نشان می‌دهد آن شمارش واقعاً
        // قفل است و یک الگو نمی‌تواند بی‌صدا فایل‌های تازه را ببلعد.
        label: 'شمارشِ صریحِ یک معافیتِ گروهی با تطبیق‌ها نخواند',
        file: 'backend/tests/guard-anchors.js',
        find: '    count: 10,',
        replace: '    count: 11,',
        expect: /یکی نیست/,
      },
      {
        // عضویتِ خالی: نگهبانی در رجیستری باشد ولی صفر جهش داشته باشد. آن‌وقت
        // هارنس رویش «پاک ✔ | جهش ۰/۰» می‌نویسد — یک سبزِ بی‌معنی.
        label: 'خروجیِ رجیستری همه‌ی شمارش‌های جهش را صفر بدهد',
        file: 'backend/tests/guard-mutations.js',
        // باز هم تمام‌خطِ دو سطری، نه قطعهٔ کوتاه‌تر: همان قطعه در تعریفِ همین
        // جهش هم هست. `\n` اینجا یک نویسهٔ واقعی است، پس لنگر یکتاست.
        find: '        file: guardFileOf(g),\n        mutations: g.mutations.length,',
        replace: '        file: guardFileOf(g),\n        mutations: 0,',
        expect: /عضویتِ خالی/,
      },
    ],
  },

  {
    name: 'error-handoff',
    scope: 'backend',
    title: 'خطای صفحه‌ای به Next می‌رود (نه صفحه‌ی HTMLِ دوم روی Express)',
    // چرا این نگهبان لنگر می‌خواهد: تصمیم‌هایش سه دامِ واقعی دارند و هر سه
    // بی‌صدا برمی‌گردند — `/api` با ۳۰۲ خطای JSON می‌دهد، `/picture` با ۳۰۲
    // حلقه‌ی بی‌پایان می‌سازد (Next همین پیشوند را به ما پروکسی می‌کند)، و
    // شاخه‌ی «به خودمان» اگر برداشته شود حلقه‌ی ریدایرکت می‌شود. هیچ‌کدام خطا
    // نمی‌دهند؛ فقط رفتار عوض می‌شود.
    runner: { kind: 'node', cwd: BACKEND, args: ['tests/error-handoff.js'] },
    mutations: [
      {
        // حلقه: Next عکس‌ها را به همین سرور پروکسی می‌کند؛ پس ۳۰۲ دادنشان
        // یعنی رفت‌وبرگشتِ بی‌پایان بین دو سرور.
        label: 'استثنای عکس‌ها برداشته شود (عکس‌ها هم ۳۰۲ بگیرند)',
        file: 'backend/lib/error-handoff.js',
        find: "  if (pathname === '/picture' || pathname.startsWith('/picture/')) {",
        replace: '  if (false) {',
        expect: /حلقه/,
      },
      {
        // ۳۰۱ برای «مسیری که امروز نیست» کشِ دائمی می‌سازد: روزی که آن مسیر
        // ساخته شود، مرورگرها همچنان به جای خالی می‌روند.
        label: '۳۰۲ به ۳۰۱ عوض شود (کشِ دائمی برای مسیرِ نبوده)',
        file: 'backend/lib/error-handoff.js',
        find: '    status: 302,',
        replace: '    status: 301,',
        expect: /۳۰۱/,
      },
      {
        // متدِ نوشتاری با ۳۰۲ به GET تبدیل می‌شود، یعنی تلقینِ «دوباره
        // فرستاده شد» — و اگر روزی مسیرِ نوشتاریِ غیرِ‌API اضافه شود، بدترین
        // حالت است.
        label: 'متدِ نوشتاری هم ۳۰۲ بگیرد',
        file: 'backend/lib/error-handoff.js',
        find: '  if (!PAGE_METHODS.includes(verb)) {',
        replace: '  if (false) {',
        expect: /متدِ (POST|PUT|PATCH|DELETE)/,
      },
      {
        // همان حلقه‌ای که قاعده‌ی `/admin` با `sameHost` بست: ۳۰۲ به خودمان.
        label: 'شاخه‌ی «سایت روی همین میزبان است» برداشته شود',
        file: 'backend/lib/error-handoff.js',
        find: '  if (!base || sameHost(base, host)) {',
        replace: '  if (!base) {',
        expect: /به خودمان/,
      },
      {
        // بازگشتِ صفحه‌ی دوم — همان چیزی که حذفِ `frontend/` می‌خواست ببندد.
        label: 'هندلرِ ۴۰۴ دوباره HTML بسازد',
        file: 'backend/server.js',
        find:
          "  res.status(404).type('text/plain; charset=utf-8').send('چنین صفحه‌ای وجود ندارد.');",
        replace:
          "  res.status(404).type('text/html; charset=utf-8').send('<!doctype html><h1>404</h1>');",
        expect: /HTML/,
      },
      {
        // هندلرِ ۵۰۰ از قاعده جدا شود: نه ۵۰۰ِ استایل‌دار، نه ۴۰۴ — یعنی
        // همان واگراییِ دو دنیا، فقط این‌بار روی خودِ دامنه.
        label: 'هندلرِ ۵۰۰ دوباره جدای از قاعده جواب بدهد',
        file: 'backend/server.js',
        find: '  const handoff = errorHandoff(req);\n  if (handoff.kind === \'storefront\') {',
        replace: "  const handoff = { kind: 'plain' };\n  if (handoff.kind === 'storefront') {",
        expect: /۴۰۴ و ۵۰۰/,
      },
    ],
  },

  // ----------------------------------------------------------
  // نگهبان‌های Vitest (منبع را عوض می‌کنیم، نگهبان باید قرمز شود)
  // ----------------------------------------------------------
  {
    name: 'copyParity',
    scope: 'frontend',
    title: 'متنِ سبد/پرداخت/فیلترها با Express یکی است',
    runner: { kind: 'vitest', test: 'src/app/copyParity.test.ts' },
    mutations: [
      {
        label: 'برچسبِ تراشه‌ی «فقط موجود» عوض شود',
        file: 'next-frontend/src/app/products/page.tsx',
        find: 'label="فقط موجود"',
        replace: 'label="فقط کالاهای موجود"',
        failedTest: 'هر برچسبِ فیلترها',
      },
      {
        label: 'سرتیترِ سبد خرید (همه‌ی نمونه‌های متن) عوض شود',
        file: 'next-frontend/src/app/cart/page.tsx',
        find: 'سبد خرید شما',
        replace: 'سبد کالا',
        all: true,
        failedTest: 'هر برچسبِ سبد خرید',
      },
    ],
  },
  {
    name: 'parityManifest',
    scope: 'frontend',
    title: 'مانیفستِ برابری کامل و راست است',
    runner: { kind: 'vitest', test: 'src/app/parityManifest.test.ts' },
    mutations: [
      {
        label: 'یک needle به رشته‌ای بی‌ربط عوض شود',
        file: 'next-frontend/src/lib/parityManifest.ts',
        find: 'needle: "در حال بارگذاری",',
        replace: 'needle: "این رشته در Express نیست (mutation)",',
        failedTest: 'needle',
      },
      {
        label: 'آدرسِ Next به مسیرِ ناموجود عوض شود',
        file: 'next-frontend/src/lib/parityManifest.ts',
        find: 'next: { url: "/", status: 200 },',
        replace: 'next: { url: "/mutation-missing", status: 200 },',
        failedTest: 'مقصدِ واقعی',
      },
    ],
  },
  {
    name: 'internalLinks',
    scope: 'frontend',
    title: 'هر ارجاعِ داخلی به مقصدِ واقعی می‌رسد',
    runner: { kind: 'vitest', test: 'src/app/internalLinks.test.ts' },
    mutations: [
      {
        label: 'لینکی به مسیرِ ناموجود اضافه شود',
        file: 'next-frontend/src/lib/site.ts',
        append: '\nexport const __mutationMissingLink = "/pg-mutation-missing";\n',
        failedTest: 'هر ارجاعِ داخلی',
      },
      {
        label: 'ارجاعی به نامِ دنیای Express برگردد',
        file: 'next-frontend/src/components/Footer.tsx',
        append: '\nexport const __mutationExpressLink = "/cart.html";\n',
        failedTest: 'دنیای Express',
      },
    ],
  },
  {
    name: 'shellParity',
    scope: 'frontend',
    title: 'پوسته‌ی Express در Next هم هست',
    runner: { kind: 'vitest', test: 'src/app/shellParity.test.ts' },
    mutations: [
      {
        label: 'عددِ تأخیرِ کادرِ خوش‌آمد عوض شود',
        file: 'next-frontend/src/lib/welcome.ts',
        find: 'export const WELCOME_DELAY_MS = 25_000;',
        replace: 'export const WELCOME_DELAY_MS = 30_000;',
        failedTest: 'هر قابلیتِ پوسته',
      },
      {
        label: 'شماره‌ی تماسِ مغازه در اوراکلِ Express عوض شود',
        file: 'next-frontend/tests/fixtures/legacy-src/index.html',
        find: 'tel:09113567409',
        replace: 'tel:09110000000',
        all: true,
        failedTest: 'هر قابلیتِ پوسته',
      },
    ],
  },
  {
    name: 'faqParity',
    scope: 'frontend',
    title: 'FAQ دیدنی و داده‌ی ساختاریافته از یک منبع می‌خوانند',
    runner: { kind: 'vitest', test: 'src/app/faqParity.test.ts' },
    mutations: [
      {
        label: 'بخشِ دیدنی از منبعِ مشترک نخواند',
        file: 'next-frontend/src/app/page.tsx',
        find: '{HOME_FAQ.map((item) => (',
        replace: '{HOME_FAQ.slice().map((item) => (',
        failedTest: 'بخشِ دیدنی و داده',
      },
      {
        label: 'لنگرِ #faq حذف شود',
        file: 'next-frontend/src/app/page.tsx',
        find: 'id="faq"',
        replace: 'id="faq-mutation"',
        failedTest: 'لنگرِ #faq',
      },
    ],
  },
  {
    name: 'seoParity',
    scope: 'frontend',
    title: 'سئوی صفحه‌ها با Express یکی است',
    runner: { kind: 'vitest', test: 'src/app/seoParity.test.ts' },
    mutations: [
      {
        label: 'سبد خرید دوباره index شود',
        file: 'next-frontend/src/app/cart/page.tsx',
        find: 'robots: { index: false, follow: true },',
        replace: 'robots: { index: true, follow: true },',
        failedTest: 'cart.html',
      },
      {
        label: 'توضیحِ متای قوانین عوض شود',
        file: 'next-frontend/src/app/terms/page.tsx',
        find: 'قوانین خرید، رویه',
        replace: 'قوانین خرید تازه، رویه',
        failedTest: 'terms.html',
      },
      {
        // صفحه‌ی ۵۰۰ِ لبه‌ی دامنه (`public/error-500.html`) سه نسخه‌ی هم‌متنِ
        // لازم دارد: خودش، `error.tsx` و `global-error.tsx`. جهش روی متنِ خودِ
        // فایل نشان می‌دهد نگهبان واقعاً *همین* فایل را می‌خواند.
        label: 'متنِ صفحه‌ی ۵۰۰ِ nginx از error.tsx واگرا شود',
        file: 'next-frontend/public/error-500.html',
        find: '<span class="badge">خطای ۵۰۰</span>',
        replace: '<span class="badge">خطای سرور</span>',
        failedTest: 'همان کارتِ خطای مسیرِ Next را دارد',
      },
      {
        // خودکفایی: صفحه‌ای که دقیقاً هنگامِ خرابیِ سرور نشان داده می‌شود
        // نباید به چیزی وابسته شود که همان لحظه نمی‌آید.
        label: 'صفحه‌ی ۵۰۰ِ nginx به یک CSS بیرونی وصل شود',
        file: 'next-frontend/public/error-500.html',
        find: '<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">',
        replace:
          '<link rel="stylesheet" href="/assets/style-mutation.css">\n<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">',
        failedTest: 'خودکفاست',
      },
      {
        // مستند ↔ فایل: اگر خطِ `error_page` از HTTPS-GUIDE پاک/عوض شود،
        // این فایل بی‌مصرف می‌ماند و کسی نمی‌فهمد. نگهبان باید همان خط را
        // از خودِ مستند بخواند، نه از حافظه.
        label: 'خطِ error_pageِ nginx به فایلِ دیگری اشاره کند',
        file: 'HTTPS-GUIDE.md',
        find: 'error_page 500 502 503 504 /error-500.html;',
        replace: 'error_page 500 502 503 504 /oops.html;',
        failedTest: 'nginx واقعاً به همین فایل وصل است',
      },
      {
        // ---------- بودجهٔ صبرِ لبهٔ دامنه ----------
        // همان رگرسیونی که این سنجش‌ها برای گرفتنش نوشته شده‌اند: مهلتِ اتصال
        // به پیش‌فرضِ ۶۰ ثانیه‌ای nginx برگردد. با آن عدد، وقتی Next زیرِ بار
        // جواب نمی‌دهد مشتری یک دقیقه به صفحهٔ سفید نگاه می‌کند و بعد کارتِ خطا
        // را می‌بیند — دقیقاً چیزی که این پیکربندی می‌بندد.
        label: 'مهلتِ اتصال به پیش‌فرضِ ۶۰ ثانیه‌ای برگردد (مشتری یک دقیقه معطل می‌شود)',
        file: 'HTTPS-GUIDE.md',
        find: 'proxy_connect_timeout 2s;',
        replace: 'proxy_connect_timeout 60s;',
        all: true,
        failedTest: 'بودجهٔ صبرِ صفحه‌ها کوتاه است',
      },
      {
        // این یکی بدترین حالتِ واقعی را می‌گیرد: درگاهِ Next باز است و
        // درخواست قبول می‌شود ولی پاسخی نمی‌آید؛ آن‌وقت این مهلت است که
        // تمام می‌شود، نه مهلتِ اتصال. با ۱۲۰ ثانیه، مشتری دو دقیقه معطل
        // می‌ماند و بعد کارتِ خطا را می‌بیند.
        label: 'مهلتِ خواندنِ صفحه‌ها به ۱۲۰ ثانیه برگردد (درگاهِ باز و بی‌پاسخ، مشتری را دو دقیقه نگه می‌دارد)',
        file: 'HTTPS-GUIDE.md',
        find: 'proxy_read_timeout 15s;',
        replace: 'proxy_read_timeout 120s;',
        failedTest: 'بودجهٔ صبرِ صفحه‌ها کوتاه است',
      },
      {
        label: 'تلاشِ دوباره روشن شود (انتظارِ مشتری دو برابر می‌شود)',
        file: 'HTTPS-GUIDE.md',
        find: 'proxy_next_upstream_tries 1;',
        replace: 'proxy_next_upstream_tries 3;',
        all: true,
        failedTest: 'بودجهٔ صبرِ صفحه‌ها کوتاه است',
      },
      {
        // بدونِ این دو پارامتر، nginx هر بار دوباره و کورکورانه اتصال می‌گیرد؛
        // یعنی در بازهٔ خرابی، هر درخواست یک انتظارِ تازه است.
        label: 'حافظهٔ خرابیِ upstream پاک شود (هر درخواست دوباره معطل می‌ماند)',
        file: 'HTTPS-GUIDE.md',
        find: 'server 127.0.0.1:3001 max_fails=2 fail_timeout=10s;',
        replace: 'server 127.0.0.1:3001;',
        failedTest: 'upstream حافظهٔ خرابی دارد',
      },
      {
        // ظرافتِ اصلی: ۴۰۴ِ *استایل‌دارِ* Next (`app/not-found.tsx`) نباید به
        // کارتِ ۵۰۰ تبدیل شود. یک خط `error_page` کافی است تا با سوئیچِ
        // `proxy_intercept_errors` همان صفحهٔ درستِ Next قربانی شود.
        label: 'در خطِ error_page، کدِ ۴۰۴ هم اضافه شود (صفحهٔ not-found قربانی شود)',
        file: 'HTTPS-GUIDE.md',
        append: '\n    error_page 404 /error-500.html;\n',
        failedTest: 'قربانیِ کارتِ ۵۰۰ نمی‌شود',
      },
      {
        label: 'زیرِ /api/ هم کارتِ HTML سرو شود (کلاینتِ fetch می‌شکند)',
        file: 'HTTPS-GUIDE.md',
        find: 'proxy_intercept_errors off;',
        replace: 'proxy_intercept_errors on;',
        failedTest: 'به JSON می‌رسد',
      },
      {
        // خودکفاییِ لبه: کارتِ خطا اگر از خودِ Next پروکسی شود، دقیقاً وقتی
        // نمی‌آید که لازم است — یعنی همان چیزی که خراب است صدایش می‌زنیم.
        label: 'کارتِ ۵۰۰ از خودِ Next پروکسی شود (وابستگیِ حلقه‌ای)',
        file: 'HTTPS-GUIDE.md',
        find: '    location = /error-500.html {\n        root /var/www/',
        replace: '    location = /error-500.html {\n        proxy_pass http://polasco_next;\n        root /var/www/',
        failedTest: 'از دیسک سرو می‌شود',
      },
    ],
  },
  {
    name: 'retiredPaths',
    scope: 'frontend',
    title: '۴۱۰ محصول و noindex صفحه‌ی حذف‌شده قفل‌اند',
    runner: { kind: 'vitest', test: 'src/app/retiredPaths.test.ts' },
    mutations: [
      {
        label: 'کدِ ۴۱۰ به ۲۰۰ برگردد',
        file: 'next-frontend/src/middleware.ts',
        find: 'status: 410,',
        replace: 'status: 200,',
        failedTest: 'middleware مسیرِ محصول',
      },
      {
        label: 'صفحه‌ی product-gone دوباره index شود',
        file: 'next-frontend/src/app/product-gone/page.tsx',
        find: 'index: false',
        replace: 'index: true',
        failedTest: 'noindex',
      },
    ],
  },
  {
    name: 'socialParity',
    scope: 'frontend',
    title: 'متادیتای اشتراک‌گذاری با Express یکی است',
    runner: { kind: 'vitest', test: 'src/lib/socialParity.test.ts' },
    mutations: [
      {
        label: 'ابعادِ تصویرِ og عوض شود',
        file: 'next-frontend/src/lib/site.ts',
        find: 'width: 512,',
        replace: 'width: 256,',
        failedTest: 'مقادیرِ ثابتِ تصویر',
      },
      {
        label: 'نوعِ og صفحه‌ی قوانین عوض شود',
        file: 'next-frontend/src/app/terms/page.tsx',
        find: 'type: "article",',
        replace: 'type: "website",',
        failedTest: '`og:type`',
      },
    ],
  },
  {
    name: 'legacyUrls',
    scope: 'frontend',
    title: 'نشانی‌های عصرِ Express به مقصدِ درست می‌روند',
    runner: { kind: 'vitest', test: 'src/lib/legacyUrls.test.ts' },
    mutations: [
      {
        label: 'محصولِ قدیمی به فهرست برگردد، نه صفحه‌ی خودش',
        file: 'next-frontend/src/lib/legacyUrls.ts',
        find: '? `/product/${id}` : "/products";',
        replace: '? "/products" : "/products";',
        failedTest: 'را به مسیرِ',
      },
      {
        label: 'نگهبانِ html مسیرهای عمیق‌تر را هم بگیرد',
        file: 'next-frontend/src/lib/legacyUrls.ts',
        find: 'return /^\\/[^/]+\\.html$/.test(pathname);',
        replace: 'return /^\\/.*\\.html$/.test(pathname);',
        failedTest: 'عمقِ بیشتر',
      },
    ],
  },
  {
    name: 'productGone',
    scope: 'frontend',
    title: 'مرزِ صفحه‌ی محصول و کدهای «نیست»',
    runner: { kind: 'vitest', test: 'src/lib/productGone.test.ts' },
    mutations: [
      {
        label: 'شناسه‌ی غیرِعددی از مرز بیفتد',
        file: 'next-frontend/src/lib/productGone.ts',
        find: 'const PRODUCT_PATH = /^\\/product\\/([^/]+)$/;',
        replace: 'const PRODUCT_PATH = /^\\/product\\/(\\d+)$/;',
        failedTest: 'عددی و غیرِعددی',
      },
      {
        label: 'کدِ ۴۰۰ دیگر «نیست» حساب نشود',
        file: 'next-frontend/src/lib/productGone.ts',
        find: 'return status !== 404 && status !== 400;',
        replace: 'return status !== 404;',
        failedTest: '۴۰۰',
      },
    ],
  },
  {
    name: 'welcome',
    scope: 'frontend',
    title: 'منطقِ کادرِ خوش‌آمد مثل Express',
    runner: { kind: 'vitest', test: 'src/lib/welcome.test.ts' },
    mutations: [
      {
        label: 'کادر در همه‌ی صفحه‌ها بیاید',
        file: 'next-frontend/src/lib/welcome.ts',
        find: 'return pathname === "/";',
        replace: 'return pathname !== "/";',
        failedTest: 'صفحه‌ی اصلی مجاز است',
      },
      {
        label: 'آستانه‌ی اسکرول عوض شود',
        file: 'next-frontend/src/lib/welcome.ts',
        find: 'export const WELCOME_SCROLL_FRACTION = 0.5;',
        replace: 'export const WELCOME_SCROLL_FRACTION = 0.75;',
        failedTest: 'درست سرِ نصف',
      },
    ],
  },
  {
    name: 'productQuery',
    scope: 'frontend',
    title: 'کلیدهای کوئریِ عصرِ Express ترجمه می‌شوند',
    runner: { kind: 'vitest', test: 'src/lib/productQuery.test.ts' },
    mutations: [
      {
        label: 'نگاشتِ cat خراب شود',
        file: 'next-frontend/src/lib/productQuery.ts',
        find: 'cat: "category",',
        replace: 'cat: "cat",',
        failedTest: 'معادلِ تازه',
      },
      {
        label: 'نگاشتِ inStock خراب شود',
        file: 'next-frontend/src/lib/productQuery.ts',
        find: 'inStock: "inStockOnly",',
        replace: 'inStock: "inStock",',
        failedTest: 'معادلِ تازه',
      },
    ],
  },
  {
    name: 'imagePath',
    scope: 'frontend',
    title: 'مسیرِ عکس فقط یک‌بار کد می‌شود',
    runner: { kind: 'vitest', test: 'src/lib/imagePath.test.ts' },
    mutations: [
      {
        label: 'یک مصرف‌کننده دوباره encodeURI بزند',
        file: 'next-frontend/src/app/sitemap.ts',
        append: '\nconst __mutationImage = encodeURI(product.image);\n',
        failedTest: 'encodeURI',
      },
      {
        label: 'JsonLd به‌جای publicImagePath از encodeURI استفاده کند',
        file: 'next-frontend/src/components/JsonLd.tsx',
        find: 'publicImagePath(product.image)',
        replace: 'encodeURI(product.image)',
        failedTest: 'publicImagePath',
      },
    ],
  },
  {
    name: 'productBulk',
    scope: 'frontend',
    title: 'عملیاتِ گروهیِ پنل و سرور یکی‌اند',
    runner: { kind: 'vitest', test: 'src/lib/productBulk.test.ts' },
    mutations: [
      {
        label: 'نامِ یک عملیات عوض شود (سرور دیگر نمی‌شناسدش)',
        file: 'next-frontend/src/lib/productBulk.ts',
        find: '{ op: "set_stock", label: "موجودی ثابت", value: "number", hint: "تعداد" },',
        replace: '{ op: "set_stock_mutation", label: "موجودی ثابت", value: "number", hint: "تعداد" },',
        failedTest: 'هر عملیاتی که پنل نشان می‌دهد',
      },
      {
        label: 'دو عملیات برچسبِ یکسان بگیرند',
        file: 'next-frontend/src/lib/productBulk.ts',
        find: '{ op: "add_stock", label: "افزودن به موجودی", value: "number", hint: "چند تا اضافه شود" },',
        replace: '{ op: "add_stock", label: "موجودی ثابت", value: "number", hint: "چند تا اضافه شود" },',
        failedTest: 'یکتا',
      },
    ],
  },
  {
    name: 'adminApi',
    scope: 'frontend',
    title: 'کلاینتِ API پنل: فیلترهای CSV و نشستِ بسته‌شده',
    runner: { kind: 'vitest', test: 'src/lib/adminApi.test.ts' },
    mutations: [
      {
        label: 'خروجیِ CSV فیلترها را دور بریزد',
        file: 'next-frontend/src/lib/adminApi.ts',
        find: 'return `/api/admin/export/orders.csv?${sp.toString()}`;',
        replace: 'return `/api/admin/export/orders.csv?status=${params.status || "all"}`;',
        failedTest: 'سفارش‌ها همان فیلترهای صفحه',
      },
      {
        label: 'دلیلِ نشستِ بسته‌شده عوض شود',
        file: 'next-frontend/src/lib/adminApi.ts',
        find: 'export const IDLE_REASON = "idle";',
        replace: 'export const IDLE_REASON = "idle_mutation";',
        failedTest: 'reason=idle',
      },
    ],
  },
  {
    name: 'productForm',
    scope: 'frontend',
    title: 'اعتبارسنجیِ فرم همان پیام‌های سرور را می‌دهد',
    runner: { kind: 'vitest', test: 'src/lib/productForm.test.ts' },
    mutations: [
      {
        label: 'سقفِ تخفیفِ عمده از ۹۰ به ۹۵ برود',
        file: 'next-frontend/src/lib/productForm.ts',
        find: 'discount > 90',
        replace: 'discount > 95',
        failedTest: 'بیش از ۹۰',
      },
      {
        label: 'پیامِ خطای عنوان کوتاه شود',
        file: 'next-frontend/src/lib/productForm.ts',
        find: '"عنوان لازم است (حداکثر ۱۲۰ حرف)"',
        replace: '"عنوان لازم است"',
        failedTest: 'عنوانِ خالی',
      },
    ],
  },
  {
    name: 'apiContract',
    scope: 'frontend',
    title: 'قراردادِ API بین دو فرانت: پوششِ پاسخ‌های آدرس و ادغامِ هدرها',
    // چرا این نگهبان لنگر می‌خواهد: خاستگاهش دو شکایتِ واقعیِ مشتری است — «آدرس
    // ست شده ولی صفحه می‌گوید انتخاب نشده» — و ریشه‌اش قراردادی بود، نه منطقی:
    // بک‌اند `{addresses:[…]}` می‌دهد و کلاینت همان شیءِ پوشش را با تایپِ
    // `Address[]` برمی‌گرداند. یک خرابیِ واقعی دقیقاً همین است: پوشش دوباره
    // بسته نشود و در `/checkout` روی `.map` بترکد.
    runner: { kind: 'vitest', test: 'src/lib/apiContract.test.ts' },
    mutations: [
      {
        label: 'getAddresses پوششِ {addresses} را باز نکند',
        file: 'next-frontend/src/lib/api.ts',
        find: 'return data.addresses ?? [];',
        replace: 'return data as unknown as Address[];',
        failedTest: 'getAddresses',
      },
    ],
  },
  {
    name: 'structuredData',
    scope: 'frontend',
    title: 'داده‌ی ساختاریافته‌ی Next با اوراکلِ منجمد یکی است (کم و زیاد)',
    // چرا لنگر می‌خواهد: این نگهبان جایش را از `backend/test-seo.js` گرفته و
    // خودش یک واگراییِ واقعی پیدا کرده بود (`/products` فقط CollectionPage را
    // می‌فرستاد و BreadcrumbList جا مانده بود). یک قلمِ JSON-LD می‌تواند بی‌صدا
    // از یک صفحه بیفتد و هیچ سنجشِ زنده‌ای آن را نمی‌بیند — چون برابریِ زنده
    // فقط متادیتا را مقایسه می‌کند، نه JSON-LD.
    runner: { kind: 'vitest', test: 'src/app/structuredData.test.ts' },
    mutations: [
      {
        // چرا کلِ خط حذف می‌شود و نه فقط نامش عوض: جهشِ اول نامِ برچسب را
        // عوض می‌کرد و آزمون سبز ماند — چون `toContain("<ProductJsonLd")` زیررشته‌ی
        // نامِ تازه را هم می‌گرفت. یک جهشِ بی‌خاصیت، خودش یک نگهبانِ قلابی است.
        label: 'قلمِ ProductJsonLd از مسیرِ محصول برداشته شود',
        file: 'next-frontend/src/app/product/[id]/page.tsx',
        find: '      <ProductJsonLd product={product} />\n',
        replace: '',
        failedTest: 'دو قلم',
      },
    ],
  },

  {
    name: 'contrastTokens',
    scope: 'frontend',
    title: 'پالتِ تم کفِ کنتراستِ WCAG AA را رد نمی‌کند (وارثِ contrast-audit.js)',
    // چرا این جهش‌ها مستقیم روی `globals.css` می‌نشینند و نه روی خودِ آزمون:
    // این نگهبان *توکن‌ها* را می‌سنجد، پس خرابیِ واقعی عوض‌کردنِ یک رنگ است —
    // همان کاری که یک بازطراحی می‌کند. دو جهشِ اول رنگ را به محدوده‌ی زیرِ
    // ۴٫۵ می‌برند (یکی متنِ کم‌رنگ، یکی ترکیبِ آلفایی) و دو جهشِ بعد دو حفرهٔ
    // تازهٔ همین نگهبان را قفل می‌کنند: پالتِ کوتاهِ :root که از @theme جدا
    // بیفتد، و یک `var(--…)` وجود‌نداشته که یک‌بار واقعاً پیش آمده بود.
    runner: { kind: 'vitest', test: 'src/app/contrastTokens.test.ts' },
    mutations: [
      {
        label: 'متنِ کم‌رنگ تیره شود (زیرِ کفِ ۴٫۵)',
        file: 'next-frontend/src/app/globals.css',
        find: '--color-ink-dim: #82968C;',
        replace: '--color-ink-dim: #6B7B73;',
        failedTest: 'فرعی',
      },
      {
        label: 'آلفای tintِ صورتی به ۰٫۱۴ برگردد (بَج زیرِ ۴٫۵)',
        file: 'next-frontend/src/app/globals.css',
        find: '--color-pink-tint: rgba(240, 83, 143, 0.11);',
        replace: '--color-pink-tint: rgba(240, 83, 143, 0.14);',
        failedTest: 'خودش',
      },
      {
        label: 'نامِ کوتاهِ :root از پالتِ @theme جدا شود',
        file: 'next-frontend/src/app/globals.css',
        find: '    --pink: #f0538f;',
        replace: '    --pink: #d94a80;',
        failedTest: 'کوتاه',
      },
      {
        label: 'متغیرِ تعریف‌نشده خوانده شود (همان باگِ var(--shadow))',
        file: 'next-frontend/src/app/globals.css',
        // لنگر دو خطی است چون `background: var(--color-cream);` دو جا می‌آید
        // (body و شیارِ اسکرول‌بار) و لنگرِ یکتا باید یکتا بماند.
        find: '  body {\n    font-family: var(--font-sans);\n    background: var(--color-cream);',
        replace: '  body {\n    font-family: var(--font-sans);\n    background: var(--color-cream-404);',
        failedTest: 'سورس یا CSS',
      },
    ],
  },
  {
    name: 'staticPathsCoverage',
    scope: 'frontend',
    title: 'هر ارجاعِ سورس سنجیده می‌شود — حذفِ یک ردیفِ فهرست بی‌صدا نیست',
    // چرا این نگهبان لنگر لازم داشت: خودش برای بستنِ «کوچک‌شدنِ بی‌صدای پوشش»
    // نوشته شد، پس اگر خودش هم کار نکند همان حفره با یک لایه اطمینانِ قلابی
    // برمی‌گردد. سه جهش، سه قانونِ متفاوتش را می‌سنجند: حذفِ یک ردیفِ سنجیده
    // که سورس به آن ارجاع دارد، دلیلِ خالی، و ردیفی که نه ارجاع دارد و نه
    // قراردادِ مستند — یعنی سنجشی که نمی‌داند چرا آنجاست.
    runner: { kind: 'vitest', test: 'src/app/staticPathsCoverage.test.ts' },
    mutations: [
      {
        label: 'ردیفِ icons.svg از فهرستِ دستیِ مسیرها پاک شود',
        file: 'next-frontend/scripts/static-paths.mjs',
        find: '  ["/assets/icons.svg", "اسپرایتِ آیکون‌ها — `IconSprite` در زمانِ اجرا fetch می‌کند و نبودش بی‌صدا به نسخه‌ی درون‌خطی می‌افتد"],\n',
        replace: '',
        failedTest: 'ارجاع',
      },
      {
        label: 'دلیلِ یک ردیف خالی شود (نمی‌دانیم چرا آنجاست)',
        file: 'next-frontend/scripts/static-paths.mjs',
        find: '  ["/sw.js", "سرویس‌ورکرِ فروشگاه"],',
        replace: '  ["/sw.js", ""],',
        failedTest: 'دلیل',
      },
      {
        label: 'ردیفی اضافه شود که نه ارجاع دارد و نه قراردادِ مستند است',
        file: 'next-frontend/scripts/static-paths.mjs',
        find: '  ["/assets/favicon.svg", "آیکونِ layout (icon)"],\n',
        replace:
          '  ["/assets/favicon.svg", "آیکونِ layout (icon)"],\n  ["/assets/icon-maskable.svg", "دلیلِ ساختگی برای آزمونِ تخریبی"],\n',
        failedTest: 'قراردادِ مستند',
      },
    ],
  },
  // ----------------------------------------------------------
  // اسکریپتِ عددهای فرانت‌اند و نگهبانِ زنده
  // ----------------------------------------------------------
  {
    name: 'readme-counts-frontend',
    scope: 'frontend',
    title: 'عددهای فرانت‌اند README با نتیجه‌ی اجرا می‌خوانند',
    runner: { kind: 'readme-script' },
    mutations: [
      {
        label: 'عددِ کلِ فرانت‌اند در README یک کم شود',
        file: 'README.md',
        derived: 'شمارشِ فرانت‌اند',
        find: README_ANCHORS.frontend.find,
        replace: README_ANCHORS.frontend.replace,
        all: true,
        expect: /اشاره به عدد/,
      },
      {
        label: 'ادعای «N تایش» صفحه‌ی نتیجه‌ی سفارش غلط شود',
        file: 'README.md',
        derived: 'ادعای «N تایش»',
        find: README_ANCHORS.suiteNote.find,
        replace: README_ANCHORS.suiteNote.replace,
        expect: /تایش/,
      },
      {
        label: 'گزارشِ کهنه یکی از فایل‌های آزمون را جا بیندازد',
        staleReport: true,
        expect: /روی دیسک هستند/,
      },
    ],
  },
  {
    name: 'parity-storefront-live',
    scope: 'live',
    title: 'اجراکننده‌ی زنده‌ی برابری، دست‌کاریِ اوراکل و اعلامِ گم‌شده را می‌گیرد',
    // چرا هدفِ جهش‌ها عوض شد: تا پیش از بازنشستگی، دو طرفِ مقایسه دو سرورِ
    // زنده بودند و «یک جمله به `frontend/terms.html` اضافه کن» کافی بود. حالا
    // Express این صفحه‌ها را ۳۰۱ می‌دهد و نیمه‌ی Expressی از
    // `tests/fixtures/legacy-oracle/` می‌آید — یعنی خودِ آرشیو منبعِ حقیقت
    // شده. پس دو جهشِ معنادارِ امروز: (۱) دست‌کاریِ آرشیو باید گرفته شود،
    // وگرنه اوراکلِ خراب بی‌صدا سبز می‌ماند؛ (۲) اعلامِ بازنشستگی که از مانیفست
    // حذف شود باید «واگراییِ تازه» بسازد، وگرنه بازنشستگی بی‌اعلام می‌ماند.
    runner: { kind: 'parity' },
    mutations: [
      {
        label: 'اوراکلِ منجمد دست‌کاری شود (یک جمله به terms.html اضافه)',
        file: 'next-frontend/tests/fixtures/legacy-oracle/terms.html',
        append: '\n<p>این جمله فقط برای آزمونِ تخریبی است و در Next نیست.</p>\n',
        // چرا «sha با کارنامه»: پیامِ خودِ اجراکننده «اوراکلِ منجمد دستکاری
        // شده» است و آن «دستکاری» نیم‌فاصله دارد؛ لنگرِ نیم‌فاصله‌دار در هر
        // ویرایشی به‌راحتی می‌شکند (یک‌بار همین شد)، پس تکّهٔ بدونِ نیم‌فاصله
        // و یکتای همان پیام قفل می‌شود.
        expect: /sha با کارنامه/,
      },
      {
        label: 'اعلامِ بازنشستگیِ /cart.html از مانیفست حذف شود',
        file: 'next-frontend/src/lib/parityManifest.ts',
        find: '    express: { url: "/cart.html", status: 301 },\n    statusReason: { state: "accepted", reason: WHY.legacyRetired },\n',
        replace: '    express: { url: "/cart.html", status: 301 },\n',
        expect: /تازه: [1-9]/,
      },
    ],
  },
  {
    name: 'legacy-links-live',
    scope: 'live',
    title: 'نگهبانِ بازنشستگی، مقصدِ مرده و نامِ بی‌مقصد را می‌گیرد',
    // چرا دو جهشِ متفاوت: این نگهبان دو چیزِ جدای هم را قفل می‌کند و هر
    // جهش باید *همان* یکی را بگیرد. اولی «مقصد» را می‌شکند (نگاشت می‌گوید یک
    // جا، سرورِ زنده جای دیگر می‌رود) و دومی «پوشش» را (نامی که از نگاشت حذف
    // شود و روزِ حذفِ `frontend/` به لینکِ مرده تبدیل شود).
    runner: {
      kind: 'node',
      cwd: NEXT,
      args: [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        path.join(NEXT, 'scripts', 'legacy-links-live.mjs'),
        `--express=${EXPRESS_ORIGIN}`,
      ],
    },
    mutations: [
      {
        label: 'مقصدِ cart.html در نگاشت به مسیری برود که وجود ندارد',
        file: 'next-frontend/src/lib/legacyUrls.ts',
        find: '  "cart.html": "/cart",',
        replace: '  "cart.html": "/cart-taghiri-karde",',
        expect: /مقصدِ ریدایرکت/,
      },
      {
        label: 'نامِ cart.html از نگاشت حذف شود (بی‌مقصد بماند)',
        file: 'next-frontend/src/lib/legacyUrls.ts',
        find: '  "cart.html": "/cart",\n',
        replace: '',
        expect: /نه مقصدی/,
      },
    ],
  },
  {
    name: 'static-paths-live',
    scope: 'static',
    title: 'سنجشِ زنده‌ی دارایی‌های ثابت، ناپدیدشدنِ دارایی و ۴۰۴ِ آدرس را می‌گیرد',
    // چرا این نگهبان به هارنس وصل شد: `static-paths-live` دلیلِ خودش را بالای
    // سرش نوشته است — پنج rewrite‌ای که تا چندی پیش `/sw.js` و `/assets/*` و
    // مانیفست و صفحه‌ی آفلاین را از `frontend/`ِ Express سرو می‌کردند برداشته
    // شدند و از آن روز تنها چیزی که این مسیرها را زنده نگه می‌دارد `public/`
    // است. ولی خودِ این سنجش تنها نگهبانِ زنده‌ی پروژه بود که هیچ جهشی رویش
    // نبود: می‌شد یک دارایی را از `public/` برداشت — یا آدرسش را در
    // `@font-face` و مانیفست به فایلی بی‌وجود برد — و هیچ‌کس قرمز نمی‌شد.
    //
    // چرا هدفِ جهش‌ها خودِ دارایی‌هاست و نه متنِ اسکریپت: این سنجش *محصول* را
    // می‌سنجد، نه سورسِ خودش را. پس جهش هم باید همان‌جایی زده شود که یک آدمِ
    // بی‌احتیاط می‌زند: فایلی که از `public/` ناپدید شود، و دو آدرسی که از
    // سورس خوانده می‌شوند (وزیر در `globals.css` و آیکونِ مانیفست) و اگر یکی
    // ۴۰۴ شود مرورگر **بی‌صدا** به جایگزین برمی‌گردد — بدونِ هیچ خطای قرمزی.
    //
    // و دو جهشِ آخر عمداً ۴۰۴ نیستند: خودِ اسکریپت دو شبکه‌ی ایمنی برای
    // «پوششِ بی‌صدا کوچک نشود» دارد (مانیفست خوانده نشود، یا صفر فونت پیدا
    // شود → کدِ خروج ۲). اگر آن دو هم قفل نباشند، روزی که مانیفست جابه‌جا شود
    // فهرستِ پویا خالی می‌ماند و اسکریپت باز هم می‌نویسد «هر N مسیر ۲۰۰ داد».
    runner: {
      kind: 'node',
      cwd: NEXT,
      args: [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        path.join(NEXT, 'scripts', 'static-paths-live.mjs'),
        `--next=${NEXT_ORIGIN}`,
        `--backend=${EXPRESS_ORIGIN}`,
      ],
    },
    mutations: [
      {
        // چرا اینجا «→ ۴۰۴» قفل نشده و «→ <کدِ سه‌رقمی>» قفل شده: داراییِ
        // *ناپدیدشده* را همین حالا سنجیدیم و Nextِ نسخه‌ی این ماشین به‌جای
        // ۴۰۴ یک **۴۰۰** می‌دهد. سنجشِ نگهبان بر `status === 200` است، پس
        // هر کدِ غیرِ۲۰۰ گرفتنِ او را نشان می‌دهد — ولی سنجیدنِ «۴۰۴» فقط
        // نگهبان را به یک عددِ داخلیِ Next گره می‌زد که خودش چیزِ محافظت‌شده‌ای
        // نیست. آنچه باید قفل بماند این است که در فهرستِ شکست، **همین**
        // دارایی با یک کدِ مردود ظاهر شود.
        label: 'داراییِ اسپرایتِ آیکون‌ها از public ناپدید شود',
        file: 'next-frontend/public/assets/icons.svg',
        delete: true,
        expect: /\/assets\/icons\.svg → \d{3}/,
      },
      {
        label: 'آدرسِ آیکونِ مانیفست به فایلی برود که وجود ندارد',
        file: 'next-frontend/public/manifest.webmanifest',
        find: '{ "src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },',
        replace: '{ "src": "/assets/icon-512-404.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },',
        expect: /\/assets\/icon-512-404\.png → 404/,
      },
      {
        label: 'آدرسِ فونتِ وزیر در globals.css به فایلی برود که وجود ندارد',
        file: 'next-frontend/src/app/globals.css',
        find: "url('/assets/fonts/Vazir-Bold-FD-WOL.woff2')",
        replace: "url('/assets/fonts/Vazir-Bold-FD-WOL-404.woff2')",
        expect: /Vazir-Bold-FD-WOL-404\.woff2 → 404/,
      },
      {
        label: 'مانیفستِ PWA ناپدید شود (فهرستِ آیکون‌ها از خودش خوانده می‌شود)',
        file: 'next-frontend/public/manifest.webmanifest',
        delete: true,
        expect: /PWA خوانده نشد/,
      },
      {
        label: 'همه‌ی url(...woff2) در globals.css از بین برود (پوشش بی‌صدا کوچک شود)',
        file: 'next-frontend/src/app/globals.css',
        find: "url('/assets/fonts/",
        replace: "آدرس('/assets/fonts/",
        all: true,
        expect: /globals\.css خوانده نشدند/,
      },
      {
        // همان نقطه‌کورِ بالا، ولی برای آیکون‌ها — و این یکی یک تفاوت مهم
        // دارد: تا پیش از این کسی *نمی‌دانست* هست. با جهش ثابت شد که مانیفست
        // می‌توانست `"icons": []` شود و سنجش هنوز سبز بماند («هر ۱۴ مسیر ۲۰۰
        // داد»). حالا تهی‌بودنِ فهرستِ اصلی پیش‌شرط را می‌شکند و رمزِ خروج ۲
        // می‌دهد؛ این جهش همان قفل است.
        label: 'فهرستِ اصلیِ آیکون‌های مانیفست تهی شود (پوشش بی‌صدا کوچک شود)',
        file: 'next-frontend/public/manifest.webmanifest',
        find: '"icons": [\n',
        replace: '"icons_unused": [\n',
        expect: /PWA هیچ آیکونی در/,
      },
      {
        // چرا این یکی جدا از آیکونِ فهرستِ اصلی است: خواهرِ ایستای همین سنجش
        // (`internalLinks.test.ts`) آیکون‌های میان‌بُرها را هم می‌خواند، ولی
        // سنجشِ زنده تا امروز فقط فهرستِ اصلی را می‌سنجید. با جهش اثبات شد:
        // آدرسِ آیکونِ میان‌بُر را به فایلی بی‌وجود بردیم و سبز ماند.
        label: 'آدرسِ آیکونِ یک میان‌بُر به فایلی برود که وجود ندارد',
        file: 'next-frontend/public/manifest.webmanifest',
        find: '{ "src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png" }',
        replace: '{ "src": "/assets/icon-192-404.png", "sizes": "192x192", "type": "image/png" }',
        all: true,
        expect: /\/assets\/icon-192-404\.png → 404/,
      },
    ],
  },
];

// ============================================================
// ۲) نگهبان → فایلِ خودِ نگهبان (تنها منبعِ لنگرِ پوشش)
// ============================================================
// چرا مشتق و نه دستی: `tests/guard-anchors.js` می‌پرسد «هر فایلِ آزمون/نگهبان
// لنگر دارد؟» و جوابش باید از همین رجیستری بیاید، نه از یک فهرستِ دومِ دستی که
// با این یکی واگرا می‌شود. مسیرِ فایل از `runner` خوانده می‌شود: برای Vitest از
// `test`، برای اسکریپت‌های آمادهٔ Next از ثابتِ همان نوع، و برای `node` از تنها
// آرگومانی که پسوندِ `.js`/`.mjs` دارد (بقیهٔ آرگومان‌ها پرچم‌اند: `--scope`،
// `--next=…`، `--disable-warning=…`).
function guardFileOf(g) {
  const r = g.runner;
  if (r.kind === 'vitest') return `next-frontend/${r.test}`;
  if (r.kind === 'readme-script') return 'next-frontend/scripts/check-readme-counts.mjs';
  if (r.kind === 'parity') return 'next-frontend/scripts/parity-storefront.mjs';
  if (r.kind === 'node') {
    const script = (r.args || []).find((a) => /\.m?js$/.test(a));
    if (!script) throw new Error(`${g.name}: هیچ فایلِ اسکریپتی در args نیست`);
    return path.relative(ROOT, path.resolve(r.cwd || ROOT, script)).split(path.sep).join('/');
  }
  throw new Error(`${g.name}: نوعِ اجراکننده‌ی ناشناخته — ${r.kind}`);
}

// ============================================================
// ۲) موتور: پشتیبان در حافظه، جهش، اجرا، بازگردانی، تأیید
// ============================================================
let pass = 0;
let failed = 0;

/** abs → Buffer|null (خالی یعنی فایل وجود نداشت) */
const active = new Map();

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const tail = (r, n = 2200) => {
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return out.length > n ? `…${out.slice(-n)}` : out;
};

function restoreAll() {
  const problems = [];
  for (const [abs, original] of [...active]) {
    try {
      if (original === null) fs.rmSync(abs, { force: true });
      else fs.writeFileSync(abs, original);
      const now = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
      const same = original === null ? now === null : now !== null && sha(now) === sha(original);
      if (!same) problems.push(abs);
    } catch (e) {
      problems.push(`${abs} (${e.message})`);
    }
    active.delete(abs);
  }
  return problems;
}

let bailing = false;
function bail(reason) {
  if (bailing) return;
  bailing = true;
  const problems = restoreAll();
  if (problems.length) console.error(`\n❌ بازگردانیِ اضطراری ناتمام: ${problems.join('، ')}`);
  else console.error('\n⚠️  اجرا وسطِ راه قطع شد؛ همه‌ی فایل‌های جهش‌دیده بایت‌به‌بایت برگردانده شدند.');
  process.exit(reason === 'SIGINT' ? 130 : 143);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => bail(sig));
process.on('exit', () => {
  if (active.size) {
    const problems = restoreAll();
    if (problems.length) console.error(`❌ فایل‌های بازگردانی‌نشده: ${problems.join('، ')}`);
  }
});

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  return hay.split(needle).length - 1;
}

function applyMutation(m) {
  const abs = path.join(ROOT, m.file);
  if (!active.has(abs)) active.set(abs, fs.existsSync(abs) ? fs.readFileSync(abs) : null);
  if (m.create !== undefined) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, m.create);
    return;
  }
  // «ناپدیدشدنِ دارایی» یک جهشِ واقعی است، نه یک متنِ عوض‌شده: حذف می‌کنیم و
  // بایت‌های اصلی در همان `active` مانده‌اند، پس بازگردانی مثل بقیه است.
  if (m.delete) {
    fs.rmSync(abs, { force: true });
    return;
  }
  if (m.append !== undefined) {
    fs.appendFileSync(abs, m.append);
    return;
  }
  const src = fs.readFileSync(abs, 'utf8');
  const hits = countOccurrences(src, m.find);
  if (hits === 0 || (!m.all && hits !== 1)) {
    throw new Error(`لنگرِ «${m.label}» یکتا نیست: ${hits} تطبیق برای «${m.find}» در ${m.file}`);
  }
  fs.writeFileSync(abs, src.split(m.find).join(m.replace));
}

function restoreOne(abs) {
  const original = active.get(abs);
  if (original === undefined) return true;
  if (original === null) fs.rmSync(abs, { force: true });
  else fs.writeFileSync(abs, original);
  active.delete(abs);
  const now = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  return original === null ? now === null : now !== null && sha(now) === sha(original);
}

const spawnNode = (args, cwd) =>
  spawnSync(process.execPath, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const vitestBin = () => path.join(NEXT, 'node_modules', 'vitest', 'vitest.mjs');
const vitestReportPath = (guardName) => path.join(os.tmpdir(), `guard-mutations-${guardName}.json`);

let cachedReadmeReport = null;
function ensureReadmeReport() {
  if (cachedReadmeReport) return cachedReadmeReport;
  const out = path.join(os.tmpdir(), 'guard-mutations-readme-report.json');
  try { fs.rmSync(out, { force: true }); } catch { /* بود و نبودش مهم نیست */ }
  const r = spawnNode([vitestBin(), 'run', '--reporter=json', `--outputFile=${out}`], NEXT);
  if (r.status !== 0) {
    throw new Error(`گزارشِ تازه‌ی vitest ساخته نشد (کد ${r.status}):\n${tail(r)}`);
  }
  cachedReadmeReport = out;
  return out;
}

/** اجرای نگهبان. برای Vitest، گزارشِ JSON هم برگردانده می‌شود. */
function runGuard(g, m) {
  const runner = g.runner;
  if (runner.kind === 'node') {
    return spawnNode(runner.args, runner.cwd || ROOT);
  }
  if (runner.kind === 'vitest') {
    const report = vitestReportPath(g.name);
    try { fs.rmSync(report, { force: true }); } catch { /* بی‌خطر */ }
    const r = spawnNode(
      [vitestBin(), 'run', runner.test, '--reporter=json', `--outputFile=${report}`],
      NEXT,
    );
    return { ...r, report, vitest: true };
  }
  if (runner.kind === 'readme-script') {
    if (m && m.staleReport) {
      const fresh = ensureReadmeReport();
      const stale = path.join(os.tmpdir(), 'guard-mutations-readme-stale.json');
      const parsed = JSON.parse(fs.readFileSync(fresh, 'utf8'));
      const results = parsed.testResults || [];
      // یک فایلِ آزمون از گزارش حذف می‌شود تا «گزارش ≠ دیسک» خودش را لو بدهد.
      if (results.length < 2) throw new Error('گزارشِ vitest کمتر از دو فایلِ آزمون دارد');
      parsed.testResults = results.slice(1);
      fs.writeFileSync(stale, JSON.stringify(parsed));
      return spawnNode([path.join(NEXT, 'scripts', 'check-readme-counts.mjs'), stale], NEXT);
    }
    const report = ensureReadmeReport();
    return spawnNode([path.join(NEXT, 'scripts', 'check-readme-counts.mjs'), report], NEXT);
  }
  if (runner.kind === 'parity') {
    return spawnNode(
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', path.join(NEXT, 'scripts', 'parity-storefront.mjs')],
      NEXT,
    );
  }
  throw new Error(`نوعِ اجراکننده‌ی ناشناخته: ${runner.kind}`);
}

/** نامِ آزمون‌های شکست‌خورده از گزارشِ Vitest؛ `null` یعنی گزارش خوانده نشد. */
function failedTestNames(reportPath) {
  try {
    const j = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    return (j.testResults || []).flatMap((t) =>
      (t.assertionResults || [])
        .filter((a) => a.status === 'failed')
        .map((a) => a.title || ''),
    );
  } catch {
    return null;
  }
}

function outOf(r) {
  return `${r.stdout || ''}${r.stderr || ''}`;
}

function checkMutation(g, m) {
  // جهش‌هایی مثل «گزارشِ کهنه» فایلی از مخزن را عوض نمی‌کنند؛ چیزی برای
  // بازیابی هم ندارند و نباید از موتورِ نسخه‌گیری رد شوند.
  const abs = m.staleReport ? null : path.join(ROOT, m.file || '');
  if (!m.staleReport) applyMutation(m);
  const r = runGuard(g, m);
  const restored = abs ? restoreOne(abs) : true;
  const label = `  ${m.file ? `${m.file} :: ` : ''}${m.label}`;
  if (!restored) {
    failed++;
    console.error(`  ✘ ${label}\n      فایلِ جهش‌دیده بایت‌به‌بایت برنگشت — اجرا متوقف شد.`);
    process.exit(92);
  }

  if (r.vitest) {
    const names = failedTestNames(r.report);
    const hit = names && names.some((t) => t.includes(m.failedTest));
    if (r.status !== 0 && hit) {
      pass++;
      console.log(`  ✔ ${label} — نگهبان گرفت (${m.failedTest})`);
      return true;
    }
    failed++;
    console.error(
      `  ✘ ${label}\n      انتظار: شکستِ «${m.failedTest}»؛ شد: کد ${r.status}` +
      (names ? `، آزمون‌های شکست‌خورده: ${names.join(' | ') || 'هیچ'}` : '، گزارش خوانده نشد') +
      `\n      ${tail(r)}\n`,
    );
    return false;
  }

  const expect = m.expect || g.failure || /\[FAIL\]/;
  if (r.status !== 0 && expect.test(outOf(r))) {
    pass++;
    console.log(`  ✔ ${label} — نگهبان گرفت (کد ${r.status})`);
    return true;
  }
  failed++;
  console.error(
    `  ✘ ${label}\n      انتظار: کدِ ناموفق و دلیلِ «${expect}»؛ شد: کد ${r.status}` +
    `\n      ${tail(r)}\n`,
  );
  return false;
}

function checkClean(g) {
  const r = runGuard(g);
  if (r.status === 0) {
    pass++;
    console.log(`  ✔ ${g.name} — روی کدِ دست‌نخورده سبز است`);
    return true;
  }
  failed++;
  console.error(`  ✘ ${g.name} — حتی روی کدِ دست‌نخورده قرمز است (کد ${r.status}):\n      ${tail(r)}\n`);
  return false;
}

// ---------- پیش‌بینی: رجیستری باید سالم باشد، وگرنه هر نتیجه‌ای بی‌معنی است ----------
function preflight(guards) {
  const problems = [];
  for (const g of guards) {
    if (g.runner.kind === 'vitest') {
      const t = path.join(NEXT, g.runner.test);
      if (!fs.existsSync(t)) problems.push(`${g.name}: فایلِ آزمون نیست — ${g.runner.test}`);
    } else {
      // نگهبان‌های غیرِ Vitest هم فایلِ خودشان را دارند و تا امروز هیچ‌کس
      // نبودنش را نمی‌سنجید: یک مسیرِ عوض‌شده فقط یک اسپاونِ ناموفق می‌داد و
      // پیامش شبیه «خودِ نگهبان قرمز است» می‌شد، نه «رجیستری غلط است».
      try {
        const own = guardFileOf(g);
        if (!fs.existsSync(path.join(ROOT, own))) problems.push(`${g.name}: فایلِ نگهبان نیست — ${own}`);
      } catch (e) {
        problems.push(`${g.name}: ${e.message}`);
      }
    }
    if (!g.mutations.length) problems.push(`${g.name}: هیچ جهشی ندارد`);
    for (const m of g.mutations) {
      if (g.runner.kind === 'vitest' && !m.failedTest) {
        problems.push(`${g.name} :: ${m.label}: «failedTest» ندارد`);
      }
      if (g.runner.kind !== 'vitest' && !(m.expect || g.failure)) {
        problems.push(`${g.name} :: ${m.label}: «expect» ندارد`);
      }
      if (m.staleReport) continue;
      if (!m.file) {
        problems.push(`${g.name} :: ${m.label}: «file» ندارد`);
        continue;
      }
      const abs = path.join(ROOT, m.file);
      if (m.create !== undefined) continue;
      if (!fs.existsSync(abs)) {
        problems.push(`${g.name} :: ${m.label}: فایل نیست — ${m.file}`);
        continue;
      }
      if (m.append !== undefined) continue;
      if (m.delete) continue;
      const src = fs.readFileSync(abs, 'utf8');
      const hits = countOccurrences(src, m.find);
      if (hits === 0) problems.push(`${g.name} :: ${m.label}: لنگر پیدا نشد — «${m.find}»`);
      if (!m.all && hits > 1) problems.push(`${g.name} :: ${m.label}: لنگر ${hits} بار آمده (باید یکتا باشد)`);
    }
  }
  return problems;
}

// ============================================================
// ۳) اجرا
// ============================================================
async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function preflightLive() {
  const [express, next] = await Promise.all([
    reachable(`${EXPRESS_ORIGIN}/api/health`),
    reachable(`${NEXT_ORIGIN}/`),
  ]);
  if (express && next) return true;
  console.error(
    '\n❌ دامنه‌ی live هر دو سرور را می‌خواهد:\n' +
    `   Express (${EXPRESS_ORIGIN}/api/health): ${express ? 'بالا' : 'پاسخ نداد'}\n` +
    `   Next (${NEXT_ORIGIN}/): ${next ? 'بالا' : 'پاسخ نداد'}\n` +
    '   اول هر دو را بالا بیاور، بعد دوباره اجرا کن.',
  );
  return false;
}

/**
 * پیش‌شرطِ دامنه‌ی `static` — عمداً برعکسِ `live`.
 *
 * خودِ نگهبان رد می‌کند اگر بک‌اند بالا باشد، چون آن‌وقت مسیرها می‌توانند از
 * پروکسی (`/api/*` و `/picture/*`) سیر شوند و سنجش همان چیزی را که ادعا می‌کند
 * نسنجد. اگر اینجا «هر چه شد سبز باش» می‌گرفتیم، نگهبان با کدِ ۲ رد می‌شد و
 * هارنس به‌جای گرفتنِ جهش، گارد را قرمز می‌دید؛ و اگر خلافش را می‌گفتیم و
 * `--allow-backend` می‌فرستادیم، شرطِ خودِ نگهبان را بی‌صدا خنثی کرده بودیم.
 */
async function preflightStatic() {
  const [express, next] = await Promise.all([
    reachable(`${EXPRESS_ORIGIN}/api/health`),
    reachable(`${NEXT_ORIGIN}/`),
  ]);
  if (next && !express) return true;
  console.error(
    '\n❌ دامنه‌ی static می‌خواهد Next بالا و بک‌اند خواب باشد:\n' +
    `   Next (${NEXT_ORIGIN}/): ${next ? 'بالا' : 'پاسخ نداد'}\n` +
    `   Express (${EXPRESS_ORIGIN}/api/health): ${express ? 'بالاست — باید خواب باشد' : 'خواب'}\n` +
    '   اگر بک‌اند بالا باشد، خودِ نگهبانِ static-paths-live با کدِ ۲ رد می‌کند\n' +
    '   (مسیرها می‌توانند از پروکسی سیر شوند). اول بک‌اند را بخوابان، بعد اجرا کن.',
  );
  return false;
}

async function main() {
  // خروجیِ ماشین‌خوان — پیش از هر دامنه‌بندی: پرسشِ «چه کسی در رجیستری است»
  // دامنه‌ای نیست. اگر نگاشتِ فایل نشکند، این‌جا با کد ۲ می‌مانیم و نه با
  // یک JSONِ ناقص که مصرف‌کننده‌اش را گمراه کند.
  if (REGISTRY) {
    let entries;
    try {
      entries = GUARDS.map((g) => ({
        name: g.name,
        scope: g.scope,
        title: g.title,
        runner: g.runner.kind,
        file: guardFileOf(g),
        mutations: g.mutations.length,
      }));
    } catch (e) {
      console.error(`✖ رجیستری خوانده نشد: ${e.message}`);
      process.exit(2);
    }
    console.log(JSON.stringify({ guards: entries }));
    return;
  }

  const selected = GUARDS.filter(
    (g) => ACTIVE_SCOPES.has(g.scope) && (!ONLY || g.name.includes(ONLY)),
  );

  if (LIST) {
    for (const g of selected) {
      console.log(`\n${g.name}  [${g.scope}]  ${g.title}`);
      for (const m of g.mutations) {
        console.log(`   • ${m.label}`);
        if (m.derived) console.log(`     ↳ لنگرِ زنده: «${m.find}» → «${m.replace}»`);
      }
    }
    console.log(`\n${selected.length} نگهبان، ${selected.reduce((a, g) => a + g.mutations.length, 0)} جهش`);
    return;
  }

  if (!selected.length) {
    console.error(`هیچ نگهبانی با دامنه‌ی «${SCOPE}»${ONLY ? ` و فیلترِ «${ONLY}»` : ''} پیدا نشد.`);
    process.exit(2);
  }

  const problems = preflight(selected);
  if (problems.length) {
    console.error('\n❌ رجیستریِ جهش‌ها سالم نیست — اول همین را درست کن:\n');
    for (const p of problems) console.error(`   • ${p}`);
    process.exit(2);
  }

  if (ACTIVE_SCOPES.has('live') && !(await preflightLive())) process.exit(2);
  if (ACTIVE_SCOPES.has('static') && !(await preflightStatic())) process.exit(2);

  console.log(`\n=== هارنسِ تخریبیِ نگهبان‌ها — دامنه: ${SCOPE} | ${selected.length} نگهبان ===`);
  const startedAt = Date.now();
  const summary = [];

  for (const g of selected) {
    console.log(`\n── ${g.name} — ${g.title}`);
    const cleanOk = checkClean(g);
    let caught = 0;
    for (const m of g.mutations) {
      if (checkMutation(g, m)) caught++;
    }
    summary.push({ name: g.name, cleanOk, caught, total: g.mutations.length });
  }

  console.log('\n=== خلاصه ===');
  for (const s of summary) {
    const mark = s.cleanOk && s.caught === s.total ? '✔' : '✘';
    console.log(`  ${mark} ${s.name.padEnd(26)} پاک ${s.cleanOk ? '✔' : '✘'} | جهش ${s.caught}/${s.total}`);
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n${failed === 0 ? 'SUCCESS' : 'FAILURE'}: ${pass} بررسی گذشت، ${failed} ناموفق — ${seconds} ثانیه`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  const problems = restoreAll();
  console.error(`\n❌ خطای غیرمنتظره: ${e.message}`);
  if (problems.length) console.error(`❌ فایل‌های بازگردانی‌نشده: ${problems.join('، ')}`);
  process.exit(1);
});
