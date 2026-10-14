#!/usr/bin/env node
/* ============================================================
   نگهبانِ مسیرهای انکودرِ عکس — «با انکودر» و «بی‌انکودر» هر دو عهدی دارند

   ---------- چرا این فایل وجود دارد ----------
   سایت به هیچ انکودرِ عکسی روی سیستم وابسته نیست: `lib/image-encode.js` هر
   ابزاری را که پیدا کند برمی‌دارد (cwebp → ImageMagick → ffmpeg → Pillow) و
   اگر هیچ‌کدام نباشد، مسیرِ آپلود یک هشدار می‌دهد و ادامه می‌دهد و ابزارِ
   خطِ فرمان با پیامِ روشن تمام می‌شود. این «نبودِ انکودر» یک شاخه‌ی واقعیِ
   کد است، ولی تا امروز **هیچ‌جا سنجیده نمی‌شد**:

     • روی ماشینِ توسعه‌دهنده که انکودر دارد، شاخه‌ی بی‌انکودر هرگز اجرا نمی‌شد.
     • روی CI هم هیچ‌وقت روی پای بدونِ انکودر اجرا نمی‌شد.
     • و هیچ‌کس نمی‌سنجید که هشدارِ «یک‌باره» واقعاً یک‌بار است.

   نتیجه‌ی احتمالیِ این کوری: کسی شاخه‌ی بی‌انکودر را می‌شکند (مثلاً `exit(0)`
   را `exit(1)` می‌کند یا هشدار را برمی‌دارد) و هیچ آزمونی قرمز نمی‌شود؛ فقط
   روزی که سرورِ مغازه بدونِ انکودر بالا بیاید معلوم می‌شود.

   ---------- چطور هر دو شاخه آزموده می‌شوند ----------
   دو محیط لازم است و هر دو در همین فایل ساخته می‌شوند:

     ۱. **بی‌انکودر** با یک `PATH` خالی در پروسه‌ی فرزند. `pickEncoder()` با
        `where`/`which` کار می‌کند، پس با `PATH` خالی هیچ ابزاری پیدا نمی‌شود —
        دقیقاً همان چیزی که روی سروری بدونِ این ابزارها می‌گذرد. این قسمت
        **همیشه** اجرا می‌شود، روی هر ماشین و هر پای CI.
     ۲. **با انکودر** فقط اگر روی همین ماشین واقعاً یک انکودر باشد. اگر نباشد
        صریح `[SKIP]` چاپ می‌شود (سبزِ خالی نیست). پای CIِ «با انکودر» این
        شاخه را با `cwebp` نصب‌شده اجرا می‌کند و `EXPECT_ENCODER=1` می‌گذارد،
        پس نمی‌شود این سنجش بی‌صدا از کار افتاد.

   ---------- `EXPECT_ENCODER` ----------
   `1` = این پای CI باید انکودر داشته باشد، `0` = نباید داشته باشد، خالی = هیچ
   ادعایی نیست. اگر ادعا با واقعیت نخواند، همین‌جا قرمز می‌شود. بدونِ این
   متغیر، یک اشتباه در نصبِ stepِ CI (نصب‌نشدنِ cwebp) یعنی آزمون بی‌صدا از
   حالتِ «با انکودر» به «بی‌انکودر» سقوط می‌کند و همچنان سبز می‌ماند.

   اجرا: node tests/image-encoder-paths.js
   ============================================================ */
'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const LIB = path.join(BACKEND, 'lib', 'image-encode.js');
const TOOL = path.join(BACKEND, 'tools', 'optimize-images.js');
const PICTURE_DIR = path.join(BACKEND, '..', 'picture');

let pass = 0;
const failures = [];
let skipped = 0;

function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    failures.push(label);
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function skip(label, why) {
  skipped++;
  console.log(`  [SKIP] ${label} — ${why}`);
}

// ---------- محیطِ فرزند ----------
// `PATH: ''` کلیدِ کلِ این آزمون است: فرزند هیچ ابزاری روی سیستم پیدا نمی‌کند.
// روی ویندوز `where.exe` خودش از System32 بالا می‌آید (مسیرِ جست‌وجوی خودِ
// CreateProcess) ولی با PATHِ خالی چیزی *پیدا نمی‌کند* — که همان هدف است.
function childEnv(extra = {}) {
  return { ...process.env, PATH: '', Path: '', ...extra };
}

// بدنه‌ی فرزندها به‌صورت تابع نوشته و با toString اجرا می‌شود: نه escapeِ رشته
// لازم است نه متغیرِ بیرونی. هر چه فرزند لازم دارد از env می‌آید.
function runChild(fn, env, timeout = 120_000) {
  const res = cp.spawnSync(process.execPath, ['-e', `(${fn.toString()})()`], {
    cwd: BACKEND,
    env,
    encoding: 'utf8',
    timeout,
  });
  let data = null;
  try { data = JSON.parse((res.stdout || '').trim()); } catch (e) { /* پایین گزارش می‌شود */ }
  return { data, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

// مسیرِ فیکسچرِ PNG از بیرون می‌آید (نه با مسیرِ نسبی): `require` در فرزندی که
// با `-e` بالا آمده به cwd گره می‌خورد و cwd یک جزئیاتِ فراموش‌شدنی است.
const MAKEPNG = path.join(__dirname, 'makepng.js');

console.log('\n=== Image encoder paths (with encoder / without encoder) ===\n');

// ---------- ۰) پیش‌شرط‌ها ----------
for (const [label, file] of [['lib/image-encode.js', LIB], ['tools/optimize-images.js', TOOL]]) {
  if (!fs.existsSync(file)) {
    console.error(`  ⚠ ${label} پیدا نشد — چیزی برای سنجیدن نیست.`);
    process.exit(2);
  }
}

// ---------- ۱) انکودرِ این ماشین، و ادعای پای CI ----------
const detect = function () {
  const out = { encoder: null, error: null };
  try {
    const enc = require(process.env.IMGENC_LIB).pickEncoder();
    out.encoder = enc ? enc.name : null;
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  process.stdout.write(JSON.stringify(out));
};

const detected = runChild(detect, { ...process.env, IMGENC_LIB: LIB }, 60_000);
if (!detected.data) {
  check('انکودرِ این ماشین پرسیده شد', false,
    `فرزند جوابِ خوانا نداد (status=${detected.status}) ${detected.stderr.slice(0, 200)}`);
} else {
  check('انکودرِ این ماشین پرسیده شد', detected.data.error === null,
    String(detected.data.error));
  const name = detected.data.encoder;
  console.log(`         detected encoder: ${name || '(none)'}`);

  // ادعای پای CI: اگر `EXPECT_ENCODER` ست باشد، واقعیت باید همان باشد.
  const expect = process.env.EXPECT_ENCODER;
  if (expect === '1') {
    check('این پای CI ادعا کرده انکودر دارد و واقعاً دارد',
      name !== null, 'EXPECT_ENCODER=1 ولی هیچ انکودری پیدا نشد — نصبِ stepِ CI خراب است');
  } else if (expect === '0') {
    check('این پای CI ادعا کرده انکودر ندارد و واقعاً ندارد',
      name === null, `EXPECT_ENCODER=0 ولی «${name}» پیدا شد — پای بدونِ انکودر، دیگر بدونِ انکودر نیست`);
  } else {
    console.log('         (EXPECT_ENCODER ست نیست — ادعایی درباره‌ی این پای CI وجود ندارد)');
  }

  // ------------------------------------------------------------------
  // ۲) شاخه‌ی بی‌انکودر — همیشه اجرا می‌شود، به‌زورِ PATHِ خالی
  // ------------------------------------------------------------------
  const degrade = function () {
    const IMG = require(process.env.IMGENC_LIB);
    const fsx = require('fs');
    const osx = require('os');
    const pathx = require('path');
    const { makeNoisePng } = require(process.env.IMGENC_MAKEPNG);
    const out = { error: null };
    try {
      const dir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'pg-enc-none-'));
      const file = pathx.join(dir, 'shot.png');
      fsx.writeFileSync(file, makeNoisePng(900, 700));
      const before = fsx.readdirSync(dir).sort();

      const warns = [];
      const log = { warn: (m) => warns.push(m), info: () => {} };
      out.encoder = IMG.encoder() ? IMG.encoder().name : null;
      out.queued = IMG.queueVariants(file, log);
      out.queuedAgain = IMG.queueVariants(file, log);

      setTimeout(() => {
        out.warns = warns;
        out.pending = IMG.pendingCount();
        out.before = before;
        out.after = fsx.readdirSync(dir).sort();
        try { fsx.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* بی‌اهمیت */ }
        process.stdout.write(JSON.stringify(out));
      }, 500);
    } catch (e) {
      out.error = String((e && e.message) || e);
      process.stdout.write(JSON.stringify(out));
    }
  };

  const noEnc = runChild(degrade, childEnv({ IMGENC_LIB: LIB, IMGENC_MAKEPNG: MAKEPNG }), 60_000);
  if (!noEnc.data) {
    check('مسیرِ آپلود روی ماشینِ بی‌انکودر اجرا شد', false,
      `فرزند جوابِ خوانا نداد (status=${noEnc.status}) ${noEnc.stderr.slice(0, 200)}`);
  } else {
    check('مسیرِ آپلود روی ماشینِ بی‌انکودر اجرا شد', noEnc.data.error === null,
      String(noEnc.data.error));

    // نگهبانِ خودِ شبیه‌سازی: اگر «PATHِ خالی» روی این سیستم انکودر را پیدا کند،
    // آن‌وقت کلِ این بخش دارد شاخه‌ی *دیگری* را می‌سنجد و باید صریح بگوید.
    check('با PATHِ خالی، داورِ انکودر هیچ ابزاری پیدا نمی‌کند',
      noEnc.data.encoder === null,
      `«${noEnc.data.encoder}» حتی با PATHِ خالی پیدا شد — شبیه‌سازیِ بی‌انکودر معتبر نیست`);

    check('آپلودِ بدونِ انکودر بی‌صدا رد می‌شود (نه صف می‌شود)',
      noEnc.data.queued === false && noEnc.data.queuedAgain === false,
      `queued=${noEnc.data.queued} queuedAgain=${noEnc.data.queuedAgain}`);

    check('صفِ تبدیل خالی می‌ماند (چیزی در پس‌زمینه نمانده)',
      noEnc.data.pending === 0, `pending=${noEnc.data.pending}`);

    check('هشدارِ «بدونِ انکودر» دقیقاً یک‌بار داده می‌شود',
      Array.isArray(noEnc.data.warns) && noEnc.data.warns.length === 1,
      `warn count=${noEnc.data.warns ? noEnc.data.warns.length : 'n/a'}`);

    check('آپلودِ بی‌انکودر هیچ فایلی روی دیسک نمی‌گذارد',
      JSON.stringify(noEnc.data.after) === JSON.stringify(noEnc.data.before),
      `before=${JSON.stringify(noEnc.data.before)} after=${JSON.stringify(noEnc.data.after)}`);
  }

  // ---------- ۳) ابزارِ خطِ فرمان روی همان ماشینِ بی‌انکودر ----------
  // دو چیز سنجیده می‌شود: کدِ خروجِ صفر با پیامِ راهنما (نه خطای گنگ)، و
  // دست‌نزدن به پوشه‌ی عکس‌ها: این شاخه باید *پیش از* پیمایشِ درخت بیرون برود.
  const snapshot = () => {
    if (!fs.existsSync(PICTURE_DIR)) return '(no picture dir)';
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [`${path.relative(PICTURE_DIR, p)}:${fs.statSync(p).size}`];
    });
    return walk(PICTURE_DIR).sort().join('|');
  };

  const pictureBefore = snapshot();
  const toolRun = cp.spawnSync(process.execPath, ['tools/optimize-images.js'], {
    cwd: BACKEND, env: childEnv(), encoding: 'utf8', timeout: 120_000,
  });
  const toolOut = `${toolRun.stdout || ''}${toolRun.stderr || ''}`;

  check('ابزارِ تبدیل روی ماشینِ بی‌انکودر با کدِ خروجِ صفر تمام می‌شود',
    toolRun.status === 0, `exit=${toolRun.status}`);

  check('و صریح می‌گوید چه نصب کند (cwebp/ImageMagick/ffmpeg/Pillow)',
    ['cwebp', 'ImageMagick', 'ffmpeg', 'Pillow'].every((n) => toolOut.includes(n)),
    'پیامِ راهنما ناقص است');

  check('و می‌گوید سایت بدونِ آن هم کار می‌کند (پیامِ آرام‌کننده)',
    /works fine without this/i.test(toolOut), 'پیامِ آرام‌کننده نیست');

  check('و هیچ نسخه‌ای نمی‌سازد (پیامِ Encoder: نبود)',
    !/Encoder:\s/.test(toolOut), 'ابزار بی‌انکودر را با انکودر اشتباه گرفته');

  check('اجرای ابزارِ بی‌انکودر پوشه‌ی عکس‌ها را دست نمی‌زند',
    snapshot() === pictureBefore, 'فایلی در پوشه‌ی عکس‌ها عوض شد');

  // ترتیبِ متنِ سورس: چکِ انکودر باید بالای پیمایشِ درخت باشد. اگر کسی آن را
  // پایین ببرد، ابزار روی ماشینِ بی‌انکودر درخت را می‌پیماید (و روی پوشه‌ی
  // ناموجود می‌شکند) — چیزی که هیچ سنجشِ رفتاریِ دیگری نمی‌گیرد.
  const toolSrc = fs.readFileSync(TOOL, 'utf8');
  const iExit = toolSrc.indexOf('No image encoder found');
  const iWalk = toolSrc.indexOf('walk(PICTURE_DIR)');
  check('در سورسِ ابزار، چکِ انکودر بالاتر از پیمایشِ پوشه است',
    iExit !== -1 && iWalk !== -1 && iExit < iWalk,
    `iExit=${iExit} iWalk=${iWalk}`);

  // ------------------------------------------------------------------
  // ۴) شاخه‌ی «با انکودر» — فقط اگر روی همین ماشین انکودر باشد
  // ------------------------------------------------------------------
  if (name === null) {
    skip('ساختِ واقعیِ WebP و نسخه‌ی ۳۲۰پیکسلی',
      'روی این ماشین انکودری نیست؛ پای CIِ «با انکودر» (EXPECT_ENCODER=1) همین را می‌سنجد');
  } else {
    const encode = function () {
      const IMG = require(process.env.IMGENC_LIB);
      const fsx = require('fs');
      const osx = require('os');
      const pathx = require('path');
          const { makeNoisePng } = require(process.env.IMGENC_MAKEPNG);
      const out = { error: null };
      try {
        const dir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'pg-enc-yes-'));
        const file = pathx.join(dir, 'noise.png');
        fsx.writeFileSync(file, makeNoisePng(800, 600));
        out.srcSize = fsx.statSync(file).size;

        const log = { warn: (m) => (out.warns = (out.warns || []).concat(m)), info: (m) => (out.infos = (out.infos || []).concat(m)) };
        out.queued = IMG.queueVariants(file, log);

        const t0 = Date.now();
        const poll = () => {
          if (IMG.pendingCount() > 0 && Date.now() - t0 < 60_000) {
            setTimeout(poll, 100);
            return;
          }
          out.pending = IMG.pendingCount();
          out.ms = Date.now() - t0;
          out.dir = dir;                        // پاک‌کردن با پدر است، نه این‌جا
          out.outputs = fsx.readdirSync(dir).filter((n) => n !== 'noise.png').sort();
          process.stdout.write(JSON.stringify(out));
        };
        setTimeout(poll, 100);
      } catch (e) {
        out.error = String((e && e.message) || e);
        process.stdout.write(JSON.stringify(out));
      }
    };

    const encRun = runChild(encode, { ...process.env, IMGENC_LIB: LIB, IMGENC_MAKEPNG: MAKEPNG }, 180_000);
    if (!encRun.data || encRun.data.error) {
      check('مسیرِ آپلود با انکودر اجرا شد', false,
        encRun.data ? String(encRun.data.error) : `status=${encRun.status} ${encRun.stderr.slice(0, 200)}`);
    } else {
      const d = encRun.data;
      const { imageSizeFromBuffer } = require('../lib/imagesize');
      // خواندنِ واقعیِ خروجی‌ها این‌جا (نه در فرزند) تا ابعاد و امضا از خودِ
      // فایلِ تولیدشده بیاید، نه از ادعای فرزند.
      const read = (n) => {
        try {
          const buf = fs.readFileSync(path.join(d.dir, n));
          return {
            size: buf.length,
            webp: buf.subarray(0, 4).toString('ascii') === 'RIFF'
              && buf.subarray(8, 12).toString('ascii') === 'WEBP',
            dim: imageSizeFromBuffer(buf),
          };
        } catch (e) { return null; }
      };

      check('مسیرِ آپلود با انکودر اجرا شد', true);
      check('آپلود با انکودر در صف می‌نشیند (نه اینکه بی‌صدا رد شود)',
        d.queued === true, `queued=${d.queued}`);
      check('صف تا آخر خالی می‌شود (تبدیل واقعاً تمام شد)',
        d.pending === 0, `pending=${d.pending}`);

      const names = d.outputs || [];
      const full = read('noise.webp');
      // عهدِ عرض‌ها: ۸۰۰×۶۰۰ از هر دو `minSource` بزرگ‌تر است، پس هم ۳۲۰ و هم
      // ۵۶۰ ساخته می‌شوند. نام‌بردنِ دقیقِ هر سه، یک الگوی گشاد نیست: یک
      // عرضِ اضافه یا نامِ عوض‌شده این‌جا قرمز می‌شود.
      check('خروجی‌ها همان سه نامِ عهدشده‌اند (webp + ۳۲۰ + ۵۶۰) و چیزِ اضافه‌ای نیست',
        names.length === 3 && names.includes('noise.webp')
          && names.includes('noise-320w.webp') && names.includes('noise-560w.webp'),
        `outputs=${JSON.stringify(names)}`);

      // عهدِ کد: هیچ‌وقت WebPِ بزرگ‌تر از منبع نگه داشته نمی‌شود (اگر بزرگ‌تر
      // در آید حذف می‌شود) — پس فایلِ باقی‌مانده باید معتبر و کوچک‌تر باشد.
      check('WebPِ کامل یک تصویرِ معتبر است و بزرگ‌تر از منبع نیست',
        !!full && full.webp && full.size < d.srcSize,
        full ? `webp=${full.webp} ${full.size}B vs src ${d.srcSize}B` : 'missing');
      check('و عرضش دست‌نخورده مانده (۸۰۰ < سقفِ ۱۴۰۰، پس بدون تغییرِ اندازه)',
        !!full && full.dim && full.dim.width === 800,
        full ? `dim=${JSON.stringify(full.dim)}` : 'missing');

      const thumb = read('noise-320w.webp');
      check('نسخه‌ی ۳۲۰پیکسلی معتبر است، از منبع کوچک‌تر است و عرضش دقیقاً ۳۲۰ است',
        !!thumb && thumb.webp && thumb.size < d.srcSize && thumb.dim && thumb.dim.width === 320,
        thumb ? `webp=${thumb.webp} ${thumb.size}B dim=${JSON.stringify(thumb.dim)}` : 'missing');

      const mid = read('noise-560w.webp');
      check('نسخه‌ی ۵۶۰پیکسلی هم معتبر است و عرضش دقیقاً ۵۶۰ است',
        !!mid && mid.webp && mid.dim && mid.dim.width === 560,
        mid ? `webp=${mid.webp} ${mid.size}B dim=${JSON.stringify(mid.dim)}` : 'missing');

      check('ساختِ نسخه‌ها در زمانِ معقولی تمام می‌شود (زیرِ ۶۰ ثانیه)',
        typeof d.ms === 'number' && d.ms < 60_000, `ms=${d.ms}`);

      try { fs.rmSync(d.dir, { recursive: true, force: true }); } catch (e) { /* بی‌اهمیت */ }
    }
  }
}

console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} سنجش قرمز شد (${pass} سبز):`);
  for (const f of failures) console.error(`    • ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`✓ همه‌ی ${pass} سنجشِ مسیرِ انکودرِ عکس سبز است` +
  (skipped ? `  (${skipped} مورد روی این ماشین اجرا نشد — بالا دلیلش را می‌گوید)` : '') + '\n');
process.exit(0);
