/* ============================================================
   نگهبانِ مرزِ راز — «رازِ سرور هرگز به مرورگر نمی‌رسد»

   این آزمون سه چیز را می‌سنجد و هیچ‌کدام درباره‌ی رفتارِ سرور نیست:

     ۱) سمتِ کلاینت: هیچ راز/پیکربندیِ سرور در فایل‌هایی که به مرورگر می‌رود
        نباشد. مرزِ امروز دو جاست، نه یکی: دارایی‌هایی که Next از `public/`
        سرو می‌کند، و سورسِ خودِ Next که باندل می‌شود.
     ۲) الگوِ محیط: `backend/.env.example` مقدارِ واقعی نداشته باشد، فقط
        جای‌نگهدار.
     ۳) ماسک‌کردنِ لاگ: `safeValue` مقدارهای حساس را با ستاره بپوشاند.

   ---------- چرا مرزِ کلاینت عوض شد ----------
   تا روزِ بازنشستگی، `frontend/` سمتِ کلاینت بود و این آزمون همان پوشه را
   اسکن می‌کرد. آن پوشه حذف شد، ولی *خطر* نه: سمتِ کلاینتِ امروز
   `next-frontend/` است. اگر مرز را هم‌زمان منتقل نمی‌کردیم، این نگهبان
   «سبزِ خالی» می‌گرفت: پوشه‌ی نبوده را می‌خواند و هیچ فایلی اسکن نمی‌شد.

   اجرا: node tests/secrets.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { safeValue } = require('../lib/logger');

const root = path.resolve(__dirname, '..', '..');

// پوشه‌ی بازنشسته نباید برگردد؛ اگر برگشت، این آزمون باید *صدای* خطر باشد،
// نه اینکه ناخواسته دو بار اسکن کند و خیالِ آسوده بدهد.
const RETIRED_DIR = path.join(root, 'frontend');

const CLIENT_DIRS = [
  path.join(root, 'next-frontend', 'public'), // دارایی‌های ثابتی که مرورگر می‌گیرد
  path.join(root, 'next-frontend', 'src'),    // سورسی که در باندل به مرورگر می‌رود
];
const CLIENT_EXT = /\.(html|js|cjs|mjs|ts|tsx|jsx|css|json|webmanifest|svg|txt)$/i;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

let pass = 0, fail = 0;
function check(label, condition, detail = '') {
  if (condition) { pass++; console.log(`  [PASS] ${label}${detail ? ` - ${detail}` : ''}`); }
  else { fail++; console.error(`  [FAIL] ${label}${detail ? ` - ${detail}` : ''}`); }
}

console.log('\n=== Secret boundary guard (server secrets never reach the browser) ===\n');

check('پوشه‌ی بازنشسته‌ی frontend/ برنگشته است', !fs.existsSync(RETIRED_DIR),
  fs.existsSync(RETIRED_DIR) ? 'پوشه دوباره ساخته شده — مرزِ کلاینت عوض شده است' : '');

const files = CLIENT_DIRS
  .filter((d) => fs.existsSync(d))
  .flatMap(walk)
  .filter((f) => CLIENT_EXT.test(f));

// «سبزِ خالی»: اگر هیچ فایلی اسکن نشود، آزمون چیزی را نسنجیده است.
check('سمتِ کلاینت واقعاً اسکن شد (کفِ ۱۰۰ فایل)', files.length >= 100, `${files.length} فایل`);

const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const SECRET_ASSIGN = /ZARINPAL_MERCHANT_ID\s*=|SMS_API_KEY\s*=|SESSION_SECRET\s*=|Authorization:\s*AccessKey/i;
check('هیچ ارجاعِ رازی در فایل‌های سمتِ کلاینت نیست', !SECRET_ASSIGN.test(text),
  SECRET_ASSIGN.test(text) ? 'یک انتسابِ راز/پیکربندی در فایلِ کلاینتی پیدا شد' : `${files.length} فایل`);

const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
const envHasRealSecret = /^\s*(ZARINPAL_MERCHANT_ID|SMS_API_KEY|SESSION_SECRET)\s*=\s*[^\s#]+/m.test(envExample)
  && !/REPLACE_WITH_A_RANDOM_SECRET/.test(envExample);
check('الگوی محیط فقط جای‌نگهدار دارد', !envHasRealSecret);

const masked = safeValue({ password: 'secret', token: 'token', phone: '09120000000', ok: 'visible' });
check('مقدارهای حساس در لاگ ماسک می‌شوند',
  !JSON.stringify(masked).includes('secret') && !JSON.stringify(masked).includes('09120000000'),
  JSON.stringify(masked));

console.log(`\nSecret boundary checks: ${pass} passed, ${fail} failed (${files.length} client files scanned)`);
if (fail) process.exit(1);
