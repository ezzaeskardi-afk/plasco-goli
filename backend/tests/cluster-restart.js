#!/usr/bin/env node
// tests/cluster-restart.js — نگهبانِ چرخهٔ عمرِ worker در حالتِ cluster
//
// ---------- چرا این آزمون وجود دارد ----------
// دو باگ در `lib/cluster.js` هم‌جنس بودند و هیچ نگهبانی نداشتند:
//
// ۱) «کرشِ جوان» (workerی که زیرِ ۱۰ ثانیه پس از تولد می‌میرد) فقط شمارنده‌ی
//    کرش را بالا می‌برد و **هیچ fork‌ای نمی‌زد**. یعنی workerی که هنگامِ بالا
//    آمدن می‌مرد (پورتِ اشغال، مایگریشنِ شکسته) تا ابد مرده می‌ماند و سایت
//    روی ظرفیتِ کم می‌رفت — بی‌هیچ خطایی جز یک warn. حالا کرشِ جوان با تعللِ
//    پله‌ای ری‌استارت می‌شود و فقط وقتی *همه*ی workerها پشتِ سرِ هم بمیرند
//    (خطای کانفیگ) master با پیام روشن بیرون می‌آید.
//
// ۲) `shutdownAll` گاردِ فراخوانیِ دوباره نداشت: دو SIGTERM پشتِ سرِ هم یعنی
//    دو بار «shutting down» و دو بار SIGTERM به همان workerها؛ و مهم‌تر،
//    شاخهٔ ری‌استارت از `shuttingDown` خبر نداشت، پس اگر workerی دقیقاً در
//    حینِ خاموشی می‌مرد master برایش **worker تازه** بالا می‌آورد — همان
//    چیزی که خاموشی را به حلقه تبدیل می‌کند.
//
// ---------- چرا اجرا و نه الگو ----------
// «تعهدِ ری‌استارت در فایل هست» چیزِ کمی را ثابت می‌کند. این‌جا خودِ
// `runMaster` در پروسه‌ی واقعی اجرا می‌شود: فرزندِ آزمون همان trunkِ
// production است (child = master + شبیه‌سازِ worker)، workerِ قلابی در فاصلهٔ
// تعیین‌شده می‌میرد، و همه‌چیز از بیرون بر اساسِ خروجیِ stdout/stderr و کدِ
// خروج داوری می‌شود.
//
// نکتهٔ پورتِ ویندوز: روی ویندوز `process.kill('SIGTERM')` فرآیند را بی‌رحمانه
// می‌کُشد و لیسنرها اصلاً اجرا نمی‌شوند؛ پس فرزندِ آزمون برای «خاموشیِ تازه»
// همان لیسنرِ واقعیِ ثبت‌شده (process.listeners('SIGTERM')) را صدا می‌زند.
// چیزی که سنجیده می‌شود — مهارشدنِ ری‌استارت در حینِ خاموشی و امنیتِ
// فراخوانیِ دوباره — دقیقاً همان چیزی است که در production با SIGTERM
// اتفاق می‌افتد؛ فقط راهِ رسیدن به لیسنر برای آزمون قابل‌حمل شده است.

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const CLUSTER_LIB = path.join(BACKEND_DIR, 'lib', 'cluster.js');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ` - ${detail}` : ''}`);
}

// فرزندِ آزمون: یک اسکریپتِ کوچک که نقشِ server.js را بازی می‌کند — در master
// همان `runMaster` واقعی را صدا می‌زند و در worker فقط «زندگی» می‌کند و بعد از
// مدتِ تعیین‌شده با کدِ ۱ می‌میرد (شبیه‌سازیِ کرش).
const CHILD_SRC = `'use strict';
const fs = require('fs');
const cluster = require('cluster');
if (cluster.isPrimary) {
  require(process.env.CLUSTER_LIB).runMaster(__filename);
  process.stdin.on('data', (buf) => {
    if (String(buf).trim() !== 'shutdown') return;
    const handlers = process.listeners('SIGTERM');
    for (const h of handlers) h('SIGTERM');
    for (const h of handlers) h('SIGTERM'); // فراخوانیِ دوباره عمدی است
  });
  process.stdin.resume();
} else {
  console.log('[WORKER] up ' + process.pid);
  // عمرِ workerِ اول از محیط («می‌میرد تا ری‌استارت سنجیده شود») و عمرِ
  // workerهای بعدی معمولاً بلند است تا سناریوی خاموشی فقط به سیگنال وابسته
  // بماند، نه به این‌که workerِ ری‌استارت‌شده خودش هم داوطلبانه بمیرد.
  const flag = process.env.CLUSTER_TEST_FIRST_FLAG;
  const first = flag ? !fs.existsSync(flag) : true;
  if (first && flag) fs.writeFileSync(flag, String(process.pid));
  const ms = first
    ? Number(process.env.CLUSTER_TEST_WORKER_MS || 0)
    : Number(process.env.CLUSTER_TEST_LATER_MS || 60000);
  setTimeout(() => process.exit(1), ms);
}
`;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-cluster-test-'));
const CHILD_PATH = path.join(TMP, 'cluster-child.js');
fs.writeFileSync(CHILD_PATH, CHILD_SRC);

// اجرای یک سناریو و برگرداندنِ خروجیِ کامل. اگر فرزند از مهلت بگذرد،
// SIGKILL می‌شود تا آزمون هرگز معلق نماند.
function runScenario(env, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHILD_PATH], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        CLUSTER_LIB,
        CLUSTER_SHUTDOWN_GRACE_MS: '400',
        ...env,
      },
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    let poll = null;
    const finish = (code) => {
      if (poll) clearInterval(poll);
      clearTimeout(timer);
      resolve({ out, err, code });
    };
    child.on('exit', (code) => finish(code));
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) { /* مرده */ }
      finish('timeout');
    }, opts.timeoutMs || 20000);
    if (opts.trigger) poll = setInterval(() => opts.trigger(child, () => out), 80);
  });
}

const countUps = (out) => (out.match(/\[WORKER\] up/g) || []).length;

(async () => {
  console.log(`\n[cluster-restart] workerِ قلابی در ${TMP}\n`);

  // ---------- سناریو ۱: همه‌ی workerها جوان می‌میرند => خروجِ روشن ----------
  // دو worker، هر دو تقریباً بی‌درنگ می‌میرند. انتظار: هیچ ری‌استارتِ بی‌پایانی
  // رخ نمی‌دهد و master با پیامِ «aborting cluster mode» و کدِ ۱ بیرون می‌آید.
  {
    const { out, err, code } = await runScenario({
      CLUSTER_WORKERS: '2',
      CLUSTER_TEST_WORKER_MS: '30',
      CLUSTER_TEST_LATER_MS: '30',
      CLUSTER_TEST_FIRST_FLAG: path.join(TMP, 'a.flag'),
      CLUSTER_YOUNG_MS: '10000',
    });
    check('سناریو ۱: دو workerِ جوانِ مرده => master با abort بیرون می‌آید',
      code === 1 && /aborting cluster mode/.test(err),
      `code=${code}`);
    check('سناریو ۱: پیش از تسلیم، یک ری‌استارتِ پله‌ای تلاش شده است',
      /restart #1/.test(err),
      err.split('\n').filter(Boolean).slice(0, 2).join(' | '));
    check('سناریو ۱: خروجیِ workerها دیده شد (سنجش روی اجرای واقعی است)',
      countUps(out) >= 2, String(countUps(out)));
  }

  // ---------- سناریو ۲: کرشِ جوانِ یکی => ری‌استارت، بدونِ abort ----------
  // یک worker، مرگ در ۷۰۰ms > YOUNG_MS=۳۰۰ms => «عمرِ طولانی/گذرا» و باید
  // بی‌درنگ ری‌استارت شود. اگر تعلل یا پیامِ اشتباه داشته باشد (باگِ قبلی:
  // هیچ fork‌ای نمی‌شد و master از حالتِ cluster بیرون می‌آمد) همین‌جا قرمز
  // می‌شود: باید *دو* worker بالا آمده باشد و هیچ «aborting»ای نباشد.
  // سپس خاموشیِ تازه با فراخوانیِ دوباره: باید یک «shutting down» بیش نباشد و
  // کدِ خروج صفر باشد (گاردِ دوبارِ SIGTERM).
  {
    let sent = false; // end() دوباره روی استریمِ بسته خطا می‌دهد
    const { out, err, code } = await runScenario(
      {
        CLUSTER_WORKERS: '1',
        CLUSTER_TEST_WORKER_MS: '700',
        CLUSTER_TEST_LATER_MS: '60000', // workerِ ری‌استارت‌شده خودش نمی‌میرد
        CLUSTER_TEST_FIRST_FLAG: path.join(TMP, 'b.flag'),
        CLUSTER_YOUNG_MS: '300',
      },
      {
        trigger: (child, getOut) => {
          // نیم‌ثانیه صبر می‌کنیم تا workerِ تازه «بالغ» شود (بیش از YOUNG_MS)
          // و مرگش در لحظه‌ی shutdown در شاخه‌ی «عمرِ طولانی» بیفتد — وگرنه
          // جهشِ برگرداندنِ گارد، تعللِ ۱ ثانیه‌ای می‌گیرد و پیش از موعدِ
          // خاموشی اصلاً فرصتِ fork پیدا نمی‌کند و آزمون بی‌صدا سبز می‌ماند.
          if (!sent && countUps(getOut()) >= 2) {
            sent = true;
            setTimeout(() => child.stdin.end('shutdown\n'), 500);
          }
        },
      },
    );
    check('سناریو ۲: workerِ کرش‌کرده واقعاً ری‌استارت شد (دو تولد)',
      countUps(out) === 2, `up=${countUps(out)}`);
    check('سناریو ۲: مسیرِ abort اشتباهاً اجرا نشد',
      !/aborting cluster mode/.test(err));
    check('سناریو ۲: خاموشیِ عمدی تنها یک بار اجرا شد (دوبار SIGTERM بی‌اثر بود)',
      (err.match(/shutting down/g) || []).length + (out.match(/shutting down/g) || []).length === 1,
      (out + err).split('\n').filter(l => /shutting down/.test(l)).join(' | '));
    check('سناریو ۲: پس از خاموشی، کدِ خروج صفر است',
      code === 0, `code=${code}`);
    check('سناریو ۲: حینِ خاموشی worker تازه‌ای بالا نیامد',
      countUps(out) === 2, `up=${countUps(out)}`);
  }

  // ---------- پاک‌سازی ----------
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* پوشهٔ موقت */ }
  check('پوشهٔ موقت پاک شد', !fs.existsSync(TMP));

  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log('\n------------------------------------------------------------');
  console.log(`  Total: ${results.length} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
  console.log('------------------------------------------------------------\n');
  process.exit(fail === 0 ? 0 : 1);
})();
