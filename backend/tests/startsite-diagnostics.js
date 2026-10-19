#!/usr/bin/env node
/* ============================================================
   tests/startsite-diagnostics.js — حالتِ عیب‌یابیِ `StartSite.bat` واقعاً عیب را می‌گوید

   ---------- چرا این آزمون وجود دارد ----------
   `StartSite.bat` تنها راهِ بالا آوردنِ کلِ سایت روی ماشینِ کاربر است و تا
   امروز وقتی چیزی خراب بود **یک** جوابِ کلی داشت: یا `npm install failed`،
   یا پنجره‌ای که سریع بسته می‌شد. ولی علتِ واقعی معمولاً جای دیگری است:

     • پورتی که از اجرای قبلی هنوز گرفته است،
     • `.env`‌ای که `SITE_URL`ش به مبدأ دیگری اشاره می‌کند (و مشتریِ پرداخت‌کننده
       را روی سرورِ اشتباه پیاده می‌کند)،
     • Node‌ی قدیمی‌تر از ۲۲.۵ که `node:sqlite` ندارد،
     • نبودِ `.env`.

   حالا `StartSite.bat --check` این چهار چیز را می‌گوید. ولی خودِ آن حالت هم
   می‌تواند «سبزِ توخالی» باشد: چاپِ «[ OK ]» برای همه‌چیز. پس این آزمون هر
   شاخه را با یک محیطِ ساختگیِ واقعی می‌زند — روی یک کپیِ موقت از همان فایل —
   و می‌خواهد که همان جملهٔ دقیق بیاید:

     • محیطِ سالم        → «[ OK ] SITE_URL and NEXT_PUBLIC_SITE_URL agree»
     • ناهم‌خوانیِ .env   → قرمز + **هر دو مقدار** چاپ شود (کدِ خروج ۱)
     • پورتِ اشغال        → قرمز + شمارهٔ پورت و PID مالک
     • Node‌ی قدیمی       → قرمز + «is too old» (با یک `node`ِ تقلبی در PATH)
     • Nodeِ نبود        → قرمز + «not on PATH»

   ---------- چرا فقط ویندوز ----------
   `.bat` روی لینوکس/مک اجرا نمی‌شود (CI روی ubuntu-latest است). بخشِ ایستا
   همیشه اجرا می‌شود؛ بخشِ اجرایی روی سیستم‌های دیگر با یک خطِ صریح رد
   می‌شود — نه اینکه بی‌صدا سبز شود.

   ---------- هزینهٔ همین «فقط ویندوز» ----------
   وقتی سه جهشِ این نگهبان *فقط* روی ویندوز گرفته می‌شدند، CI (که لینوکس است)
   سه جهشِ «گرفته‌نشده» گزارش می‌کرد و دروازه قرمز می‌شد — بدونِ اینکه کد
   خراب باشد. پس بخشِ ایستا حالا ساختارِ همان سه شاخه را هم قفل می‌کند:
   خواندنِ PIDِ صاحبِ پورت از netstat، مقایسهٔ دو متغیرِ *متفاوت*، و کفِ
   آستانهٔ نسخه. هر سه، خرابیِ رفتاریِ متناظرشان را هم در برچسب می‌برند تا
   هارنسِ جهش بتواند «گرفته شد» را روی هر دو سیستم‌عامل ببیند.

   ---------- اجرا ----------
     node tests/startsite-diagnostics.js   → ۰ سبز، ۱ قرمز، ۲ پیش‌شرط
   ============================================================ */
'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BAT = path.join(ROOT, 'StartSite.bat');
const WINDOWS = process.platform === 'win32';

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

if (!fs.existsSync(BAT)) {
  console.error(`پیش‌شرط: ${BAT} پیدا نشد.`);
  process.exit(2);
}
const src = fs.readFileSync(BAT, 'utf8');

// ------------------------------------------------------------
section('۱) فایل واقعاً یک حالتِ عیب‌یابی دارد (ایستا)');
// ------------------------------------------------------------
check('سوییچِ `--check` پذیرفته می‌شود و به بخشِ عیب‌یابی می‌رود',
  /if \/i "%~1"=="--check" goto :diagnose/.test(src));
check('مسیرِ عادی (بدونِ سوییچ) دست نمی‌خورد و به شروع می‌رسد',
  /goto :start_site/.test(src) && /:start_site/.test(src));
check('حالتِ عیب‌یابی چیزی نصب/اجرا نمی‌کند (پیش از بخشِ نصب است)',
  src.indexOf(':diagnose') < src.indexOf('call npm install') &&
  // و در همان بخش هیچ دستورِ نصبی نیست
  !/call npm install/.test(src.slice(src.indexOf(':diagnose'), src.indexOf(':start_site'))));
check('کدِ خروج صریح دارد (۰ سالم، ۱ مشکل) — نه فقط چاپ',
  /exit \/b 0/.test(src) && /exit \/b 1/.test(src));
check('چهار بررسیِ خواسته‌شده همه در همان بخش‌اند: Node، به‌روزبودنش، پورت، نبودِ .env',
  /call :nodecheck/.test(src) &&
  /is too old/.test(src) &&
  /call :portcheck %BE_PORT% backend/.test(src) &&
  /backend\\\.env is missing/.test(src));

// ---------- سه بررسیِ زیر عمداً *مستقل* شده‌اند، نه یک بررسیِ بستهٔ بزرگ ----------
// چرا: هر سه جهشِ این نگهبان روی ویندوز از بخشِ اجرایی گرفته می‌شوند، ولی CI
// روی ubuntu-latest است و بخشِ اجرایی آن‌جا عمداً رد می‌شود. نتیجه‌اش یک قرمزِ
// واقعیِ CI بود: سه جهش، «گرفته‌نشده» (۰/۳). حالا همان سه چیز یک لایه بالاتر
// هم سنجیده می‌شوند — روی *متن*، که به سیستم‌عامل کاری ندارد. و هر کدام
// برچسبی دارند که نامِ همان خرابیِ رفتاری را می‌برد، چون هارنسِ جهش با همین
// عبارت‌ها تشخیص می‌دهد که جهش «گرفته شد».

// مقایسه باید بینِ *دو* متغیرِ متفاوت باشد. اگر به خودش مقایسه شود همیشه
// «موافق» می‌دهد و مغازه دو مبدأِ متفاوت برای همان صفحه تبلیغ می‌کند.
check('مقایسهٔ SITE_URL با NEXT_PUBLIC_SITE_URL است، نه با خودش (وگرنه ناهم‌خوانی دیده نمی‌شود)',
  /if \/i "%BE_SITE%"=="%NEXT_SITE%"/.test(src) &&
  /SITE_URL and NEXT_PUBLIC_SITE_URL disagree/.test(src));

// بررسیِ پورت باید «صاحبش» را از خودِ netstat بخواند. اگر این خط بیفتد شاخهٔ
// else می‌رود و پورتِ اشغال **آزاد** گزارش می‌شود — یک سبزِ قلابی، بدونِ هیچ
// خطای واضحی؛ و همان چیزی است که جهشِ اولِ این نگهبان می‌سازد.
check('بررسیِ پورت صاحبش را از netstat می‌خواند (وگرنه پورتِ اشغال «آزاد» گزارش می‌شود)',
  /for \/f "tokens=5" %%p in \('netstat -ano \^\| findstr \/r \/c:":%1 \.\*LISTENING"'\)/.test(src) &&
  /do if not defined OWNER_PID set "OWNER_PID=%%p"/.test(src) &&
  /if defined OWNER_PID/.test(src));

// آستانهٔ نسخه نباید زیرِ حداقلی برود که `node:sqlite` را دارد (۲۲.۵).
// چرا عدد این‌جا قفل شد: پیش‌تر این بررسی عمداً `\d+` بود («عدد جای دیگری
// سنجیده می‌شود») — و آن «جای دیگر» بخشِ اجراییِ ویندوز است که روی CI نمی‌رود.
// یعنی می‌شد آستانه را به ۵ برد، Nodeِ ۲۰ «تازه» شمرده می‌شد، و هارنس هیچ
// چیزی نمی‌دید. بالا بردنِ آستانه آزاد است، پایین آوردنش نه.
const nodeFloor = /%NODE_MAJ% LSS (\d+) goto :node_old/.exec(src);
check('آستانهٔ نسخهٔ Node کمتر از ۲۲ نیست (زیرِ ۲۲.۵ خبری از node:sqlite نیست)',
  Number(nodeFloor && nodeFloor[1]) >= 22,
  nodeFloor ? `آستانه: ${nodeFloor[1]}` : 'خطِ مقایسهٔ NODE_MAJ پیدا نشد');

// مقایسه در سابروتین باشد، نه داخلِ بلوکی که همان `%VAR%` را ست کرده است.
check('مقایسهٔ Node در سابروتین است (وگرنه داخلِ بلوک، `%VAR%`ِ خالی مقایسه می‌شود)',
  /:nodecheck/.test(src) &&
  src.search(/%NODE_MAJ% LSS \d+ goto :node_old/) > src.indexOf(':nodecheck') &&
  !/\n\s{4}if %NODE_MAJ% LSS \d+/.test(src));

// ناظرِ کدِ پیامکیِ حالتِ آزمایشی: بک‌اند خروجی‌اش را به فایلِ لاگ می‌فرستد و
// بدونِ این ناظر، کدِ ورود فقط در همان فایل دیده می‌شود — همان چیزی که کاربر
// گزارش کرد («قبلاً کد پیش‌فرض در پنجره می‌آمد، حالا نمی‌آید»). این بررسی هر
// دو نیمهٔ مکانیزم را می‌خواهد: خواندنِ زندهٔ لاگ (`-Wait`) و فیلترِ خطِ
// TEST MODE و چاپش به‌عنوان [SMS TEST]. اگر روزی یکی بیفتد، همین‌جا قرمز است.
check('کدِ پیامکیِ حالتِ آزمایشی در پنجرهٔ StartSite دیده می‌شود (نه فقط در فایلِ لاگ)',
  /Get-Content\b[^\r\n]*-Wait/.test(src) &&
  /Select-String -SimpleMatch '\[TEST MODE'/.test(src) &&
  /Write-Host[^\r\n]*\[SMS TEST\]/.test(src));

if (!WINDOWS) {
  console.log('\n  (بخشِ اجرایی روی این سیستم‌عامل معنا ندارد: `.bat` فقط ویندوز است)');
  console.log(`\nStartsite diagnostics: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ------------------------------------------------------------
// محیطِ ساختگی: یک مخزنِ موقت که فقط همان چیزی را دارد که bat می‌بیند
// ------------------------------------------------------------
function makeFakeRepo({ siteUrl, nextSiteUrl, apiOrigin, nodeShim }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-bat-'));
  fs.mkdirSync(path.join(dir, 'backend'));
  fs.mkdirSync(path.join(dir, 'next-frontend'));
  fs.writeFileSync(path.join(dir, 'backend', 'server.js'), '// placeholder\n');
  fs.writeFileSync(path.join(dir, 'next-frontend', 'package.json'), '{}\n');
  let bat = src;
  // پورت‌های آزمون به پورت‌های موقت تغییر می‌کنند تا آزمون روی ماشینِ کاربر
  // پورتِ واقعیِ سایت را اشغال نکند (خودِ بررسی دست‌نخورده می‌ماند).
  bat = bat
    .replace('set "BE_PORT=3000"', `set "BE_PORT=${TEST_PORT}"`)
    .replace('set "NEXT_PORT=3001"', `set "NEXT_PORT=${TEST_PORT + 1}"`);
  fs.writeFileSync(path.join(dir, 'StartSite.bat'), bat);
  if (siteUrl !== undefined) {
    fs.writeFileSync(path.join(dir, 'backend', '.env'), `SITE_URL=${siteUrl}\n`);
  }
  if (nextSiteUrl !== undefined || apiOrigin !== undefined) {
    fs.writeFileSync(path.join(dir, 'next-frontend', '.env'),
      `NEXT_PUBLIC_SITE_URL=${nextSiteUrl ?? ''}\nAPI_ORIGIN=${apiOrigin ?? ''}\n`);
  }
  let pathPrefix = '';
  if (nodeShim) {
    const bin = path.join(dir, 'fakebin');
    fs.mkdirSync(bin);
    // `node.cmd` قبل از nodeِ واقعی در PATH می‌نشیند: نه نسخهٔ ساختگی را عوض
    // می‌کنیم و نه به nodeِ واقعی دست می‌زنیم. متنِ خودِ shim داده می‌شود تا
    // شاخهٔ «نسخه‌ای برنگشت» هم با یک shimِ بی‌خروجی سنجیدنی باشد.
    fs.writeFileSync(path.join(bin, 'node.cmd'), `@echo off\r\n${nodeShim}\r\n`);
    pathPrefix = bin + ';';
  }
  return { dir, bat: path.join(dir, 'StartSite.bat'), pathPrefix };
}

const TEST_PORT = 39944;

function runCheck(fake) {
  // `pause` در پایانِ حالتِ عیب‌یابی منتظرِ کلید است؛ یک خطِ خالی می‌فرستیم تا
  // پنجره‌ی کاربر مثلِ همیشه باز بماند ولی آزمون معلق نماند.
  const res = spawnSync('cmd.exe', ['/c', fake.bat, '--check'], {
    cwd: fake.dir,
    encoding: 'utf8',
    input: '\r\n\r\n',
    env: { ...process.env, PATH: fake.pathPrefix + process.env.PATH },
    windowsHide: true,
  });
  return { status: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

function cleanup(fake) {
  try { fs.rmSync(fake.dir, { recursive: true, force: true }); } catch { /* بی‌اهمیت */ }
}

(async () => {
  // ------------------------------------------------------------
  section('۲) محیطِ سالم → سبز و کدِ خروج ۰');
  // ------------------------------------------------------------
  const clean = makeFakeRepo({
    siteUrl: 'http://localhost:3001',
    nextSiteUrl: 'http://localhost:3001',
    apiOrigin: 'http://localhost:3000',
  });
  const okRes = runCheck(clean);
  check('خروجیِ سالم کدِ ۰ می‌دهد', okRes.status === 0, `کد: ${okRes.status}`);
  check('و هر چهار بررسی را نام می‌برد',
    /\[ OK \] Node/.test(okRes.out) &&
    /\[ OK \] SITE_URL and NEXT_PUBLIC_SITE_URL agree/.test(okRes.out) &&
    new RegExp(`\\[ OK \\] Port ${TEST_PORT} is free`).test(okRes.out),
    okRes.out.split('\n').filter((l) => /\[/.test(l)).join(' | ').slice(0, 300));
  cleanup(clean);

  // ------------------------------------------------------------
  section('۳) ناهم‌خوانیِ SITE_URL → قرمز، با هر دو مقدار');
  // ------------------------------------------------------------
  const mismatch = makeFakeRepo({
    siteUrl: 'https://polasco.example',
    nextSiteUrl: 'http://localhost:3001',
    apiOrigin: 'http://localhost:3000',
  });
  const misRes = runCheck(mismatch);
  check('ناهم‌خوانی کدِ خروجِ ۱ می‌دهد', misRes.status === 1, `کد: ${misRes.status}`);
  check('و دقیقاً می‌گوید کدام دو مقدار با هم نمی‌خوانند',
    /SITE_URL and NEXT_PUBLIC_SITE_URL disagree/.test(misRes.out) &&
    misRes.out.includes('https://polasco.example') &&
    misRes.out.includes('http://localhost:3001'));
  cleanup(mismatch);

  // ------------------------------------------------------------
  section('۴) پورتِ اشغال → قرمز، با شمارهٔ پورت و PID');
  // ------------------------------------------------------------
  const occupied = makeFakeRepo({
    siteUrl: 'http://localhost:3001',
    nextSiteUrl: 'http://localhost:3001',
    apiOrigin: 'http://localhost:3000',
  });
  const srv = net.createServer(() => {});
  await new Promise((resolve) => srv.listen(TEST_PORT, '127.0.0.1', resolve));
  const busyRes = runCheck(occupied);
  srv.close();
  check('پورتِ اشغال کدِ خروجِ ۱ می‌دهد', busyRes.status === 1, `کد: ${busyRes.status}`);
  const busyLine = busyRes.out.split('\n').find((l) => l.includes('already in use')) || '';
  check('و می‌گوید همان پورت و PIDِ مالکش',
    new RegExp(`\\[FAIL\\] Port ${TEST_PORT} is already in use by PID \\d+`).test(busyLine) &&
    /the backend server cannot bind it/.test(busyRes.out),
    busyLine || '(خطی نبود)');
  check('و راهِ بیرون آمدن را هم می‌گوید (کشتنِ همان PID)',
    new RegExp(`taskkill /PID \\d+`).test(busyRes.out), '(راهنمای taskkill نبود)');
  cleanup(occupied);

  // ------------------------------------------------------------
  section('۵) Nodeِ قدیمی و Nodeِ نبود → دو پیامِ متفاوت');
  // ------------------------------------------------------------
  const oldNode = makeFakeRepo({
    siteUrl: 'http://localhost:3001',
    nextSiteUrl: 'http://localhost:3001',
    apiOrigin: 'http://localhost:3000',
    nodeShim: 'echo v20.11.0',
  });
  const oldRes = runCheck(oldNode);
  check('نسخهٔ ۲۰ قرمز می‌شود (node:sqlite از ۲۲.۵ است)',
    oldRes.status === 1 && /Node 20\.11\.0 is too old/.test(oldRes.out),
    oldRes.out.split('\n').find((l) => l.includes('Node')) || '(خطی نبود)');
  cleanup(oldNode);

  const noNode = makeFakeRepo({
    siteUrl: 'http://localhost:3001',
    nextSiteUrl: 'http://localhost:3001',
    apiOrigin: 'http://localhost:3000',
    nodeShim: 'rem nothing',
  });
  const noRes = runCheck(noNode);
  // shimِ خالی یک خطِ خالی چاپ می‌کند؛ `for /f` خطوطِ خالی را رد می‌کند، پس مسیرِ
  // «نسخه‌ای برنگشت» می‌رود — همان چیزی که روی ماشینی بدونِ Node هم می‌رود.
  check('Nodeِ برنگشته → «not on PATH»، نه یک عددِ خالی',
    noRes.status === 1 &&
    /Node\.js is not on PATH/.test(noRes.out) &&
    !/is too old/.test(noRes.out),
    noRes.out.split('\n').find((l) => l.includes('Node')) || '(خطی نبود)');
  cleanup(noNode);

  console.log(`\nStartsite diagnostics: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
