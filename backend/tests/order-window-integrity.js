#!/usr/bin/env node
// tests/order-window-integrity.js — نگهبانِ هم‌ترازیِ «پنجره‌ی صبرِ مشتری» با بک‌اند
//
// ---------- چرا این آزمون وجود دارد ----------
// مشتری بعد از پرداخت روی صفحه‌ی نتیجه‌ی سفارش می‌ماند و آن صفحه خودش هر چند
// ثانیه از سرور می‌پرسد «تکلیفِ این سفارش چه شد؟». آن پرسیدن سقف دارد (الان
// ۴۱ دقیقه) و سقف **بی‌معنی** است اگر کوتاه‌تر از پنجره‌ای باشد که خودِ بک‌اند
// در آن می‌تواند خبرِ خوب را پیدا کند:
//
//   • تا `expires_at` (یعنی لحظه‌ی ساخت + ORDER_TTL_MS) سفارش اصلاً کاندیدِ
//     تطبیق با درگاه نیست — تا آن لحظه ممکن است کال‌بکِ درگاه سالم برسد.
//   • بعد از انقضا، سفارش فقط سرِ تیکِ دوره‌ای (`RECONCILE_INTERVAL_MS`) بررسی
//     می‌شود؛ پس اولین شانس در بدترین حالت انقضا + یک تیک است.
//   • و اگر درگاه همان لحظه در دسترس نباشد، جوابِ ما «دست نزن» است و شانسِ
//     بعدی یک تیکِ دیگر بعد است — یعنی انقضا + دو تیک.
//
// این عددها در دو فایلِ متفاوت و دو زبانِ متفاوت زندگی می‌کنند (بک‌اند: مهلت و
// فاصله‌ی تیک؛ فرانت‌اند: ریتم و تعدادِ بررسی) و **هیچ کامپایلر یا lintی رابطه‌ی
// بینشان را نمی‌بیند**. کافی است کسی یکی را عوض کند تا سکوتِ کامل بشود: صفحه
// یکی-دو دقیقه قبل از روشن‌شدنِ سفارش تسلیم می‌شود، مشتری پیامِ «ایستادم»
// می‌بیند و باید خودش «بررسی دوباره» را بزند — در حالی که اگر یک تیکِ دیگر
// صبر می‌کرد، خبر را خودکار می‌گرفت. این آزمون همان رابطه را قفل می‌کند.
//
// هر دو طرف را از **متنِ سورس** می‌خواند و نه از `require`: طرفِ بک‌اند با
// `require` دیتابیس را باز می‌کند و طرفِ فرانت‌اند یک کامپوننتِ React است که
// اینجا اجراپذیر نیست. خواندنِ سورس هم یعنی آزمون در هر محیطی (حتی بدونِ
// دیتابیس) اجرا می‌شود.

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const REPO = path.join(BACKEND, '..');

const FILES = {
  'lib/db.js': path.join(BACKEND, 'lib', 'db.js'),
  'lib/reconcile.js': path.join(BACKEND, 'lib', 'reconcile.js'),
  'server.js': path.join(BACKEND, 'server.js'),
  'OrderSuccessContent.tsx': path.join(
    REPO, 'next-frontend', 'src', 'components', 'OrderSuccessContent.tsx',
  ),
};

let pass = 0, fail = 0;
function ok(label) { pass++; console.log(`  [PASS] ${label}`); }
function notOk(label, detail) { fail++; console.error(`  [FAIL] ${label} — ${detail}`); }

console.log('\n=== Order window integrity (frontend polling <-> backend TTL) ===\n');

// ---------- ۰) هر چهار فایلِ طرفِ قرارداد باید باشند ----------
let missing = false;
for (const [label, file] of Object.entries(FILES)) {
  if (!fs.existsSync(file)) {
    notOk(`${label} exists`, `not found at ${file}`);
    missing = true;
  }
}
if (missing) {
  console.error('\n  ⚠ فایلی که این قرارداد رویش بسته شده پیدا نشد — نمی‌شود چیزی نسنجید.\n');
  process.exit(1);
}
ok(`همه‌ی ${Object.keys(FILES).length} فایلِ طرفِ قرارداد موجودند`);

/** «۳۰ * ۶۰ * ۱۰۰۰» → عددِ میلی‌ثانیه، بدونِ eval */
function duration(expr) {
  return expr
    .split('*')
    .map((part) => Number(part.replace(/_/g, '').trim()))
    .reduce((a, b) => a * b, 1);
}

/** مقدارِ `const NAME = 30 * 60 * 1000;` را از متنِ فایل می‌خواند */
function constantOf(source, name) {
  const m = source.match(new RegExp(`\\bconst\\s+${name}\\s*=\\s*([0-9_*\\s]+?);`));
  return m ? duration(m[1]) : null;
}

const mmss = (ms) => `${Math.round((ms / 60000) * 10) / 10} min`;
const db = fs.readFileSync(FILES['lib/db.js'], 'utf8');
const reconcile = fs.readFileSync(FILES['lib/reconcile.js'], 'utf8');
const server = fs.readFileSync(FILES['server.js'], 'utf8');
const orderSuccess = fs.readFileSync(FILES['OrderSuccessContent.tsx'], 'utf8');

// ---------- ۱) طرفِ بک‌اند: مهلتِ پرداخت ----------
const ORDER_TTL_MS = constantOf(db, 'ORDER_TTL_MS');
if (ORDER_TTL_MS) {
  ok(`lib/db.js: ORDER_TTL_MS = ${ORDER_TTL_MS} ms (${mmss(ORDER_TTL_MS)})`);
} else {
  notOk('ORDER_TTL_MS', 'در lib/db.js پیدا نشد — مرجعِ همین عدد است');
}

// عددی که پیدا کردیم باید همان چیزی باشد که `expires_at` را می‌سازد؛ وگرنه
// داریم عددِ بی‌ربطی را با فرانت‌اند مقایسه می‌کنیم.
if (/Date\.now\(\)\s*\+\s*ORDER_TTL_MS/.test(db)) {
  ok('expires_at از ORDER_TTL_MS ساخته می‌شود');
} else {
  notOk('expires_at', 'دیگر با `Date.now() + ORDER_TTL_MS` ساخته نمی‌شود');
}

// و «کاندیدِ تطبیق» دقیقاً با همین انقضا درآورده می‌شود: status=pending_payment،
// expires_at گذشته، و authority داشته باشد (یعنی مشتری به درگاه رفته بود).
const staleAt = db.indexOf('stmtStaleWithAuthority');
const staleStmt = staleAt === -1 ? '' : db.slice(staleAt, staleAt + 600);
if (/expires_at\s*<\s*\?/.test(staleStmt) && /authority\s+IS NOT NULL/.test(staleStmt)) {
  ok('کاندیدِ تطبیق روی انقضای سفارش گیت شده (expires_at < now + authority)');
} else {
  notOk('reconcile candidate query', 'getStaleOrdersToReconcile دیگر روی expires_at/authority گیت نشده');
}

// ---------- ۲) طرفِ بک‌اند: فاصله‌ی تیک ----------
const RECONCILE_INTERVAL_MS = constantOf(reconcile, 'RECONCILE_INTERVAL_MS');
if (RECONCILE_INTERVAL_MS) {
  ok(`lib/reconcile.js: RECONCILE_INTERVAL_MS = ${RECONCILE_INTERVAL_MS} ms (${mmss(RECONCILE_INTERVAL_MS)})`);
} else {
  notOk('RECONCILE_INTERVAL_MS', 'در lib/reconcile.js پیدا نشد');
}

// هم برداشتن و هم صادر کردنش مهم است: اگر این ثابت صادر نشود، `server.js`
// مقدار `undefined` می‌گیرد و `setInterval(fn, undefined)` یعنی فاصله‌ی صفر —
// یعنی حلقه‌ای که بی‌وقفه سفارش‌ها را از درگاه می‌پرسد. این حالت از «تسلیمِ
// زودهنگام» بدتر است، پس هر دو سرش را می‌سنجیم.
if (/\{[^}]*RECONCILE_INTERVAL_MS[^}]*\}\s*=\s*require\(['"]\.\/lib\/reconcile['"]\)/.test(server)) {
  ok('server.js این ثابت را از lib/reconcile برمی‌دارد');
} else {
  notOk('server.js import', 'RECONCILE_INTERVAL_MS از lib/reconcile وارد نمی‌شود');
}

const exportsAt = reconcile.lastIndexOf('module.exports');
if (exportsAt !== -1 && reconcile.slice(exportsAt).includes('RECONCILE_INTERVAL_MS')) {
  ok('lib/reconcile.js آن را صادر می‌کند (وگرنه undefined می‌شد)');
} else {
  notOk('module.exports', 'RECONCILE_INTERVAL_MS صادر نشده — server.js مقدار undefined می‌گیرد');
}

// تیکِ تطبیق باید با همان ثابت زده شود و نه با یک عددِ لخت: اگر کسی فاصله را
// در server.js دستی عوض کند، عددِ lib/reconcile دروغ می‌شود و این آزمون
// بی‌خبر می‌ماند.
const tickFrom = server.indexOf('reconcileStaleOrders()');
const tick = tickFrom === -1 ? '' : server.slice(tickFrom, tickFrom + 500);
const tickDelay = tick.indexOf('RECONCILE_INTERVAL_MS');
if (tickDelay !== -1 && tickDelay < tick.indexOf('.unref()')) {
  ok('تیکِ دوره‌ای با RECONCILE_INTERVAL_MS زده می‌شود (بدونِ عددِ لخت)');
} else {
  notOk('reconcile tick', 'setInterval تطبیق دیگر RECONCILE_INTERVAL_MS را به‌کار نمی‌برد');
}

// ---------- ۳) طرفِ فرانت‌اند: ریتم و سقف ----------
const POLL_MS_FAST = constantOf(orderSuccess, 'POLL_MS_FAST');
const POLL_MS_SLOW = constantOf(orderSuccess, 'POLL_MS_SLOW');
const POLL_CHECKS_FAST = constantOf(orderSuccess, 'POLL_CHECKS_FAST');
const POLL_CHECKS_TOTAL = constantOf(orderSuccess, 'POLL_CHECKS_TOTAL');

const rhythmKnown = POLL_MS_FAST && POLL_MS_SLOW && POLL_CHECKS_FAST && POLL_CHECKS_TOTAL;
if (rhythmKnown) {
  ok(`OrderSuccessContent.tsx: ریتم ${POLL_MS_FAST / 1000}s × ${POLL_CHECKS_FAST} + ${POLL_MS_SLOW / 1000}s × ${POLL_CHECKS_TOTAL - POLL_CHECKS_FAST}`);
} else {
  notOk('frontend rhythm constants', 'یکی از چهار ثابتِ ریتم در OrderSuccessContent.tsx پیدا نشد');
}
if (rhythmKnown && POLL_MS_FAST < POLL_MS_SLOW && POLL_CHECKS_FAST < POLL_CHECKS_TOTAL) {
  ok('ریتمِ سریع واقعاً کوتاه‌تر از ریتمِ آرام است');
} else {
  notOk('rhythm order', 'ریتمِ سریع/آرام جابه‌جا شده — یعنی بارِ درخواست چند برابر می‌شود');
}

// سقف باید همان جایی تمام شود که `checkTimeMs` می‌گوید. اگر کسی فرمولِ زمان‌بندیِ
// کامپوننت را عوض کند و اینجا هم‌زمان به‌روز نشود، عددی که این آزمون می‌سنجد
// دیگر پنجره‌ی واقعی نیست — پس خودِ فرمول را هم قفل می‌کنیم.
const windowMs = rhythmKnown
  ? POLL_CHECKS_FAST * POLL_MS_FAST + (POLL_CHECKS_TOTAL - POLL_CHECKS_FAST) * POLL_MS_SLOW
  : 0;

// ---------- ۳.۵) بازسازیِ واقعیِ فرمولِ زمان‌بندی، نه فقط نامِ دو تابع ----------
// پیش از این فقط دو regex بود: «تابعی به نامِ checkTimeMs هست» و «جایی
// `Math.min(POLL_CHECKS_TOTAL` نوشته شده». آن دو با هر فرمولِ اشتباهی هم سبز
// می‌ماندند: کافی بود کسی ضریبِ پله‌ی آرام را عوض کند تا پنجره‌ی *واقعی* نصف
// شود و این نگهبان همچنان سبز بماند — یعنی عددش دیگر پنجره‌ی مشتری نبود.
//
// حالا **بدنه‌ی خودِ تابع‌ها** از سورس بیرون کشیده و با همان ثابت‌ها اجرا
// می‌شود؛ پس عددِ سنجیده‌شده از خودِ فرمول می‌آید و محاسبه‌ی موازیِ این فایل
// فقط تا جایی مجاز است که با آن یکی بخواند.
const bodyOf = (source, name) => {
  const at = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (at === -1) return null;
  const open = source.indexOf('{', source.indexOf(')', at));
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
};

// نامِ پارامترها هم از خودِ سورس خوانده می‌شود: بدنه‌ای که با نامِ سخت‌کدشده
// فراخوانی شود (`n`، `elapsedMs`) به `ReferenceError` می‌رسد و آن‌وقت شکستِ
// آزمون برچسبِ گمراه‌کننده‌ای می‌گیرد.
const paramsOf = (source, name) => {
  const at = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (at === -1) return null;
  const open = source.indexOf('(', at);
  const close = source.indexOf(')', open);
  if (open === -1 || close === -1) return null;
  // فایلِ TypeScript است: `n: number` و `n?: number` باید به همان نامِ پارامتر
  // برسند. اگر روزی نوعِ پارامتر پیچیده شود (شیء با `:` داخلی)، این نگهبان
  // بی‌صدا از کار نمی‌افتد بلکه پایین‌تر صریح قرمز می‌شود.
  return source.slice(open + 1, close).split(',')
    .map((p) => p.split(/[:=]/)[0].trim().replace(/\?$/, ''))
    .filter(Boolean);
};

const SCOPE = {
  POLL_MS_FAST, POLL_MS_SLOW, POLL_CHECKS_FAST, POLL_CHECKS_TOTAL,
};
const REBUILT = {
  checkTimeMs: bodyOf(orderSuccess, 'checkTimeMs'),
  checksDue: bodyOf(orderSuccess, 'checksDue'),
};
const PARAMS = {
  checkTimeMs: paramsOf(orderSuccess, 'checkTimeMs'),
  checksDue: paramsOf(orderSuccess, 'checksDue'),
};

if (!rhythmKnown || !REBUILT.checkTimeMs || !REBUILT.checksDue
    || !PARAMS.checkTimeMs?.length || !PARAMS.checksDue?.length
    || [...PARAMS.checkTimeMs, ...PARAMS.checksDue].some((p) => !/^[A-Za-z_$][\w$]*$/.test(p))) {
  notOk(
    'schedule formula rebuilt',
    `بازسازیِ فرمول ممکن نشد — ثابت‌ها=${rhythmKnown}`
    + ` checkTimeMs=${Boolean(REBUILT.checkTimeMs)} checksDue=${Boolean(REBUILT.checksDue)}`,
  );
} else {
  // ثابت‌ها + نامِ پارامترها به خودِ بدنه تزریق می‌شوند، بعد با آرگومان‌های
  // واقعی صدا زده می‌شود — یعنی همان چیزی که مرورگر اجرا می‌کند.
  // eslint-disable-next-line no-new-func
  const build = (name) => new Function(...Object.keys(SCOPE), ...PARAMS[name], REBUILT[name]);
  const checkTimeMs = (n) => build('checkTimeMs')(...Object.values(SCOPE), n);
  const checksDue = (ms) => build('checksDue')(...Object.values(SCOPE), ms);

  ok('فرمولِ زمان‌بندی از خودِ سورس بازسازی شد (بدنه‌ی checkTimeMs/checksDue، نه نامشان)');

  // مهلتِ بررسیِ n اُم باید دو پله باشد: پله‌ی سریع تا POLL_CHECKS_FAST و بعد
  // پله‌ی آرام. اگر کسی ضریبِ پله‌ی دوم را به ثابتِ اول عوض کند (شایع‌ترین
  // اشتباه)، دقیقاً دو مهلتِ سرِ پله فرق می‌کنند.
  const firstFast = checkTimeMs(1);
  const lastFast = checkTimeMs(POLL_CHECKS_FAST);
  const afterFast = checkTimeMs(POLL_CHECKS_FAST + 1);
  if (firstFast === POLL_MS_FAST && lastFast === POLL_CHECKS_FAST * POLL_MS_FAST
      && afterFast - lastFast === POLL_MS_SLOW) {
    ok('مهلت‌ها دو‌پله‌ای‌اند: پله‌ی سریع، بعد پله‌ی آرام (اجرا روی فرمولِ بازسازی‌شده)');
  } else {
    notOk(
      'two-phase schedule',
      `۱→${firstFast} · ${POLL_CHECKS_FAST}→${lastFast} · ${POLL_CHECKS_FAST + 1}→${afterFast}`
      + ` (پله‌ی بعد از ${POLL_CHECKS_FAST} باید ${POLL_MS_SLOW} میلی‌ثانیه باشد)`,
    );
  }

  // آخرین مهلت باید **دقیقاً** همان پنجره‌ای باشد که پایین‌تر با آن مقایسه
  // می‌شود. این خط، محاسبه‌ی موازیِ همین فایل را به فرمولِ واقعی گره می‌زند: هر
  // جابه‌جایی در فرمول یا در ثابت‌ها همین‌جا لو می‌رود.
  const lastDeadline = checkTimeMs(POLL_CHECKS_TOTAL);
  if (lastDeadline === windowMs) {
    ok(`تنها پنجره‌ی واقعی ${mmss(windowMs)} است (مطابقِ آخرین مهلتِ checkTimeMs)`);
  } else {
    notOk(
      'window vs checkTimeMs',
      `این فایل ${mmss(windowMs)} حساب می‌کند ولی آخرین مهلتِ فرمول ${mmss(lastDeadline)} است`,
    );
  }

  // صعودی بودنِ مهلت‌ها: شاخه‌ی جابه‌جاشده (`<=` که `>` شود) عددی می‌سازد که با
  // بزرگ‌شدنِ n کوچک می‌شود؛ آن‌وقت `delayToNextCheck` منفی می‌شود و حلقه
  // بی‌وقفه به سرور می‌کوبد.
  let monotonic = true;
  for (let n = 2; n <= POLL_CHECKS_TOTAL; n++) {
    if (!(checkTimeMs(n) > checkTimeMs(n - 1))) monotonic = false;
  }
  if (monotonic) {
    ok('مهلت‌ها اکیداً صعودی‌اند (هیچ موعدی از موعدِ قبلی عقب‌تر نیست)');
  } else {
    notOk('monotonic schedule', 'فرمول جایی نزولی است — یعنی تأخیرِ منفی و حلقه‌ی بی‌وقفه');
  }

  // مرزِ تسلیم: کامپوننت همان‌جا می‌ایستد که `checksDue` عددِ کل را بدهد. اگر
  // سقفِ `Math.min` برداشته شود، `checksDue` بعد از پنجره هم بالا می‌رود ولی
  // شرطِ توقف (`checks >= POLL_CHECKS_TOTAL`) باز هم درست می‌شود — پس این
  // سنجش به‌تنهایی سقف را قفل نمی‌کند و «دقیقاً سرِ پنجره» را می‌سنجد.
  const atEnd = checksDue(windowMs);
  const justBefore = checksDue(windowMs - 1);
  if (atEnd === POLL_CHECKS_TOTAL && justBefore === POLL_CHECKS_TOTAL - 1) {
    ok('مرزِ تسلیم دقیقاً سرِ پنجره است (`checksDue` سرِ این عدد به سقف می‌رسد)');
  } else {
    notOk(
      'give-up boundary',
      `checksDue(${mmss(windowMs)})=${atEnd} (باید ${POLL_CHECKS_TOTAL})`
      + ` و checksDue(${mmss(windowMs - 1)})=${justBefore}`,
    );
  }

  const beforeFirst = checksDue(POLL_MS_FAST - 1);
  const atFirst = checksDue(POLL_MS_FAST);
  const endOfFast = checksDue(POLL_CHECKS_FAST * POLL_MS_FAST);
  if (beforeFirst === 0 && atFirst === 1 && endOfFast === POLL_CHECKS_FAST) {
    ok('شمارشِ موعدها سرِ مرزها درست است (پیش از اولی صفر، سرِ اولی یک، سرِ پله دقیقاً سقفِ پله)');
  } else {
    notOk('checksDue boundaries', `${beforeFirst} / ${atFirst} / ${endOfFast}`);
  }

  // سقفِ `Math.min` یک کمربندِ امنیتی است، نه تزئین: مشتری که ساعتی بعد برمی‌گردد
  // (یا همان پنجره را در یک تبِ دیگر باز می‌کند) زمانی سپری‌شده می‌دهد که
  // بی‌سقف به عددی چند‌برابری تبدیل می‌شود. شرطِ توقفِ کامپوننت با آن هم درست
  // کار می‌کند، ولی عددِ «چند بررسی مانده» و پیامِ کاربر از همان سقف می‌آید.
  const wayPast = checksDue(windowMs + 20 * POLL_MS_SLOW);
  if (wayPast === POLL_CHECKS_TOTAL) {
    ok('شمارشِ موعدها هرگز از سقفِ کل بیشتر نمی‌شود (بازگشتِ مشتری بعد از ساعت‌ها)');
  } else {
    notOk('checksDue cap', `${wayPast} در حالی که سقف ${POLL_CHECKS_TOTAL} است`);
  }

  // و حلقه باید از همین دو تابع بخواند، نه از یک شمارنده‌ی موازی. اگر
  // `delayToNextCheck` موعدِ بررسیِ *بعدی* را نخواند، تأخیر همیشه صفر می‌شود.
  if (/checkTimeMs\(checks \+ 1\)\s*-\s*elapsed\(\)/.test(orderSuccess)
      && /let checks = checksDue\(elapsed\(\)\)/.test(orderSuccess)) {
    ok('حلقه از همین دو تابع می‌خواند (موعدِ بعدی و شمارِ موعدهای رسیده)');
  } else {
    notOk(
      'loop wiring',
      'حلقه دیگر `checkTimeMs(checks + 1) - elapsed()` را نمی‌خواند — عددِ بازسازی‌شده رفتارِ واقعی نیست',
    );
  }
}

// ---------- ۴) همان رابطه‌ای که این آزمون برایش ساخته شده ----------
if (rhythmKnown && ORDER_TTL_MS && RECONCILE_INTERVAL_MS) {
  const firstPass = ORDER_TTL_MS + RECONCILE_INTERVAL_MS;
  const retryPass = ORDER_TTL_MS + 2 * RECONCILE_INTERVAL_MS;
  const ceiling = ORDER_TTL_MS + 4 * RECONCILE_INTERVAL_MS;

  // چرا `retryPass` و نه فقط اولین تطبیق: یک تیک می‌تواند با «درگاه در دسترس
  // نیست» برگردد و آن‌وقت تصمیمِ درست «دست نزن» است، نه «باطل کن». اگر پنجره
  // پیش از تلاشِ جبرانی تمام شود، همان حالتِ گم‌شدنِ خبرِ خوب برمی‌گردد.
  if (windowMs >= retryPass) {
    ok(`پنجره‌ی صبر (${mmss(windowMs)}) از اولین تطبیق و تلاشِ جبرانی (${mmss(retryPass)}) رد می‌شود`);
  } else {
    notOk(
      'پنجره‌ی صبر کوتاه‌تر از پنجره‌ی بک‌اند است',
      `${mmss(windowMs)} < ${mmss(retryPass)} ` +
      `(انقضا ${mmss(ORDER_TTL_MS)} + ۲ تیکِ ${mmss(RECONCILE_INTERVAL_MS)}) — ` +
      'صفحه قبل از روشن‌شدنِ سفارش تسلیم می‌شود',
    );
  }

  // و سقفِ بالایی: پنجره‌ی چندساعته هم درست نیست — یعنی ساعتی به سرور درخواست
  // می‌زنیم برای سفارشی که تطبیقش خیلی قبل تعیین‌تکلیف شده.
  if (windowMs <= ceiling) {
    ok(`پنجره بیهوده بلند نیست (${mmss(windowMs)} ≤ ${mmss(ceiling)})`);
  } else {
    notOk('پنجره‌ی صبر بیش از حد بلند است', `${mmss(windowMs)} > ${mmss(ceiling)} — درخواستِ بی‌فایده`);
  }

  // افقِ تسلیمِ خودِ بک‌اند هم باید از پنجره‌ی فرانت‌اند جلوتر باشد، وگرنه صفحه
  // دنبال سفارشی می‌پرسد که بک‌اند دیگر رهایش کرده.
  const GIVE_UP_AFTER_MS = constantOf(reconcile, 'GIVE_UP_AFTER_MS');
  if (GIVE_UP_AFTER_MS && GIVE_UP_AFTER_MS >= windowMs) {
    ok(`افقِ تسلیمِ بک‌اند (${mmss(GIVE_UP_AFTER_MS)}) از پنجره‌ی فرانت‌اند جلوتر است`);
  } else {
    notOk(
      'افقِ تسلیمِ بک‌اند',
      `${GIVE_UP_AFTER_MS ? mmss(GIVE_UP_AFTER_MS) : 'خوانده نشد'} < پنجره‌ی ${mmss(windowMs)}`,
    );
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
console.log(`${'='.repeat(60)}\n`);

if (fail > 0) process.exit(1);
