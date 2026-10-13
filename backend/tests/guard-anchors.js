#!/usr/bin/env node
/* ============================================================
   نگهبانِ لنگرِ جهش — «هیچ آزمون/نگهبانی بی‌لنگر نماند»

   ---------- چرا این فایل وجود دارد ----------
   `tests/guard-mutations.js` برای هر نگهبان چند خرابیِ عمدی می‌سازد و انتظار
   دارد قرمز شود؛ ولی خودِ فهرستِ نگهبان‌هایش یک **فهرستِ دستی** بود. یعنی
   حفره‌اش دقیقاً همان چیزی بود که آن هارنس برای بستنش نوشته شد:

       نگهبانِ تازه‌ای به مخزن اضافه می‌شد، هیچ‌کس به رجیستری اضافه‌اش نمی‌کرد،
       و «همه‌ی جهش‌ها سبز» جوابِ سؤالی می‌داد که آن نگهبان را نداشت. هارنسِ
       سبز، نگهبانِ بی‌لنگر را پوشش نمی‌دهد — و هیچ‌کس نمی‌فهمید.

   این نگهبان همان قاعده را دوطرفه می‌کند:

     • هر فایلی که آزمون/نگهبان است باید **یا** در رجیستریِ هارنس لنگر داشته
       باشد (دست‌کم یک جهش)، **یا** در فهرستِ معافیت‌های همین فایل با یک دلیلِ
       مستند آمده باشد. فایلِ سوم وجود ندارد.
     • و برعکس: هر لنگر باید به فایلی اشاره کند که **هست** و **آزمون/نگهبان**
       است، و هر معافیت باید به فایلی اشاره کند که واقعاً وجود دارد — وگرنه
       معافیتِ بی‌اثر است. لنگرِ سرگردان و معافیتِ مرده هم قرمز می‌شوند.

   هیچ‌کدام «الگو در برابر همان الگو» نیست: رجیستری از **خودِ** هارنس خوانده
   می‌شود (`guard-mutations.js --registry`) و فهرستِ فایل‌ها از **دیسک**، و این
   دو با هم مقایسه می‌شوند. پس اگر کسی یک طرف را عوض کند، اینجا معلوم می‌شود.

   ---------- معافیت چه شکلی است ----------
   هر معافیت یک `kind` از مجموعه‌ی بسته‌ی زیر و یک `why` (دلیلِ مستند) دارد،
   و دقیقاً یکی از این دو شکل است:

     { file: '…', kind, why }                    ← تصمیمِ یک‌جا برای یک فایل
     { glob: '…', kind, count, why }             ← سیاستِ عام + شمارشِ صریح

   `count` در فرمِ گروهی عمداً اجباری است: یک الگو، هر فایلِ تازه‌ای را
   بی‌صدا می‌بلعد، ولی شمارشِ صریح نمی‌گذارد — افزودنِ یک فایل به آن گروه
   قرمز می‌شود تا کسی همان‌جا تصمیم بگیرد «این هم مثل بقیه است یا نه».

   ---------- انواعِ معافیت (بسته است؛ نوعِ تازه = ویرایشِ همین فایل) ----------
     unit        آزمونِ رفتاریِ واحد/کامپوننت — همان دسته‌ای که خودِ هارنس در
                 سرلوحه‌اش مستثنا کرده: رفتار را مستقیم اجرا می‌کند و شکستنش
                 بدیهی است. اگر به قراردادِ بین‌فایلی گره بخورد، این‌جا جا ندارد.
     integration مجموعه‌ی زنده‌ی سرتاسری (سرورِ سندباکسِ خودش یا دامنه‌ی سوّم).
                 `needs` اجباری است: گفته می‌شود لنگرِ نبوده *چه جهشی* است.
     tool        ابزارِ ساختِ فیکسچر/انجماد — خودش سنجش نیست.
     library     ماژولِ مشترک؛ اجراکننده نیست (و جهش‌هایش زیرِ نامِ نگهبانِ
                 مصرف‌کننده‌اش در رجیستری نشسته‌اند).
     gate        اجراکننده/دروازه‌ی چند‌نگهبانه؛ خطایش از کدِ خروجِ گام‌هاست.
     instrument  خودِ هارنسِ جهش — ابزارِ سنجش؛ جهش روی خودش دوری است.

   ---------- اجرا و کدِ خروج ----------
     node tests/guard-anchors.js           # سنجش (بدونِ سرور، بدونِ سرورِ زنده)
     node tests/guard-anchors.js --list    # فهرستِ کشف‌شده‌ها + وضعیتشان، بدونِ سنجش

   صفر = سبز. یک = یک بررسی رد شد. دو = پیش‌شرط آماده نبود (رجیستری خوانده نشد
   یا کشفِ فایل‌ها زیرِ کفِ اعلام‌شده افتاد — یعنی پوششِ بی‌صدا کوچک شده).
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;                      // backend/tests
const BACKEND = path.join(HERE, '..');       // backend
const ROOT = path.join(BACKEND, '..');       // ریشه‌ی مخزن
const NEXT = path.join(ROOT, 'next-frontend');
const HARNESS = path.join(HERE, 'guard-mutations.js');

const LIST = process.argv.includes('--list');

// ------------------------------------------------------------
// ۱) کشفِ فایل‌های آزمون/نگهبان — از دیسک، نه از فهرستِ دستی
// ------------------------------------------------------------
// مرزِ این کشف عمدی و مستند است: محتوای مخزن سنجیده می‌شود، نه هر فایلِ
// `.js` مخزن. بنچمارک‌ها (`backend/bench-*.js`)، ابزارهای `backend/tools/` و
// پیکربندی‌ها نگهبان نیستند و همین‌جا کنار گذاشته شده‌اند. اگر روزی یک
// نگهبان جایی بیرون از این چهار ریشه نشست، باید ریشه‌اش را همین‌جا اضافه کرد
// — که خودش یک تصمیمِ صریح است، نه فراموشی.
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

const flat = (dir, test) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && test(e.name))
        .map((e) => path.join(dir, e.name))
    : [];

const RULES = [
  {
    id: 'frontend-src-tests',
    what: 'آزمون‌های Vitest زیرِ next-frontend/src',
    floor: 25,
    files: () => walk(path.join(NEXT, 'src')).filter((f) => /\.test\.(?:ts|tsx|js|jsx)$/.test(f)),
  },
  {
    id: 'backend-tests',
    what: 'نگهبان‌ها و ابزارهای backend/tests',
    floor: 12,
    files: () => walk(path.join(BACKEND, 'tests')).filter((f) => f.endsWith('.js')),
  },
  {
    id: 'backend-root-suites',
    what: 'مجموعه‌های سرتاسریِ ریشه‌ی بک‌اند (backend/test*.js)',
    floor: 2,
    files: () => flat(BACKEND, (n) => /^test.*\.js$/.test(n)),
  },
  {
    id: 'next-scripts',
    what: 'اجراکننده‌های next-frontend/scripts',
    floor: 5,
    files: () => walk(path.join(NEXT, 'scripts')).filter((f) => /\.(?:mjs|js)$/.test(f)),
  },
  {
    id: 'root-gate',
    what: 'دروازه‌ی پیش از کامیتِ ریشه',
    floor: 1,
    files: () => [path.join(ROOT, 'verify-before-commit.mjs')].filter((f) => fs.existsSync(f)),
  },
];

/** repo-relative → شناسه‌ی قاعده. برخوردِ دو قاعده یک اشکالِ همین فایل است. */
const discovered = new Map();
const collision = [];

for (const rule of RULES) {
  const found = [...new Set(rule.files().map(rel))].sort();
  if (found.length < rule.floor) {
    console.error(
      `✖ کشفِ «${rule.what}» زیرِ کف است: ${found.length} فایل (کف: ${rule.floor}).\n` +
        '   یعنی یا ساختارِ مخزن عوض شده یا قاعده‌ی کشف دیگر کار نمی‌کند — در هر دو\n' +
        '   حالت سنجش را انجام نمی‌دهیم، وگرنه «سبزِ خالی» می‌دهد.',
    );
    process.exit(2);
  }
  for (const file of found) {
    if (discovered.has(file)) collision.push(`${file} (${discovered.get(file)} + ${rule.id})`);
    else discovered.set(file, rule.id);
  }
}
if (collision.length) {
  console.error(`✖ دو قاعده‌ی کشف یک فایل را ادعا کردند:\n   ${collision.join('\n   ')}`);
  process.exit(2);
}

// ------------------------------------------------------------
// ۲) رجیستریِ لنگرها — از خودِ هارنس، به‌صورتِ JSON
// ------------------------------------------------------------
function readRegistry() {
  const r = spawnSync(process.execPath, [HARNESS, '--registry'], {
    cwd: BACKEND,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(
      '✖ رجیستریِ هارنس خوانده نشد — `node tests/guard-mutations.js --registry` ' +
        `با کدِ ${r.status} رد شد:\n${(r.stdout || '') + (r.stderr || '')}`,
    );
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    console.error(`✖ خروجیِ --registry قابلِ‌خواندن نبود: ${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(parsed.guards) || !parsed.guards.length) {
    console.error('✖ خروجیِ --registry هیچ نگهبانی ندارد — رجیستری خالی، لنگرِ خالی.');
    process.exit(2);
  }
  return parsed.guards;
}

const anchors = readRegistry();

// ------------------------------------------------------------
// ۳) معافیت‌ها — تصمیم‌های مستند، نه سکوت
// ------------------------------------------------------------
// هر ردیفِ این فهرست یک پاسخ به همین پرسش است: «چرا *این* فایل در رجیستریِ
// جهش نیست؟» ردیفِ بی‌دلیل یا معافیتی که به فایلی اشاره کند که آزمون/نگهبان
// نیست، قرمز می‌شود. افزودنِ نگهبانِ تازه بخواهد این‌جا بنشیند، باید دست‌کم
// یک `kind` درست و یک `why` روشن بدهد.
const KINDS = {
  unit: 'آزمونِ رفتاریِ واحد/کامپوننت — شکستنش بدیهی است',
  integration: 'مجموعه‌ی زنده‌ی سرتاسری — `needs` می‌گوید لنگرِ نبوده چه جهشی است',
  tool: 'ابزارِ ساختِ فیکسچر/انجماد — خودش سنجش نیست',
  library: 'ماژولِ مشترک — اجراکننده نیست',
  gate: 'اجراکننده/دروازه‌ی چند‌نگهبانه — خطایش از کدِ خروجِ گام‌هاست',
  instrument: 'خودِ هارنسِ جهش — ابزارِ سنجش',
};
const NEEDS_KINDS = new Set(['integration']);

const EXEMPTIONS = [
  // ---------- فرانت‌اند ----------
  {
    glob: 'next-frontend/src/components/**/*.test.tsx',
    kind: 'unit',
    count: 11,
    why:
      'آزمونِ رفتارِ کامپوننت‌های Next (رندر، کلاس/نقش، کلیک، فیلتر) — همان دسته‌ای که ' +
      'خودِ هارنس مستثنا کرده: رفتار را مستقیم اجرا می‌کنند و شکستنشان بدیهی است. ' +
      'اگر یکی از این‌ها به یک قراردادِ بین‌فایلی گره بخورد (مثلِ copyParity/shellParity)، ' +
      'جایش دیگر این‌جا نیست و ردیفِ خودش را در رجیستری می‌خواهد؛ آن‌وقت این شمارش یک ' +
      'واحد پایین می‌آید و همین معافیت قرمز می‌شود.',
  },
  {
    file: 'next-frontend/src/lib/jalaliYear.test.ts',
    kind: 'unit',
    why:
      'ریاضیِ تاریخِ شمسی و متنِ پاورقی؛ هر کدِ ثابت یا تقویمِ اشتباه در همان لحظه قرمز ' +
      'می‌شود (آزمونِ «هرگز یک سالِ ثابت نیست» خودش همین را قفل می‌کند). لنگرِ جهشِ ' +
      'اضافه، همان ادعا را دو بار می‌سنجد و چیزی که امروز پنهان باشد ندارد.',
  },

  // ---------- بک‌اند ----------
  {
    file: 'backend/tests/guard-mutations.js',
    kind: 'instrument',
    why:
      'خودِ هارنس است، نه یکی از نگهبان‌ها: تنها ابزارِ اندازه‌گیریِ این پروژه. جهش روی ' +
      'آن یعنی خراب‌کردنِ همان چیزی که دارد اندازه می‌گیرد. اعتبارش جای دیگر سنجیده ' +
      'می‌شود: هر نگهبانِ رجیستری دست‌کم یک جهش دارد و همین فایل (`guard-anchors.js`) ' +
      'خودش با پنج جهش در همان رجیستری لنگر خورده است.',
  },
  {
    file: 'backend/tests/sandbox.js',
    kind: 'tool',
    why:
      'کمکِ مشترکِ تست‌ها: ساختنِ دیتابیسِ یک‌بارمصرف و پوشه‌ی عکسِ سندباکس. خودش هیچ ' +
      'سنجشی ندارد؛ اگر خراب شود، مجموعه‌های زنده (`security.js`/`discount.js`) با خطای ' +
      'مسیر می‌ترکند و همان لحظه دیده می‌شود.',
  },
  {
    file: 'backend/tests/makepng.js',
    kind: 'tool',
    why: 'ساختِ PNGِ معتبر با ابعادِ دلخواه برای آزمونِ آپلود — فیکسچر، نه سنجش.',
  },
  {
    file: 'backend/test-all.js',
    kind: 'gate',
    why:
      'ارکستراتورِ سه مجموعه‌ی سرتاسری: آن‌ها را پشتِ‌سرِهم اجرا می‌کند و سبزی‌اش معنیِ ' +
      '«همه سبز» است. خودش سنجشی ندارد؛ خطای هر گام از کدِ خروجِ همان مجموعه می‌آید و ' +
      'هر سه مجموعه در CI هم مستقل اجرا می‌شوند.',
  },
  {
    file: 'backend/tests/discount.js',
    kind: 'integration',
    needs:
      'جهش روی محاسبه‌ی قیمتِ قبلی/درصد (routes/products.js یا lib/db.js) و انتظارِ همان ' +
      'بررسی در خروجیِ زنده (مثلِ «قیمتِ قبلی») — آزمون روی HTTPِ واقعی است، پس لنگرش ' +
      'هم باید یک خرابیِ سرتاسری باشد.',
    why:
      'مجموعه‌ی زنده‌ی ۳۱ بررسی روی سرورِ سندباکسِ خودش (پورت ۳۹۹۷): قیمتِ قبلی، درصد، ' +
      'اعتبارسنجی و ویرایشِ گروهی. سنجش‌هایش رفتاری‌اند، ولی یک ادعای قراردادی هم دارد — ' +
      '«قیمتِ قبلی نباید بی‌صدا از پاسخِ API بیفتد» — که هنوز لنگرِ جهش ندارد.',
  },
  {
    file: 'backend/tests/security.js',
    kind: 'integration',
    needs:
      'جهش روی میان‌افزارِ هدر/CSRF/آپلود در server.js و انتظارِ همان بررسی در خروجی.',
    why:
      'مجموعه‌ی زنده‌ی امنیت (۴۵ بررسی): هدرها، CSRF، جعلِ IP، کش و آپلود روی سرورِ ' +
      'سندباکسِ خودش. هر سنجشش یک درخواستِ واقعی است، پس شکستنش خودش را نشان می‌دهد؛ ' +
      'ولی هیچ جهشی رویش نیست که ثابت کند *همین* بررسی‌ها می‌گیرند.',
  },
  {
    file: 'backend/tests/owasp-scan.js',
    kind: 'integration',
    needs:
      'یا جهش روی همان چیزی که هر بررسی می‌سنجد (هدر، سقفِ نرخ، آپلود)، یا یک جهشِ ' +
      '«اسکنرِ خالی» تا پوششِ بی‌صدا کوچک نشود.',
    why:
      'اسکنرِ ۴۷ بررسیِ OWASP روی سرورِ سندباکسِ خودش (پورت ۴۰۱۰). پوششِ خودش را از ' +
      'دستِ نمی‌دهد (فهرستِ بررسی‌ها صریح است)، ولی مثلِ بقیه‌ی مجموعه‌های زنده لنگرِ ' +
      'جهش ندارد.',
  },
  {
    file: 'backend/test-smoke.js',
    kind: 'integration',
    needs:
      'جهش روی یک مسیرِ کاربری (یا lib/db.js) و انتظارِ همان بخشِ شمرده‌شده در خروجیِ ' +
      'دود — نه فقط «کدِ خروجِ ناموفق».',
    why:
      'دودِ ۶۵۷ بررسی: کلِ مسیرِ کاربر (کدِ پیامکی، سبد، سفارش) روی سرورِ خودش (پورت ' +
      '۳۹۹۹). بزرگ‌ترین مجموعه‌ی پروژه است و در CI هم اجرا می‌شود؛ چیزی که ندارد لنگرِ ' +
      'جهش است.',
  },

  // ---------- اسکریپت‌های Next ----------
  {
    file: 'next-frontend/scripts/static-paths.mjs',
    kind: 'library',
    why:
      'فهرستِ مسیرهای ثابت + کشفِ آیکون/فونت — منبعِ حقیقتِ مشترکِ نگهبانِ ایستا ' +
      '(`staticPathsCoverage.test.ts`) و اسکریپتِ زنده؛ خودش اجراکننده نیست. جهش‌هایش در ' +
      'رجیستری هستند، زیرِ نامِ همان نگهبانِ ایستا (حذفِ ردیف، دلیلِ خالی، ردیفِ بی‌قرارداد).',
  },
  {
    file: 'next-frontend/scripts/freeze-legacy-oracle.mjs',
    kind: 'tool',
    why:
      'ابزارِ انجمادِ اوراکل: HTMLِ سروشده‌ی Express را یک‌بار برای همیشه روی دیسک می‌نویسد. ' +
      'قفل‌های خودش داخلِ همان فایل است (کفِ محتوا، ممنوعیتِ بازنویسیِ آرشیو) و ابزارِ ' +
      'یک‌بارمصرفِ مهاجرت است، نه نگهبانِ همیشه‌رو.',
  },
  {
    file: 'next-frontend/scripts/cutover-rehearsal.mjs',
    kind: 'integration',
    needs:
      'دامنه‌ی سوّمی لازم دارد (پروکسیِ واحد روی یک پورت) که دامنه‌های هارنس ندارند؛ ' +
      'لنگرش جهش روی خودِ مسیریابیِ پروکسی و انتظارِ همان مسیرِ شکسته است.',
    why:
      'تمرینِ دستیِ کاتاور: هر دو دنیا (Next و Express) پشتِ یک دامنه، با زنجیره‌ی کاملِ ' +
      'هر لینکِ شکسته. یک نگهبانِ واقعی است ولی به سه سرورِ هم‌زمان نیاز دارد و در CI ' +
      'اجرا نمی‌شود.',
  },

  // ---------- ریشه ----------
  {
    file: 'verify-before-commit.mjs',
    kind: 'gate',
    why:
      'دروازه‌ی پیش از کامیت: دو نگهبانِ عدد و جهش‌های نگهبان‌ها را یک‌جا اجرا می‌کند. ' +
      'سنجشِ خودش کدِ خروجِ گام‌هاست. اگر گامی از آن حذف شود همین‌جا گرفته نمی‌شود، ولی ' +
      'هر همان گام در CI مستقل اجرا می‌شود — این دروازه راحتیِ زمانِ کامیت است، نه تنها ' +
      'خطِ دفاع.',
  },
];

// ------------------------------------------------------------
// ۴) سنجش
// ------------------------------------------------------------
let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ''}`);
  } else {
    failures.push(name);
    console.log(`[FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

// الگوی گروهی → regex ( `**/` اختیاری، `*` یک بخش، `?` یک نویسه)
function globToRe(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = esc
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*');
  return new RegExp(`^${body}$`);
}

// ---------- ۴.۱) لنگرها ----------
const anchored = new Map(); // file → [name, …]
const anchorDupes = [];
for (const g of anchors) {
  if (typeof g.file !== 'string' || !g.file) {
    failures.push(`لنگرِ «${g.name}» فایل ندارد`);
    continue;
  }
  if (anchored.has(g.file)) anchorDupes.push(`${g.file} (${anchored.get(g.file).join('، ')} و ${g.name})`);
  anchored.set(g.file, [...(anchored.get(g.file) || []), g.name]);
}

const missingOnDisk = anchors.filter((g) => !fs.existsSync(path.join(ROOT, g.file)));
check(
  'هر لنگرِ رجیستری روی فایلی است که روی دیسک هست',
  missingOnDisk.length === 0,
  missingOnDisk.map((g) => `${g.file} ← ${g.name} (فایل روی دیسک نیست)`).join(' | ') || `${anchors.length} لنگر`,
);

const notAGuard = anchors.filter((g) => fs.existsSync(path.join(ROOT, g.file)) && !discovered.has(g.file));
check(
  'هر لنگر روی فایلی است که آزمون/نگهبان است',
  notAGuard.length === 0,
  notAGuard.map((g) => `${g.file} ← ${g.name}`).join(' | ') || '—',
);

const empty = anchors.filter((g) => !(g.mutations >= 1));
check(
  'هیچ لنگری بی‌جهش نیست (عضویتِ خالی، لنگر نیست)',
  empty.length === 0,
  empty.map((g) => `${g.file} ← ${g.name}`).join(' | ') || `${anchors.reduce((a, g) => a + g.mutations, 0)} جهش`,
);

check('هیچ فایلی دو لنگر ندارد', anchorDupes.length === 0, anchorDupes.join(' | ') || '—');

// ---------- ۴.۲) معافیت‌ها ----------
const exemptFiles = new Map(); // file → {kind, why, via}
const kindCount = {};
const badEntries = [];
const deadEntries = [];

for (const e of EXEMPTIONS) {
  const label = e.file || e.glob || '(بی‌نشانه)';
  const shape = [e.file, e.glob].filter(Boolean).length;
  if (shape !== 1) {
    badEntries.push(`${label}: باید دقیقاً یکی از file/glob باشد`);
    continue;
  }
  if (!KINDS[e.kind]) {
    badEntries.push(`${label}: نوعِ ناشناخته «${e.kind}» — یکی از ${Object.keys(KINDS).join('، ')}`);
    continue;
  }
  if (typeof e.why !== 'string' || !e.why.trim()) {
    badEntries.push(`${label}: دلیل ندارد (why خالی است)`);
    continue;
  }
  if (NEEDS_KINDS.has(e.kind) && (typeof e.needs !== 'string' || !e.needs.trim())) {
    badEntries.push(`${label}: نوعِ «${e.kind}» باید needs بدهد (لنگرِ نبوده چه جهشی است)`);
    continue;
  }

  if (e.file) {
    if (!discovered.has(e.file)) {
      deadEntries.push(`${e.file}: روی دیسک نیست یا آزمون/نگهبان نیست`);
      continue;
    }
    if (anchored.has(e.file)) {
      badEntries.push(`${e.file}: هم لنگر دارد (${anchored.get(e.file).join('، ')}) هم معافیت — معافیتِ اضافه را بردار`);
      continue;
    }
    exemptFiles.set(e.file, { kind: e.kind, via: 'file' });
    kindCount[e.kind] = (kindCount[e.kind] || 0) + 1;
    continue;
  }

  const re = globToRe(e.glob);
  const matched = [...discovered.keys()].filter((f) => re.test(f)).sort();
  if (!matched.length) {
    deadEntries.push(`${e.glob}: هیچ فایلی را نمی‌گیرد`);
    continue;
  }
  if (!Number.isInteger(e.count) || e.count < 1) {
    badEntries.push(`${e.glob}: فرمِ گروهی باید count مثبت بدهد`);
    continue;
  }
  if (matched.length !== e.count) {
    badEntries.push(
      `${e.glob}: تعدادِ تطبیق (${matched.length}) با count (${e.count}) یکی نیست — ` +
        `فایل‌ها: ${matched.join('، ')}`,
    );
    continue;
  }
  const anchoredInside = matched.filter((f) => anchored.has(f));
  if (anchoredInside.length) {
    badEntries.push(`${e.glob}: این فایل‌ها لنگر هم دارند — از گروه بیرون بیاور: ${anchoredInside.join('، ')}`);
    continue;
  }
  for (const f of matched) {
    if (exemptFiles.has(f)) {
      badEntries.push(`${f}: زیرِ دو معافیتِ گروهی است (${exemptFiles.get(f).via} و ${e.glob})`);
      continue;
    }
    exemptFiles.set(f, { kind: e.kind, via: e.glob });
  }
  kindCount[e.kind] = (kindCount[e.kind] || 0) + matched.length;
}

check('هر معافیت شکل، نوع و دلیلِ درست دارد', badEntries.length === 0, badEntries.join(' | ') || '—');
check('هیچ معافیتی بی‌اثر نیست (فایلی که نیست یا گروهی که چیزی نمی‌گیرد)', deadEntries.length === 0, deadEntries.join(' | ') || '—');

// ---------- ۴.۳) پوششِ دوطرفه ----------
const orphans = [...discovered.keys()].filter((f) => !anchored.has(f) && !exemptFiles.has(f)).sort();
check(
  'هر آزمون/نگهبان یا لنگرِ جهش دارد یا دلیلِ مستند',
  orphans.length === 0,
  orphans.join(' | ') || `${anchored.size} لنگر + ${exemptFiles.size} معافیت برای ${discovered.size} فایل`,
);

const orphansByName = orphans.map((f) => `${f} (${discovered.get(f)})`);
if (orphans.length && LIST) console.log(`\n  بی‌لنگر و بی‌دلیل:\n   ${orphansByName.join('\n   ')}`);
else if (orphans.length) {
  console.log('  ↳ درمان: نگهبان را در رجیستریِ `tests/guard-mutations.js` لنگر کن (با دست‌کم یک جهش)،');
  console.log('     یا در `EXEMPTIONS` همین فایل با یک `kind` و یک `why` مستندش کن:');
  for (const o of orphansByName) console.log(`       • ${o}`);
}

// ---------- ۴.۴) گزارش ----------
const byArea = {};
for (const [file, rule] of discovered) {
  byArea[rule] = (byArea[rule] || 0) + 1;
}
console.log('\n— کشف (دیسک ← قواعد):');
for (const rule of RULES) console.log(`   ${rule.id.padEnd(22)} ${String(byArea[rule.id] || 0).padStart(3)} فایل — ${rule.what}`);
console.log(`   ${'لنگرِ جهش'.padEnd(22)} ${String(anchored.size).padStart(3)} فایل — رجیستریِ هارنس`);
console.log(
  `   ${'معافیت'.padEnd(22)} ${String(exemptFiles.size).padStart(3)} فایل — ` +
    Object.entries(kindCount)
      .sort()
      .map(([k, n]) => `${k}=${n}`)
      .join('، '),
);

if (LIST) {
  console.log('\n— تک‌تکِ فایل‌ها:');
  for (const [file, rule] of [...discovered].sort()) {
    const why = anchored.has(file)
      ? `لنگر: ${anchored.get(file).join('، ')}`
      : `معافیت: ${exemptFiles.get(file)?.kind} (${exemptFiles.get(file)?.via})`;
    console.log(`   ${(anchored.has(file) ? '✔' : '·').padEnd(2)} ${file.padEnd(58)} ${rule.padEnd(20)} ${why}`);
  }
  console.log('');
  process.exit(0);
}

console.log(`\n${failures.length === 0 ? 'SUCCESS' : 'FAILURE'}: ${pass} بررسی گذشت، ${failures.length} ناموفق`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
