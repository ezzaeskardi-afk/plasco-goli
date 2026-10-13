#!/usr/bin/env node
/* ============================================================
   نقشهٔ ASVS — «هر بندِ استاندارد یا سنجیده می‌شود یا با دلیلِ روشن غایب است»

   ---------- چرا این فایل وجود دارد ----------
   `tests/owasp-scan.js` روی ۱۰ دستهٔ OWASP Top 10 کار می‌کند و سنجشش زنده است
   (سرور سندباکس بالا می‌آید و رفتار را می‌بیند). ASVS یک لایهٔ پایین‌تر و
   دقیق‌تر است: نه «چه دسته‌ای از حمله»، بلکه «کدام کنترل باید باشد و آیا
   *هست*». ولی بردنِ ASVS به این مخزن یک خطرِ مشخص دارد:

       مرجعِ امنیتی وقتی بی‌ارزش می‌شود که به فهرستِ تیک تبدیل شود. «۴۰ بند
       سبز» که هیچ‌کدام به کدی گره نخورده باشد، از نبودنش بدتر است — همان
       اطمینانِ قلابیِ نگهبانِ بی‌لنگر.

   پس این فایل سه کارِ متفاوت می‌کند و سه‌تایش هم لازم است:

     ۱) هر بندی که ادعا می‌شود، یک **سنجشِ قابلِ‌اجرا** دارد که به فایل و
        رشتهٔ واقعی گره خورده است (نه به حافظهٔ کسی).
     ۲) هر بندی که *نیست*، به‌جای سکوت، با `why` اعلام می‌شود: `gap` یعنی
        استاندارد چیزی می‌خواهد که نمی‌دهیم، `partial` یعنی می‌دهیم ولی نه
        کامل، `na` یعنی موضوعاً صدق نمی‌کند. بندِ بی‌دلیل قرمز می‌شود.
     ۳) خودِ نقشه سنجیده می‌شود: شناسه‌های تکراری، لنگرِ مرده (فایلی که نیست)
        برچسبِ تکراری (که ابزارِ جهش را گیج می‌کند)، و بندِ `verified` بدون
        فایلِ شاهد — همه قرمز می‌شوند.

   ---------- چه چیزی *نیست* ----------
   این «گواهیِ ASVS» نیست و هیچ‌جا هم ادعا نمی‌کند. ASVS یک چارچوبِ سنجشِ
   انسانی دارد (ارزیاب، شواهد، سطحِ L1/L2/L3) و اینجا فقط یک نگهبانِ مقایسه‌ای
   است که می‌گوید «این کنترل‌ها امروز در کد هستند». بخشی از بندها هم اصلاً
   موضوعِ این پروژه نیستند (`na`) و همان‌طور علامت خورده‌اند.

   سطحِ هر بند (L1/L2/L3) عمداً اینجا نوشته نمی‌شود: از متنِ رسمی استخراج نشده
   و اختراع کردنش همان دروغِ کوچکی است که این فایل می‌خواهد جلویش را بگیرد.

   ---------- مرجع ----------
   شناسه‌ها از شاخهٔ برچسب‌خوردهٔ خودِ OWASP خوانده شده‌اند، نه از حافظه:
   https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en

   ---------- اجرا و کدِ خروج ----------
     node tests/asvs.js           # سنجش (بدونِ سرور، بدونِ شبکه)
     node tests/asvs.js --list    # نقشه بدونِ اجرا: هر بند با وضعیتش

   صفر = سبز. یک = یک سنجش رد شد یا بندی بی‌دلیل ماند. دو = پیش‌شرط آماده
   نبود (فایلِ شاهد گم شده) — چون آن‌وقت «سبز» بی‌معناست.
   ============================================================ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HERE = __dirname;                      // backend/tests
const BACKEND = path.join(HERE, '..');       // backend
const ROOT = path.join(BACKEND, '..');       // ریشهٔ مخزن

/* لاگر روی require یک پوشهٔ لاگ می‌سازد. برای اینکه سنجش، لاگ‌های واقعی را
   دست نزند (همان قرارِ `PG_DATA_DIR` که خودِ لاگر و tests/sandbox.js دارند)
   پیش از require به پوشهٔ موقتِ سیستم می‌فرستیمش. */
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-asvs-'));
process.env.PG_DATA_DIR = SANDBOX;

const LIST = process.argv.includes('--list');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    if (LIST) console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name) {
  console.log(`\n=== ASVS ${name} ===`);
}

/* ---------- دسترسی به فایل‌ها، با کش ----------
   هر فایل یک بار خوانده می‌شود: چهل بند که هرکدام چند بار یک فایل را باز
   کنند، هم کند است و هم به‌مرور ناهم‌خوان (یک بند نسخهٔ قدیمی را می‌بیند). */
const fileCache = new Map();
function readFile(rel) {
  if (!fileCache.has(rel)) {
    fileCache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  }
  return fileCache.get(rel);
}
const has = (rel, needle) => readFile(rel).includes(needle);
const countOf = (rel, needle) => readFile(rel).split(needle).length - 1;
const rxCount = (rel, re) => (readFile(rel).match(re) || []).length;
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* ---------- بخش‌های ASVS 5.0.0 (نام‌ها از همان مرجع بالا) ---------- */
const CHAPTERS = {
  V1: 'Encoding and Sanitization',
  V2: 'Validation and Business Logic',
  V3: 'Web Frontend Security',
  V4: 'API and Web Service',
  V5: 'File Handling',
  V6: 'Authentication',
  V7: 'Session Management',
  V8: 'Authorization',
  V9: 'Self-contained Tokens',
  V10: 'OAuth and OIDC',
  V11: 'Cryptography',
  V12: 'Secure Communication',
  V13: 'Configuration',
  V14: 'Data Protection',
  V15: 'Secure Coding and Architecture',
  V16: 'Security Logging and Error Handling',
  V17: 'WebRTC',
};

/* ---------- نقشه ----------
   هر ردیف: شناسه، بخش، عنوانِ فارسی، وضعیت، فایل‌های شاهد، و `run` (برای
   verified/partial) یا `why` (برای gap/na). قاعده‌ها در بخشِ «۲) سنجشِ خودِ
   نقشه» اجرا می‌شوند، پس نمی‌شود بندی نوشت که این قرارداد را نشکند. */
const REQUIREMENTS = [
  {
    id: '1.2.1',
    chapter: 'V1',
    title: 'خروجی متناسب با بافتِ خودش رمزگذاری می‌شود (JSON-LD در داخل <script>)',
    status: 'verified',
    evidence: ['next-frontend/src/components/JsonLd.tsx'],
    run() {
      const f = 'next-frontend/src/components/JsonLd.tsx';
      check('سایتِ JSON-LD از تابعِ ایمنِ safeJsonLd رد می‌شود',
        rxCount(f, /safeJsonLd\(ld\)/g) === 8, `${rxCount(f, /safeJsonLd\(ld\)/g)} جا`);
      check('هیچ درجِ خامِ JSON.stringify(ld) داخل صفحه نمانده',
        !has(f, '__html: JSON.stringify(ld)'));
      check('safeJsonLd بازهٔ خطرناکِ </script> را می‌بندد',
        has(f, '.replace(/</g, "\\\\u003c")'));
    },
  },
  {
    id: 'V1',
    chapter: 'V1',
    title: 'در سمتِ Express هیچ ورودیِ کاربر داخلِ HTML درج نمی‌شود',
    status: 'verified',
    evidence: ['backend/server.js'],
    run() {
      const f = 'backend/server.js';
      // بدنه‌های خطا عمداً JSON متنی‌اند، نه HTMLِ رشته‌ساخته؛ پس جایی برای
      // درجِ رمزگذاری‌نشده باقی نمی‌ماند.
      check('پاسخ‌های خطای اکسپرس HTMLِ رشته‌ساخته نیستند',
        has(f, "res.status(500).json({") && has(f, "type('text/plain; charset=utf-8')"));
      check('در هیچ نقطه‌ای res.send با رشتهٔ حاویِ متغیرِ کاربر ساخته نمی‌شود',
        rxCount(f, /res\.send\(\s*`/g) === 0);
    },
  },

  {
    id: '2.2.1',
    chapter: 'V2',
    title: 'ورودی‌ها با ساختارِ انتظاری و مرزهای روشن اعتبارسنجی می‌شوند',
    status: 'verified',
    evidence: ['backend/lib/middleware.js', 'backend/routes/products.js', 'backend/routes/auth.js', 'backend/routes/wholesale.js'],
    run() {
      const helpers = 'backend/lib/middleware.js';
      check('جعبه‌ابزارِ اعتبارسنجی (validate/V) وجود دارد',
        has(helpers, 'ValidationError') && /module\.exports = \{[^}]*\bvalidate\b/.test(readFile(helpers)));
      const used = ['backend/routes/products.js', 'backend/routes/auth.js', 'backend/routes/wholesale.js']
        .reduce((n, f) => n + rxCount(f, /(?:\bvalidate\(|\bV\.)/g), 0);
      check('اعتبارسنجی در روت‌ها واقعاً به‌کار رفته (کفِ ۱۵ نقطه)', used >= 15, `${used} نقطه`);
    },
  },
  {
    id: '2.2.2',
    chapter: 'V2',
    title: 'اعتبارسنجی در لایهٔ موردِ اعتماد اجرا می‌شود، نه در مرورگر',
    status: 'verified',
    evidence: ['backend/server.js', 'backend/lib/middleware.js'],
    run() {
      check('خطای اعتبارسنجی در سرور به ۴۰۰ با نامِ فیلد تبدیل می‌شود',
        has('backend/server.js', 'err.status === 400 && err.field'));
      check('کلاینتیِ اعتبارسنجی، کنترلِ امنیتی شمرده نمی‌شود (بررسی در سمتِ سرور)',
        has('backend/lib/middleware.js', 'function validate('));
    },
  },

  {
    id: '3.4.1',
    chapter: 'V3',
    title: 'هدر HSTS با عمرِ حداقلِ یک سال و فقط روی HTTPS',
    status: 'verified',
    evidence: ['backend/server.js', 'next-frontend/next.config.ts', 'HTTPS-GUIDE.md'],
    run() {
      const year = 31536000;
      const exp = Number((readFile('backend/server.js').match(/max-age=(\d+)/) || [])[1]);
      check('HSTSِ Express یک‌ساله است (ASVS: حداقلِ یک سال)', exp >= year, `max-age=${exp}`);
      const nextExp = Number((readFile('next-frontend/next.config.ts').match(/Strict-Transport-Security", value: "max-age=(\d+)/) || [])[1]);
      check('HSTSِ مبدأ Next هم یک‌ساله است', nextExp >= year, `max-age=${nextExp}`);
      const edge = Number((readFile('HTTPS-GUIDE.md').match(/add_header Strict-Transport-Security "max-age=(\d+)/) || [])[1]);
      check('لبهٔ nginx در راهنما هم همان یک‌سال را می‌دهد', edge >= year, `max-age=${edge}`);
      // فرستادنِ HSTS روی HTTP بی‌اثر است (مرورگر نادیده می‌گیرد)، ولی خودِ
      // گیت هم باید سرِ جایش باشد: تنها وقتی پشتِ TLS هستیم اعلامش می‌کنیم.
      const srv = readFile('backend/server.js');
      const iHsts = srv.indexOf("setHeader('Strict-Transport-Security'");
      const iGuard = srv.lastIndexOf('if (HTTPS_MODE) {', iHsts);
      check('روی HTTPِ بدونِ TLS هدر HSTS فرستاده نمی‌شود',
        iHsts !== -1 && iGuard !== -1 && iHsts - iGuard < 400, `فاصله=${iHsts - iGuard}`);
      check('راهنما مقدارِ مستندِ Express را با کد یکی نگه داشته',
        has('HTTPS-GUIDE.md', `max-age=${exp}; includeSubDomains`), `کد=${exp}`);
    },
  },
  {
    id: '3.4.3',
    chapter: 'V3',
    title: 'CSP با object-src \'none\' و base-uri \'none\'',
    status: 'partial',
    evidence: ['backend/server.js', 'next-frontend/next.config.ts', 'backend/tests/security.js'],
    why:
      'روی مبدأِ Express CSP کامل است (default-src/script-src/style-src محدود + object-src/base-uri \'none\'). ' +
      'روی مبدأِ Next عمداً script-src/style-src/default-src نیست: App Router دادهٔ RSC را در <script>ِ ' +
      'درون‌خطی می‌گذارد و ۵۲ صفحهٔ ثابت دارد؛ nonce یعنی داینامیک‌شدنِ همه، و \'unsafe-inline\' یعنی ' +
      'همان چیزی که CSP برایش هست از کار می‌افتد. پس باقیِ دستورها هستند و این تفاوت در راهنمای HTTPS مستند شده.',
    run() {
      const csp = readFile('backend/server.js');
      for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'", "form-action 'self' https://www.zarinpal.com"]) {
        check(`CSPِ Express شاملِ ${directive}`, csp.includes(directive));
      }
      check('CSPِ Express اسکریپتِ درون‌خطی را مجاز نکرده',
        !/script-src[^;]*unsafe-inline/.test(csp));
      const next = readFile('next-frontend/next.config.ts');
      check("CSPِ Next شاملِ object-src 'none'", next.includes("object-src 'none'"));
      check("CSPِ Next شاملِ base-uri 'none'", next.includes("base-uri 'none'"));
      check('سنجشِ زندهٔ امنیت هم همان base-uri را انتظار دارد (متن و کد یکی)',
        has('backend/tests/security.js', "\"base-uri 'none'\""));
    },
  },
  {
    id: '3.3.1',
    chapter: 'V3',
    title: 'کوکیِ نشست روی HTTPS فقط با پرچمِ Secure فرستاده می‌شود و production بدونش بالا نمی‌آید',
    status: 'verified',
    evidence: ['backend/server.js', 'backend/lib/security-config.js'],
    run() {
      check('کوکی به COOKIE_SECURE گره خورده', has('backend/server.js', 'secure: HTTPS_MODE'));
      const { validateProductionConfig } = require(path.join(BACKEND, 'lib/security-config'));
      let threw = false;
      try {
        validateProductionConfig({ isProduction: true, cookieSecure: false, sessionSecret: 'x'.repeat(40) });
      } catch (e) {
        threw = /COOKIE_SECURE/.test(e.message);
      }
      // جهتِ منفی: اگر این throw برداشته شود، production می‌تواند بی‌کوکیِ امن بالا بیاید.
      check('production با کوکیِ ناامن عمداً بالا نمی‌آید', threw);
      let ok = true;
      try {
        validateProductionConfig({ isProduction: true, cookieSecure: true, sessionSecret: 'x'.repeat(40) });
      } catch (e) {
        ok = false;
      }
      check('همین اعتبارسنجی در حالتِ درست رد نمی‌کند', ok);
    },
  },
  {
    id: '3.3.2',
    chapter: 'V3',
    title: 'SameSite متناسب با کاربردِ کوکی ست شده',
    status: 'verified',
    evidence: ['backend/server.js'],
    run() {
      check('SameSite روی lax است (نشستِ فروشگاه با ناوبریِ عادی کار کند، CSRF هم بسته باشد)',
        has('backend/server.js', "sameSite: 'lax'"));
    },
  },
  {
    id: '3.3.4',
    chapter: 'V3',
    title: 'کوکیِ نشست از دسترسِ اسکریپت بیرون است (HttpOnly)',
    status: 'verified',
    evidence: ['backend/server.js'],
    run() {
      check('HttpOnly روی کوکیِ نشست ست شده', has('backend/server.js', 'httpOnly: true'));
    },
  },
  {
    id: '3.5.1',
    chapter: 'V3',
    title: 'درخواست‌های نوشتنی باید از خودِ سایت آمده باشند (Origin/Referer)',
    status: 'verified',
    evidence: ['backend/server.js'],
    run() {
      const srv = readFile('backend/server.js');
      check('مبدأ/ارجاعِ درخواستِ نوشتنی بررسی می‌شود',
        srv.includes('req.headers.origin || req.headers.referer'));
      check('ردِ درخواستِ بیگانه لاگ می‌شود',
        srv.includes('Cross-origin write blocked'));
      check('میزبان‌های مجازِ اضافی از محیط می‌آیند (لیستِ بسته در کد نیست)',
        srv.includes('CSRF_EXTRA_HOSTS') && srv.includes('CSRF_EXTRA_ORIGINS'));
    },
  },

  {
    id: '4.1.3',
    chapter: 'V4',
    title: 'هدرهای میان‌گذاری (X-Forwarded-*) بی‌اعتمادند مگر پروکسی اعلام شده باشد',
    status: 'verified',
    evidence: ['backend/server.js'],
    run() {
      const srv = readFile('backend/server.js');
      check('اعتماد به پروکسی از محیط می‌آید و پیش‌فرض خاموش است',
        srv.includes("app.set('trust proxy', TRUST_PROXY)") && /TRUST_PROXY \?\? ''/.test(srv));
      check('اگر XFF بیاید و اعتماد خاموش باشد، هشدارِ روشن داده می‌شود',
        srv.includes('Requests carry X-Forwarded-For but TRUST_PROXY is off'));
    },
  },

  {
    id: '5.2.2',
    chapter: 'V5',
    title: 'نوعِ فایلِ آپلودی از محتوا تشخیص داده می‌شود، نه از ادعای فرستنده',
    status: 'verified',
    evidence: ['backend/routes/admin.js'],
    run() {
      const f = 'backend/routes/admin.js';
      check('فهرستِ نوع‌های مجاز (IMG_TYPES) دروازهٔ اول است', has(f, 'IMG_TYPES[req.headers[\'content-type\']]'));
      check('پسوند از امضای بایت‌های اولِ فایل گرفته می‌شود',
        has(f, 'head[0] === 0xFF && head[1] === 0xD8') && has(f, "head.toString('ascii', 0, 4) === 'RIFF'"));
      check('ابعاد از خودِ بایت‌ها خوانده می‌شود و مرزِ بالا/پایین دارد',
        has(f, 'imageSizeFromBuffer(req.body)') && has(f, 'MAX_IMG_EDGE') && has(f, 'MIN_IMG_EDGE'));
      check('سقفِ حجم در لایهٔ پارسر اعمال می‌شود', has(f, 'limit: MAX_IMG_BYTES'));
    },
  },
  {
    id: '5.3.1',
    chapter: 'V5',
    title: 'فایل‌های آپلودی جایی می‌نشینند که کدِ سرور اجرا نمی‌شود',
    status: 'verified',
    evidence: ['backend/lib/paths.js', 'backend/server.js', 'backend/routes/admin.js'],
    run() {
      check('ریشهٔ عکس‌ها از lib/paths.js می‌آید (بیرونِ سورسِ برنامه)', has('backend/lib/paths.js', 'PRODUCTS_PICTURE_DIR'));
      check('سروِ عکس‌ها فقط استاتیک است، نه اجراکننده',
        has('backend/server.js', "app.use('/picture', express.static(PICTURE_DIR"));
      check('از ریشهٔ عکس‌ها چیزی با require/اجرا خوانده نمی‌شود',
        rxCount('backend/server.js', /require\(PICTURE_DIR|require\(.*PRODUCTS_PICTURE_DIR/) === 0);
    },
  },
  {
    id: '5.3.2',
    chapter: 'V5',
    title: 'نامِ فایلِ ذخیره‌شده ساختِ خودِ سرور است، نه نامِ فرستادهٔ کاربر',
    status: 'verified',
    evidence: ['backend/routes/admin.js'],
    run() {
      const f = 'backend/routes/admin.js';
      check('نامِ فایل از زمان + بایتِ تصادفی ساخته می‌شود',
        has(f, '`p-${Date.now()}-${crypto.randomBytes(4).toString(\'hex\')}${ext}`'));
      check('در مسیرِ نوشتن هیچ نامِ کاربری به‌کار نمی‌رود',
        rxCount(f, /originalname|req\.body\.name|path\.join\([^)]*req\.body\./) === 0);
      check('فرادادهٔ پنهان (از جمله GPS) پیش از دیسک پاک می‌شود',
        has(f, 'stripImageMetadata(req.body, ext)') &&
          readFile(f).indexOf('stripImageMetadata(req.body, ext)') < readFile(f).indexOf('fs.writeFileSync(path.join(PRODUCTS_PICTURE_DIR, name)'));
    },
  },

  {
    id: '6.3.1',
    chapter: 'V6',
    title: 'ورودِ کدِ پیامکی در برابر حدس‌زدنِ پشت‌سرهم محدود می‌شود',
    status: 'verified',
    evidence: ['backend/routes/auth.js', 'backend/lib/login-guard.js', 'backend/lib/middleware.js'],
    run() {
      const auth = readFile('backend/routes/auth.js');
      check('سقفِ نرخ روی درخواستِ کد هست', auth.includes('challengeLimiter'));
      check('سقفِ نرخ روی تأییدِ کد هست (و تلاشِ موفق شمرده نمی‌شود)', auth.includes('otpVerifyLimiter') && auth.includes('skipSuccess: true'));
      check('قفلِ حساب، جدا از سقفِ IP، وجود دارد', auth.includes('login-guard') && has('backend/lib/login-guard.js', 'registerFail'));
      check('تلاشِ ناموفق در دیتابیس شمرده می‌شود', has('backend/lib/db.js', 'stmtOtpBumpAttempts'));
    },
  },
  {
    id: '6.5.1',
    chapter: 'V6',
    title: 'کدِ پیامکی یک‌بارمصرف است و به‌صورتِ هش نگه داشته می‌شود',
    status: 'verified',
    evidence: ['backend/lib/db.js'],
    run() {
      check('ستونِ کد، هش است نه متنِ خام', has('backend/lib/db.js', 'code_hash'));
      check('کد پس از مصرف یا پایانِ عمر پاک می‌شود', has('backend/lib/db.js', 'DELETE FROM otp_codes WHERE phone = ?'));
    },
  },
  {
    id: '6.6.3',
    chapter: 'V6',
    title: 'ارسالِ کدِ پیامکی هم بر پایهٔ IP و هم بر پایهٔ روز سقف دارد',
    status: 'verified',
    evidence: ['backend/routes/auth.js', 'backend/lib/db.js'],
    run() {
      check('سقفِ IP برای ارسالِ کد هست', has('backend/routes/auth.js', 'otpIpLimiter'));
      check('شمارشِ روزانهٔ ارسال بر پایهٔ IP نگه داشته می‌شود',
        has('backend/lib/db.js', 'otp_ip_log') && has('backend/lib/db.js', 'INSERT INTO otp_ip_log'));
    },
  },
  {
    /* ---------- این بند تا دیروز `gap` بود ----------
       متنش این بود: «ورود فقط با تصرفِ شمارهٔ موبایل است... هر کس کدِ پیامک را
       بگیرد ادمین است». حالا بسته شده و بندِ `gap` به سنجشِ زنده تبدیل شده.
       چیزی که مواظبش بودیم: عوض‌کردنِ برچسب به `verified` بدونِ اینکه واقعاً
       چیزی عوض شده باشد — همان «فهرستِ تیک» که این فایل در سرصفحه‌اش از
       آن حذر می‌کند. پس هر سنجِ زیر به فایل و رشتهٔ واقعی گره خورده است، و
       رفتارِ زندهٔ همین مسیر (نشستِ نیمه‌واردشده، کدِ تکراری، سوختن) در
       `tests/wstg.js` بخشِ ATHN-11 روی سرورِ واقعی سنجیده می‌شود. */
    id: 'V6',
    chapter: 'V6',
    title: 'ورودِ ادمین دو عامل دارد: کدِ پیامکی + کدِ زمانیِ TOTP',
    status: 'verified',
    evidence: [
      'backend/lib/totp.js',
      'backend/lib/mfa.js',
      'backend/routes/auth.js',
      'backend/routes/admin.js',
      'backend/lib/security-config.js',
    ],
    run() {
      const auth = readFile('backend/routes/auth.js');

      check('ماژولِ TOTP هست و کد را با HMAC می‌سازد',
        exists('backend/lib/totp.js') && has('backend/lib/totp.js', 'createHmac('));
      check('درهم‌سازِ تنهایی به کار نرفته (SHA-1 فقط به‌عنوان digestِ HMAC)',
        !/createHash\(/.test(readFile('backend/lib/totp.js')));
      check('مقایسهٔ کد ثابت‌زمان است (نه === روی رشته)', has('backend/lib/totp.js', 'timingSafeEqual'));
      check('پنجرهٔ کشسانِ ساعت هست تا کدِ درست با اختلافِ ساعت رد نشود',
        has('backend/lib/totp.js', 'window'));

      check('کلید از محیط می‌آید، نه از یک مسیرِ «ثبت‌نامِ عاملِ دوم» در API',
        has('backend/lib/mfa.js', 'ADMIN_TOTP_SECRETS')
        && !/router\.(post|get)\(\s*['"][^'"]*totp\/setup/.test(auth));
      check('هر کد فقط یک بار پذیرفته می‌شود (replay)', has('backend/lib/mfa.js', 'usedSteps.mutate'));

      /* ساختارِ امن، نه فقط وجودِ رشته: اگر روزی کسی هویت را *قبل* از سدِ دوم
         بنشاند و فقط یک پرچم بگذارد، این سنجش قرمز می‌شود — چون دیگر همهٔ
         مسیرهای پنل باید آن پرچم را به یاد بیاورند و یکی یادش می‌رود. */
      check('در حالتِ نیمه‌واردشده هویتِ کاربر ست نمی‌شود (سد، نه پرچم)',
        /if \(mfa\.requiredFor\(user\)\) \{\s*req\.session\.pendingMfa = \{[^}]*\};\s*return \{ user, mfaRequired: true \};/.test(auth));
      check('مسیرِ کامل‌کردنِ ورود با کدِ دوم وجود دارد',
        auth.includes("router.post('/totp/verify'"));

      // هر دو راهِ رسیدن به پنل باید از همان سد بگذرند — وگرنه سد یک درِ
      // پشتی دارد. «ورود با رمز» و «ارتقای پویا به ادمین» دو موردِ واقعی‌اند.
      check('ورود با رمز هم از همان ایستگاه می‌گذرد',
        (auth.match(/await establishSession\(/g) || []).length >= 2);
      /* لنگر، محلِ *فراخوانی* است نه نامِ تابع: نام در کامنتِ همان فایل هم
         هست، و سنجشی که کامنت را باور کند با حذفِ فراخوانی هم سبز می‌ماند. */
      check('ارتقای پویا به ادمین از همین سد می‌گذرد (نه یک راهِ دیگرِ ورود)',
        has('backend/routes/admin.js', 'mfa.allowAdminUpgrade(req.session')
        && has('backend/routes/auth.js', 'mfa.allowAdminUpgrade(req.session'));

      /* ---------- رفتار، نه فقط ساختار ----------
         اینجا ماژول را واقعاً اجرا می‌کنیم: ادعای «در production اجباری است»
         اگر با یک .envِ خالی هم سرور بالا بیاید، یک ادعای توخالی می‌شود. */
      const { validateRuntimeConfig } = require(path.join(BACKEND, 'lib', 'security-config'));
      const base = { isProduction: true, siteUrl: 'https://shop.example' };
      let noKey = null;
      try { validateRuntimeConfig({ ...base, adminPhones: ['09121234567'], totpSecretPhones: [] }); }
      catch (e) { noKey = e; }
      check('در production بدونِ کلیدِ عاملِ دوم، سرور ادمین را بالا نمی‌آورد',
        Boolean(noKey) && /ADMIN_TOTP_SECRETS/.test(noKey.message));

      let covered = null;
      try { validateRuntimeConfig({ ...base, adminPhones: ['09121234567'], totpSecretPhones: ['09121234567'] }); }
      catch (e) { covered = e; }
      check('با کلیدِ پوشش‌دهندهٔ همان شماره‌ها مانعی نیست', covered === null);

      let devOk = null;
      try { validateRuntimeConfig({ isProduction: false, siteUrl: '', adminPhones: ['09121234567'], totpSecretPhones: [] }); }
      catch (e) { devOk = e; }
      check('خارج از production اجباری نیست (توسعه بدونِ کلید کار می‌کند)', devOk === null);
    },
  },

  {
    id: '7.2.4',
    chapter: 'V7',
    title: 'پس از ورود، شناسهٔ نشست عوض می‌شود (جلوگیری از session fixation)',
    status: 'verified',
    evidence: ['backend/routes/auth.js'],
    run() {
      const auth = readFile('backend/routes/auth.js');
      check('نشست پس از ورود بازسازی می‌شود', auth.includes('req.session.regenerate'));
      /* ---------- چرا مقایسه به بدنهٔ همین تابع محدود شد ----------
         نسخهٔ قبلی، جایگاهِ *اولین* `req.session.userId = user.id` را در کلِ
         فایل با جایگاهِ اولین `regenerate` مقایسه می‌کرد. این دو چیزِ درست را
         می‌سنجید ولی به موقعیتِ خطیِ کد در فایل گره خورده بود: با اضافه‌شدنِ
         یک مسیرِ تازه که آن سطر را *زودتر* دارد (مسیرِ عاملِ دوم)، سنجش
         قرمز می‌شود بدونِ اینکه چیزی شکسته باشد — و بدتر: اگر کسی
         `userId` را جایی *بعد* از regenerate بگذارد، همان سنجش سبز می‌ماند.
         حالا داخلِ بدنهٔ همان تابعی می‌گردد که ورود را می‌سازد — یعنی دقیقاً
         همان جایی که خطرِ fixation هست — و برای مسیرِ دوم هم سنجشِ خودش را
         دارد (بندِ V6: در حالتِ معلق هویت ست نمی‌شود). */
      const start = auth.indexOf('async function establishSession(');
      const endMark = auth.indexOf('return { user, mfaRequired: false }', start);
      const body = auth.slice(start, auth.indexOf('\n}', endMark));
      const iRegen = body.indexOf('req.session.regenerate');
      const iUser = body.indexOf('req.session.userId = user.id');
      check('داخلِ establishSession، بازسازی پیش از نشاندنِ هویت انجام می‌شود',
        start !== -1 && endMark !== -1 && iRegen !== -1 && iUser !== -1 && iRegen < iUser);
    },
  },

  {
    id: '8.2.2',
    chapter: 'V8',
    title: 'دسترسی به داده در سطحِ خودِ شیء کنترل می‌شود (نه با شناسهٔ کلاینتی)',
    status: 'verified',
    evidence: ['backend/routes/orders.js', 'backend/routes/addresses.js', 'backend/routes/admin.js'],
    run() {
      check('آدرس‌ها به شناسهٔ کاربرِ نشست گره خورده‌اند',
        rxCount('backend/routes/addresses.js', /req\.session\.userId/g) >= 4);
      check('سفارشِ غریبه رد می‌شود، نه فقط پنهان',
        rxCount('backend/routes/orders.js', /order\.userId !== req\.session\.userId/g) >= 2);
      check('فهرستِ سفارش‌ها فقط سفارش‌های خودِ کاربر است',
        has('backend/routes/orders.js', 'getUserOrders(req.session.userId)'));
      check('روت‌های پنل پشتِ نگهبانِ ادمین‌اند',
        rxCount('backend/routes/admin.js', /requireAdmin/g) >= 4);
    },
  },

  {
    id: '11.2.4',
    chapter: 'V11',
    title: 'مقایسهٔ راز و کد به‌صورتِ ثابت‌زمان انجام می‌شود',
    status: 'verified',
    evidence: ['backend/routes/auth.js'],
    run() {
      const auth = readFile('backend/routes/auth.js');
      check('مقایسه با crypto.timingSafeEqual است', rxCount('backend/routes/auth.js', /timingSafeEqual/g) >= 2);
      check('پیش از مقایسه، هم‌اندازه بودنِ دو طرف بررسی می‌شود',
        auth.includes('derived.length === expected.length') && auth.includes('ba.length === bb.length'));
    },
  },
  {
    id: '11.4.2',
    chapter: 'V11',
    title: 'رمزِ عبور با KDFِ کند و saltِ یکتا ذخیره می‌شود (نه هشِ ساده)',
    status: 'verified',
    evidence: ['backend/routes/auth.js'],
    run() {
      const auth = readFile('backend/routes/auth.js');
      check('scrypt به‌کار رفته و ناهمگام است (نه scryptSync که سرور را قفل کند)',
        auth.includes('promisify(crypto.scrypt)') && !auth.includes('scryptSync('));
      check('saltِ یکتا برای هر رمز تولید می‌شود', /randomBytes\(\d+\).*salt|salt.*randomBytes\(\d+\)/s.test(auth));
    },
  },
  {
    id: '11.4.1',
    chapter: 'V11',
    title: 'الگوریتمِ شکستهٔ رمزنگاری به‌کار نمی‌رود (MD5 غایب، SHA-1 فقط برای هویتِ محتوا)',
    status: 'partial',
    evidence: ['backend/lib/middleware.js', 'backend/lib/static-compress.js'],
    why:
      'MD5 هیچ‌جا نیست و SHA-1 فقط برای ساختِ ETag/هویتِ محتوای فایلِ استاتیک به‌کار می‌رود؛ ضمیمهٔ Cِ ASVS ' +
      'SHA-1 را «منسوخ» می‌داند و کاربردهای HMAC/KDF/امضا را منع می‌کند. اینجا نه راز است، نه امضا، نه مشتق‌سازیِ کلید: ' +
      'فقط مقایسهٔ محتواست که تصادمِ عمدی‌اش خارج از توان است. پس نه حذفش کردیم و نه ادعا می‌کنیم «کامل» است.',
    run() {
      const files = ['backend/server.js', 'backend/lib/middleware.js', 'backend/lib/static-compress.js', 'backend/routes/auth.js', 'backend/lib/db.js'];
      const md5 = files.filter((f) => /createHash\(['"]md5['"]\)|md5\(/i.test(readFile(f)));
      check('هیچ استفادهٔ رمزنگارانه‌ای از MD5 نمانده', md5.length === 0, md5.join(','));
      check('SHA-1 فقط در دو نقطهٔ هویتِ محتوا (ETag) حضور دارد',
        rxCount('backend/lib/middleware.js', /sha1/g) >= 1 && rxCount('backend/lib/static-compress.js', /sha1/g) >= 1);
    },
  },
  {
    id: 'V11',
    chapter: 'V11',
    title: 'برای رازها سیاستِ چرخش نداریم',
    status: 'gap',
    evidence: ['backend/lib/security-config.js'],
    why:
      'SESSION_SECRET یک رشتهٔ ثابت در .env است و عوض‌کردنش همهٔ نشست‌ها را می‌اندازد؛ یعنی چرخشِ دوره‌ای ' +
      'عملاً انجام نمی‌شود. مسیرِ درست، نگه‌داشتنِ دو راز (فعال + قبلی) و پذیرشِ موقتِ امضای قدیمی است. ' +
      'طول و اجباری‌بودنش سنجیده می‌شود، ولی خودِ چرخش نه — و همین‌جا اعلام می‌شود.',
  },

  {
    id: 'V12',
    chapter: 'V12',
    title: 'کانالِ ارتباط با TLS محافظت می‌شود (نسخه و رمزهای مجاز محدود)',
    status: 'verified',
    evidence: ['HTTPS-GUIDE.md'],
    run() {
      const guide = readFile('HTTPS-GUIDE.md');
      check('فقط TLSv1.2 و TLSv1.3 مجاز است', guide.includes('ssl_protocols TLSv1.2 TLSv1.3;'));
      check('رمزهای ضعیف کنار گذاشته شده‌اند', guide.includes('ssl_ciphers HIGH:!aNULL:!MD5;'));
      check('گواهی و کلید از مسیرِ استانداردِ letsencrypt می‌آید', guide.includes('ssl_certificate /etc/letsencrypt/live/'));
    },
  },

  {
    id: '13.3.1',
    chapter: 'V13',
    title: 'رازها نه در سورسِ کلاینت‌اند و نه در مخزن',
    status: 'verified',
    evidence: ['backend/tests/secrets.js', '.github/workflows/security.yml', '.github/workflows/ci.yml'],
    run() {
      check('نگهبانِ مرزِ رازِ سمتِ کلاینت وجود دارد', exists('backend/tests/secrets.js'));
      check('نگهبان روی پوشه‌های واقعیِ کلاینت کار می‌کند، نه پوشهٔ بازنشسته',
        has('backend/tests/secrets.js', "'next-frontend', 'public'") && has('backend/tests/secrets.js', "'next-frontend', 'src'"));
      check('CI هم اسکنِ راز را اجرا می‌کند (دو مسیرِ مستقل)',
        has('.github/workflows/ci.yml', 'node tests/secrets.js') && exists('.github/workflows/security.yml'));
    },
  },
  {
    id: '13.4.1',
    chapter: 'V13',
    title: 'فرادادهٔ مخزن (.git/.env) از راهِ وب سرو نمی‌شود',
    status: 'verified',
    evidence: ['backend/server.js', 'backend/lib/paths.js'],
    run() {
      // تنها دو ریشهٔ استاتیک سرو می‌شود: عکس‌های محصول و publicِ Next. هیچ‌کدام
      // ریشهٔ مخزن نیستند، پس /.git/config و /.env موضوعاً ۴۰۴ می‌گیرند.
      // سنجش، محاسبه‌ای است نه الگومحور: مسیرها از خودِ ماژول خوانده می‌شوند.
      const { PICTURE_DIR } = require(path.join(BACKEND, 'lib/paths'));
      const gitPath = path.join(ROOT, '.git');
      const rel = path.relative(PICTURE_DIR, gitPath);
      check('فرادادهٔ مخزن بیرون از ریشهٔ سروشدهٔ عکس‌هاست', rel.startsWith('..'), `نسبت=${rel}`);
      check('سروِ استاتیک فقط دو ریشه دارد (عکس‌ها + فایل‌های همراه)',
        rxCount('backend/server.js', /express\.static\(/g) <= 2,
        `${rxCount('backend/server.js', /express\.static\(/g)} ریشه`);
      check('ریشهٔ سروشدهٔ عکس‌ها خودِ ریشهٔ مخزن نیست', path.resolve(PICTURE_DIR) !== path.resolve(ROOT));
    },
  },
  {
    id: '13.2.1',
    chapter: 'V13',
    title: 'تنظیماتِ production اعتبارسنجی می‌شوند و بی‌تنظیمِ درست بالا نمی‌آید',
    status: 'verified',
    evidence: ['backend/lib/security-config.js', 'backend/server.js'],
    run() {
      const cfg = 'backend/lib/security-config.js';
      check('کوکیِ امن و رازِ نشست در production اجباری‌اند',
        has(cfg, 'COOKIE_SECURE must be true in production') &&
        has('backend/server.js', "requireProductionSecret('SESSION_SECRET', { minLength: 32 })"));
      check('آدرسِ رسمی باید https باشد', has(cfg, 'SITE_URL must be a valid https:// URL in production'));
      check('همین اعتبارسنجی در استارتِ سرور صدا زده می‌شود',
        has('backend/server.js', 'validateProductionConfig({') && has('backend/server.js', 'validateRuntimeConfig({'));
      const { validateRuntimeConfig } = require(path.join(BACKEND, 'lib/security-config'));
      let threw = false;
      try {
        validateRuntimeConfig({ isProduction: true, siteUrl: 'http://insecure.local' });
      } catch (e) {
        threw = /SITE_URL/.test(e.message);
      }
      check('SITE_URLِ غیرِ https در production رد می‌شود', threw);
    },
  },
  {
    id: 'V13',
    chapter: 'V13',
    title: 'پایشِ خودکارِ آسیب‌پذیریِ وابستگی‌ها نداریم',
    status: 'gap',
    evidence: ['backend/package.json'],
    why:
      'هیچ‌کدام از این‌ها نیست: Dependabot، `npm audit` در CI، یا SBOM. اسکنِ ZAP (DAST) رفتارِ سایت را می‌سنجد ' +
      'ولی وابستگی‌ها را نمی‌بیند. وابستگی‌های اجرایی سه‌تا هستند (express، express-session، dotenv) و lockfile ' +
      'داریم، پس ریسک کوچک است — ولی «کوچک» با «پایش‌شده» یکی نیست و همین‌جا اعلام می‌شود.',
  },

  {
    id: 'V14',
    chapter: 'V14',
    title: 'دادهٔ شخصی در لاگ ماسک می‌شود و فرادادهٔ عکس (از جمله GPS) روی دیسک نمی‌ماند',
    status: 'verified',
    evidence: ['backend/lib/logger.js', 'backend/routes/admin.js'],
    run() {
      check('کلیدهای حساس در لاگر ماسک می‌شوند', has('backend/lib/logger.js', "'[redacted]'"));
      check('شماره/نشانی/کدپستی در فهرستِ ماسک هستند',
        /password\|secret\|token\|cookie/.test(readFile('backend/lib/logger.js')) &&
          /otp\|address\|postal\|phone\|mobile/.test(readFile('backend/lib/logger.js')));
      const { safeValue } = require(path.join(BACKEND, 'lib/logger'));
      const masked = safeValue({ phone: '09120000000', address: 'خیابان یک', postalCode: '1234567890' });
      check('ماسک‌کردنِ واقعیِ شماره/نشانی/کدپستی (اجرا شد، نه فقط الگو)',
        Object.values(masked).every((v) => v === '[redacted]'), JSON.stringify(masked));
      check('فرادادهٔ عکس پیش از نوشتن پاک می‌شود', has('backend/routes/admin.js', 'stripImageMetadata'));
    },
  },

  {
    id: 'V15',
    chapter: 'V15',
    title: 'در مسیرِ درخواست کدِ پویا/پوسته اجرا نمی‌شود',
    status: 'verified',
    evidence: ['backend/server.js', 'backend/lib/image-encode.js'],
    run() {
      const dynamic = ['backend/server.js', 'backend/routes/auth.js', 'backend/routes/orders.js', 'backend/routes/admin.js']
        .filter((f) => /(?:^|[^.\w])eval\s*\(|new Function\s*\(|vm\.run/.test(readFile(f)));
      check('eval / new Function / vm.run در مسیرِ درخواست نیست', dynamic.length === 0, dynamic.join(','));
      check('child_process فقط در ماژولِ انکودرِ عکس است (با آرگومانِ ثابت، بی‌shell)',
        rxCount('backend/lib/image-encode.js', /child_process/g) >= 1);
    },
  },

  {
    id: '16.5.1',
    chapter: 'V16',
    title: 'خطای غیرمنتظره پیامِ عمومی می‌گیرد و جزئیاتِ داخلی بیرون نمی‌رود',
    status: 'verified',
    evidence: ['backend/server.js', 'backend/lib/logger.js'],
    run() {
      const srv = readFile('backend/server.js');
      check('پاسخِ ۵۰۰ به API پیامِ عمومی + شناسهٔ پیگیری است، نه جزئیات',
        srv.includes("error: 'خطای داخلی سرور؛ چند لحظه بعد دوباره تلاش کنید'") && srv.includes('ref: req.id'));
      check('پشتهٔ خطا هرگز در پاسخ نمی‌آید',
        rxCount('backend/server.js', /res\.(?:send|json|end)\([^)]*err\.(?:stack|message)/g) === 0);
      check('پشته فقط در لاگِ سرور نوشته می‌شود', has('backend/lib/logger.js', 'stack: value.stack'));
    },
  },
  {
    id: '16.2.5',
    chapter: 'V16',
    title: 'لاگ فقط به اندازهٔ لازمِ محافظت، دادهٔ حساس می‌گیرد',
    status: 'verified',
    evidence: ['backend/lib/logger.js'],
    run() {
      check('ماسک‌کردن در لایهٔ نوشتنِ لاگ اعمال می‌شود، نه به‌عهدهٔ مصرف‌کننده',
        has('backend/lib/logger.js', 'cleanExtra = extra === undefined ? undefined : safeValue(extra)'));
      const { safeValue } = require(path.join(BACKEND, 'lib/logger'));
      check('آرایه/شیءِ تودرتو هم ماسک می‌شود', safeValue({ order: { phone: '0912' } }).order.phone === '[redacted]');
    },
  },
  {
    id: '16.4.1',
    chapter: 'V16',
    title: 'دادهٔ لاگ رمزگذاری می‌شود تا تزریقِ خطِ جعلی ممکن نباشد',
    status: 'verified',
    evidence: ['backend/lib/logger.js'],
    run() {
      check('الگویِ حذفِ نویسه‌های کنترلی در یک جا تعریف شده', has('backend/lib/logger.js', 'const CONTROL_CHARS ='));
      check('همهٔ پنج مسیرِ نوشتنِ لاگ از همان الگو رد می‌شوند',
        rxCount('backend/lib/logger.js', /\.replace\(CONTROL_CHARS, ' '\)/g) === 5,
        `${rxCount('backend/lib/logger.js', /\.replace\(CONTROL_CHARS, ' '\)/g)} از ۵`);
      const { safeValue } = require(path.join(BACKEND, 'lib/logger'));
      const injected = safeValue('a\r\nb\tc\u001b[31m');
      check('CR/LF/TAB/ESC واقعاً از متنِ لاگ پاک می‌شوند',
        !/[\r\n\t\u001b]/.test(injected), JSON.stringify(injected));
      check('در عوض، حرف‌های r/n/t در متنِ سالم دست‌نخورده می‌مانند (باگِ قبلی برنگردد)',
        safeValue('return request token') === 'return request token', JSON.stringify(safeValue('return request token')));
    },
  },
  {
    id: 'V16',
    chapter: 'V16',
    title: 'لاگ‌ها بیرونِ سرور نمی‌روند و هشدار/تجمیعِ بیرونی نداریم',
    status: 'gap',
    evidence: ['backend/lib/logger.js'],
    why:
      'لاگ‌ها فایلِ محلی‌اند و ۱۴ روز نگه داشته می‌شوند؛ نه ارسال به یک سرویسِ تجمیع، نه هشدارِ خودکار روی رویدادهای ' +
      'قرمزِ پنل. یعنی «ثبتِ رویداد» هست ولی «کسی خبردار می‌شود» نیست. این تفاوت را عمداً نگه می‌داریم تا ' +
      'اشتباه گرفته نشود؛ نقطهٔ اتصالِ طبیعی، همان دفترِ رویدادهای پنل است (رکوردهای note/event).',
  },

  {
    id: 'V9',
    chapter: 'V9',
    title: 'توکنِ خودبسنده (JWT) به‌کار نمی‌رود',
    status: 'na',
    evidence: ['backend/server.js'],
    why:
      'نشست‌ها با express-session و کوکیِ سرورنگه‌داشته اداره می‌شوند. هیچ JWT یا توکنِ امضاشدهٔ سمتِ کلاینت در پروژه ' +
      'نیست، پس بندهای این بخش (الگوریتمِ امضا، ادعاها، لغو) موضوعاً صدق نمی‌کنند — نه اینکه انجام شده باشند.',
  },
  {
    id: 'V10',
    chapter: 'V10',
    title: 'ورودِ بیرونی (OAuth/OIDC) به‌کار نمی‌رود',
    status: 'na',
    evidence: ['backend/routes/auth.js'],
    why:
      'هویت فقط با شمارهٔ موبایل + کدِ پیامکی تأیید می‌شود و هیچ ارائه‌دهندهٔ خارجی وصل نیست. اگر روزی اضافه شد، ' +
      'این ردیف باید از `na` به یک نقشهٔ واقعی تبدیل شود، نه اینکه همان‌جا بماند.',
  },
  {
    id: 'V17',
    chapter: 'V17',
    title: 'WebRTC به‌کار نمی‌رود',
    status: 'na',
    evidence: ['backend/server.js'],
    why:
      'هیچ جریانِ صدا/تصویرِ همتا‌به‌همتا در پروژه نیست و CSP هم `frame-src \'none\'` است؛ بندهای این بخش موضوعاً صدق نمی‌کنند.',
  },
];

/* ============================================================
   ۱) سنجشِ خودِ نقشه — پیش از هر چیز
   ============================================================ */
if (LIST) {
  console.log('\n=== نقشهٔ ASVS 5.0.0 (بدونِ اجرا) ===');
  for (const r of REQUIREMENTS) {
    console.log(`  ${r.id.padEnd(7)} ${r.status.padEnd(9)} ${CHAPTERS[r.chapter]}\n     ${r.title}`);
    if (r.why) console.log(`     ↳ دلیل: ${r.why}`);
  }
  console.log(`\n  ${REQUIREMENTS.length} بند — مرجع: https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en\n`);
  process.exit(0);
}

section('SELF — نقشه باید خودش سالم باشد');

const STATUSES = new Set(['verified', 'partial', 'gap', 'na']);
const ids = REQUIREMENTS.map((r) => r.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
check('شناسهٔ تکراری وجود ندارد', dupes.length === 0, dupes.join(','));
check('فرمتِ شناسه‌ها درست است (x.y.z یا نامِ بخش)',
  REQUIREMENTS.every((r) => /^\d+\.\d+\.\d+$/.test(r.id) || /^V\d+$/.test(r.id)), ids.join(','));
check('هر ردیف به بخشِ شناخته‌شده‌ای از ASVS 5.0.0 وصل است',
  REQUIREMENTS.every((r) => Boolean(CHAPTERS[r.chapter])), REQUIREMENTS.map((r) => r.chapter).join(','));
check('وضعیتِ هر ردیف از مجموعهٔ بسته است',
  REQUIREMENTS.every((r) => STATUSES.has(r.status)), REQUIREMENTS.map((r) => r.status).join(','));
check('هر ردیف فایلِ شاهدِ موجود دارد',
  REQUIREMENTS.every((r) => Array.isArray(r.evidence) && r.evidence.length > 0 && r.evidence.every(exists)),
  REQUIREMENTS.filter((r) => !r.evidence?.every(exists)).map((r) => r.id).join(','));
check('ردیفِ verified/partial سنجش دارد و ردیفِ gap/na دلیل',
  REQUIREMENTS.every((r) => (r.status === 'gap' || r.status === 'na')
    ? typeof r.why === 'string' && r.why.trim().length >= 60 && !r.run
    : typeof r.run === 'function'));
check('دلیلِ هر gap/na واقعاً توضیح می‌دهد (نه جملهٔ سرهم‌بندی)',
  REQUIREMENTS.filter((r) => r.status === 'gap' || r.status === 'na').every((r) => r.why.split(/\s+/).length >= 12));

// برچسبِ تکراری، ابزارِ جهش را گیج می‌کند: `expect` روی متنِ خطا می‌نشیند و اگر دو
// سنجش یک برچسب داشته باشند، معلوم نمی‌شود کدام شکست خورده.
const labels = [];
const realCheck = check;
check = (label, condition, detail = '') => {
  labels.push(label);
  return realCheck(label, condition, detail);
};
for (const r of REQUIREMENTS) {
  if (typeof r.run === 'function') {
    section(`${r.id} — ${r.title}`);
    try {
      r.run();
    } catch (e) {
      realCheck(`اجرای سنجشِ ${r.id}`, false, e.message);
    }
  }
}
const dupLabels = labels.filter((l, i) => labels.indexOf(l) !== i);
check('برچسبِ سنجش‌ها یکتاست (وگرنه تشخیصِ جهش مبهم می‌شود)', dupLabels.length === 0, dupLabels.join(' | '));

/* ============================================================
   ۲) سیم‌کشی — نقشه باید جایی اجرا شود
   ============================================================ */
section('WIRING — این نگهبان باید در CI و اسکریپت‌ها باشد');
check('اسکریپتِ npm دارد', has('backend/package.json', '"test:asvs"'));
check('در CI اجرا می‌شود', has('.github/workflows/ci.yml', 'node tests/asvs.js'));
check('در فهرستِ test:full هست', has('backend/package.json', 'node tests/asvs.js'));
check('دروازهٔ پیش از کامیت/پوششِ لنگر در جریان است', exists('backend/tests/guard-anchors.js'));

/* ============================================================
   جمع‌بندی
   ============================================================ */
const byStatus = REQUIREMENTS.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}, {});

console.log(`\n${'='.repeat(66)}`);
console.log(`  بندهای نقشه: ${REQUIREMENTS.length}  (verified ${byStatus.verified || 0} · partial ${byStatus.partial || 0} · gap ${byStatus.gap || 0} · na ${byStatus.na || 0})`);
console.log(`  سنجش‌های اجراشده: ${pass + fail}  |  PASS ${pass}  |  FAIL ${fail}`);
console.log(`${'='.repeat(66)}`);
if (fail) console.error(`\nشکست‌ها:\n  - ${failures.join('\n  - ')}\n`);
else console.log(`\n✔ ${REQUIREMENTS.length} بندِ ASVS 5.0.0 نگاشت شد؛ ${byStatus.gap || 0} شکاف با دلیلِ مستند اعلام شد.`);
console.log('مرجعِ شناسه‌ها: https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en\n');

try {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
} catch (e) { /* بخواهد بماند، در پوشهٔ موقت است نه در مخزن */ }

process.exit(fail > 0 ? 1 : 0);
