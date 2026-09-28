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
// سه چیزی که قفل می‌شوند:
//   ۱) نوشتن: هر جای نوشتن باید یک **مهلتِ مطلق** بنویسد (`Date.now() + …`).
//      اگر کسی دوباره `resendLeft: 30` بگذارد، همین‌جا قرمز می‌شود.
//   ۲) خواندن: هر تیک باید از همان مهلت و از ساعتِ *همان لحظه* بازمحاسبه کند،
//      نه از یک شمارنده‌ی کاهنده. تبِ مخفی و لپ‌تاپِ خواب‌رفته تایمرها را عقب
//      می‌اندازند؛ شمارنده‌ی کاهنده آن‌وقت عددی نشان می‌دهد که واقعیت ندارد.
//   ۳) دوام: بازگشت به صفحه باید همان عددِ وسطِ راه را ادامه دهد، نه از صفر.
//
// چرا عبارت‌ها **اجرا** می‌شوند و نه فقط الگو-تطبیق: اگر فقط بگردیم که «عبارت
// `Date.now()` دارد»، یک اشتباهِ علامت یا تقسیم (`* 1000` به‌جای `/ 1000`) هم
// سبز می‌ماند. اینجا خودِ متنِ سورس برداشته و با یک ساعتِ جعلی اجرا می‌شود:
// وسطِ یک پنجره‌ی ۳۰ ثانیه‌ای، ده ثانیه بعد از نوشتن، باید **۲۰** بدهد و نه ۳۰.
//
// هر دو طرف از **متنِ سورس** خوانده می‌شوند و نه از `require`: `login.js` یک
// اسکریپتِ کلاسیک است که به DOM وابسته است و `LoginForm.tsx` با JSX نوشته شده
// و اینجا اجراپذیر نیست. خواندنِ سورس یعنی آزمون بدونِ دیتابیس و مرورگر هم
// اجرا می‌شود.

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const REPO = path.join(BACKEND, '..');

const FILES = {
  'frontend/js/login.js': path.join(REPO, 'frontend', 'js', 'login.js'),
  'LoginForm.tsx': path.join(REPO, 'next-frontend', 'src', 'components', 'LoginForm.tsx'),
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

/* ================= ۶) خودآزمونِ نگهبان ================= */
console.log('\n-- ۶) خودآزمونِ نگهبان (نگهبانِ خراب باید قرمز شود) --');

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

console.log('\n------------------------------------------------------------');
console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
console.log('------------------------------------------------------------\n');
process.exit(fail === 0 ? 0 : 1);
