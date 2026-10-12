#!/usr/bin/env node
/* ============================================================
   نگهبانِ پیش‌دستیِ خطا — «صفحه‌ی خطا صاحب دارد، و صاحبش Next است»

   ---------- چرا این فایل وجود دارد ----------
   تا عصرِ `frontend/`، این سرور خودش `404.html` و `500.html` را سرو می‌کرد.
   آن دو حذف شدند و صفحه‌های استایل‌دار در Next ساخته شدند
   (`app/not-found.tsx` و `app/error.tsx` + `app/global-error.tsx`) — ولی
   *پاسخِ* خطا همچنان از این‌جا می‌آمد: «چنین صفحه‌ای وجود ندارد.» با
   `text/plain`. یعنی روی همان دامنه دو جور خطا دیده می‌شد.

   حالا قاعده در `lib/error-handoff.js` نوشته شده (خالص و بدونِ سرور) و
   `server.js` فقط می‌پرسدش. این نگهبان سه چیز را قفل می‌کند:

     ۱. **تصمیم‌ها** — چهار حالت (`api`/`asset`/`storefront`/`plain`) و مرزِ
        هرکدام. دو مرزِ حساس‌اند و هر دو یک باگِ واقعی‌اند:
          • `/api/*` نباید ۳۰۲ بگیرد (کلاینتش `fetch` است، نه مرورگر).
          • `/picture/*` نباید ۳۰۲ بگیرد: `next.config.ts` همین پیشوند را
            دوباره به این سرور پروکسی می‌کند → حلقه‌ی بی‌پایان.
     ۲. **لوپ‌نبستن** — ۳۰۲ به *خودمان* ممنوع (همان سدِ `sameHost` که قاعده‌ی
        `/admin` دارد)، و ۳۰۲ روی متدِ نوشتاری ممنوع (وگرنه POST بی‌صدا به
        GET تبدیل می‌شود).
     ۳. **نداشتنِ صفحه‌ی دوم** — سورسِ `server.js` نباید هیچ‌جای هندلرهای خطا
        `text/html` بسازد. آن HTMLِ دوم همان چیزی است که حذفِ `frontend/`
        می‌خواست ببندد: دو نسخه‌ی واگرا از یک صفحه.

   ---------- چرا بدونِ سرور ----------
   قاعده در یک تابعِ خالص است، پس این نگهبان نه پورت می‌خواهد نه دیتابیس
   (مثل `legacy-redirects`). رفتارِ زنده‌ی همین تصمیم روی سرورِ واقعی در
   `test-smoke.js` سنجیده می‌شود: در تست `SITE_URL` همان میزبانِ درخواست است،
   پس شاخه‌ی `plain` اجرا می‌شود و ۴۰۴ِ خالصِ همان مجموعه همان‌جا قفل است.

   اجرا: node tests/error-handoff.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const { decideErrorHandoff, KINDS } = require('../lib/error-handoff');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(__dirname, '..', 'server.js');

// دو دنیای واقعی: استقرارِ تک‌دامنه‌ای (Express و Next پشتِ یک دامنه) و
// اجرای محلی، که سایت روی پورتِ دیگری است و درخواست به مبدأِ Express می‌رسد.
const LOCAL_HOST = '127.0.0.1:3000';
const SITE = 'https://polasco.example';

let pass = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`[PASS] ${label}${detail ? ` - ${detail}` : ''}`);
  } else {
    failures.push(label);
    console.log(`[FAIL] ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

/** یک درخواستِ نمونه با پیش‌فرض‌های محلی — فقط چیزی که آزمون عوض می‌کند داده می‌شود. */
const req = (over = {}) => ({
  method: 'GET',
  path: '/blog',
  host: LOCAL_HOST,
  siteUrl: SITE,
  ...over,
});

// ------------------------------------------------------------
// ۱) `/api/*` — JSON، هرگز ۳۰۲
// ------------------------------------------------------------
for (const p of ['/api', '/api/nope', '/api/products/999999']) {
  const d = decideErrorHandoff(req({ path: p }));
  check(
    `«${p}» JSON می‌گیرد نه ۳۰۲`,
    d.kind === 'api',
    `kind=${d.kind}`,
  );
}
check(
  '«/api/*» با SITE_URLِ خالی هم JSON می‌گیرد (خطا به fetch خراب نمی‌شود)',
  decideErrorHandoff(req({ path: '/api/nope', siteUrl: '' })).kind === 'api',
  String(decideErrorHandoff(req({ path: '/api/nope', siteUrl: '' })).kind),
);

// ------------------------------------------------------------
// ۲) `/picture/*` — دارایی، نه صفحه. ۳۰۲ اینجا حلقه می‌سازد
// ------------------------------------------------------------
for (const p of ['/picture', '/picture/products/missing.jpg', '/picture/x.webp']) {
  const d = decideErrorHandoff(req({ path: p }));
  check(
    `«${p}» عکس است و ۳۰۲ نمی‌گیرد (حلقه با پروکسیِ Next)`,
    d.kind === 'asset',
    `kind=${d.kind}`,
  );
  check(
    `دلیلِ «${p}» حلقه را می‌گوید`,
    /حلقه/.test(d.why),
    d.why,
  );
}

// ------------------------------------------------------------
// ۳) مسیرِ صفحه‌ای روی میزبانِ دیگر — ۳۰۲ به همان مسیر روی سایت
// ------------------------------------------------------------
const cart = decideErrorHandoff(req({ path: '/cart' }));
check(
  'مسیرِ ناموجودِ صفحه‌ای به همان مسیر روی سایت می‌رود',
  cart.kind === 'storefront' && cart.target === `${SITE}/cart`,
  `${cart.kind} → ${cart.target}`,
);
check(
  '۳۰۲ است نه ۳۰۱ (مسیری که امروز نیست ممکن است فردا باشد)',
  cart.status === 302,
  `status=${cart.status}`,
);

const withQuery = decideErrorHandoff(req({ path: '/products', originalUrl: '/products?cat=%D8%B3%D8%B7%D9%84&min=1' }));
check(
  'کوئریِ درخواست در مقصدِ ۳۰۲ حفظ می‌شود',
  withQuery.kind === 'storefront' && withQuery.target === `${SITE}/products?cat=%D8%B3%D8%B7%D9%84&min=1`,
  withQuery.target,
);

const trailing = decideErrorHandoff(req({ path: '/nope', siteUrl: `${SITE}/` }));
check(
  'اسلشِ آخرِ SITE_URL مقصدِ دوتایی نمی‌سازد',
  trailing.kind === 'storefront' && trailing.target === `${SITE}/nope`,
  trailing.target,
);

// ------------------------------------------------------------
// ۴) مرزهای «به خودمان ۳۰۲ نمی‌دهیم»
// ------------------------------------------------------------
const same = decideErrorHandoff(
  req({ path: '/nope', host: 'polasco.example', siteUrl: SITE }),
);
check(
  'روی همان میزبان ۳۰۲ به خودمان نمی‌دهیم (حلقه)',
  same.kind === 'plain',
  `${same.kind} — ${same.why}`,
);
const a = decideErrorHandoff(req({ path: '/nope', host: 'www.polasco.example', siteUrl: SITE }));
check(
  'میزبانِ متفاوت ولی مسیرِ صفحه‌ای دوباره ۳۰۲ می‌گیرد',
  a.kind === 'storefront',
  `${a.kind} → ${a.target}`,
);

check(
  'بدونِ SITE_URL هیچ ۳۰۲‌ای ساخته نمی‌شود',
  decideErrorHandoff(req({ path: '/nope', siteUrl: '' })).kind === 'plain',
  String(decideErrorHandoff(req({ path: '/nope', siteUrl: '' })).kind),
);
check(
  'SITE_URLِ نامعتبر (بدونِ پروتکل) هم مقصدِ ۳۰۲ نمی‌شود',
  decideErrorHandoff(req({ path: '/nope', siteUrl: 'polasco.example' })).kind === 'plain',
  String(decideErrorHandoff(req({ path: '/nope', siteUrl: 'polasco.example' })).kind),
);

// ------------------------------------------------------------
// ۵) متدِ نوشتاری — ۳۰۲ آن را به GET تبدیل می‌کند
// ------------------------------------------------------------
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  const d = decideErrorHandoff(req({ method, path: '/nope' }));
  check(
    `متدِ ${method} روی میزبانِ دیگر ۳۰۲ نمی‌گیرد`,
    d.kind === 'plain',
    `kind=${d.kind}`,
  );
  check(`دلیلِ ${method} صریح است (تبدیل به GET)`, /GET/.test(d.why), d.why);
}
check(
  'HEAD هم مثلِ GET صفحه‌دیدن است',
  decideErrorHandoff(req({ method: 'HEAD', path: '/nope' })).kind === 'storefront',
  String(decideErrorHandoff(req({ method: 'HEAD', path: '/nope' })).kind),
);

// ------------------------------------------------------------
// ۶) حالت‌ها بسته‌اند و هر تصمیم دلیل دارد
// ------------------------------------------------------------
const SAMPLE = [
  req({ path: '/api/x' }),
  req({ path: '/picture/x.jpg' }),
  req({ path: '/cart' }),
  req({ path: '/cart', host: 'polasco.example' }),
  req({ method: 'POST', path: '/cart' }),
  req({ path: '/cart', siteUrl: '' }),
];
const decisions = SAMPLE.map((r) => decideErrorHandoff(r));
check(
  'هر تصمیم یکی از حالت‌های بسته است',
  decisions.every((d) => KINDS.includes(d.kind)),
  decisions.map((d) => d.kind).join(','),
);
check(
  'هر تصمیم دلیلِ نوشته‌شده دارد',
  decisions.every((d) => typeof d.why === 'string' && d.why.trim().length > 10),
  decisions.map((d) => (d.why || '').length).join(','),
);
check(
  'تنها حالتِ ۳۰۲ می‌تواند مقصد بسازد',
  decisions.every((d) => (d.kind === 'storefront' ? d.status === 302 && !!d.target : !d.target)),
  decisions.map((d) => `${d.kind}:${d.target || '—'}`).join(' '),
);

// ------------------------------------------------------------
// ۷) سورسِ سرور: همین قاعده پرسیده می‌شود و صفحه‌ی دومی ساخته نمی‌شود
// ------------------------------------------------------------
const server = fs.readFileSync(SERVER, 'utf8');

const i404 = server.indexOf('// 404 — کدِ ۴۰۴ِ واقعی');
const iErr = server.indexOf('// ---------- مدیریت خطای سراسری ----------');
const iUnhandled = server.indexOf("process.on('unhandledRejection'");
check(
  'مرزِ هندلرهای خطا در server.js پیدا شد',
  i404 !== -1 && iErr !== -1 && iUnhandled !== -1 && i404 < iErr && iErr < iUnhandled,
  `404=${i404} error=${iErr} process=${iUnhandled}`,
);
const region404 = i404 === -1 ? '' : server.slice(i404, iErr === -1 ? undefined : iErr);
const regionErr = iErr === -1 || iUnhandled === -1 ? '' : server.slice(iErr, iUnhandled);

check(
  'server.js قاعده‌ی خطا را از lib/error-handoff می‌گیرد (پیاده‌سازیِ دوم نه)',
  /require\('\.\/lib\/error-handoff'\)/.test(server),
  /require\('\.\/lib\/error-handoff'\)/.test(server)
    ? 'وارد شده'
    : 'واردکردنِ ماژول پیدا نشد — قاعده دوباره داخلِ server.js پیاده شده؟',
);
check(
  'هر دو هندلرِ خطا (۴۰۴ و ۵۰۰) از همان تصمیم استفاده می‌کنند',
  region404.includes('errorHandoff(req)') && regionErr.includes('errorHandoff(req)'),
  region404.includes('errorHandoff(req)') && regionErr.includes('errorHandoff(req)')
    ? 'هر دو'
    : `404=${region404.includes('errorHandoff(req)')} 500=${regionErr.includes('errorHandoff(req)')}`,
);
check(
  'شاخه‌ی ۳۰۲ در هر دو هندلر از status/target تصمیم می‌آید',
  region404.includes('redirect(handoff.status, handoff.target)') &&
    regionErr.includes('redirect(handoff.status, handoff.target)'),
  region404.includes('redirect(handoff.status, handoff.target)') &&
    regionErr.includes('redirect(handoff.status, handoff.target)')
    ? 'هر دو'
    : 'redirect با مقدارِ ثابت پیدا شد — status باید از همان تصمیم بیاید',
);
check(
  'هیچ HTMLی برای خطا در server.js ساخته نمی‌شود (صفحه‌ی دوم = واگرایی)',
  !/text\/html/.test(region404) && !/text\/html/.test(regionErr),
  /text\/html/.test(region404) || /text\/html/.test(regionErr)
    ? 'text/html در هندلرهای خطا پیدا شد'
    : 'فقط JSON و متنِ ساده',
);
check(
  'پاسخِ کمینه هم کدِ خطای درست را نگه می‌دارد (۴۰۴ و ۵۰۰)',
  /status\(404\)\.type\('text\/plain/.test(region404) &&
    /status\(500\)\.type\('text\/plain/.test(regionErr),
  /status\(404\)\.type\('text\/plain/.test(region404) &&
    /status\(500\)\.type\('text\/plain/.test(regionErr)
    ? '۴۰۴ و ۵۰۰'
    : 'کدِ خطا از پاسخِ متنی افتاده',
);

// ------------------------------------------------------------
console.log(`\n${failures.length === 0 ? 'SUCCESS' : 'FAILURE'}: ${pass} بررسی گذشت، ${failures.length} ناموفق`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
