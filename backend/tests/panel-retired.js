#!/usr/bin/env node
// tests/panel-retired.js — نگهبانِ «پنلِ Express برنگردد و ارجاعش هم جا نماند»
//
// ---------- چرا این آزمون وجود دارد ----------
// پنلِ قدیمی (`frontend/admin.html` + `frontend/js/admin.js` + `frontend/css/invoice.css`)
// حذف شد چون هر ۱۳ نما در Next بازنویسی شده بود. حذفِ یک صفحه در گیت یک خط است،
// ولی **برنگشتنش** تضمینی ندارد و سه شکلِ مختلفِ برگشت دارد که هیچ‌کدام خطا
// نمی‌دهند:
//
//   ۱. فایل دوباره سرِ جایش بگذارند (از `backup/` یا از تاریخچه) — همان صفحه‌ی
//      قدیمی بی‌صدا زنده می‌شود، در حالی که همه فکر می‌کنند پنل در Next است.
//   ۲. کسی لینک/`href`/`src` جدیدی به آن اضافه کند — کاربرِ بعدی به ۴۰۴ می‌رسد
//      و مثل همیشه هیچ typecheck یا lintی نمی‌فهمد (چون رشته است، نه مسیر).
//   ۳. یک استایلشیت یا اسکریپت هنوز به فایلِ حذف‌شده اشاره کند — یعنی صفحه‌ای
//      که بدونِ استایل یا بدونِ اسکریپت بالا می‌آید.
//
// این آزمون هر سه را می‌گیرد و **فقط سورس می‌خواند**: نه سرور لازم دارد، نه
// دیتابیس، نه شبکه. اگر فایلِ مرجعی جابه‌جا شود، جای دیگری می‌شکند نه اینجا.
//
// ۴۰۴ بودنِ زنده‌ی این مسیرها جای دیگری سنجیده می‌شود: `test-smoke.js` →
// «V37 بازنشسته». آن یکی سرورِ واقعی بالا می‌آورد و کدِ HTTP را می‌بیند؛ این
// یکی فقط دیسک را. عمداً جدا هستند تا این نگهبان در هر محیطی (حتی بدونِ سرور)
// قابل اجرا بماند.
//
// ---------- استثناها عمداً کم و صریح‌اند ----------
// دو فایل مجازند نامِ فایل‌های حذف‌شده را ببرند و دلیلش هم کنارشان نوشته شده:
//   • `README.md` — تاریخِ همین تصمیم را روایت می‌کند («چه چیزی و چرا حذف شد»).
//   • `next-frontend/src/app/internalLinks.test.ts` — فهرستِ ممنوعه‌ای که خودش
//     نگهبانِ طرفِ Next است.
// هر استثنای دیگری باید با توجیه اضافه شود، نه با شل‌کردنِ الگو.
//
// ---------- دو تصحیحِ لازم پس از پورتِ برابری (وگرنه نگهبان روی کارِ درست قرمز می‌شد) ----------
//   ۱. **کامنت ارجاع نیست.** نگهبان خط‌به‌خط و بدونِ نگاه به کامنت می‌خواند،
//      پس یادداشتی مثلِ «این مسیر دیگر هیچ‌وقت باز نمی‌شود» هم قرمز می‌شد —
//      یعنی نگهبان روی چیزی قرمز می‌شد که *خودش* محافظش است. کامنت نمی‌تواند
//      کاربر را به ۴۰۴ بفرستد، پس اول کامنت‌ها خنثی می‌شوند (با حفظِ شماره‌ی
//      خط).
//   ۲. **استثنا روی «فایل + نام» است، نه کلِ فایل.** جدولِ نشانی‌های عصرِ
//      Express در `legacyUrls.ts` ناچاراً `/admin.html` را می‌نویسد تا بگوید
//      چرا ۴۰۴ می‌ماند، و دو آزمون همان تصمیم را می‌سنجند. ولی همان فایل
//      نباید اجازه بگیرد `js/admin.js` یا `invoice.css` را هم ببرد — آن دو
//      داراییِ واقعیِ پنل‌اند. پس استثنا جفت‌محور است و خودش هم کهنه‌شدنی نیست
//      (بخشِ ۳ می‌سنجد که هر استثنا واقعاً همان‌جا باشد).

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const REPO = path.join(BACKEND, '..');

// ---------- ۱) فایل‌هایی که نباید باشند ----------
// فقط نامِ فایل، چون برگشتِ پنل به هر شکلی همین سه نام را برمی‌گرداند و مهم
// نیست در کدام پوشه بنشیند. استثنا: `routes/admin.js` — آن **API** پنل است، نه
// خودِ پنل، و همه‌ی ۱۳ نمای Next از همان می‌خوانند.
const RETIRED_BASENAMES = ['admin.html', 'admin.js', 'invoice.css'];
const ALLOWED_PATHS = [/[/\\]routes[/\\]admin\.js$/];

// پوشه‌هایی که یک داراییِ ثابت در آن‌ها سرو می‌شود (پس برگشتِ پنل اینجا خطرناک است)
const ASSET_ROOTS = ['frontend', 'next-frontend/public', 'backend'];

// ---------- ۲) ارجاع‌هایی که نباید در سورس بمانند ----------
const TOKENS = ['admin.html', 'js/admin.js', 'invoice.css'];

// فایل‌هایی که اجازه دارند این نام‌ها را ببرند (دلیلش بالای همین فایل)
const REF_ALLOWED_FILES = new Set([
  'README.md',
  'next-frontend/src/app/internalLinks.test.ts',
  // خودِ همین فایل: فهرستِ الگوها و نمونه‌های ساختگیِ بخشِ ۳ ناچاراً همان نام‌ها
  // را دارند. جای دیگری شل نمی‌شود؛ استثنا فقط جایی است که خودِ ناظر است.
  'backend/tests/panel-retired.js',
]);

// استثناهای دقیق‌تر: «فایل::نام». این سه، جاهایی هستند که نامِ *نشانیِ*
// بازنشسته عمداً می‌آید و ارجاع نیست — هر سه هم می‌گویند «۴۰۴ بماند»:
//   • جدولِ `legacyUrls.ts`: کارش همین است که بگوید کدام نشانیِ عصرِ Express
//     تغییرِ مسیر می‌خورد و کدام نمی‌خورد؛ `/admin.html` عمداً در فهرستِ
//     «بدونِ تغییرِ مسیر» است.
//   • دو آزمونی که همین ماندنِ ۴۰۴ را می‌سنجند (یکی در همان جدول، یکی در
//     همتای نوارِ پایینِ موبایل: در Express هم `admin.html` هرگز `common.js`
//     را لود نمی‌کرد، پس نوارِ پایین را نمی‌دید).
const REF_ALLOWED_PAIRS = new Set([
  'next-frontend/src/lib/legacyUrls.ts::admin.html',
  'next-frontend/src/lib/legacyUrls.test.ts::admin.html',
  'next-frontend/src/components/BottomNav.test.tsx::admin.html',
]);

// درخت‌هایی که اسکن می‌شوند — همه‌ی جایی که یک ارجاع می‌تواند بی‌صدا بشکند
const SCAN_ROOTS = [
  'frontend',
  'backend',
  'next-frontend/src',
  'next-frontend/public',
  '.github',
];
const SCAN_ROOT_FILES = ['README.md', 'SECURITY.md', 'backend/.env.example'];

const TEXT_EXT = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.html', '.css',
  '.md', '.txt', '.yml', '.yaml', '.webmanifest', '.example', '.env',
]);
// چیزهایی که سورس نیستند: وابستگی‌ها، خروجیِ بیلد، پشتیبانِ محلی (کپیِ عمدیِ
// همان فایل‌های قدیمی)، تنظیماتِ شخصیِ ابزار، دیتابیس/لاگ و عکس‌ها.
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'backup', '.claude', 'data', 'logs',
  'backups', 'picture', 'assets', 'dist', 'coverage',
]);

let pass = 0, fail = 0;
function ok(label) { pass++; console.log(`  [PASS] ${label}`); }
function notOk(label, detail) { fail++; console.error(`  [FAIL] ${label} — ${detail}`); }

console.log('\n=== Retired panel guard (Express admin must stay gone) ===\n');

const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

/** همه‌ی فایل‌های زیرِ یک ریشه، با پرش از پوشه‌های غیرسورس */
function walk(root, out = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// ============================================================
// ۱) فایلِ حذف‌شده برنگشته باشد
// ============================================================
console.log('-- ۱) فایل‌های بازنشسته --');
const allAssets = ASSET_ROOTS.flatMap((r) => walk(path.join(REPO, r)));
const resurrected = allAssets.filter((f) => {
  if (!RETIRED_BASENAMES.includes(path.basename(f))) return false;
  return !ALLOWED_PATHS.some((re) => re.test(f));
});
if (resurrected.length === 0) {
  ok(`${RETIRED_BASENAMES.join('، ')} در ${ASSET_ROOTS.join('، ')} وجود ندارند`);
} else {
  for (const f of resurrected) notOk('فایلِ بازنشسته برگشته', rel(f));
}

// ============================================================
// ۲) هیچ ارجاعِ متنی به آن‌ها نمانده باشد
// ============================================================
// چرا unescape: یک ارجاع می‌تواند به شکلِ regex یا مسیرِ ویندوزی نوشته شود
// (`/admin\.html/`، `routes\admin.js`). بدونِ این تبدیل، هر دو از تور می‌افتند
// در حالی که دقیقاً همان چیزی‌اند که باید گرفته شود.
function unescapeText(line) {
  const flat = line.replace(/\\(.)/g, '$1');
  return flat.replace(/routes[/\\]+admin\.js/g, '');
}

/** کامنت را با فاصله عوض می‌کند ولی `\n`ها را نگه می‌دارد تا شماره‌ی خط‌ها
 *  جابه‌جا نشود (گزارشِ [FAIL] با شماره‌ی خط می‌آید و باید دقیق باشد). */
const blankOut = (m) => m.replace(/[^\n]/g, ' ');

/** همان کاری که اسکنِ دارایی‌ها می‌کند، برای ارجاع‌های متنی: کامنت نمی‌تواند
 *  کاربر را به ۴۰۴ بفرستد، پس پیش از تطبیق حذف می‌شود. `://` دست‌نخورده
 *  می‌ماند تا آدرسِ کاملِ `https://…` خراب نشود. */
function stripComments(text, ext) {
  if (ext === '.html') return text.replace(/<!--[\s\S]*?-->/g, blankOut);
  if (ext === '.css') return text.replace(/\/\*[\s\S]*?\*\//g, blankOut);
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blankOut)
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

console.log('\n-- ۲) ارجاع‌های متنی --');
const scanFiles = [
  ...SCAN_ROOTS.flatMap((r) => walk(path.join(REPO, r))),
  ...SCAN_ROOT_FILES.map((f) => path.join(REPO, f)),
];
let refCount = 0, scanned = 0;
const findings = [];
for (const file of scanFiles) {
  const name = rel(file);
  if (REF_ALLOWED_FILES.has(name)) continue;
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXT.has(ext)) continue;
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
  scanned++;
  // کامنت ارجاع نیست: یادداشتی که می‌گوید «این مسیر دیگر باز نمی‌شود» باید
  // آزاد باشد، وگرنه نگهبان روی همان چیزی قرمز می‌شود که محافظش است.
  const source = stripComments(raw, ext);
  source.split(/\r?\n/).forEach((line, i) => {
    const probe = unescapeText(line);
    for (const token of TOKENS) {
      if (!probe.includes(token)) continue;
      // استثنا فقط برای «همین نام در همین فایل» است، نه کلِ فایل
      if (REF_ALLOWED_PAIRS.has(`${name}::${token}`)) continue;
      findings.push(`${name}:${i + 1} → ${token} | ${line.trim().slice(0, 90)}`);
    }
  });
}
refCount = findings.length;
if (refCount === 0) {
  ok(`در ${scanned} فایلِ سورس هیچ ارجاعی به پنلِ بازنشسته نمانده`);
} else {
  for (const f of findings) notOk('ارجاع به پنلِ بازنشسته', f);
}

// ============================================================
// ۳) آزمونِ خودِ آزمون — وگرنه سبزیِ بالا بی‌معنا است
// ============================================================
// اگر فهرستِ اسکن خالی شود (مسیرها عوض شوند) یا الگو هیچ‌وقت مطابقت نکند، همه‌ی
// بررسی‌های بالا «سبز» می‌شوند بدونِ اینکه چیزی سنجیده باشند. پس خودِ الگو را
// روی یک رشته‌ی ساختگی می‌آزماییم و تعدادِ فایل‌های اسکن‌شده را هم کف می‌گذاریم.
console.log('\n-- ۳) خودِ نگهبان --');
// این نمونه‌ها همان مسیرِ واقعیِ اسکن را می‌گذرند (خنثی‌کردنِ کامنت + unescape)،
// وگرنه یک آزمونِ خودی که روندِ واقعی را نمی‌سنجد، فقط اطمینانِ قلابی می‌دهد.
const selfTests = [
  ['  <a href="/admin.html">پنل</a>', 'admin.html', '.html'],
  ['  <script src="js/admin.js?v=66">', 'js/admin.js', '.html'],
  ['  /admin\\.html$/', 'admin.html', '.ts'],
  ['  routes\\admin.js — API', null, '.ts'],
  ['  routes/admin.js — API', null, '.ts'],
  ['  // پنلِ قدیمیِ Express (حذف‌شده)', null, '.ts'],
  // کامنت نمی‌تواند کاربر را به ۴۰۴ بفرستند — این چهار شکل باید خنثی شوند،
  // وگرنه نگهبان روی یادداشتِ «این مسیر مرده است» قرمز می‌شود.
  ['  // است و `/admin.html` هم رشته‌ای با `/admin` شروع می‌شود', null, '.ts'],
  ['  {/* <a href="/admin.html">پنل</a> */}', null, '.tsx'],
  ['  <!-- <script src="js/admin.js"></script> -->', null, '.html'],
  ['  /* background: url(/css/invoice.css); */', null, '.css'],
  // ...ولی نامِ همان مسیر در *کدِ زنده* باید همان‌طور گرفته شود.
  ['  href="/admin.html"', 'admin.html', '.tsx'],
  ['  const css = "/css/invoice.css";', 'invoice.css', '.ts'],
];
let selfOk = true;
for (const [line, expected, ext] of selfTests) {
  const probe = unescapeText(stripComments(line, ext || '.ts'));
  const hit = TOKENS.find((t) => probe.includes(t)) || null;
  if (hit !== expected) {
    selfOk = false;
    notOk('آزمونِ الگو', `«${line}» → ${hit || 'چیزی پیدا نشد'}، انتظار: ${expected || 'چیزی'}`);
  }
}
if (selfOk) ok(`الگو روی ${selfTests.length} نمونه‌ی ساختگی درست رفتار کرد (شاملِ routes/admin.js که باید رد شود، و کامنت‌هایی که نباید بگیرند)`);
// استثنای کهنه هم خودش یک خطا است: اگر فایل عوض شود و آن نام را دیگر نبرد،
// استثنا بی‌صدا نگهبان را شل کرده است.
const stalePairs = [...REF_ALLOWED_PAIRS].filter((key) => {
  const [file, token] = key.split('::');
  try { return !fs.readFileSync(path.join(REPO, file), 'utf8').includes(token); }
  catch { return true; }
});
if (stalePairs.length) notOk('استثنای کهنه', `این فایل‌ها دیگر آن نام را ندارند: ${stalePairs.join('، ')}`);
if (scanned >= 100) ok(`اسکن واقعاً ${scanned} فایل را دید`);
else notOk('فهرستِ اسکن', `فقط ${scanned} فایل — یعنی ریشه‌ها یا پسوندها دیگر نمی‌خوانند`);

// ============================================================
console.log('\n----------------------------------------------');
if (fail === 0) {
  console.log(`SUCCESS: all ${pass} checks passed - the Express panel is still retired.`);
} else {
  console.log(`WARNING: ${pass} passed / ${fail} failed - the retired panel is referenced again.`);
}
console.log('----------------------------------------------\n');
process.exit(fail === 0 ? 0 : 1);
