#!/usr/bin/env node
/* ============================================================
   tests/second-factor-visible.js — «پنل باید بگوید یک‌عاملی است»

   ---------- چرا این آزمون وجود دارد ----------
   عاملِ دومِ ورودِ پنل (TOTP) ساخته شد و در production اجباری هم شد
   (`lib/security-config.js`). ولی آن اجبار فقط **در لحظهٔ بوت** خودش را نشان
   می‌داد:

     • روی سروری که از قبل بالا آمده بود، هیچ‌جا گفته نمی‌شد؛
     • در توسعه، که اجباری نیست، هیچ‌کس هیچ‌وقت نمی‌فهمید؛
     • و بدتر: پنل — همان جایی که مدیر هر روز بازش می‌کند — در «وضعیت سیستم»
       می‌گفت «همه‌چیز مرتب است» در حالی که ورودِ پنل یک‌عاملی بود.

   یعنی حفره یک *راهِ دیدن* بود، نه یک سدِ گم‌شده. این آزمون همان را می‌بندد
   و چهار لایه را به هم گره می‌زند، چون هر کدام تنها نصفِ کار است:

     ۱) قاعده (`lib/mfa.js → coverage`) — با ماتریسِ محیطیِ واقعی
     ۲) سیم (`/api/admin/system-status`) — روی HTTPِ واقعی، در هر دو حالت
     ۳) نمای Next — هشدارِ پایدار، بی‌دکمهٔ بستن، با راهِ رفعش
     ۴) تایپِ فرانت — تا فیلدِ سیم و کلیدِ تایپ از هم نیفتند

   ---------- چرا دو نیمه (ایستا + زنده) ----------
   نیمهٔ ایستا سورس را می‌خواند و در هر محیطی (حتی بی‌سرور) اجرا می‌شود، ولی
   نمی‌تواند ثابت کند سرور واقعاً همان را می‌فرستد. پس نیمهٔ زنده **دو سرورِ
   سندباکس** بالا می‌آورد: یکی بی کلید و یکی با کلیدِ همان شمارهٔ مدیر، و از
   هر دو با HTTPِ واقعی می‌پرسد. تفاوتِ این دو حالت کلِ معنای این هشدار است:
   اگر آزمون فقط حالتِ بی‌کلید را ببیند، هشدارِ **همیشه‌روشن** هم سبز می‌شود.

   کلید در هر اجرا ساخته می‌شود (`totp.randomSecret()`) و در مخزن نوشته
   نمی‌شود: یک رشتهٔ به‌ظاهر تصادفیِ کنارِ کلمهٔ «secret» همان چیزی است که
   اسکنرِ راز (gitleaks در CI) دنبالش می‌گردد، و استثناگرفتن برای یک ثابتِ
   بی‌ارزش روزی روی یک رازِ واقعی هم اعمال می‌شود.

   ---------- اجرا ----------
     node tests/second-factor-visible.js   → ۰ سبز، ۱ قرمز
   ============================================================ */
'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const {
  BACKEND_DIR: DIR, PROJECT_DIR: REPO,
  makeSandboxData, removeSandboxData, serverEnv
} = require('./sandbox');
const totpLib = require('../lib/totp');

const read = (p) => fs.readFileSync(p, 'utf8');
const MFA = read(path.join(DIR, 'lib', 'mfa.js'));
const ROUTE = read(path.join(DIR, 'routes', 'admin.js'));
const VIEW = read(path.join(REPO, 'next-frontend', 'src', 'components', 'admin', 'SystemContent.tsx'));
const TYPES = read(path.join(REPO, 'next-frontend', 'src', 'lib', 'adminTypes.ts'));

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

// برشِ عبارت از سورسِ واقعی. صفر یعنی لنگر جابه‌جا شده و دو یعنی نمی‌دانیم
// کدام را می‌سنجیم؛ هر دو باید قرمز شوند، نه اینکه خالی سبز بمانند.
function grab(src, re) {
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) return { expr: null, count: hits.length };
  return { expr: hits[0], count: 1 };
}

const ADMIN = '09121234567';
const OTHER = '09129876543';
const KEY_ADMIN = totpLib.randomSecret();

console.log('\n=== Second-factor visibility guard (the panel must say it is one-factor) ===\n');

/* ================= ۱) قاعده ================= */
// قاعده در یک پروسهٔ فرزند و با محیطِ **کنترل‌شده** اجرا می‌شود. چرا نه
// in-process: `lib/mfa.js` کلیدها را یک بار در زمانِ بارگذاری می‌خواند، پس
// یک پروسه فقط می‌تواند یک پیکربندی را نشان دهد — و اگر محیطِ توسعه‌دهنده
// خودش ADMIN_TOTP_SECRETS داشته باشد، آزمون به‌جای قاعده، محیط را می‌سنجد.
section('۱) قاعده: مبنای هشدار «هیچ مدیری کلید ندارد» است');

const PROBE = `
  const mfa = require('./lib/mfa');
  const phones = JSON.parse(process.env.PROBE_PHONES || '[]');
  process.stdout.write(JSON.stringify({
    coverage: mfa.coverage(phones),
    invalid: mfa.invalidEntries().length
  }));
`;

function coverageIn(secrets, phones) {
  const r = spawnSync(process.execPath, ['-e', PROBE], {
    cwd: DIR,
    env: { ...process.env, ADMIN_TOTP_SECRETS: secrets, PROBE_PHONES: JSON.stringify(phones) },
    encoding: 'utf8'
  });
  if (r.status !== 0) return { error: ((r.stderr || '') + (r.stdout || '')).trim().slice(-200) };
  try { return JSON.parse(r.stdout); } catch (e) { return { error: 'پاسخِ خوانا نبود' }; }
}

const noKeys = coverageIn('', [ADMIN]);
check('مدیرِ بی‌کلید ⇒ «هیچ‌کس کلید ندارد» روشن می‌شود',
  noKeys.coverage?.noneCovered === true && noKeys.coverage?.admins === 1 && noKeys.coverage?.covered === 0,
  JSON.stringify(noKeys));

const withKey = coverageIn(`${ADMIN}:${KEY_ADMIN}`, [ADMIN]);
check('مدیرِ کلیددار ⇒ هشدار خاموش (و پوشش یکی حساب می‌شود)',
  withKey.coverage?.noneCovered === false && withKey.coverage?.covered === 1 && withKey.coverage?.admins === 1,
  JSON.stringify(withKey));

// کلیدِ شمارهٔ غیرِ مدیر (کارمند) پوششِ *مدیر* را نمی‌سازد. اگر این یکی را با
// «آیا هیچ کلیدی در سرور هست؟» قاطی کنیم، یک کارمندِ کلیددار هشدارِ مدیرها
// را خاموش می‌کند — همان نوع دروغِ آرام.
const staffOnly = coverageIn(`${OTHER}:${KEY_ADMIN}`, [ADMIN]);
check('کلیدِ شمارهٔ غیرِ مدیر، هشدارِ مدیرها را خاموش نمی‌کند',
  staffOnly.coverage?.noneCovered === true && staffOnly.coverage?.covered === 0,
  JSON.stringify(staffOnly));

const twoAdmins = coverageIn(`${OTHER}:${KEY_ADMIN}`, [ADMIN, OTHER]);
check('پوششِ ناقص هشدار نیست (سیاستِ مستند: فقط «هیچ‌کدام» هشدار است)',
  twoAdmins.coverage?.noneCovered === false && twoAdmins.coverage?.admins === 2 && twoAdmins.coverage?.covered === 1,
  JSON.stringify(twoAdmins));

const noAdmins = coverageIn('', []);
check('بی ADMIN_PHONE اصلاً هشدار ساخته نمی‌شود (سد روی کسی معنا ندارد)',
  noAdmins.coverage?.noneCovered === false && noAdmins.coverage?.admins === 0,
  JSON.stringify(noAdmins));

// شکلِ نوشتنِ شماره نباید نتیجه را عوض کند: اگر مقایسه در فضای خام انجام شود،
// یک ADMIN_PHONE با فاصله یا پیش‌شمارهٔ کشور هیچ‌وقت به کلیدش نمی‌خورد و هشدار
// به‌غلط روشن می‌ماند.
const spellings = coverageIn(`${ADMIN}:${KEY_ADMIN}`, ['0912 123 4567', '+989121234567', ADMIN]);
check('شکل‌های مختلفِ یک شماره، یک مدیر حساب می‌شوند (مقایسه در فضای یکدست)',
  spellings.coverage?.admins === 1 && spellings.coverage?.covered === 1,
  JSON.stringify(spellings));

const junk = coverageIn('', ['', null, 'x', '   ']);
check('ورودیِ خالی/بی‌معنی شمارش نمی‌شود',
  junk.coverage?.admins === 0 && junk.coverage?.noneCovered === false,
  JSON.stringify(junk));

// کلیدِ غلطِ قالب: بی‌صدا بی‌اثر می‌ماند (پس پوشش نمی‌سازد) ولی باید *دیده*
// شود؛ وگرنه مدیر کلید را اضافه می‌کند، هشدار می‌ماند و هیچ‌کس نمی‌گوید چرا.
const badSecret = coverageIn(`${ADMIN}:not-base32!!`, [ADMIN]);
check('کلیدِ ناخوانا پوشش نمی‌سازد ولی شمرده می‌شود',
  badSecret.coverage?.noneCovered === true && badSecret.invalid === 1,
  JSON.stringify(badSecret));

check('قاعده در lib/mfa.js است (نه حسابِ دستیِ env در مسیرِ API)',
  /^function coverage\(adminPhones\) \{/m.test(MFA) && /\n  coverage,\n/.test(MFA));

/* ================= ۲) سیمِ API ================= */
section('۲) سیم: فیلد از همان قاعده می‌آید، نه از یک خواندنِ دومِ env');

check('ADMIN_PHONES از lib/phone می‌آید (یک تعریف، دو مصرف‌کننده)',
  /const \{ isAdminPhone, normalizePhone, isValidIranPhone, ADMIN_PHONES \} = require\('\.\.\/lib\/phone'\);/.test(ROUTE));

const fieldGrab = grab(ROUTE, /secondFactor: \{\n\s+\.\.\.mfa\.coverage\(ADMIN_PHONES\),\n[\s\S]{0,220}?invalidEntries: mfa\.invalidEntries\(\)\.length,/g);
check('پاسخِ system-status همان خروجیِ mfa.coverage(ADMIN_PHONES) را پخش می‌کند',
  fieldGrab.count === 1, `انطباق: ${fieldGrab.count}`);
check('شمارشِ ورودی‌های ناخوانا هم در همان پاسخ می‌آید',
  /invalidEntries: mfa\.invalidEntries\(\)\.length/.test(ROUTE));
check('پاسخِ این نما کش نمی‌شود (وضعیتِ لحظه‌ای است، نه یک عکسِ کهنه)',
  /router\.get\('\/system-status'[\s\S]{0,200}?Cache-Control', 'no-store'/.test(ROUTE));

/* ================= ۳) نمای پنل ================= */
section('۳) نمای پنل: هشدارِ پایدار، با راهِ رفعش');

// «تعریف‌شده ولی مونت‌نشده» یک باگِ بی‌صدا است: کامپوننتِ درست، صفحهٔ بی‌خبر.
const mountGrab = grab(VIEW, /<SecondFactorPanel sf=\{s\.security\?\.secondFactor\} \/>/g);
check('کارت بی‌قید در صفحه مونت می‌شود (نه فقط تعریف‌شده)', mountGrab.count === 1, `انطباق: ${mountGrab.count}`);
check('شرطِ هشدار همان بولیِ سرور است، هم در کارت و هم در بندِ داوری',
  /sf\.noneCovered \? \(/.test(VIEW) && /if \(sf\?\.noneCovered\) \{/.test(VIEW));
check('متنِ هشدار صریح است، نه «یک نکتهٔ امنیتی»',
  VIEW.includes('هیچ مدیری کلیدِ عاملِ دوم ندارد'));

// پایداری: چیزی که بسته شود، پایدار نیست. کارت نباید هیچ حالتِ محلی برای
// پنهان‌شدن داشته باشد، وگرنه با یک کلیک (یا با رفرش، از localStorage) می‌رود.
const panelGrab = grab(VIEW, /function SecondFactorPanel\([\s\S]*?\n\}\n\n\/\*\*/g);
const panel = panelGrab.expr ? panelGrab.expr[0] : '';
check('بدنهٔ کارت یکتا برش خورد', panelGrab.count === 1, `انطباق: ${panelGrab.count}`);
check('هشدار قطع‌شدنی نیست (هیچ حالت/دکمه‌ای برای بستنش نیست)',
  panel.length > 500 && !/useState|onClick|localStorage|sessionStorage/.test(panel));
check('حتی وقتی وضعیت خوب است، شمارش گفته می‌شود (نه یک «خوب است» بی‌عدد)',
  /`\$\{faNum\(sf\.covered\)\} از \$\{faNum\(sf\.admins\)\}/.test(panel));
check('راهِ رفع داخلِ خودِ هشدار است: دستورِ ساختِ کلید',
  /node tools\/admin-totp\.js/.test(panel));
check('و اینکه خطِ کلید کجا می‌نشیند (.env) هم گفته شده',
  /\.env/.test(panel) && /ADMIN_TOTP_SECRETS/.test(panel));
check('نبودِ فیلد (سرورِ Expressِ قدیمی‌تر) صفحه را سفید نمی‌کند',
  /s\.security\?\.secondFactor/.test(VIEW) && /sf\?\.noneCovered/.test(VIEW));

/* ================= ۴) بندِ داوری ================= */
section('۴) داوری: یک‌عاملی بودن قرمز است، نه زرد');

const badGrab = grab(VIEW, /const bad = ([\s\S]*?);\n  return \{ level:/g);
check('عبارتِ داوری یکتا برش خورد', badGrab.count === 1, `انطباق: ${badGrab.count}`);

// عبارتِ **خودِ سورس** اجرا می‌شود، نه یک کپیِ دستی: یک اشتباهِ علامت با چشم
// دیده نمی‌شود ولی با اجرا دیده می‌شود.
function verdictBad(s, sf) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('s', 'sf', `return (${badGrab.expr[1]});`);
    return fn(s, sf) === true;
  } catch (e) {
    return false;
  }
}
const HEALTHY = { health: { ok: true, backupStale: false }, errors: {}, security: {} };
check('دیتابیسِ سالم + پنلِ یک‌عاملی ⇒ قرمز',
  verdictBad(HEALTHY, { noneCovered: true }) === true);
check('دیتابیسِ سالم + مدیرِ کلیددار ⇒ سبز',
  verdictBad(HEALTHY, { noneCovered: false }) === false);
check('معنای قبلی خراب نشده: دیتابیسِ خراب هنوز قرمز است',
  verdictBad({ health: { ok: false }, errors: {}, security: {} }, { noneCovered: false }) === true);
check('ایراد در فهرستِ بندِ داوری هم می‌آید (آدمِ عجله‌دار همین را می‌خواند)',
  /issues\.push\(\s*\n?\s*"ورودِ پنل یک‌عاملی است/.test(VIEW) ||
  /issues\.push\([\s\S]{0,120}?ورودِ پنل یک‌عاملی است[\s\S]{0,120}?\);/.test(VIEW));

/* ================= ۵) آزمونِ زنده: دو سرور ================= */
section('۵) آزمونِ زنده: همان فیلد روی HTTP، بی کلید و با کلید');

const PORT_NO_KEY = 3991;
const PORT_WITH_KEY = 3992;
const SANDBOX_DATA = makeSandboxData();
const ADMIN_PHONE = '0912' + String(Math.floor(1000000 + Math.random() * 8999999));

// فقط وقتی «سرورِ ما بالا آمد» حساب می‌شود که پروسه زنده باشد، پورت پیش از
// بالا آوردن آزاد بوده باشد، و پاسخِ /api/health پاسخِ **خودِ ما** باشد
// (یک شنوندهٔ غریبه روی همان پورت با `r.ok` ساده «سبز» می‌شد).
function portFree(port) {
  return new Promise((resolve) => {
    const srv = require('net').createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

function startServer(port, extraEnv) {
  const out = { text: '' };
  const child = spawn(process.execPath, [path.join(DIR, 'server.js')], {
    cwd: DIR,
    env: serverEnv(SANDBOX_DATA, { PORT: String(port), ADMIN_PHONE, ...extraEnv }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { out.text += d; });
  child.stderr.on('data', (d) => { out.text += d; });
  return { child, out, base: `http://127.0.0.1:${port}` };
}

async function healthy(srv) {
  if (srv.child.exitCode !== null) return false;
  try {
    const r = await fetch(`${srv.base}/api/health`);
    if (!r.ok) return false;
    if (!/json/i.test(r.headers.get('content-type') || '')) return false;
    const d = await r.json();
    return Boolean(d && d.ok === true);
  } catch (e) {
    return false;
  }
}

async function waitUp(srv) {
  for (let i = 0; i < 40; i++) {
    if (await healthy(srv)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function client(base) {
  const cookies = new Map();
  const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  return async function api(method, url, body) {
    const res = await fetch(base + '/api' + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies.size ? { Cookie: cookieHeader() } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    for (const c of raw) {
      const pair = c.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* بدنهٔ غیرِ JSON */ }
    return { status: res.status, data };
  };
}

// کدِ پیامکی از لاگِ سرور خوانده می‌شود (در حالتِ تست پیامک چاپ می‌شود، همان
// کاری که بقیهٔ مجموعه‌های زنده می‌کنند).
async function codeFromLog(srv, phone) {
  for (let i = 0; i < 20; i++) {
    const m = [...srv.out.text.matchAll(new RegExp(`${phone}: (\\d{5})`, 'g'))];
    if (m.length) return m[m.length - 1][1];
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** ورودِ مدیر: بی کلید یک پله است، با کلید دو پله — و شمارشِ پله‌ها برمی‌گردد. */
async function loginAdmin(srv, secret) {
  const api = client(srv.base);
  const ch = await api('GET', '/auth/otp/challenge');
  if (!ch.data?.token) throw new Error(`challenge failed: ${ch.status}`);
  const rq = await api('POST', '/auth/otp/request', { phone: ADMIN_PHONE, challenge: ch.data.token });
  if (rq.status !== 200) throw new Error(`otp/request failed: ${rq.status} ${JSON.stringify(rq.data)}`);
  const code = await codeFromLog(srv, ADMIN_PHONE);
  if (!code) throw new Error('کدِ پیامکی در لاگِ سرور پیدا نشد');
  let res = await api('POST', '/auth/otp/verify', { phone: ADMIN_PHONE, code });
  let secondStep = 0;
  if (res.data?.mfaRequired) {
    secondStep = 1;
    res = await api('POST', '/auth/totp/verify', { code: totpLib.totp(secret) });
  }
  return { api, res, secondStep };
}

/** همان چهار کلیدِ قرارداد، از پاسخِ زنده. */
function secondFactorOf(api) {
  return api('GET', '/admin/system-status').then((r) => ({
    status: r.status,
    sf: r.data?.security?.secondFactor
  }));
}

// سرورها **یکی پس از دیگری** بالا می‌آیند، نه با هم: هر دو روی یک دیتابیسِ
// سندباکس کار می‌کنند و بوتِ سرور بکاپ/مهاجرت می‌نویسد. دو نویسندهٔ هم‌زمان
// روی یک فایل یعنی قفلِ SQLite و آزمونی که به‌جای قاعده، تصادف را می‌سنجد.
const active = [];

function stopAll() {
  for (const s of active) { try { s.child.kill(); } catch (e) { /* بی‌اهمیت */ } }
}
function bail() {
  stopAll();
  removeSandboxData(SANDBOX_DATA);
  finish();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(port, extraEnv, label) {
  const free = await portFree(port);
  check(`پورتِ ${port} برای سندباکس آزاد است`, free,
    free ? '' : `فرآیندِ دیگری پورتِ ${port} را گرفته — همان را ببند و دوباره اجرا کن`);
  if (!free) return null;
  const srv = startServer(port, extraEnv);
  active.push(srv);
  const up = await waitUp(srv);
  check(`سرورِ سندباکس ${label} بالا آمد`, up,
    up ? '' : `${srv.out.text.slice(-400)}\n     └─ اگر خالی است، پورتِ ${port} اشغال است (EADDRINUSE).`.trim());
  return up ? srv : null;
}

(async () => {
  // ---------- الف) بی کلید: همان حالتی که هشدار برایش ساخته شده ----------
  const noKeySrv = await boot(PORT_NO_KEY, { ADMIN_TOTP_SECRETS: '' }, '(بی کلید)');
  if (!noKeySrv) return bail();

  const anon = await fetch(`${noKeySrv.base}/api/admin/system-status`);
  check('این فیلد پشتِ ورودِ مدیر است (بی‌نشست ۴۰۱/۴۰۳، نه ۲۰۰)',
    anon.status === 401 || anon.status === 403, `کدِ وضعیت: ${anon.status}`);
  if (anon.status === 200) return bail();

  const oneFactor = await loginAdmin(noKeySrv, '');
  check('ورودِ مدیر بدونِ کلید، یک‌پله است (وضعیتِ پیش‌فرضِ توسعه)',
    oneFactor.res.status === 200 && oneFactor.secondStep === 0,
    `${oneFactor.res.status} ${JSON.stringify(oneFactor.res.data)}`);

  const a = await secondFactorOf(oneFactor.api);
  check('پاسخِ واقعی بخشِ امنیت را دارد', a.status === 200 && a.sf && typeof a.sf === 'object',
    `${a.status} ${JSON.stringify(a.sf)}`);
  check('مدیرِ بی‌کلید ⇒ noneCovered روی HTTPِ واقعی روشن است',
    a.sf?.noneCovered === true && a.sf?.covered === 0 && a.sf?.admins === 1,
    JSON.stringify(a.sf));
  check('ورودیِ ناخوانا صفر است (پیکربندیِ خالی، غلط نیست)',
    a.sf?.invalidEntries === 0, JSON.stringify(a.sf));

  // قراردادِ سیم ↔ تایپ: کلیدِ اضافه در یکی یعنی آن یکی عقب مانده — و تایپی
  // که فیلدِ موجود را اعلام نکند، همان چیزی است که یک روز بی‌صدا می‌شکند.
  const typeGrab = grab(TYPES, /export interface AdminSecondFactorStatus \{([\s\S]*?)\n\}/g);
  const typeKeys = typeGrab.expr
    ? [...typeGrab.expr[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort()
    : [];
  const wireKeys = a.sf ? Object.keys(a.sf).sort() : [];
  check('تایپِ فرانت همین کلیدها را اعلام می‌کند (سیم و تایپ یکی‌اند)',
    typeKeys.length > 0 && JSON.stringify(typeKeys) === JSON.stringify(wireKeys),
    `تایپ: ${typeKeys.join(',')} | سیم: ${wireKeys.join(',')}`);
  check('خودِ AdminSystemStatus هم فیلدِ security را دارد',
    /export interface AdminSystemStatus \{[\s\S]{0,400}?security: AdminSecurityStatus;/.test(TYPES));

  try { noKeySrv.child.kill(); } catch (e) { /* بی‌اهمیت */ }
  await sleep(700);

  // ---------- ب) با کلید: همان درخواست باید هشدار را خاموش نشان بدهد ----------
  const keySrv = await boot(PORT_WITH_KEY, { ADMIN_TOTP_SECRETS: `${ADMIN_PHONE}:${KEY_ADMIN}` }, '(با کلید)');
  if (!keySrv) return bail();

  const twoFactor = await loginAdmin(keySrv, KEY_ADMIN);
  check('با کلید، ورود واقعاً دوپله شد (وگرنه آزمون حالتِ دوم بی‌معنی است)',
    twoFactor.secondStep === 1 && twoFactor.res.status === 200,
    `پله‌ی دوم: ${twoFactor.secondStep} | ${twoFactor.res.status} ${JSON.stringify(twoFactor.res.data)}`);

  const b = await secondFactorOf(twoFactor.api);
  check('مدیرِ کلیددار ⇒ همان فیلد، ولی خاموش',
    b.status === 200 && b.sf?.noneCovered === false && b.sf?.covered === 1 && b.sf?.admins === 1,
    JSON.stringify(b.sf));

  stopAll();
  await sleep(500);
  removeSandboxData(SANDBOX_DATA);
  finish();
})().catch((e) => {
  fail++;
  console.error(`\n  [FAIL] اجرای آزمونِ زنده شکست خورد: ${e.message}`);
  bail();
});

function finish() {
  console.log('\n------------------------------------------------------------');
  console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
  console.log('------------------------------------------------------------\n');
  // عمداً `process.exitCode` و نه `process.exit()`: با سوکت‌های بازِ fetch،
  // خروجِ اجباری روی ویندوز گاهی کدِ خروجِ بی‌ربط می‌دهد و نتیجه را وارونه
  // نشان می‌دهد.
  process.exitCode = fail === 0 ? 0 : 1;
}
