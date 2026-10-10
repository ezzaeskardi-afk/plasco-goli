#!/usr/bin/env node
// tests/otp-attempt-cap.js — نگهبانِ «مرزِ پنج‌تاییِ کدِ پیامکی» و پیامِ باقی‌مانده
//
// ---------- چرا این آزمون وجود دارد ----------
// کدِ پیامکی پنج تلاش دارد (`MAX_ATTEMPTS`)، تلاشِ ششم کد را می‌سوزاند و
// ردیفش را از دیتابیس پاک می‌کند. این رفتار تا امروز **هیچ آزمونی نداشت**:
// `MAX_ATTEMPTS` در کلِ مخزن فقط در `routes/auth.js` دیده می‌شد، پس کسی که آن
// عدد یا جهتِ مقایسه را عوض می‌کرد (مثلاً `>` را `>=` می‌کرد) هیچ‌جا قرمز
// نمی‌شد — نه typecheck، نه lint، نه هیچ مجموعه‌ی دیگری. تفاوتِ `>` و `>=`
// اینجا یک تلاشِ کمتر یا بیشتر است: یعنی مشتریِ بدشانس یک شانسِ اضافه از دست
// می‌دهد یا مهاجم یک شانسِ اضافه می‌گیرد، و هر دو بی‌صدا اتفاق می‌افتند.
//
// سه چیزِ به‌هم‌پیوسته اینجا قفل می‌شود و هیچ‌کدام «الگو در برابر همان الگو»
// نیستند:
//
//   ۱) **مرزِ عددی** — سقف ۵ است، دروازه پیش از مقایسه اجرا می‌شود، و مقایسه
//      سخت‌گیرانه (`>`) است: تلاشِ پنجم عبور می‌کند، ششم نه. عبارتِ خودِ سورس
//      برداشته و با یک `new Function` **اجرا** می‌شود، چون یک اشتباهِ علامت با
//      چشم دیده نمی‌شود ولی با اجرا دیده می‌شود.
//   ۲) **عددِ باقی‌مانده** — پاسخِ کدِ غلط `remaining` را ماشین‌خوان می‌دهد و
//      همان را در جمله‌ی فارسی هم می‌گذارد، پس کاربر می‌فهمد چند شانس دارد و
//      کِی باید کدِ تازه بگیرد. پیش‌تر هیچ عددی به کاربر گفته نمی‌شد: پنج تلاش
//      بی‌اعلان مصرف می‌شد و کاربر تازه با پیامِ «تعداد تلاش زیاد بود» می‌فهمید
//      که کدش سوخته است.
//   ۳) **ردِ امنیتی** — سوختنِ کد یک سطر در دفترِ رویدادها می‌گذارد
//      (`otp_code_burned`). بدونِ آن، پنجره‌ی سوخته هیچ اثری در پنل نداشت.
//
// ---------- چرا دو نیمه (ایستا + زنده) ----------
// نیمه‌ی ایستا فقط سورسِ هر دو فرانت و بک‌اند را می‌خواند و در هر محیطی (حتی
// بدونِ سرور) اجرا می‌شود؛ اما نمی‌تواند ثابت کند که سرور واقعاً همان کار را
// می‌کند — فقط می‌گوید کدی که ادعا می‌شود سر جایش است. نیمه‌ی زنده روی
// **سندباکسِ یک‌بارمصرفِ خودش** (`tests/sandbox.js`) سرورِ واقعی بالا می‌آورد و
// مسیرِ مرز را با HTTP می‌رود: پنج تلاشِ غلط، بعد کدِ **درست** (که باید رد
// شود)، بعد همان کدِ درست دوباره (که باید بگوید «ابتدا درخواست کد کنید» —
// یعنی ردیف پاک شده، نه اینکه فقط قفل شده باشد). سناریوی دوم از سمتِ درست
// می‌آید: چهار تلاشِ غلط و کدِ درست در **تلاشِ پنجم** باید وارد کند.
//
// هیچ‌کدام روی داده‌ی واقعیِ مغازه نمی‌نشیند: سندباکس کپیِ دیتابیس است و
// پیامک در حالتِ تست فقط در لاگِ سرور چاپ می‌شود، پس کد از همان‌جا خوانده
// می‌شود (همان کاری که `tests/security.js` می‌کند).
//
// ---------- اجرا ----------
//   node tests/otp-attempt-cap.js      → ۰ اگر همه سبز، ۱ اگر یکی قرمز

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const {
  BACKEND_DIR: DIR, PROJECT_DIR: REPO,
  makeSandboxData, removeSandboxData, serverEnv
} = require('./sandbox');
const read = (p) => fs.readFileSync(p, 'utf8');
const AUTH = read(path.join(DIR, 'routes', 'auth.js'));
const DB = read(path.join(DIR, 'lib', 'db.js'));
// سمتِ Expressِ این مقایسه از اوراکلِ منجمد می‌خواند، نه از یک پوشه‌ی زنده:
// `frontend/` با بازنشستگیِ فروشگاه حذف شد و این کپیِ بایت‌به‌بایت پیش از حذف
// گرفته شده است. چرا حذف نشد: قراردادِ «سقف، ترتیبِ شمارش، و لحنِ پیامِ خطا»
// را دو پیاده‌سازی مقایسه می‌کنند؛ با یک پیاده‌سازی، «درست بودن» بی‌مرجع می‌شود.
const LEGACY_SRC = path.join(REPO, 'next-frontend', 'tests', 'fixtures', 'legacy-src');
const EXPRESS_LOGIN = read(path.join(LEGACY_SRC, 'js', 'login.js'));
const NEXT_LOGIN = read(path.join(REPO, 'next-frontend', 'src', 'components', 'LoginForm.tsx'));
const ACTIVITY = read(path.join(REPO, 'next-frontend', 'src', 'components', 'admin', 'ActivityContent.tsx'));

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

// ---------- برشِ عبارت‌ها از سورسِ واقعی ----------
// هر لنگر باید **دقیقاً یکی** را پیدا کند: صفر یعنی لنگر جابه‌جا شده و دو یعنی
// نمی‌دانیم کدام را می‌سنجیم. هر دو حالت باید قرمز شوند، نه اینکه خالی سبز شود.
function grab(src, re) {
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) return { expr: null, count: hits.length };
  return { expr: hits[0], count: 1 };
}

// اجرای خودِ عبارتِ سورس (`Date`/`Math` فقط درونِ همین تابع سایه می‌شوند).
// هر خطا به `NaN` تبدیل می‌شود تا بررسی با پیامِ «شد: NaN» قرمز شود، نه با
// استک‌تریس در وسطِ نگهبان.
function evalExpr(expr, vars) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(vars), `return (${expr});`);
    const value = fn(...Object.values(vars));
    return typeof value === 'number' ? value : NaN;
  } catch (e) {
    return NaN;
  }
}

// همان کار برای عبارت‌های شرطی (مثلِ دروازه) که نتیجه‌شان «درست/غلط» است و نه عدد.
function evalBool(expr, vars) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(vars), `return (${expr});`);
    return fn(...Object.values(vars)) === true;
  } catch (e) {
    return false;
  }
}

console.log('\n=== OTP attempt cap guard (5 tries, then the code burns) ===\n');

/* ================= ۱) مرزِ عددی ================= */
section('۱) سقف، ترتیبِ شمارش، و جهتِ مقایسه');

const capGrab = grab(AUTH, /const MAX_ATTEMPTS = (\d+);/g);
check('سقفِ تلاش یک مقدارِ صریح است و لنگرش یکتاست', capGrab.count === 1, `انطباق: ${capGrab.count}`);
const CAP = capGrab.expr ? Number(capGrab.expr[1]) : NaN;
check('سقف ۵ تلاش است (همان عددی که در README نوشته شده)', CAP === 5, `شد: ${CAP}`);

const usedGrab = grab(AUTH, /const attemptsUsed = ([^;]+);\n/g);
check('«شماره‌ی همین تلاش» یک‌جا و یک‌بار حساب می‌شود', usedGrab.count === 1, `انطباق: ${usedGrab.count}`);
if (usedGrab.expr) {
  const used = evalExpr(usedGrab.expr[1], { record: { attempts: 0 } });
  const usedRepeat = evalExpr(usedGrab.expr[1], { record: { attempts: 4 } });
  check('اجرا: تلاشِ اول روی ردیفِ تازه «۱» می‌شود', used === 1, `شد: ${used}`);
  check('اجرا: بعد از چهار تلاشِ ثبت‌شده، تلاشِ بعدی «۵» می‌شود', usedRepeat === 5, `شد: ${usedRepeat}`);
}

const gateGrab = grab(AUTH, /if \((attemptsUsed > MAX_ATTEMPTS)\) \{\n/g);
check('دروازه یکتاست و از همان عددِ «شماره‌ی همین تلاش» می‌خواند', gateGrab.count === 1, `انطباق: ${gateGrab.count}`);

// دروازه از سورس گرفته و با مرز اجرا می‌شود — تفاوتِ `>` و `>=` همین‌جا دیده می‌شود
const gateExpr = gateGrab.expr ? gateGrab.expr[1] : 'false';
const refusesAt = (used) => evalBool(gateExpr, { attemptsUsed: used, MAX_ATTEMPTS: CAP });
check('اجرا: هر پنج تلاشِ اول پذیرفته می‌شوند (پنجم هم شامل)', !refusesAt(1) && !refusesAt(5),
  `۱→${refusesAt(1)} ۵→${refusesAt(5)}`);
check('اجرا: تلاشِ ششم رد می‌شود', refusesAt(6) === true, `۶→${refusesAt(6)}`);

const bumpAt = AUTH.indexOf('otp.bumpAttempts.run(phone)');
const gateAt = AUTH.indexOf('if (attemptsUsed > MAX_ATTEMPTS)');
check('شمارش **قبل از** مقایسه ثبت می‌شود (وگرنه تلاشِ سوخته در DB نمی‌ماند)',
  bumpAt !== -1 && gateAt !== -1 && bumpAt < gateAt, `bump=${bumpAt} gate=${gateAt}`);

// هیچ شمارنده‌ی دومی نباید ساخته شود: اگر یک `attempts` در حافظه کنارِ DB سبز
// شود، با ری‌استارت صفر می‌شود و مرز دور می‌خورد.
const ATTEMPTS_ALLOWED = [
  /const attemptsUsed = record\.attempts \+ 1;/,
  /if \(attemptsUsed > MAX_ATTEMPTS\)/,
  /MAX_ATTEMPTS - attemptsUsed/,
  // رشته‌ی لاگِ انگلیسی یک شناسه نیست؛ «max attempts» فقط یک اتفاقِ لغوی است
  // و هیچ شمارنده‌ای نمی‌سازد.
  /log\.warn\('OTP code burned after max attempts'/
];
function strayAttempts(src) {
  const out = [];
  const re = /\battempts(?:Used)?\b/g;
  let m;
  while ((m = re.exec(src))) {
    const ctx = src.slice(Math.max(0, m.index - 40), m.index + 40);
    if (!ATTEMPTS_ALLOWED.some((p) => p.test(ctx))) out.push(ctx.replace(/\s+/g, ' ').trim());
  }
  return out;
}
const stray = strayAttempts(AUTH);
check('تلاش‌ها فقط از یک منبع می‌آیند (شمارنده‌ی دومِ درون‌حافظه‌ای وجود ندارد)',
  stray.length === 0, stray.join(' | ') || `${(AUTH.match(/\battempts(?:Used)?\b/g) || []).length} موردِ مجاز`);

/* ================= ۲) عددِ باقی‌مانده ================= */
section('۲) عددِ باقی‌مانده: هم ماشین‌خوان، هم در جمله‌ی کاربر');

const remainGrab = grab(AUTH, /const remaining = ([^;]+);\n/g);
check('عبارتِ باقی‌مانده یکتاست و پیدا شد', remainGrab.count === 1, `انطباق: ${remainGrab.count}`);
if (remainGrab.expr) {
  const left = (used) => evalExpr(remainGrab.expr[1], { Math, MAX_ATTEMPTS: CAP, attemptsUsed: used });
  check('اجرا: تلاشِ اول ۴ تلاشِ باقی‌مانده می‌گذارد', left(1) === 4, `شد: ${left(1)}`);
  check('اجرا: تلاشِ چهارم ۱ تلاش و تلاشِ پنجم صفر می‌گذارد',
    left(4) === 1 && left(5) === 0, `۴→${left(4)} ۵→${left(5)}`);
  check('اجرا: عدد هرگز منفی نمی‌شود (مسیرِ سوخته هم اگر برسد، صفر می‌بیند)',
    left(6) === 0 && left(99) === 0, `۶→${left(6)} ۹۹→${left(99)}`);
}

// پاسخ باید **هم** فیلدِ ماشین‌خوان بدهد و **هم** عدد را در جمله بگذارد. اگر
// فقط فیلد بدهد، هیچ کاربری آن را نمی‌بیند (هیچ‌کدام از دو فرانت‌اند باقی‌مانده
// را بازنویسی نمی‌کند، هر دو `err.message` را نشان می‌دهند). اگر فقط در جمله
// باشد، از بیرون قابلِ سنجش نیست.
function carriesCount(src) {
  const machineField = src.split('\n').some((l) => /^\s*remaining\s*,?\s*$/.test(l) || /^\s*remaining\s*:/.test(l));
  // عدد در جمله باید از `faDigits` رد شود: صفحه‌ی ورود همه‌ی عددهایش فارسی
  // است و «4 تلاش دیگر مانده» کنارِ «۱ شماره، ۲ کد» ناهمگون می‌افتد.
  const inSentence = /\$\{faDigits\(remaining\)\}/.test(src);
  return machineField && inSentence;
}

// همان کاری که سرور می‌کند، برای سنجشِ خروجیِ زنده (عددِ لاتین در متن نیست).
const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const payloadAt = AUTH.indexOf('const remaining = ');
const payload = payloadAt === -1 ? '' : AUTH.slice(payloadAt, payloadAt + 420);
check('پاسخِ کدِ غلط، عدد را هم به‌صورتِ فیلد و هم داخلِ جمله می‌فرستد',
  carriesCount(payload), payload.replace(/\s+/g, ' ').slice(0, 120));
check('جمله‌ی «آخرین تلاش» برای وقتی است که چیزی باقی نمانده (وگرنه کاربر بی‌خبر می‌سوزد)',
  /این آخرین تلاش بود/.test(payload));
check('هم عددِ باقی‌مانده و هم ثانیه‌شمارِ ارسال مجدد، فارسی نوشته می‌شوند',
  /function faDigits\(n\) \{/.test(AUTH)
  && /کد قبلاً ارسال شده؛ \$\{faDigits\(wait\)\}/.test(AUTH));

/* ================= ۳) سوختن و ردِ امنیتی ================= */
section('۳) سوختنِ کد: ردیف پاک می‌شود و یک رویداد می‌ماند');

const burnBlock = gateAt === -1 ? '' : AUTH.slice(gateAt, gateAt + 1400);
check('تلاشِ سوخته ردیفِ کد را از دیتابیس پاک می‌کند',
  /otp\.del\.run\(phone\);/.test(burnBlock));
check('سوختن، رویدادِ امنیتیِ `otp_code_burned` را در دفتر ثبت می‌کند',
  /logAdminAction\(null, 'otp_code_burned', maskPhone\(phone\), clientFingerprint\(req\)\)/.test(burnBlock));
check('شماره در لاگِ سرور هم ماسک می‌شود (چهار رقمِ آخر، نه شماره‌ی کامل)',
  !/log\.warn\('OTP code burned[\s\S]{0,120}\{ phone: phone/.test(burnBlock) &&
  /log\.warn\('OTP code burned after max attempts', \{ phone: maskPhone\(phone\)/.test(burnBlock));

const labelBlock = (ACTIVITY.match(/const ACTION_FA[\s\S]*?\n\};/) || [''])[0];
check('پنل برای این رویداد برچسبِ فارسی دارد (وگرنه کلیدِ خام نشان داده می‌شود)',
  /otp_code_burned:\s*"[^"]+"/.test(labelBlock));
const toneBlock = (ACTIVITY.match(/const ACTION_TONE[\s\S]*?\n\};/) || [''])[0];
check('رویدادِ سوختن قرمز است («بد» یعنی برگشت‌ناپذیر یا مشکوک)',
  /otp_code_burned:\s*"bad"/.test(toneBlock));

/* ================= ۴) دوام: شمارش در دیتابیس ================= */
section('۴) شمارش روی دیسک می‌ماند (ری‌استارتِ سرور آن را صفر نمی‌کند)');

const ddl = (DB.match(/CREATE TABLE IF NOT EXISTS otp_codes \([\s\S]*?\);/ ) || [''])[0];
check('جدولِ otp_codes ستونِ attempts دارد', /^\s*attempts\s+INTEGER NOT NULL DEFAULT 0,/m.test(ddl), ddl.split('\n')[2] || '');
check('شمارش با یک UPDATE اتمیک در DB انجام می‌شود، نه در حافظه',
  /UPDATE otp_codes SET attempts = attempts \+ 1 WHERE phone = \?/.test(DB));
check('کدِ تازه شمارنده را صفر می‌کند (هر کدِ نو پنج شانسِ کامل دارد)',
  /ON CONFLICT\(phone\) DO UPDATE SET[\s\S]{0,200}attempts=0/.test(DB));

/* ================= ۵) رسیدنِ عدد به چشمِ کاربر (هر دو فرانت) ================= */
section('۵) هر دو فروشگاه همان جمله‌ی سرور را نشان می‌دهند');

const expressCatch = EXPRESS_LOGIN.slice(EXPRESS_LOGIN.indexOf("PG.api('/auth/otp/verify'"), EXPRESS_LOGIN.indexOf("PG.api('/auth/otp/verify'") + 1400);
check('Express: جمله‌ی خطای کد از خودِ سرور خوانده می‌شود (پس عددِ باقی‌مانده هم می‌رسد)',
  /showAlert\(alertCode, humanError\(err\)\)/.test(expressCatch));
const humanError = (EXPRESS_LOGIN.match(/function humanError\(err\) \{[\s\S]*?\n  \}/) || [''])[0];
check('Express: برای ۴۰۰ عدد را دور نمی‌ریزد (`err.message` برمی‌گردد)',
  /return err\.message \|\| /.test(humanError));

// فقط تنه‌ی `submitOtp` بریده می‌شود: همان‌جایی که خطای کدِ غلط مدیریت می‌شود.
// (`handleResend` هم `setOtpError` دارد و شکلِ مشابهی دارد — اگر کلِ فایل
// گشته شود، انطباق دو می‌شود و معلوم نیست کدام را می‌سنجیم.)
const submitOtpAt = NEXT_LOGIN.indexOf('const submitOtp = async');
const step3At = NEXT_LOGIN.indexOf('مرحله ۳');
const nextCatch = submitOtpAt === -1 ? ''
  : NEXT_LOGIN.slice(submitOtpAt, step3At !== -1 && step3At > submitOtpAt ? step3At : undefined);
check('Next: در مرحله‌ی کد هم پیامِ سرور نشان داده می‌شود (پس عددِ باقی‌مانده می‌رسد)',
  /setOtpError\(err instanceof ApiError \? err\.message :/.test(nextCatch));
check('Next: پیامِ جانشین فقط وقتی است که سرور جوابی نداده (خطای شبکه)، نه وقتی پیامِ عددی داریم',
  /setOtpError\(err instanceof ApiError \? err\.message : "کد اشتباه است"\)/.test(nextCatch));

// لایه‌ی دومِ محدودسازی سرِ جایش باشد: سقفِ IP مکملِ سقفِ کد است و «ورودِ
// موفق سهمیه نمی‌سوزاند» — وگرنه مشتریِ واقعی بعد از چند ورود از یک خط قفل می‌شد.
check('سقفِ IP برای «چک کردنِ کد» هنوز هست و ورودِ موفق سهمیه نمی‌سوزاند',
  /const otpVerifyLimiter = rateLimit\(\{ windowMs: 10 \* 60 \* 1000, max: \d+, skipSuccess: true/.test(AUTH));

/* ================= ۶) خودآزمونِ نگهبان ================= */
section('۶) خودآزمون (نگهبانِ خراب باید قرمز شود)');

check('خودآزمون: `>=` روی مرز رد می‌شود (تلاشِ پنجم را بی‌دلیل قربانی می‌کند)',
  evalBool('attemptsUsed >= MAX_ATTEMPTS', { attemptsUsed: 5, MAX_ATTEMPTS: CAP }) === true);
check('خودآزمون: شمارنده‌ی دومِ درون‌حافظه‌ای گرفته می‌شود',
  strayAttempts('let attempts = 0;\nif (attempts > MAX_ATTEMPTS) attempts = 0;').length === 3,
  String(strayAttempts('let attempts = 0;\nif (attempts > MAX_ATTEMPTS) attempts = 0;').length));
const SAMPLE_OK = "return res.status(400).json({\n  error: remaining > 0 ? `کد اشتباه؛ ${faDigits(remaining)} تلاش مانده` : 'x',\n  remaining\n});";
const SAMPLE_BAD = "return res.status(400).json({ error: 'کد وارد شده اشتباه است' });";
check('خودآزمون: پاسخِ بی‌عدد رد می‌شود', !carriesCount(SAMPLE_BAD));
check('خودآزمون: پاسخ با عددِ لاتین هم رد می‌شود (ناهمگونیِ ارقام گرفته می‌شود)',
  !carriesCount(SAMPLE_OK.replace('${faDigits(remaining)}', '${remaining}')));
check('خودآزمون: همان پاسخ با فیلد و عدد در جمله قبول می‌شود', carriesCount(SAMPLE_OK));
check('خودآزمون: برچسبِ نبوده در فهرست گرفته می‌شود',
  !/otp_code_absent:\s*"/.test(labelBlock) && /login_failed:\s*"/.test(labelBlock));

/* ================= ۷) آزمونِ زنده ================= */
section('۷) آزمونِ زنده روی سندباکس: پنج تلاش، تلاشِ ششم، و ردیفِ سوخته');

const PORT = 3993;
const SANDBOX_DATA = makeSandboxData();

// دو شماره‌ی یکتا در هر اجرا: سقفِ روزانه‌ی پیامک و مهلتِ ارسالِ مجدد روی
// «هر شماره» است، پس شماره‌ی تازه یعنی آزمون به‌هم نچسبد. شماره‌ی اول همان
// ADMIN_PHONE سندباکس است تا بشود دفترِ رویدادها را از API پنل خواند.
const randPhone = () => '0912' + String(Math.floor(1000000 + Math.random() * 8999999));
const ADMIN = randPhone();
const TARGET = randPhone();

let serverOut = '';
let child = null;

// سرورِ سندباکس فقط وقتی «بالا آمد» حساب می‌شود که سه شرط با هم درست باشد:
// پروسه زنده باشد، پورت پیش از هر چیز آزاد بوده باشد، و پاسخِ `/api/health`
// پاسخِ **خودِ ما** باشد (`ok: true` روی JSON).
//
// چرا این‌قدر سخت‌گیرانه: یک فرآیندِ غریبه روی همان پورت که به هر درخواستی ۲۰۰
// می‌دهد، با بررسیِ ساده‌ی `r.ok` «سرور بالا آمد» را سبز می‌کرد و آزمون بعد با
// پیامِ گمراه‌کننده‌ی «challenge failed: 200» می‌افتاد — یعنی توسعه‌دهنده دنبالِ
// باگِ OTP می‌رفت، نه دنبالِ پورتِ اشغال.
// نکته‌ی مهمِ ویندوزی: میزبان عمداً داده نمی‌شود تا **همان‌طور** بایند شود که
// خودِ `server.js` می‌کند (`app.listen(PORT)` بدونِ میزبان → wildcard). با
// `127.0.0.1` صریح، ویندوز اجازه می‌دهد در کنارِ فرآیندی که wildcard را گرفته
// یک شنونده‌ی محدود بالا بیاید — یعنی بررسی «سبز» می‌شد در حالی که سرورِ
// سندباکس هرگز نمی‌توانست bind کند.
function portFree(port) {
  return new Promise((resolve) => {
    const srv = require('net').createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

async function ownServerHealthy() {
  if (child && child.exitCode !== null) return false;
  try {
    const r = await fetch(BASE + '/api/health');
    if (!r.ok) return false;
    if (!/json/i.test(r.headers.get('content-type') || '')) return false;
    const d = await r.json();
    return Boolean(d && d.ok === true);
  } catch (e) {
    return false;
  }
}

const BASE = `http://127.0.0.1:${PORT}`;
const cookies = new Map();
function saveCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const c of raw) {
    const pair = c.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function api(method, url, body) {
  const res = await fetch(BASE + '/api' + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookies.size ? { Cookie: cookieHeader() } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  saveCookies(res);
  let data = null;
  try { data = await res.json(); } catch (e) { /* بدنه‌ی غیرِ JSON */ }
  return { status: res.status, data };
}

// خواندنِ مستقیمِ شمارنده از دیتابیسِ سندباکس (`node:sqlite` هم در `lib/db.js`
// و هم در `test-smoke.js` استفاده می‌شود، پس وابستگیِ تازه‌ای نیست).
// `null` یعنی ردیف نیست، `undefined` یعنی خواندن شکست خورد — این دو را قاطی
// نمی‌کنیم وگرنه «ردیف پاک نشده» و «خواندن نشد» یکی دیده می‌شوند.
function storedAttempts(phone) {
  const dbPath = path.join(SANDBOX_DATA, 'polasco.db');
  let db = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    // حالتِ WAL گاهی خواندنِ read-only را سخت می‌کند؛ اگر نشد، با دسترسیِ
    // معمولی باز می‌شود (این تست فقط SELECT می‌زند).
    try { db = new DatabaseSync(dbPath, { readOnly: true }); }
    catch (e) { db = new DatabaseSync(dbPath); }
    const row = db.prepare('SELECT attempts FROM otp_codes WHERE phone = ?').get(phone);
    return row ? row.attempts : null;
  } catch (e) {
    return undefined;
  } finally {
    try { if (db) db.close(); } catch (e) { /* بی‌اهمیت */ }
  }
}

// درخواستِ کد و خواندنِ کدِ واقعی از لاگِ سرور (پیامک در حالتِ تست چاپ می‌شود)
async function requestCode(phone) {
  const ch = await api('GET', '/auth/otp/challenge');
  if (!ch.data || !ch.data.token) throw new Error(`challenge failed: ${ch.status}`);
  const rq = await api('POST', '/auth/otp/request', { phone, challenge: ch.data.token });
  if (rq.status !== 200) throw new Error(`otp/request failed: ${rq.status} ${JSON.stringify(rq.data)}`);
  for (let i = 0; i < 20; i++) {
    const m = [...serverOut.matchAll(new RegExp(`${phone}: (\\d{5})`, 'g'))];
    if (m.length) return m[m.length - 1][1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no OTP code in server output');
}

(async () => {
  // پیش‌پرواز: اگر پورتِ سندباکس اشغال باشد، سرورِ ما هرگز bind نمی‌شود و
  // آزمونِ زنده بی‌معنی می‌شود. اول همین را صریح بگوییم، بعد بالا بیاوریم.
  const free = await portFree(PORT);
  check(`پورتِ ${PORT} برای سندباکس آزاد است`, free,
    free ? '' : `فرآیندِ دیگری پورتِ ${PORT} را گرفته — همان را ببند و دوباره اجرا کن`);
  if (!free) {
    removeSandboxData(SANDBOX_DATA);
    return finish();
  }

  child = spawn(process.execPath, [path.join(DIR, 'server.js')], {
    cwd: DIR,
    env: serverEnv(SANDBOX_DATA, { PORT: String(PORT), ADMIN_PHONE: ADMIN }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { serverOut += d; });
  child.stderr.on('data', (d) => { serverOut += d; });

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = await ownServerHealthy();
    if (!up) await new Promise((r) => setTimeout(r, 300));
  }
  check('سرورِ سندباکسِ خودمان بالا آمد (نه یک شنونده‌ی غریبه روی همان پورت)', up,
    up ? '' : `${serverOut.slice(-400)}\n     └─ اگر خالی است، پورتِ ${PORT} احتمالاً اشغال است (EADDRINUSE).`.trim());
  if (!up) {
    try { child.kill(); } catch (e) { /* بی‌اهمیت */ }
    removeSandboxData(SANDBOX_DATA);
    return finish();
  }

  // --- سناریوِ ۱: هدفِ سوختن ---
  const targetCode = await requestCode(TARGET);
  check('کدِ هدف از لاگِ سرور خوانده شد', /^\d{5}$/.test(targetCode));

  const wrong = '00000'; // هرگز با کدِ تولیدشده یکی نیست (کد از ۱۰۰۰۰ شروع می‌شود)
  let sent = 0;
  const storedCounts = [];
  for (let i = 1; i <= CAP; i++) {
    const r = await api('POST', '/auth/otp/verify', { phone: TARGET, code: wrong });
    sent++;
    storedCounts.push(storedAttempts(TARGET));
    const wantLeft = CAP - i;
    // برای باقی‌مانده‌ی صفر، جمله عدد ندارد — می‌گوید «این آخرین تلاش بود»،
    // چون «۰ تلاش مانده» یعنی «بی‌فایده است تلاش کن» و همان چیزی است که
    // کاربر را به یک تلاشِ محکوم‌به‌شکست می‌فرستد.
    const messageOk = typeof r.data?.error === 'string' && (
      wantLeft > 0
        ? r.data.error.includes(fa(wantLeft)) && /تلاش دیگر مانده/.test(r.data.error)
        : /آخرین تلاش بود/.test(r.data.error)
    );
    check(`تلاشِ ${i}: کدِ غلط رد می‌شود و می‌گوید «${wantLeft} تلاش مانده»`,
      r.status === 400 && r.data && r.data.remaining === wantLeft && messageOk,
      `${r.status} ${JSON.stringify(r.data)}`);
  }
  // اگر سقف خوانده نشود (NaN)، حلقه بی‌صدا صفر بار اجرا می‌شود و بقیه‌ی آزمونِ
  // زنده معنایش را از دست می‌دهد؛ این بررسی همان حالت را قرمز می‌کند.
  check('مرزِ زنده واقعاً پنج تلاشِ غلط فرستاد (حلقه بی‌صدا رد نشده)', sent === 5, `فرستاده شد: ${sent}`);
  // شاهد از **خودِ دیتابیس**، نه از پیامِ سرور: پیامی که «۴ تلاش مانده» می‌گوید
  // می‌تواند از یک شمارندهٔ غلط بیاید، ولی ستونِ `attempts` دروغ نمی‌گوید.
  check('شمارندهٔ دیتابیسِ سندباکس با هر تلاش دقیقاً یکی بالا می‌رود (۱ تا ۵)',
    JSON.stringify(storedCounts) === '[1,2,3,4,5]', JSON.stringify(storedCounts));

  const sixth = await api('POST', '/auth/otp/verify', { phone: TARGET, code: targetCode });
  check('تلاشِ ششم با کدِ **درست** هم رد می‌شود (کد سوخته)', sixth.status === 429,
    `${sixth.status} ${JSON.stringify(sixth.data)}`);
  check('پیامِ سوختن به کاربر می‌گوید چه کار کند (کدِ تازه بگیر) — نه فقط «خطا»',
    sixth.status === 429 && /درخواست کد/.test(sixth.data.error || ''),
    sixth.data && sixth.data.error);
  const seventh = await api('POST', '/auth/otp/verify', { phone: TARGET, code: targetCode });
  check('بعد از سوختن، ردیفِ کد پاک شده — پیام «ابتدا درخواست کد کنید» است، نه «کد اشتباه»',
    seventh.status === 400 && /ابتدا درخواست کد کنید/.test(seventh.data.error || ''),
    `${seventh.status} ${JSON.stringify(seventh.data)}`);
  check('خودِ ردیف هم از دیتابیس رفته (نه اینکه فقط قفل شده)',
    storedAttempts(TARGET) === null, `مقدار: ${String(storedAttempts(TARGET))}`);

  // --- سناریوِ ۲: مرز از سمتِ درست (مدیر) ---
  const adminCode = await requestCode(ADMIN);
  // سطرِ کدِ تازه باید شمارنده را صفر کرده باشد (وعده‌ی «کدِ نو، پنج شانسِ نو»)
  // و ردیفِ شماره‌ی دیگر (هدف) نباید دست‌خورده باشد — پاک‌سازی باید فقط همان
  // شماره را ببرد.
  check('کدِ تازه شمارنده را صفر می‌کند (کدِ نو، پنج شانسِ نو)',
    storedAttempts(ADMIN) === 0, `مقدار: ${String(storedAttempts(ADMIN))}`);
  check('پاک‌سازیِ کدِ سوخته به شماره‌های دیگر سرایت نکرد (ردیفِ هدف هنوز نیست، ردیفِ مدیر هست)',
    storedAttempts(TARGET) === null && storedAttempts(ADMIN) === 0);
  let adminWrong = 0;
  const adminCounts = [];
  for (let i = 1; i <= CAP - 1; i++) {
    const r = await api('POST', '/auth/otp/verify', { phone: ADMIN, code: wrong });
    adminWrong++;
    adminCounts.push(storedAttempts(ADMIN));
    check(`مدیر، تلاشِ ${i}: رد می‌شود و ${CAP - i} تلاش می‌ماند`,
      r.status === 400 && r.data.remaining === CAP - i, `${r.status} ${JSON.stringify(r.data)}`);
  }
  check('چهار تلاشِ غلطِ مدیر واقعاً فرستاده شد', adminWrong === 4, `فرستاده شد: ${adminWrong}`);
  check('شمارنده‌ی مدیر هم دقیقاً چهار تا بالا رفته',
    JSON.stringify(adminCounts) === '[1,2,3,4]', JSON.stringify(adminCounts));
  const fifthOk = await api('POST', '/auth/otp/verify', { phone: ADMIN, code: adminCode });
  check('تلاشِ پنجم با کدِ درست وارد می‌کند (سقف ۵ است، نه ۴)',
    fifthOk.status === 200 && fifthOk.data && fifthOk.data.ok === true,
    `${fifthOk.status} ${JSON.stringify(fifthOk.data)}`);

  // --- ردِ امنیتی از دیدِ پنل ---
  const logRes = await api('GET', '/admin/activity?limit=50');
  check('دفترِ رویدادها برای مدیر خوانده شد', logRes.status === 200 && Array.isArray(logRes.data.activity),
    `${logRes.status}`);
  const burned = (logRes.data.activity || []).find((x) => x.action === 'otp_code_burned');
  check('سوختنِ کد در دفتر ثبت شده', Boolean(burned), JSON.stringify((logRes.data.activity || []).slice(0, 3)));
  check('هدفِ حمله ماسک شده ثبت شده (چهار رقمِ آخر، نه شماره‌ی کامل)',
    Boolean(burned) && burned.target === '****' + TARGET.slice(-4),
    burned ? burned.target : 'سطر پیدا نشد');
  // اثرِ انگشت باید **هر دو** نیمه را داشته باشد: «IP … — مرورگر روی سیستم».
  // فقط «IP» کافی نیست؛ و فقط مرورگر هم بی‌IP یعنی نمی‌دانی از کجا آمده.
  const fp = burned ? burned.detail || '' : '';
  check('اثرِ انگشتِ مهاجم هر دو نیمه را دارد (IP و مرورگر روی سیستم)',
    /^IP \S+ — \S+ روی \S+$/.test(fp), fp);
  check('دفتر User-Agentِ کاملِ درخواست را ذخیره نمی‌کند (فقط نامِ کوتاه)',
    fp.length > 0 && !/Mozilla|AppleWebKit|Gecko/.test(fp), fp);

  try { child.kill(); } catch (e) { /* بی‌اهمیت */ }
  setTimeout(() => { removeSandboxData(SANDBOX_DATA); finish(); }, 500);
})().catch((e) => {
  fail++;
  console.error(`\n  [FAIL] اجرای آزمونِ زنده شکست خورد: ${e.message}`);
  try { if (child) child.kill(); } catch (err) { /* بی‌اهمیت */ }
  removeSandboxData(SANDBOX_DATA);
  finish();
});

function finish() {
  console.log('\n------------------------------------------------------------');
  console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
  console.log('------------------------------------------------------------\n');
  // عمداً `process.exitCode` نه `process.exit()`: با سوکت‌های fetchِ باز،
  // خروجِ اجباری روی ویندوز گاهی کدِ خروجِ بی‌ربط می‌دهد و نتیجه‌ی درست را
  // وارونه نشان می‌دهد.
  process.exitCode = fail === 0 ? 0 : 1;
}
