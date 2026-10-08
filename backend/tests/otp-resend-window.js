#!/usr/bin/env node
// tests/otp-resend-window.js — نگهبانِ «ثانیه‌شمارِ ارسال مجدد، رفرش‌ناپذیر بماند»
//
// ---------- چرا این آزمون وجود دارد ----------
// مهلتِ «ارسال مجدد» باید **زمانِ پایان** را ذخیره کند، نه «چند ثانیه مانده».
// اگر شماره‌ی باقی‌مانده ذخیره شود، هر رفرش شمارش را از صفر شروع می‌کند: مشتری
// سی ثانیه منتظر می‌ماند، صفحه را رفرش می‌کند، و سی ثانیه‌ی تازه می‌بیند — در
// حالی که سرور هنوز همان کدِ قبلی را معتبر می‌داند و درخواستِ تازه را با ۴۲۹
// رد می‌کند. یعنی فرانت به کاربر دروغ می‌گوید و دکمه هم بی‌دلیل قفل می‌ماند.
//
// همین قرارداد **دو بار** نوشته شده و در دو زبان:
//   • فروشگاهِ Express — `frontend/js/login.js`، کلیدِ `pg_otp_state` (یک شیءِ
//     JSON با مهلتِ ارسال، کلِ مهلت، و عمرِ خودِ کد).
//   • فروشگاهِ Next — `next-frontend/src/components/LoginForm.tsx`، یک عددِ
//     ساده در `pg_otp_resend_<شماره>`.
// هیچ کامپایلر، lint، یا typecheckی رابطه‌ی این دو را نمی‌بیند — و هیچ‌کدام از
// این دو فایل تا امروز آزمونی نداشتند. این نگهبان همان رابطه را قفل می‌کند.
//
// چهار چیزی که قفل می‌شوند:
//   ۱) نوشتن: هر جای نوشتن باید یک **مهلتِ مطلق** بنویسد (`Date.now() + …`).
//      اگر کسی دوباره `resendLeft: 30` بگذارد، همین‌جا قرمز می‌شود.
//   ۲) خواندن: هر تیک باید از همان مهلت و از ساعتِ *همان لحظه* بازمحاسبه کند،
//      نه از یک شمارنده‌ی کاهنده. تبِ مخفی و لپ‌تاپِ خواب‌رفته تایمرها را عقب
//      می‌اندازند؛ شمارنده‌ی کاهنده آن‌وقت عددی نشان می‌دهد که واقعیت ندارد.
//   ۳) دوام: بازگشت به صفحه باید همان عددِ وسطِ راه را ادامه دهد، نه از صفر.
//   ۴) منبع: عدد باید از **خودِ سرور** بیاید (`retryAfter`). تا امروز Next
//      مقدارِ «۳۰» را هاردکد می‌کرد و ۴۲۹ را هم بی‌جواب می‌گذاشت؛ یعنی وقتی
//      سرور مهلتِ کوتاه‌تری می‌داد، دکمه با تأخیر باز می‌شد و عددِ روی صفحه
//      عددی نبود که سرور اعمال می‌کند.
//
// چرا عبارت‌ها **اجرا** می‌شوند و نه فقط الگو-تطبیق: اگر فقط بگردیم که «عبارت
// `Date.now()` دارد»، یک اشتباهِ علامت یا تقسیم (`* 1000` به‌جای `/ 1000`) هم
// سبز می‌ماند. اینجا خودِ متنِ سورس برداشته و با یک ساعتِ جعلی اجرا می‌شود:
// وسطِ یک پنجره‌ی ۳۰ ثانیه‌ای، ده ثانیه بعد از نوشتن، باید **۲۰** بدهد و نه ۳۰.
//
// هر دو طرف از **متنِ سورس** خوانده می‌شوند و نه از `require`: `login.js` یک
// اسکریپتِ کلاسیک است که به DOM وابسته است و `LoginForm.tsx` با JSX نوشته شده
// و اینجا اجراپذیر نیست. خواندنِ سورس یعنی نیمه‌ی ایستا بدونِ دیتابیس و مرورگر
// هم اجرا می‌شود؛ ولی هیچ سورسی ثابت نمی‌کند که سرورِ واقعی *همان* عددی را
// می‌دهد که فرانت می‌شمارد. برای همین یک نیمه‌ی **زنده** هم هست (بخشِ ۸): خودش
// یک سرورِ سندباکس با دیتابیسِ یک‌بارمصرف بالا می‌آورد، دو درخواستِ پشتِ هم
// می‌زند، و همان عددِ زنده‌ی ۴۲۹ را داخلِ عبارت‌های هر دو فرانت اجرا می‌کند.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// همان الگوی خواهرش (`tests/otp-attempt-cap.js`): دیتابیسِ یک‌بارمصرف + پیامکِ
// آزمایشی، تا آزمون هرگز به داده‌ی واقعیِ مغازه یا خطِ پیامکِ واقعی دست نزند.
const {
  BACKEND_DIR: DIR,
  makeSandboxData, removeSandboxData, serverEnv,
} = require('./sandbox');

const BACKEND = path.join(__dirname, '..');
const REPO = path.join(BACKEND, '..');

const FILES = {
  'frontend/js/login.js': path.join(REPO, 'frontend', 'js', 'login.js'),
  'LoginForm.tsx': path.join(REPO, 'next-frontend', 'src', 'components', 'LoginForm.tsx'),
  // سه فایلِ زیر «سرور = تنها منبعِ حقیقتِ مهلت» را می‌سازند: عدد از این‌جا
  // می‌آید (auth.js)، از لایه‌ی درخواست رد می‌شود (api.ts)، و شکلش اعلام شده
  // است (types.ts). اگر یکی از این سه نباشد، هر دو فرانت ناچارند حدس بزنند.
  'lib/api.ts': path.join(REPO, 'next-frontend', 'src', 'lib', 'api.ts'),
  'lib/types.ts': path.join(REPO, 'next-frontend', 'src', 'lib', 'types.ts'),
  'routes/auth.js': path.join(BACKEND, 'routes', 'auth.js'),
};

// ---------- ۰) هر دو طرفِ قرارداد باید باشند ----------
// اگر یکی نبود، هیچ‌چیز سنجیده نمی‌شود؛ بهتر است زود و با پیامِ روشن قرمز شود
// تا اینکه وسطِ راه با یک استک‌تریس بیفتد.
let missing = false;
for (const [label, file] of Object.entries(FILES)) {
  if (!fs.existsSync(file)) {
    console.error(`  [FAIL] ${label} وجود ندارد — ${file}`);
    missing = true;
  }
}
if (missing) {
  console.error('  ⚠ یکی از دو طرفِ قرارداد پیدا نشد — نمی‌شود چیزی نسنجید.');
  process.exit(1);
}

const SOURCES = {};
for (const [label, file] of Object.entries(FILES)) {
  SOURCES[label] = fs.readFileSync(file, 'utf8');
}
const EXPRESS = SOURCES['frontend/js/login.js'];
const NEXT = SOURCES['LoginForm.tsx'];

let pass = 0, fail = 0;
function ok(label) { pass++; console.log(`  [PASS] ${label}`); }
function bad(label, detail) { fail++; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
function check(label, condition, detail = '') {
  if (condition) ok(label); else bad(label, detail);
}

// ---------- برشِ عبارت‌ها از سورسِ واقعی ----------
// هر الگو باید **دقیقاً یکی** را پیدا کند. صفر یعنی لنگر جابه‌جا شده و دو یعنی
// نمی‌دانیم کدام را می‌سنجیم — هر دو حالت باید قرمز شوند، نه اینکه خالی سبز شود.
function grab(src, re) {
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) return { expr: null, count: hits.length };
  return { expr: hits[0][1], count: 1 };
}

// اجرای خودِ عبارتِ سورس با یک ساعتِ جعلی (`Date` فقط درونِ همین تابع سایه می‌شود)
//
// هر خطا هم به `NaN` تبدیل می‌شود: عبارتِ سورس ممکن است به چیزی اشاره کند که
// اینجا وجود ندارد (متغیرِ حذف‌شده)، و آن‌وقت بهتر است بررسی با پیامِ «شد: NaN»
// قرمز شود تا اینکه نگهبان وسطِ راه با استک‌تریس بیفتد و معلوم نشود کدام بررسی
// شکست خورد.
function evalExpr(expr, vars) {
  try {
    const names = Object.keys(vars);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, `return (${expr});`);
    const value = fn(...names.map((n) => vars[n]));
    return typeof value === 'number' ? value : NaN;
  } catch (e) {
    return NaN;
  }
}
const fakeNow = (ms) => ({ now: () => ms });

// مثلِ evalExpr ولی برای شرط‌ها (نتیجه‌ی بولین).
function evalTruthy(expr, vars) {
  try {
    const names = Object.keys(vars);
    // eslint-disable-next-line no-new-func
    return Boolean(new Function(...names, `return (${expr});`)(...names.map((n) => vars[n])));
  } catch (e) {
    return false;
  }
}

// مثلِ `evalExpr` ولی مقدارِ خام (رشته/تابع) را هم برمی‌گرداند — قالبِ برچسبِ
// دکمه و تابعِ `serverResendSeconds` عدد نیستند و باید عیناً اجرا شوند.
function evalRaw(expr, vars) {
  try {
    const names = Object.keys(vars);
    // eslint-disable-next-line no-new-func
    return new Function(...names, `return (${expr});`)(...names.map((n) => vars[n]));
  } catch (e) {
    return undefined;
  }
}

// همان نگاشتِ ارقامِ صفحه‌ی ورود (`toFa` در `login.js`: `FA[+d]`). اینجا فقط
// برای *ساختنِ انتظار* به کار می‌رود؛ خودِ قالبِ برچسب از سورس اجرا می‌شود.
const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

// ---------- ابزارِ خواندنِ کلیدهای یک شیءِ نوشته‌شده ----------
function objectArgsOf(src, callName) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf(`${callName}({`, i)) !== -1) {
    let depth = 0, j = i + callName.length;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    out.push(src.slice(i + callName.length + 1, j + 1));
    i = j;
  }
  return out;
}

// جداکردنِ اعضای سطحِ بالا با احترام به آکولادهای تودرتو
function topLevelParts(objText) {
  const inner = objText.slice(1, -1);
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of inner) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}
function keysOf(objText) {
  const keys = [], spreads = [];
  for (const part of topLevelParts(objText)) {
    if (part.startsWith('...')) { spreads.push(part.slice(3).trim()); continue; }
    // شکلِ خلاصه (`phone,`) هم یک کلید است — اگر شمرده نشود، یک فیلدِ تازه
    // می‌تواند بی‌سروصدا از فهرستِ مجاز رد شود.
    const m = part.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/);
    if (m) keys.push(m[1]);
  }
  return { keys, spreads };
}

console.log('\n=== OTP resend window guard (reload-proof deadline) ===\n');

/* ================= ۱) نوشتنِ مهلتِ مطلق — Express ================= */
console.log('-- ۱) نوشتن: مهلتِ مطلق، نه ثانیه‌ی مانده (Express) --');

const saveCalls = objectArgsOf(EXPRESS, 'saveState');
check('نگهبانِ خودش: سه جای نوشتنِ وضعیت پیدا شد (نگهبانِ خالی سبز نشود)',
  saveCalls.length === 3, `پیدا شد: ${saveCalls.length}`);

const writerKeys = new Set();
const writerSpread = [];
for (const call of saveCalls) {
  const { keys, spreads } = keysOf(call);
  keys.forEach((k) => writerKeys.add(k));
  writerSpread.push(spreads.join(','));
}
const ALLOWED_KEYS = new Set(['phone', 'resendAt', 'resendTotal', 'codeExpiresAt']);
const strayKeys = [...writerKeys].filter((k) => !ALLOWED_KEYS.has(k));
check('هیچ کلیدِ تازه‌ای در وضعیت ذخیره نمی‌شود (مثلِ «چند ثانیه مانده»)',
  strayKeys.length === 0,
  strayKeys.length ? `کلیدِ اضافه: ${strayKeys.join('، ')}` : [...writerKeys].join('، '));

const resendWrites = [...EXPRESS.matchAll(/resendAt:\s*([^,\n]+)/g)].map((m) => m[1].trim());
check('هر سه جای نوشتن، مهلت را با `Date.now()` مُهر می‌کنند',
  resendWrites.length === 3 && resendWrites.every((e) => e.startsWith('Date.now() +')),
  `مقدارها: ${resendWrites.join(' | ')}`);

const writeExpr = grab(EXPRESS, /resendAt:\s*(Date\.now\(\) \+ retry \* 1000)/g);
check('عبارتِ نویسنده‌ی مسیرِ اصلی خوانا و یکتاست',
  writeExpr.count === 1, `تطبیق: ${writeExpr.count}`);
if (writeExpr.expr) {
  const until = evalExpr(writeExpr.expr, { Date: fakeNow(1_000_000), retry: 30 });
  check('اجرا: مهلتِ نوشته‌شده یک لحظه‌ی *آینده* است (۳۰ ثانیه بعد)، نه شمارنده',
    until === 1_030_000, `شد: ${until}`);
}

// عمرِ خودِ کد باید در همان وضعیت بماند، وگرنه هشدارِ «کد منقضی شده» دیگر کار نمی‌کند
const expiryWriters = saveCalls.filter((c) => /codeExpiresAt:/.test(c) || /\.\.\.\w/.test(c));
check('هر جای نوشتن، عمرِ کد را هم دارد (تازه حساب می‌کند یا از وضعیتِ قبلی می‌برد)',
  expiryWriters.length === saveCalls.length && saveCalls.length === 3,
  `انطباق: ${expiryWriters.length}/${saveCalls.length}`);

/* ================= ۲) خواندن — Express ================= */
console.log('\n-- ۲) خواندن: هر تیک از مهلتِ همان لحظه (Express) --');

const readerExpr = grab(EXPRESS, /const leftResend = ([^;]+);/g);
check('عبارتِ خواندنِ ثانیه‌شمار یکتاست و پیدا شد',
  readerExpr.count === 1, `تطبیق: ${readerExpr.count}`);
if (readerExpr.expr) {
  const at = (now, resendAt) => evalExpr(readerExpr.expr, {
    Date: fakeNow(now), st: { resendAt },
  });
  const fresh = at(1_000_000, 1_030_000);
  const reloaded = at(1_010_000, 1_030_000);      // رفرش، ده ثانیه بعد
  const late = at(1_030_001, 1_030_000);          // یک میلی‌ثانیه بعد از مهلت
  check('اجرا: بلافاصله بعد از ارسال، پنجره‌ی کامل (۳۰) دیده می‌شود',
    fresh === 30, `شد: ${fresh}`);
  check('اجرا: رفرشِ ده ثانیه‌ای شمارش را از صفر شروع نمی‌کند — ۲۰ می‌ماند',
    reloaded === 20, `شد: ${reloaded}`);
  check('اجرا: بعد از گذشتنِ مهلت، عدد صفر یا منفی می‌شود (دکمه باز می‌شود)',
    late <= 0, `شد: ${late}`);
}

const pctExpr = grab(EXPRESS, /const pct = ([^;]+);/g);
check('عبارتِ نوارِ پیشرفت یکتاست و پیدا شد', pctExpr.count === 1, `تطبیق: ${pctExpr.count}`);
if (pctExpr.expr) {
  // نوار باید نسبتِ *سپری‌شده* به «کلِ مهلتِ ذخیره‌شده» را نشان دهد؛ اگر کل ذخیره
  // نشود، بعد از رفرش مخرج اشتباه می‌شود و نوار می‌پرد.
  const pct = evalExpr(pctExpr.expr, {
    Math, leftResend: 20, total: 30,
  });
  check('اجرا: وسطِ پنجره، نوارِ پیشرفت یک‌سومِ مسیر را نشان می‌دهد',
    Math.abs(pct - 33.333) < 0.01, `شد: ${pct}`);
}

check('هر تیک از وضعیتِ همان لحظه حساب می‌شود، نه از شمارنده‌ای که کم می‌شود',
  /setInterval\(renderCountdown, 1000\)/.test(EXPRESS) &&
  /function renderCountdown\(\)\s*\{\s*\n\s*const st = loadState\(\);/.test(EXPRESS) &&
  !/\bleftResend\s*[-+]=/.test(EXPRESS),
  'تیک یا از وضعیت نمی‌خواند یا شمارنده کم می‌کند');

check('برگشت به تب (تایمرِ کندشده) فوراً همگام می‌شود',
  /visibilitychange/.test(EXPRESS) && /if \(!document\.hidden && !stepCode\.classList\.contains\('hidden'\)\) renderCountdown\(\)/.test(EXPRESS));

check('وضعیت از یک کلیدِ واحد می‌گذرد و localStorage فقط از همان راه خوانده می‌شود',
  /const STATE_KEY = 'pg_otp_state';/.test(EXPRESS) &&
  ([...EXPRESS.matchAll(/localStorage\.(setItem|getItem|removeItem)\(([^,)]+)/g)]
    .every((m) => m[2].trim() === 'STATE_KEY')),
  [...EXPRESS.matchAll(/localStorage\.(setItem|getItem|removeItem)\(([^,)]+)/g)].map((m) => m[2].trim()).join(' | '));

/* ================= ۳) بازیابی بعد از رفرش — Express ================= */
console.log('\n-- ۳) بازیابی: برگشتن به همان‌جایی که بود (Express) --');

const restoreExpr = grab(EXPRESS, /const resendLeft = ([^;]+);/g);
check('عبارتِ دروازه‌ی بازیابی یکتاست و پیدا شد',
  restoreExpr.count === 1, `تطبیق: ${restoreExpr.count}`);
if (restoreExpr.expr) {
  const left = evalExpr(restoreExpr.expr, { Date: fakeNow(1_005_000), st: { resendAt: 1_030_000 } });
  check('اجرا: مهلتِ باقی‌مانده در لحظه‌ی بازگشت بازمحاسبه می‌شود (۲۵ ثانیه)',
    left === 25_000, `شد: ${left}`);
}
check('بازیابی همان مرحله‌ی کد را برمی‌گرداند و شمارش را دوباره راه می‌اندازد',
  /function goToCodeStep\(phone\)[\s\S]{0,600}?startCountdown\(\);/.test(EXPRESS) &&
  /\(function restore\(\)[\s\S]{0,700}?goToCodeStep\(st\.phone\);/.test(EXPRESS));
check('اگر هم مهلت و هم عمرِ کد گذشته باشد، وضعیتِ کهنه پاک می‌شود',
  /if \(resendLeft <= 0 && codeLeft <= 0\) \{ clearState\(\); return; \}/.test(EXPRESS));

/* ================= ۴) نوشتن و خواندن — Next ================= */
console.log('\n-- ۴) همان قرارداد در فروشگاهِ Next --');

const nextWriter = grab(NEXT, /const until = (Date\.now\(\) \+ seconds \* 1000);/g);
check('لنگرِ نویسنده‌ی Next پیدا شد و یکتاست', nextWriter.count === 1, `تطبیق: ${nextWriter.count}`);
if (nextWriter.expr) {
  const until = evalExpr(nextWriter.expr, { Date: fakeNow(1_000_000), seconds: 30 });
  check('اجرا (Next): مهلتِ نوشته‌شده مطلق است (۳۰ ثانیه بعد از همین لحظه)',
    until === 1_030_000, `شد: ${until}`);
}

// چرا مهلت به‌همراهِ شماره ذخیره می‌شود: بدونِ آن، بعد از رفرش معلوم نیست این
// مهلت مالِ کدام شماره است. آن‌وقت تنها راهِ رسیدنِ کاربر به مرحله‌ی کد
// «فرستادنِ دوباره‌ی کد» است که خودش مهلت را با یک پنجره‌ی تازه بازنویسی
// می‌کند — یعنی عددِ ذخیره‌شده هیچ‌وقت به چشم نمی‌آمد و مکانیزم مرده بود.
check('مهلت به‌همراهِ شماره ذخیره می‌شود تا بعد از رفرش معلوم باشد مالِ کدام شماره است',
  NEXT.includes('localStorage.setItem(RESEND_KEY, JSON.stringify({ phone, until }))') &&
  NEXT.includes('JSON.parse(localStorage.getItem(RESEND_KEY) || "null")') &&
  NEXT.includes('if (!stored?.phone || !Number.isFinite(remain) || remain <= 0) return;'));

const resumeAnchor = NEXT.indexOf('localStorage.getItem(RESEND_KEY)');
const resume = resumeAnchor >= 0 ? NEXT.slice(resumeAnchor, resumeAnchor + 700) : '';
check('بازگشت به صفحه کاربر را به همان مرحله‌ی کد می‌برد (وگرنه مهلت هرگز به چشم نمی‌آید)',
  resumeAnchor >= 0 &&
  resume.includes('setPhone(stored.phone);') &&
  resume.includes('setCooldownUntil(until);') &&
  resume.includes('setStep("otp");'),
  resumeAnchor < 0
    ? 'لنگرِ خواندنِ وضعیت در LoginForm.tsx پیدا نشد'
    : resume.replace(/\s+/g, ' ').slice(0, 100));
const clearCalls = NEXT.split('clearCooldown();').length - 1;
check('بعد از ورودِ موفق یا «تغییر شماره» مهلتِ ذخیره‌شده پاک می‌شود',
  clearCalls >= 2 && NEXT.includes('localStorage.removeItem(RESEND_KEY)'),
  `جاهای صدا‌زدن: ${clearCalls}`);

const nextReader = grab(NEXT, /const remain = ([^;]+);/g);
check('لنگرِ خواننده‌ی Next پیدا شد و یکتاست', nextReader.count === 1, `تطبیق: ${nextReader.count}`);
if (nextReader.expr) {
  const remain = evalExpr(nextReader.expr, { Date: fakeNow(1_010_000), until: 1_030_000 });
  check('اجرا (Next): رفرشِ ده ثانیه‌ای همان ۲۰ ثانیه را ادامه می‌دهد',
    remain === 20, `شد: ${remain}`);
}

/* ================= ۵) تیکِ مهلت‌محور، نه شمارنده‌ی کاهنده ================= */
console.log('\n-- ۵) تیکِ هر دو سمت از مهلت بازمحاسبه می‌شود (خواب/تبِ مخفی) --');

check('نگهبانِ Next: شمارنده‌ی کاهنده‌ای در کد نیست',
  !/setCooldown\(\(c\)\s*=>\s*Math\.max\(0,\s*c - 1\)\)/.test(NEXT),
  'شمارنده‌ی کاهنده پیدا شد — تبِ مخفی/خواب آن را عقب می‌اندازد');

const nextTick = grab(NEXT, /const left = ([^;]+);/g);
check('لنگرِ تیکِ Next پیدا شد و یکتاست', nextTick.count === 1, `تطبیق: ${nextTick.count}`);
if (nextTick.expr) {
  const jumped = evalExpr(nextTick.expr, {
    Math, Date: fakeNow(1_600_000), cooldownUntil: 1_030_000, // ده دقیقه بعد از مهلت
  });
  check('اجرا (Next): اگر تب ده دقیقه خواب رفته باشد، تیکِ بعدی صفر می‌دهد (نه ۲۹)',
    jumped === 0, `شد: ${jumped}`);
  const mid = evalExpr(nextTick.expr, {
    Math, Date: fakeNow(1_010_000), cooldownUntil: 1_030_000,
  });
  check('اجرا (Next): وسطِ پنجره هم عددِ درست را می‌دهد', mid === 20, `شد: ${mid}`);
}
check('تیکِ Next همان مهلتِ مطلق را مصرف می‌کند و با تمام‌شدنش می‌ایستد',
  /setInterval\(tick, 1000\)/.test(NEXT) &&
  /if \(left <= 0\) setCooldownUntil\(0\);/.test(NEXT) &&
  /useEffect\(\(\) => \{\s*\n\s*if \(cooldownUntil <= 0\) return;/.test(NEXT));

/* ================= ۶) سرور، تنها منبعِ حقیقتِ مهلت ================= */
// قراردادِ چهارم (و مهم‌ترینش): عددی که کاربر می‌شمارد باید *همان* عددی باشد
// که سرور اعمال می‌کند. سه حالت دارد و هر سه باید از سرور خوانده شوند —
// وگرنه عددِ روی صفحه و عددِ واقعیِ سرور دو چیزِ متفاوت می‌شوند:
//   • ارسالِ موفق → سرور مهلتِ کامل را می‌دهد (`RESEND_COOLDOWN_MS`).
//   • ۴۲۹ («کدِ قبلی هنوز معتبر است») → سرور مهلتِ *باقی‌مانده* را می‌دهد که
//     همیشه از مهلتِ کامل کوتاه‌تر است؛ فرانت باید خودش را با آن کوتاه کند.
//   • سرورِ بی‌عدد → هر دو فروشگاه باید یک پشتیبانِ نام‌دارِ یکسان داشته باشند،
//     وگرنه با اولین پاسخِ بدونِ عدد، دو فروشگاه دو چیزِ متفاوت نشان می‌دهند.
console.log('\n-- ۶) مهلتِ واقعیِ سرور (retryAfter) = همان چیزی که فرانت می‌شمارد --');

const API_SRC = SOURCES['lib/api.ts'];
const TYPES_SRC = SOURCES['lib/types.ts'];
const AUTH_SRC = SOURCES['routes/auth.js'];

// الگوهای *کد* روی متنِ بدونِ کامنت اجرا می‌شوند.
//
// چرا: یک کامنت می‌تواند عیناً «startCooldown(30)» را برای توضیح بنویسد (و همین
// امروز یکی نوشت)؛ آن‌وقت نگهبانی که «عددِ هاردکد» را می‌گیرد بی‌دلیل قرمز
// می‌شود و آدم سراغِ کامنت می‌رود، نه کد. `//` فقط وقتی کامنت حساب می‌شود که
// پیشش فاصله/ابتدا/ مرزِ بلوک باشد — وگرنه `https://…` داخلِ رشته هم کامنت
// دیده می‌شد.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[\s;{}([])\/\/[^\n]*/gm, '$1');
const NEXT_CODE = stripComments(NEXT);
const EXPRESS_CODE = stripComments(EXPRESS);

// ۶.۱) خودِ سرور: مهلتِ کامل در پاسخِ موفق، مهلتِ باقی‌مانده در ۴۲۹
check('سرور در پاسخِ موفق مهلتِ کاملِ ارسال مجدد را می‌فرستد',
  AUTH_SRC.includes('retryAfter: Math.ceil(RESEND_COOLDOWN_MS / 1000),'));

const remaining = grab(AUTH_SRC,
  /const wait = (Math\.ceil\(\(RESEND_COOLDOWN_MS - \(now - existing\.last_sent_at\)\) \/ 1000\));/g);
check('سرور در ۴۲۹ لنگرِ «مهلتِ باقی‌مانده» را دارد و یکتاست',
  remaining.count === 1, `تطبیق: ${remaining.count}`);
if (remaining.expr) {
  const rest = evalExpr(remaining.expr, {
    Math, RESEND_COOLDOWN_MS: 30_000,
    now: 1_000_000, existing: { last_sent_at: 1_000_000 - 22_000 },
  });
  check('اجرا: ۲۲ ثانیه بعد از ارسال، سرور ۸ ثانیه مهلت می‌دهد (نه ۳۰)',
    rest === 8, `شد: ${rest}`);
}
check('همان عددِ باقی‌مانده در بدنه‌ی ۴۲۹ برمی‌گردد (کوتاه‌ترِ واقعی، نه مهلتِ کامل)',
  AUTH_SRC.split('retryAfter: wait });').length - 1 === 1,
  `${AUTH_SRC.split('retryAfter: wait });').length - 1} جا`);

// ۶.۲) Express: عدد از پاسخ می‌آید، نه از کد
const exRetry = grab(EXPRESS,
  /const retry = (Number\(res\.retryAfter\) \|\| FALLBACK_RESEND_SECONDS);/g);
check('Express: مهلت از پاسخِ سرور خوانده می‌شود (نه عددِ هاردکد)',
  exRetry.count === 1, `تطبیق: ${exRetry.count}`);
if (exRetry.expr) {
  const fromServer = evalExpr(exRetry.expr,
    { Number, res: { retryAfter: 12 }, FALLBACK_RESEND_SECONDS: 30 });
  const noNumber = evalExpr(exRetry.expr,
    { Number, res: {}, FALLBACK_RESEND_SECONDS: 30 });
  check('اجرا (Express): سرور گفته ۱۲ → فرانت ۱۲ می‌شمارد (نه ۳۰)',
    fromServer === 12, `شد: ${fromServer}`);
  check('اجرا (Express): سرورِ بی‌عدد → همان پشتیبانِ نام‌دار',
    noNumber === 30, `شد: ${noNumber}`);
}

const exAdopt = [...EXPRESS.matchAll(/resendAt:\s*Date\.now\(\) \+ wait \* 1000/g)].length;
check('Express: هر دو مسیرِ ۴۲۹ مهلتِ *سرور* را می‌نویسند (خودش را کوتاه می‌کند)',
  exAdopt === 2, `پیدا شد: ${exAdopt}`);
const exReadsWait = [...EXPRESS.matchAll(/Number\(err\?\.data\?\.retryAfter\)/g)].length;
check('Express: هر دو مسیر عددِ سرور را از بدنهٔ خطا می‌خوانند',
  exReadsWait === 2, `پیدا شد: ${exReadsWait}`);
check('Express: پنجرهٔ کوتاه‌تر، «کلِ مهلت» را هم کوتاه می‌کند (نوارِ پیشرفت دروغ نگوید)',
  [...EXPRESS.matchAll(/resendTotal:\s*wait/g)].length === 2,
  `پیدا شد: ${[...EXPRESS.matchAll(/resendTotal:\s*wait/g)].length}`);

// ۶.۳) Next: همان قرارداد، این‌بار در فروشگاهِ دیگر
const nextFromServer = [...NEXT_CODE.matchAll(/startCooldown\(serverResendSeconds\(res\)\)/g)].length;
check('Next: هر دو جای شروعِ پنجره، مهلت را از پاسخِ سرور می‌گیرند',
  nextFromServer === 2, `پیدا شد: ${nextFromServer}`);
check('Next: هیچ پنجره‌ای با عددِ هاردکد باز نمی‌شود (نه ۳۰، نه ۶۰)',
  !/startCooldown\(\s*[\d۰-۹]/.test(NEXT_CODE), 'فراخوانیِ عددی پیدا شد');

const secondsGuard = grab(NEXT, /if \((Number\.isFinite\(seconds\) && seconds > 0)\) return seconds;/g);
check('Next: مهلتِ نامعتبر/صفر رد می‌شود و به پشتیبان می‌رسد',
  secondsGuard.count === 1 && NEXT.includes('return FALLBACK_RESEND_SECONDS;'),
  `تطبیق: ${secondsGuard.count}`);
if (secondsGuard.expr) {
  check('اجرا (Next): ۱۲ ثانیهٔ سرور معتبر است و ۰/NaN نه',
    evalTruthy(secondsGuard.expr, { seconds: 12 }) === true &&
    evalTruthy(secondsGuard.expr, { seconds: 0 }) === false &&
    evalTruthy(secondsGuard.expr, { Number, seconds: NaN }) === false,
    `۱۲→${evalTruthy(secondsGuard.expr, { seconds: 12 })} · ۰→${evalTruthy(secondsGuard.expr, { seconds: 0 })}`);
}

const nextAdopt = [...NEXT_CODE.matchAll(/startCooldown\(wait\)/g)].length;
check('Next: ۴۲۹ در هر دو مرحله پنجره را با مهلتِ سرور کوک می‌کند (کوتاه‌تر → کوتاه‌تر)',
  nextAdopt === 2, `پیدا شد: ${nextAdopt}`);
const nextWaitRead = [...NEXT_CODE.matchAll(/const wait = err instanceof ApiError \? Number\(err\.retryAfter\) : NaN;/g)].length;
check('Next: عددِ سرور از خودِ خطای ۴۲۹ می‌آید',
  nextWaitRead === 2, `پیدا شد: ${nextWaitRead}`);
check('Next: کلیدِ درست پاک می‌شود (خداحافظی با `pg_otp_resend_<شماره>` که هیچ‌وقت نوشته نمی‌شد)',
  !/pg_otp_resend_\$/.test(NEXT_CODE) && NEXT_CODE.split('clearCooldown();').length - 1 >= 3,
  `${NEXT_CODE.split('clearCooldown();').length - 1} جا`);

// ۶.۴) لایهٔ انتقال: بدونِ این دو، LoginForm راهی برای خواندنِ عدد ندارد
check('ApiError عددِ مهلتِ سرور را حمل می‌کند',
  /retryAfter\?: number;/.test(API_SRC) && API_SRC.includes('err.retryAfter = wait;'));
check('fetcher در ۴۲۹ عدد را از بدنهٔ پاسخ برمی‌دارد',
  API_SRC.includes('retryAfter?: number;') && /const wait = Number\(data\.retryAfter\);/.test(API_SRC));
check('نوعِ OtpRequestResponse میدانِ retryAfter را دارد (ریشهٔ هاردکدِ ۳۰ نبودِ همین فیلد بود)',
  /interface OtpRequestResponse \{[\s\S]*?retryAfter\?: number;[\s\S]*?\n\}/.test(TYPES_SRC));

// ۶.۵) پشتیبانِ یکسان — اگر دو فروشگاه دو عددِ متفاوت داشته باشند،
// با اولین پاسخِ بدونِ عدد دو چیزِ متفاوت نشان می‌دهند.
const fbOf = (src) => grab(src, /const FALLBACK_RESEND_SECONDS = (\d+);/g);
const fbExpress = fbOf(EXPRESS);
const fbNext = fbOf(NEXT);
check('هر دو فروشگاه پشتیبانِ نام‌دار دارند (عددِ جادوییِ داخلِ شرط نه)',
  fbExpress.count === 1 && fbNext.count === 1,
  `Express: ${fbExpress.count} · Next: ${fbNext.count}`);
check('عددِ پشتیبانِ دو فروشگاه یکی است',
  fbExpress.expr === fbNext.expr,
  `Express: ${fbExpress.expr} · Next: ${fbNext.expr}`);

/* ================= ۷) خودآزمونِ نگهبان ================= */
console.log('\n-- ۷) خودآزمونِ نگهبان (نگهبانِ خراب باید قرمز شود) --');

// نمونه‌ی غلطِ کلاسیک: ذخیره‌ی «چند ثانیه مانده» به‌جای مهلت
const WRONG_WRITER = "saveState({ phone, resendLeft: 30 });";
const wrongCall = objectArgsOf(WRONG_WRITER, 'saveState')[0];
const wrongKeys = keysOf(wrongCall).keys;
const wrongStray = wrongKeys.filter((k) => !ALLOWED_KEYS.has(k));
check('خودآزمون: نویسنده‌ی «ثانیه‌ی مانده» رد می‌شود',
  wrongStray.length === 1 && wrongStray[0] === 'resendLeft' &&
  !/resendAt: Date\.now\(\)/.test(WRONG_WRITER),
  `کلیدهای نمونه: ${wrongKeys.join('، ')} · بیرون از فهرستِ مجاز: ${wrongStray.join('، ') || 'هیچ'}`);

// نمونه‌ی درستِ همان الگو، تا خودآزمون فقط «چیزِ غلط را گرفتن» نباشد
const RIGHT_WRITER = "saveState({ phone, resendAt: Date.now() + retry * 1000, resendTotal: retry, codeExpiresAt: Date.now() + ttl * 1000 });";
const rightKeys = keysOf(objectArgsOf(RIGHT_WRITER, 'saveState')[0]).keys;
check('خودآزمون: همان الگو روی نمونه‌ی درست چیزِ اضافه‌ای پیدا نمی‌کند (شکلِ خلاصه هم شمرده می‌شود)',
  rightKeys.every((k) => ALLOWED_KEYS.has(k)) && rightKeys.length === 4,
  `کلیدهای نمونه: ${rightKeys.join('، ')}`);

check('خودآزمون: الگوی «کم‌کردنِ شمارنده» نمونه‌ی کاهنده را می‌گیرد',
  /setCooldown\(\(c\)\s*=>\s*Math\.max\(0,\s*c - 1\)\)/.test(
    'const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);'));

check('خودآزمون: ساعتِ جعلی واقعاً بر نتیجه اثر دارد (وگرنه اعداد بی‌معنی‌اند)',
  evalExpr(readerExpr.expr || '0', { Date: fakeNow(1_000_000), st: { resendAt: 1_030_000 } }) === 30 &&
  evalExpr(readerExpr.expr || '0', { Date: fakeNow(1_020_000), st: { resendAt: 1_030_000 } }) === 10);

// --- خودآزمونِ قراردادِ تازه: مهلتِ سرور ---
check('خودآزمون: پشتیبانِ ناهمخوان دو فروشگاه گرفته می‌شود',
  fbOf('const FALLBACK_RESEND_SECONDS = 30;').expr !==
  fbOf('const FALLBACK_RESEND_SECONDS = 60;').expr);
check('خودآزمون: پنجره‌ای که با عددِ هاردکد باز شود گرفته می‌شود',
  /startCooldown\(\s*[\d۰-۹]/.test('startCooldown(30);') &&
  !/startCooldown\(\s*[\d۰-۹]/.test('startCooldown(serverResendSeconds(res)); startCooldown(wait);'));
check('خودآزمون: شرطِ مهلتِ نامعتبر، عددِ منفی را هم رد می‌کند',
  evalTruthy(secondsGuard.expr || 'true', { seconds: -3 }) === false);
check('خودآزمون: مهلتِ باقی‌ماندهٔ سرور با مهلتِ کاملِ ۳۰ یکی نیست (وگرنه کوتاه‌شدن بی‌معنی است)',
  evalExpr(remaining.expr || '0', {
    Math, RESEND_COOLDOWN_MS: 30_000,
    now: 1_000_000, existing: { last_sent_at: 1_000_000 - 1_000 },
  }) < 30);

/* ================= ۸) آزمونِ زنده: دو درخواستِ پشتِ هم روی سرورِ واقعی ================= */
// هرچه بالاتر سنجیده شد، «سورسِ درست سرِ جایش است» را ثابت می‌کند و نه بیشتر.
// عددی که سرورِ واقعی می‌دهد و عددی که کاربر می‌شمارد، تا وقتی هیچ درخواستِ
// واقعی‌ای زده نشود، دو ادعای جدا هستند — و همین شکاف یک‌بار واقعاً باز ماند.
// اینجا یک سرورِ سندباکس (دیتابیسِ یک‌بارمصرف، همان الگوی
// `tests/otp-attempt-cap.js`) بالا می‌آید، درخواستِ اول کد را می‌گیرد، بعد از
// گذشتنِ بخشی از پنجره درخواستِ دوم می‌رود، و ۴۲۹ باید **همان مهلتِ
// باقی‌مانده‌ی واقعی** را بدهد — نه پنجره‌ی کاملِ ۳۰. بعد همان عددِ زنده داخلِ
// عبارت‌های هر دو فرانت **اجرا** می‌شود تا معلوم شود عددِ روی دکمه همان است.
//
// دو نکته‌ی ظریف که خودِ آزمون هم می‌سنجدشان:
//   • دو درخواست را بی‌فاصله بزنی، سرورِ درست هنوز ۳۰ می‌گوید: مهلتِ
//     باقی‌مانده با `ceil` گرد می‌شود و ۲۹٫۸ ثانیه هم یعنی «۳۰ ثانیه صبر کن».
//     پس فاصله‌ی عمدی گذاشته می‌شود و *همان فاصله* هم بررسی می‌شود، وگرنه
//     آزمون می‌توانست بدونِ دیدنِ «کوتاه‌تر» سبز شود.
//   • شاهدِ «باقی‌مانده‌ی واقعی» از **دیتابیسِ سندباکس** می‌آید
//     (`last_sent_at`)، نه از پیامِ سرور: عدد را خودمان از همان مُهر بازسازی
//     می‌کنیم و در بازه‌ی فرستادن/گرفتنِ همان درخواست می‌سنجیم.
console.log('\n-- ۸) آزمونِ زنده: دو درخواستِ پشتِ هم روی سرورِ واقعی --');

const PORT = 3994;        // دود روی ۳۹۹۹ و مرزِ پنج‌تایی روی ۳۹۹۳ است
const GAP_MS = 2200;      // بخشی از پنجره باید واقعاً بگذرد تا «کوتاه‌تر» دیده شود
const SANDBOX_DATA = makeSandboxData();
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let serverOut = '';
let child = null;

// لنگرِ «مهلتِ کامل» از خودِ سورسِ سرور خوانده می‌شود، نه دوباره نوشته شود.
const cooldownGrab = grab(AUTH_SRC, /const RESEND_COOLDOWN_MS = ([\d_]+) \* 1000;/g);
const COOLDOWN_MS = cooldownGrab.expr ? Number(cooldownGrab.expr.replace(/_/g, '')) * 1000 : NaN;

// خواندنِ مستقیمِ ردیفِ کد از دیتابیسِ سندباکس (`node:sqlite` همان وابستگیِ
// موجودِ `lib/db.js` و `test-smoke.js` است). `null` یعنی ردیف نیست، `undefined`
// یعنی خواندن شکست خورد — این دو قاطی نمی‌شوند، وگرنه «ردیف نیست» و «خوانده
// نشد» یکی دیده می‌شوند.
function storedOtp(phone) {
  const dbPath = path.join(SANDBOX_DATA, 'polasco.db');
  let db = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    try { db = new DatabaseSync(dbPath, { readOnly: true }); }
    catch (e) { db = new DatabaseSync(dbPath); }
    const row = db.prepare('SELECT last_sent_at, sent_today, attempts FROM otp_codes WHERE phone = ?').get(phone);
    return row || null;
  } catch (e) {
    return undefined;
  } finally {
    try { if (db) db.close(); } catch (e) { /* بی‌اهمیت */ }
  }
}

async function api(method, url, body) {
  const res = await fetch(BASE + '/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* بدنه‌ی غیرِ JSON */ }
  return { status: res.status, data };
}

// «بالا آمدن» فقط وقتی باور می‌شود که پاسخ، پاسخِ **خودِ ما** باشد (`ok: true`
// روی JSON). یک شنونده‌ی غریبه روی همان پورت با هر پاسخِ ۲۰۰ ساده، آزمون را
// با پیامی گمراه‌کننده می‌انداخت.
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

async function stopServer() {
  if (!child) return;
  try { child.kill(); } catch (e) { /* بی‌اهمیت */ }
  await Promise.race([
    new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r))),
    sleep(1000),
  ]);
}

(async () => {
  check('لنگرِ مهلتِ کاملِ سرور (`RESEND_COOLDOWN_MS`) یکتاست',
    cooldownGrab.count === 1, `تطبیق: ${cooldownGrab.count}`);

  // پیش‌پرواز: پورتِ اشغال یعنی سرورِ ما هرگز بالا نمی‌آید و آزمون بی‌معنی می‌شود.
  const free = await portFree(PORT);
  check(`پورتِ ${PORT} برای سندباکس آزاد است`, free,
    free ? '' : `فرآیندِ دیگری پورتِ ${PORT} را گرفته — همان را ببند و دوباره اجرا کن`);
  // `return finish()` و نه `return`: بدونِ آن، پورتِ اشغال یعنی پروسه با کدِ
  // صفر تمام می‌شود و «سبزِ خالی» می‌گیریم — همان چیزی که این نگهبان‌ها
  // برای گرفتنش ساخته شده‌اند.
  if (!free) { removeSandboxData(SANDBOX_DATA); return finish(); }

  child = spawn(process.execPath, [path.join(DIR, 'server.js')], {
    cwd: DIR,
    // `SMS_API_KEY: ''` عمدی است: با یک کلیدِ خالی، `dotenv` (که مقدارِ موجود را
    // بازنویسی نمی‌کند) نمی‌تواند از `.env`ی توسعه‌دهنده کلیدِ واقعی بیاورد.
    // بدونِ این خط، روی ماشینی که کلیدِ پیامک دارد، آزمون به یک شماره‌ی
    // تصادفیِ واقعی پیامک می‌فرستاد و کد هم جایی چاپ نمی‌شد.
    env: serverEnv(SANDBOX_DATA, { PORT: String(PORT), SMS_API_KEY: '' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { serverOut += d; });
  child.stderr.on('data', (d) => { serverOut += d; });

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = await ownServerHealthy();
    if (!up) await sleep(300);
  }
  check('سرورِ سندباکسِ خودمان بالا آمد (نه شنونده‌ی غریبه روی همان پورت)', up,
    up ? '' : `${serverOut.slice(-400)}\n     └─ اگر خالی است، پورتِ ${PORT} احتمالاً اشغال است (EADDRINUSE).`.trim());
  if (!up) { await stopServer(); removeSandboxData(SANDBOX_DATA); return finish(); }

  const phone = '0913' + String(Math.floor(1000000 + Math.random() * 8999999));

  // ---------- درخواستِ اول: پنجره‌ی کامل ----------
  const ch1 = await api('GET', '/auth/otp/challenge');
  check('توکنِ چالش گرفته شد (بدونِ آن مسیرِ کد اصلاً باز نمی‌شود)',
    ch1.status === 200 && typeof ch1.data?.token === 'string', `${ch1.status} ${JSON.stringify(ch1.data)}`);
  const t1send = Date.now();
  const r1 = await api('POST', '/auth/otp/request', { phone, challenge: ch1.data?.token });
  const t1recv = Date.now();
  check('درخواستِ اولِ کد: ۲۰۰', r1.status === 200 && r1.data?.ok === true,
    `${r1.status} ${JSON.stringify(r1.data)}`);
  check('پاسخِ موفق پنجره‌ی کاملِ مهلت را می‌دهد (۳۰ ثانیه)',
    r1.data?.retryAfter === COOLDOWN_MS / 1000, `retryAfter=${r1.data?.retryAfter} · کامل=${COOLDOWN_MS / 1000}`);
  check('سرورِ سندباکس در حالتِ «آزمایشی» است — آزمون هیچ پیامکِ واقعی نمی‌فرستد',
    r1.data?.mode === 'test', `mode=${r1.data?.mode}`);
  const row1 = storedOtp(phone);
  check('ردیفِ کد با مُهرِ زمانی در دیتابیسِ سندباکس نوشته شد',
    Boolean(row1) && Number.isFinite(row1.last_sent_at) && Math.abs(row1.last_sent_at - t1send) < 10_000,
    row1 ? `last_sent_at=${row1.last_sent_at} · t1=${t1send}` : 'ردیف پیدا نشد');

  // ---------- فاصله‌ی عمدی، بعد درخواستِ دوم ----------
  await sleep(GAP_MS);
  const ch2 = await api('GET', '/auth/otp/challenge');
  const t2send = Date.now();
  const r2 = await api('POST', '/auth/otp/request', { phone, challenge: ch2.data?.token });
  const t2recv = Date.now();

  const stamp = row1?.last_sent_at;
  const cooldownSec = COOLDOWN_MS / 1000;
  const retry = Number(r2.data?.retryAfter);
  // بازه‌ی واقعی: سرور در درخواستِ اول `last_sent_at = now` را نوشته و مهلت را
  // از همان حساب می‌کند. لحظه‌ی محاسبه‌ی سرور جایی بینِ فرستادن و گرفتنِ
  // درخواستِ دوم است، پس عددِ درست در همین بازه می‌افتد (اگر مرزِ ثانیه رد
  // شود، دو عددِ مجاور — برای همین پهنای بازه هم سنجیده می‌شود).
  const lower = Number.isFinite(stamp) ? Math.ceil((COOLDOWN_MS - (t2recv - stamp)) / 1000) : NaN;
  const upper = Number.isFinite(stamp) ? Math.ceil((COOLDOWN_MS - (t2send - stamp)) / 1000) : NaN;

  check('درخواستِ دوم: ۴۲۹ (کدِ قبلی هنوز معتبر است)', r2.status === 429,
    `${r2.status} ${JSON.stringify(r2.data)}`);
  check('فاصله‌ی عمدی واقعاً گذشت (وگرنه عددِ کامل برمی‌گشت و آزمون چیزِ بی‌ربطی را سبز می‌کرد)',
    t2send - t1recv >= GAP_MS - 100, `فاصله: ${t2send - t1recv}ms`);
  check('۴۲۹ مهلتِ کوتاه‌ترِ واقعی می‌دهد، نه پنجره‌ی کاملِ ۳۰ ثانیه',
    Number.isFinite(retry) && retry < cooldownSec, `سرور=${r2.data?.retryAfter} · کامل=${cooldownSec}`);
  check('عددِ ۴۲۹ همان «باقی‌مانده‌ی واقعی» است (از مُهرِ دیتابیس بازسازی شد)',
    Number.isFinite(retry) && Number.isFinite(lower) && retry >= lower && retry <= upper && upper - lower <= 1,
    `سرور=${r2.data?.retryAfter} · بازه‌ی واقعی=[${lower},${upper}]`);
  check('عدد در پیامِ کاربر هم همان عدد است (فارسی، به ثانیه)',
    String(r2.data?.error || '').includes(fa(retry)) && /ثانیه دیگر/.test(r2.data?.error || ''), r2.data?.error);
  const codeLogs = (serverOut.match(new RegExp(`Login code for ${phone}:`, 'g')) || []).length;
  check('درخواستِ ردشده پیامکِ تازه نفرستاد (فقط یک کد در لاگِ سرور)',
    codeLogs === 1, `${codeLogs} کد در لاگ`);
  const row2 = storedOtp(phone);
  check('مُهرِ ارسال با درخواستِ ردشده جابه‌جا نشد و شمارنده‌ی روز هم دست‌نخورده ماند',
    row2?.last_sent_at === row1?.last_sent_at && row2?.sent_today === 1,
    `last_sent_at=${row2?.last_sent_at} (قبلاً ${row1?.last_sent_at}) · sent_today=${row2?.sent_today}`);

  // ---------- فرانتِ Express: همان عدد را برمی‌دارد، همان را می‌شمارد ----------
  const waitHits = [...EXPRESS.matchAll(/const wait = (Number\(err\?\.data\?\.retryAfter\));/g)];
  check('لنگرِ خواندنِ مهلتِ سرور در Express (هر دو مسیرِ ۴۲۹) پیدا شد',
    waitHits.length === 2, `تطبیق: ${waitHits.length}`);
  const exWait = evalExpr(waitHits.length ? waitHits[0][1] : 'NaN',
    { Number, err: { status: r2.status, data: r2.data } });
  check('اجرا (Express): عددِ مهلت از همان پاسخِ زندهٔ ۴۲۹ خوانده می‌شود',
    exWait === retry, `فرانت=${exWait} · سرور=${retry}`);

  const writeAt = Date.now();                 // لحظه‌ای که فرانت مهلت را می‌نویسد
  const exDeadline = writeAt + exWait * 1000; // `resendAt: Date.now() + wait * 1000`
  const exLeft = evalExpr(readerExpr.expr || 'NaN',
    { Date: fakeNow(writeAt), st: { resendAt: exDeadline } });
  check('اجرا (Express): همان لحظه، ثانیه‌شمار روی همان عددِ سرور می‌ایستد',
    exLeft === retry, `روی صفحه=${exLeft} · سرور=${retry}`);
  const exLabelGrab = grab(EXPRESS, /(`ارسال مجدد در \$\{toFa\(leftResend\)\} ثانیه`)/g);
  const exLabel = evalRaw(exLabelGrab.expr || 'undefined', { toFa: fa, leftResend: exLeft });
  check('اجرا (Express): برچسبِ دکمه همان عدد را با ارقامِ فارسی نشان می‌دهد',
    exLabelGrab.count === 1 && exLabel === `ارسال مجدد در ${fa(retry)} ثانیه`,
    `برچسب: ${exLabel} · انتظار: ارسال مجدد در ${fa(retry)} ثانیه`);

  // ---------- فرانتِ Next: همان قرارداد، همان پاسخِ زنده ----------
  const nextFnSrc = (NEXT.match(/function serverResendSeconds\([\s\S]*?\n\}/) || [''])[0];
  // تایپ‌های TypeScript از متن برداشته می‌شوند تا **خودِ تابعِ سورس** اجرا شود
  // (نه بازنویسیِ آن). اگر روزی امضا عوض شود، این‌جا تابع ساخته نمی‌شود و
  // بررسی قرمز می‌شود — نه اینکه سبزِ بی‌معنی بدهد.
  const nextFnJs = nextFnSrc
    .replace(': { retryAfter?: number }', '')
    .replace(/\): number \{/, ') {');
  const nextFn = evalRaw(`(function () { ${nextFnJs}; return serverResendSeconds; })()`,
    { FALLBACK_RESEND_SECONDS: Number(fbNext.expr) });
  const nextSeconds = typeof nextFn === 'function' ? Number(nextFn({ retryAfter: retry })) : NaN;
  check('اجرا (Next): serverResendSeconds با پاسخِ زنده همان عددِ سرور را می‌دهد',
    nextSeconds === retry, `فرانت=${nextFn ? nextFn({ retryAfter: retry }) : 'تابع اجرا نشد'} · سرور=${retry}`);
  const nextUntil = evalExpr(nextWriter.expr || 'NaN',
    { Date: fakeNow(writeAt), seconds: nextSeconds });
  const nextLeft = evalExpr(nextTick.expr || 'NaN',
    { Math, Date: fakeNow(writeAt), cooldownUntil: nextUntil });
  check('اجرا (Next): لحظه‌ی شروع، ثانیه‌شمار همان عدد را نشان می‌دهد',
    nextLeft === retry, `روی صفحه=${nextLeft} · سرور=${retry}`);
  const nextLabelGrab = grab(NEXT, /(`ارسال مجدد کد \(\$\{cooldown\} ثانیه\)`)/g);
  const nextLabel = evalRaw(nextLabelGrab.expr || 'undefined', { cooldown: nextLeft });
  check('اجرا (Next): برچسبِ دکمه هم همان عدد را نشان می‌دهد',
    nextLabelGrab.count === 1 && nextLabel === `ارسال مجدد کد (${retry} ثانیه)`,
    `برچسب: ${nextLabel}`);

  // ---------- «کوتاه‌تر» یعنی هیچ‌وقت زودتر از خودِ سرور ----------
  // مهلتِ نوشته‌شده در فرانت باید از مهلتِ واقعیِ سرور (`last_sent_at + ۳۰s`)
  // نه عقب بیفتد و نه بی‌دلیل جلو بزند: عقب‌افتادن یعنی دکمه پیش از پایانِ
  // پنجره باز می‌شود و کاربر بی‌دلیل ۴۲۹ می‌خورد؛ جلو‌زدنِ بی‌دلیل یعنی پنهان
  // کردنِ بخشی از مهلتِ واقعی از چشمِ کاربر.
  const serverDeadline = stamp + COOLDOWN_MS;
  const slackMs = 1500;   // سقفِ `ceil` (یک ثانیه) + تأخیرِ شبکه
  check('اجرا: مهلتِ هر دو فرانت پیش از مهلتِ واقعیِ سرور تمام نمی‌شود (دکمه زود باز نشود)',
    exDeadline >= serverDeadline && nextUntil >= serverDeadline,
    `Express=+${exDeadline - serverDeadline}ms · Next=+${nextUntil - serverDeadline}ms (باید ≥۰ باشد)`);
  check('اجرا: و بیش از سقفِ گردکردن و تأخیرِ شبکه هم جلو نمی‌زند',
    exDeadline - serverDeadline <= slackMs && nextUntil - serverDeadline <= slackMs,
    `Express=+${exDeadline - serverDeadline}ms · Next=+${nextUntil - serverDeadline}ms (سقف ${slackMs}ms)`);

  check('خودآزمونِ نیمه‌ی زنده: بازه‌ی واقعی، پنجره‌ی کاملِ ۳۰ را رد می‌کند (وگرنه «کوتاه‌تر» سنجیده نمی‌شد)',
    !(cooldownSec >= lower && cooldownSec <= upper),
    `کامل=${cooldownSec} · بازه=[${lower},${upper}]`);

  // شاهدِ عددی، تا نتیجه فقط «سبز شد» نباشد: دقیقاً معلوم باشد سرور چه گفت
  // و دکمه‌ی هر فرانت چه نشان می‌دهد.
  console.log(`  · شاهدِ زنده: اول ${r1.data?.retryAfter} ثانیه · بعد از ${t2send - t1recv}ms`
    + `، دوباره → ۴۲۹ با ${r2.data?.retryAfter} ثانیه · بازه‌ی واقعی=[${lower},${upper}]`
    + ` · دکمه‌ی Express=${fa(exLeft)} و Next=${fa(nextLeft)}`);

  await stopServer();
  removeSandboxData(SANDBOX_DATA);
  finish();
})().catch((e) => {
  fail++;
  console.error(`\n  [FAIL] اجرای آزمونِ زنده شکست خورد: ${e.message}`);
  stopServer().then(() => {
    removeSandboxData(SANDBOX_DATA);
    finish();
  });
});

function finish() {
  console.log('\n------------------------------------------------------------');
  console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
  console.log('------------------------------------------------------------\n');
  // عمداً `process.exitCode` نه `process.exit()`: با سوکت‌های بازِ fetch روی
  // ویندوز، خروجِ اجباری گاهی کدِ خروجِ بی‌ربط می‌دهد و نتیجه‌ی درست را وارونه
  // نشان می‌دهد (همان درسی که `tests/otp-attempt-cap.js` گرفت).
  process.exitCode = fail === 0 ? 0 : 1;
}
