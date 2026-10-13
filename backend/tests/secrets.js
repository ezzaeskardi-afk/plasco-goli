/* ============================================================
   نگهبانِ مرزِ راز — «رازِ سرور هرگز به مرورگر نمی‌رسد»

   این آزمون چهار چیز را می‌سنجد و هیچ‌کدام درباره‌ی رفتارِ سرور نیست:

     ۱) سمتِ کلاینت: هیچ راز/پیکربندیِ سرور در فایل‌هایی که به مرورگر می‌رود
        نباشد. مرزِ امروز دو جاست، نه یکی: دارایی‌هایی که Next از `public/`
        سرو می‌کند، و سورسِ خودِ Next که باندل می‌شود.
     ۲) الگوِ محیط: `backend/.env.example` مقدارِ واقعی نداشته باشد، فقط
        جای‌نگهدار.
     ۳) ماسک‌کردنِ لاگ: `safeValue` مقدارهای حساس را با ستاره بپوشاند.
     ۴) اسکنرِ راز (`tools/gitleaks.js`) واقعاً به دروازهٔ پیش از کامیت گره
        خورده باشد — نه فقط موجود باشد. دلیلش پایین‌تر، سرِ همان بخش.

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
const { spawnSync } = require('child_process');
const { safeValue } = require('../lib/logger');

const backend = path.join(__dirname, '..');

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

/* ---------- ۴) اسکنرِ راز: «جدا‌افتاده» نباید سبزِ خالی بدهد ----------
   یک نگهبانِ سیم‌نشده از نبودنش بدتر است: کسی که خیالش راحت باشد که «اسکن
   می‌شود»، دیگر دستی نگاه نمی‌کند. سه چیز سنجیده می‌شود — وجودِ اجراکننده،
   صدا زده‌شدنش از دروازهٔ پیش از کامیت (و نماندنش در حالتِ `--fast` که
   هوکِ نصب‌شده با آن اجرا می‌شود)، و این‌که اسکریپتِ npm هم به همان اجراکننده
   برود نه به `gitleaks detect`ِ خام که دامنه‌اش با پوشه‌های محلی قاطی است.

   و در آخر یک سنجشِ *رفتاری* روی خودِ اجراکننده: با مسیرِ غلطِ `GITLEAKS_BIN`
   باید کدِ ۲ بدهد. «نشد» و «پاک» دو چیزند و همین تفاوت باید قفل باشد،
   وگرنه روزی که باینری نباشد دروازه ساکت می‌ماند. */
const runner = path.join(backend, 'tools', 'gitleaks.js');
check('اجراکنندهٔ راز کنارِ ابزارها هست', fs.existsSync(runner));

const gateSrc = fs.readFileSync(path.join(root, 'verify-before-commit.mjs'), 'utf8');
const stepsSrc = (gateSrc.match(/const STEPS = \[[\s\S]*?\n\];/) || [''])[0];
const stepBlock = (needle) => {
  const at = stepsSrc.indexOf(needle);
  if (at === -1) return '';
  const start = stepsSrc.lastIndexOf('{', at);
  const end = stepsSrc.indexOf('},', at);
  return stepsSrc.slice(start, end === -1 ? stepsSrc.length : end);
};
const secretStep = stepBlock('tools/gitleaks.js');
check('دروازهٔ پیش از کامیت اسکنرِ راز را صدا می‌زند', secretStep !== '');
check('و در حالتِ سریعِ هوک (--fast) هم می‌ماند', /fast:\s*true/.test(secretStep));

const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
check('اسکریپت npm هم از همان اجراکننده می‌رود (نه باینریِ خام)',
  /tools\/gitleaks\.js/.test(pkg.scripts['security:gitleaks'] || ''),
  pkg.scripts['security:gitleaks'] || '(نیست)');

const cold = spawnSync(process.execPath, ['tools/gitleaks.js'], {
  cwd: backend,
  encoding: 'utf8',
  env: { ...process.env, GITLEAKS_BIN: path.join(root, 'no-such-gitleaks-here') },
});
check('باینریِ نبوده «پاک» گزارش نمی‌شود (کدِ ۲، نه صفر)', cold.status === 2,
  `کدِ خروج ${cold.status}`);
check('و همان مسیرِ غلط را در پیام نام می‌برد',
  /no-such-gitleaks-here/.test(`${cold.stdout || ''}${cold.stderr || ''}`));

console.log(`\nSecret boundary checks: ${pass} passed, ${fail} failed (${files.length} client files scanned)`);
if (fail) process.exit(1);
