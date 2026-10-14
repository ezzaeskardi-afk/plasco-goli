#!/usr/bin/env node
/* ============================================================
   tests/legacy-map-single-source.js — «نگاشتِ نام‌های .html یک منبع دارد، نه دو تا»

   ---------- چرا این آزمون وجود دارد ----------
   `REVIEW.md` (ریسکِ ۷) دقیقاً همین را نوشته بود: منبعِ حقیقتِ نگاشتِ
   `/cart.html → /cart` در `next-frontend/src/lib/legacyUrls.ts` بود و یک
   **کپیِ دستی** در `backend/lib/legacy-redirects.js`. دو نگهبان می‌گذاشتند
   واگرا نشوند، ولی هر دو **زنده** بودند (`scripts/legacy-links-live.mjs`:
   دو سرورِ بالا). روی ماشینی که آن دو سرور روشن نیستند — مثلِ همین
   دروازهٔ آفلاین و مثلِ CI — دو فهرست می‌توانستند بی‌صدا از هم دور شوند.

   امروز یک فایلِ مشترک هست و Express آن را `require` می‌کند. یعنی واگرایی
   *ممکن نیست*. ولی «ممکن‌نبودن» هم خودش می‌تواند روزی برگردد: کسی فایلِ
   `.ts` را دوباره کنارش می‌سازد، یا جدول را در پوستهٔ Express کپی می‌کند، و
   هیچ آزمونی نمی‌فهمد. این فایل همان روز را قرمز می‌کند:

     ۱. همان شیء: خروجیِ Express و فایلِ مشترک باید **همان** تابع‌ها باشند
        (برابریِ مرجع، نه برابریِ محتوا). دو تابعِ «یکسان» دو جای خطاست.
     ۲. پوستهٔ Express نباید هیچ نامی از `.html` داشته باشد. یک رشته‌ی
        `'cart.html'` آن‌جا یعنی جدولِ دوم — حتی اگر امروز درست باشد.
     ۳. کلِ مخزن باید **دقیقاً یک** فایل داشته باشد که شکلی از «تعریفِ جدول»
        دارد (`"x.html": "…"`). فایلِ دوم ⇒ قرمز، هرجا که باشد.
     ۴. عهدهای رفتاری روی همان تابعِ مشترک سنجیده می‌شوند (شناسه به مسیر،
        ترجمهٔ `next`، کوئریِ فیلتر) — وگرنه سبزیِ بالا می‌تواند «هیچ‌کاری
        نمی‌کند» را تأیید کند.

   ---------- کدِ خروج ----------
     0 سبز · 1 قرمز · 2 پیش‌شرط (منبعِ مشترک نیست)

   ---------- اجرا ----------
     node tests/legacy-map-single-source.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const BACKEND = path.join(__dirname, '..');
const ROOT = path.join(BACKEND, '..');
const SHARED = path.join(ROOT, 'next-frontend', 'src', 'lib', 'legacyUrls.js');
const SHIM = path.join(BACKEND, 'lib', 'legacy-redirects.js');
const OLD_TS = path.join(ROOT, 'next-frontend', 'src', 'lib', 'legacyUrls.ts');
const MIDDLEWARE = path.join(ROOT, 'next-frontend', 'src', 'middleware.ts');

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

if (!fs.existsSync(SHARED)) {
  console.error(`\nپیش‌شرط: منبعِ مشترکِ نگاشت پیدا نشد: ${SHARED}`);
  console.error('بدونِ آن این آزمون بی‌معنی است (نه «سبز»).');
  process.exit(2);
}

// ------------------------------------------------------------
// مقایسه‌ساز: یک پیاده‌سازی می‌گیرد و می‌گوید کجاها با عهدِ منبعِ مشترک نمی‌خواند.
// جدا نگه داشته شده تا خودش هم سنجیدنی باشد (بخشِ خودآزمون، پایین).
// ------------------------------------------------------------
const CASES = [
  ['/index.html', '', '/'],
  ['/products.html', '', '/products'],
  ['/cart.html', '', '/cart'],
  ['/checkout.html', '', '/checkout'],
  ['/login.html', '', '/login'],
  ['/account.html', '', '/account'],
  ['/order-success.html', '?orderId=42', '/order-success?orderId=42'],
  ['/terms.html', '', '/terms'],
  ['/wholesale.html', '', '/wholesale'],
  // کوئریِ عصرِ Express دست‌نخورده منتقل می‌شود (فیلترِ محصول در Next هم خوانده می‌شود)
  ['/products.html', '?cat=satl&min=10', '/products?cat=satl&min=10'],
  // نامِ پارامترِ «برگرد به این صفحه» در دو فرانت‌اند فرق می‌کند
  ['/login.html', '?next=%2Faccount', '/login?redirect=%2Faccount'],
  // شناسه از کوئری به مسیر می‌رود؛ بی‌شناسه یا نامعتبر → فهرست
  ['/product.html', '?id=12', '/product/12'],
  ['/product.html', '', '/products'],
  ['/product.html', '?id=abc', '/products'],
  ['/product.html', '?id=-3', '/products'],
  // نگاشت‌نشده‌ها باید `null` بمانند (نه ۳۰۱ به جایی که وجود ندارد)
  ['/admin.html', '', null],
  ['/offline.html', '', null],
  ['/product-gone.html', '', null],
  ['/picture/products/a.jpg', '', null],
];

function divergences(impl, label) {
  const bad = [];
  for (const [p, q, want] of CASES) {
    let got;
    try { got = impl.legacyRedirect(p, q); } catch (e) { got = `throw: ${e.message}`; }
    if (got !== want) bad.push(`${label}: ${p}${q} → ${JSON.stringify(got)}، انتظار ${JSON.stringify(want)}`);
  }
  const depth = [
    ['/cart.html', true], ['/offline.html', true], ['/products', false], ['/a/b.html', false],
  ];
  for (const [p, want] of depth) {
    let got;
    try { got = impl.isLegacyHtmlPath(p); } catch (e) { got = `throw: ${e.message}`; }
    if (got !== want) bad.push(`${label}: isLegacyHtmlPath(${p}) → ${got}`);
  }
  return bad;
}

const shared = require(SHARED);
const expressSide = require(SHIM);

// ------------------------------------------------------------
section('۱) همان شیء، نه کپیِ هم‌محتوا');
// ------------------------------------------------------------
const sameFn = expressSide.legacyRedirect === shared.legacyRedirect;
const sameTable = expressSide.LEGACY_PAGE_ALIASES === shared.LEGACY_PAGE_ALIASES;
const sameNoAlias = expressSide.LEGACY_NO_ALIAS === shared.LEGACY_NO_ALIAS;
const sameGuard = expressSide.isLegacyHtmlPath === shared.isLegacyHtmlPath;
check('تابعِ ریدایرکتِ Express همان تابعِ منبعِ مشترک است (برابریِ مرجع)', sameFn,
  sameFn ? '' : 'دو تابعِ جدا ⇒ دو جا برای واگرایی');
check('جدولِ نام‌ها همان شیء است، نه کپیِ آن', sameTable && sameNoAlias);
check('نگهبانِ شکلِ نشانی هم همان تابع است', sameGuard);

// ------------------------------------------------------------
section('۲) پوستهٔ Express هیچ جدولی ندارد');
// ------------------------------------------------------------
const shimSrc = fs.readFileSync(SHIM, 'utf8');
const htmlLiterals = [...shimSrc.matchAll(/["'][^"'\n]*\.html["']/g)].map((m) => m[0]);
check('هیچ نامی از `.html` در پوستهٔ Express نیست (جدولِ دوم ممنوع)', htmlLiterals.length === 0,
  htmlLiterals.join('، '));
check('پوسته، منبعِ مشترک را require می‌کند', /require\(SHARED\)/.test(shimSrc));
check('پوسته، مسیرِ منبع را از محلِ خودش می‌سازد (نه از cwd)', /__dirname/.test(shimSrc));

const oldTsGone = !fs.existsSync(OLD_TS);
check('نسخهٔ .ts قدیمی برنگشته است (یک منبع، نه دو تا)', oldTsGone, OLD_TS);

// ------------------------------------------------------------
section('۳) گشتِ کلِ مخزن: جدول دقیقاً یک‌جا تعریف شده است');
// ------------------------------------------------------------
// شکلی که «تعریفِ جدول» را از «ارجاع» جدا می‌کند: کلیدِ یک نامِ .html که به
// یک مسیر نگاشت شده باشد. یک ارجاعِ ساده (`href="/cart.html"`) این شکل را
// ندارد و بنابراین جدول شمرده نمی‌شود.
//
// دامنهٔ گشت: درخت‌های **زمانِ اجرا** (کدِ Express، کدِ Next و اجراکننده‌هایش) —
// نه کلِ مخزن. دلیلش دو چیز است که هر دو مستندند:
//   • آزمون‌ها باید بتوانند همان نام‌ها را *نام ببرند* (`guard-mutations.js`
//     جهش‌هایش را روی همین رشته‌ها می‌نویسد)؛ اگر آن‌جا هم ممنوع شود، نگهبان
//     خودش را دور زده‌ایم. و یک جدولِ تقلیدی در یک آزمون، مسیرِ کاربر را
//     عوض نمی‌کند — خطرِ واقعی، جدولِ دوم در کدِ سروکننده است.
//   • `README.md` و اسناد عمداً بیرون‌اند: نشان‌دادنِ یک جفتِ `a.html → /a` در
//     متنِ مستندات، منبعِ دوم نیست.
const TABLE_SHAPE = /["'][a-z0-9-]+\.html["']\s*:\s*["']/i;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', 'backup', 'tests', 'data']);
const TEXT_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitleaksignore') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(abs);
    } else if (TEXT_EXT.has(path.extname(entry.name))) {
      yield abs;
    }
  }
}

const definers = [];
for (const root of ['backend', 'next-frontend/src', 'next-frontend/scripts']) {
  for (const file of walk(path.join(ROOT, root))) {
    if (/\.test\.(ts|tsx)$/.test(file)) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (TABLE_SHAPE.test(text)) definers.push(path.relative(ROOT, file).replace(/\\/g, '/'));
  }
}
const unexpected = definers.filter((f) => f !== 'next-frontend/src/lib/legacyUrls.js');
check('تنها یک فایل در کلِ مخزن جدولِ نگاشت را تعریف می‌کند', unexpected.length === 0,
  unexpected.join('، '));

// ------------------------------------------------------------
section('۴) عهدهای رفتاری روی همان تابعِ مشترک');
// ------------------------------------------------------------
const bad = divergences(expressSide, 'Express');
check(`بین دو طرف هیچ اختلافی نیست (${CASES.length} نشانی + ${4} شکلِ نشانی)`, bad.length === 0,
  bad.slice(0, 4).join(' | '));
check('جدول دست‌کم ۹ نام دارد و همه‌شان در عهدِ بالا سنجیده شده‌اند',
  Object.keys(shared.LEGACY_PAGE_ALIASES).length >= 9);
check('هر نامِ «عمداً بی‌مقصد» دلیلِ مکتوب دارد (≥۱۰ نویسه)',
  Object.keys(shared.LEGACY_NO_ALIAS).length > 0 &&
  Object.values(shared.LEGACY_NO_ALIAS).every((why) => String(why).length > 10));

// ------------------------------------------------------------
section('۵) سرور و میان‌افزار از همین منبع استفاده می‌کنند');
// ------------------------------------------------------------
const serverSrc = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');
check('سرورِ Express پلِ ۳۰۱ را از پوستهٔ مشترک می‌گیرد',
  /require\('\.\/lib\/legacy-redirects'\)/.test(serverSrc));
const mwSrc = fs.readFileSync(MIDDLEWARE, 'utf8');
check('میان‌افزارِ Next از همان ماژول import می‌کند',
  /from\s+["']@\/lib\/legacyUrls["']/.test(mwSrc));
check('میان‌افزار همان دو تابع را می‌خواهد (نگهبانِ شکل + نگاشت)',
  /legacyRedirect/.test(mwSrc) && /isLegacyHtmlPath/.test(mwSrc));

// ------------------------------------------------------------
section('۶) خودآزمون: نگهبانی که همیشه سبز است، نگهبان نیست');
// ------------------------------------------------------------
// یک «منبعِ مشترکِ تقلبی» می‌سازیم که در یک مورد واگرا است. اگر مقایسه‌ساز
// آن را نگیرد، بخشِ ۴ بی‌ارزش است.
const fake = path.join(os.tmpdir(), `legacy-fake-${process.pid}.js`);
fs.writeFileSync(fake, `module.exports = {
  LEGACY_PAGE_ALIASES: { 'cart.html': '/cart-taghiri-karde' },
  LEGACY_NO_ALIAS: {},
  isLegacyHtmlPath: (p) => /^\\/.*\\.html$/.test(p),
  legacyRedirect: (p, q) => (p === '/cart.html' ? '/cart-taghiri-karde' : null),
};\n`);
try {
  const fakeBad = divergences(require(fake), 'تقلبی');
  check('مقایسه‌ساز، واگراییِ عمدی را می‌گیرد', fakeBad.length >= 2, `شد: ${fakeBad.length}`);
  check('و همان واگرایی را نام می‌برد (نه فقط «خطا»)',
    fakeBad.some((b) => b.includes('/cart-taghiri-karde')));
} finally {
  try { fs.unlinkSync(fake); } catch { /* بی‌اهمیت */ }
}

// ------------------------------------------------------------
// سنجشِ جانبی و ارزان: نگهبانِ لنگرهای جهش باید این فایل را بشناسد.
// («هر آزمونی لنگر یا دلیلِ مستند دارد» — این فایل هم یکی از همان‌هاست.)
// ------------------------------------------------------------
section('۷) این نگهبان خودش لنگرِ جهش دارد');
const reg = spawnSync(process.execPath, [path.join(__dirname, 'guard-mutations.js'), '--registry'], {
  cwd: BACKEND, encoding: 'utf8',
});
check('رجیستریِ هارنس خوانده شد', reg.status === 0, (reg.stderr || '').trim().slice(0, 200));
const selfName = path.basename(__filename);
check('نامِ این فایل در رجیستریِ لنگرها هست', (reg.stdout || '').includes(selfName));

console.log(`\nLegacy-map single-source: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
