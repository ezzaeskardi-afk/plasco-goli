// مدیریت Node.js cluster — استفاده از تمام هسته‌های CPU
//
// مشکل: Node.js تک‌پروسه است و فقط یک هستهٔ CPU را استفاده می‌کند.
// در یک سرور ۸ هسته‌ای، ۷ هسته بیکار می‌مانند.
//
// راه‌حل: cluster.fork() — هر worker یک نسخهٔ کامل از Express + SQLite دارد.
// SQLite WAL mode تضمین می‌کند همهٔ workers بتوانند هم‌زمان بخوانند.
// نوشتن serialized می‌شود ولی busy_timeout=5000 جلوی خطای SQLITE_BUSY را می‌گیرد.
//
// نحوهٔ استفاده:
//   Linux:   CLUSTER_ENABLED=true node backend/server.js
//   PM2:     CLUSTER_ENABLED=true pm2 start backend/server.js -i max
//   ویندوز:  غیرفعال (cluster module روی ویندوز مشکل port sharing دارد)
//
// بدون این متغیر، server.js به‌صورت عادی اجرا می‌شود (تک‌پروسه).

'use strict';

const cluster = require('cluster');
const os = require('os');

const IS_WINDOWS = process.platform === 'win32';

const WORKERS = Math.max(1, Math.min(
  Number(process.env.CLUSTER_WORKERS) || os.cpus().length,
  8  // سقف ۸ worker — بیشتر از آن روی SQLite فایده ندارد
));

// «کرشِ جوان» = مرگِ worker در این بازه پس از تولد. مقدار قابل تنظیم است فقط
// برای اینکه آزمونِ نگهبان بتواند بدونِ ۱۰ ثانیه خوابِ واقعی، هر دو شاخه را
// بزند؛ پیش‌فرض همان ۱۰ ثانیه‌ی قبلی است.
const YOUNG_CRASH_MS = Math.max(100, Number(process.env.CLUSTER_YOUNG_MS) || 10000);

// مهلتِ خاموشیِ تمیز پیش از SIGKILL. همان دلیلِ بالا: آزمونِ نگهبان نباید
// ۱۰ ثانیهٔ واقعی صبر کند تا ببیند ماشینِ خاموشی exit(0) می‌دهد.
const SHUTDOWN_GRACE_MS = Math.max(100, Number(process.env.CLUSTER_SHUTDOWN_GRACE_MS) || 10000);

/**
 * آیا باید حالت cluster فعال شود؟
 * شرایط:
 *   1) CLUSTER_ENABLED=true باشد
 *   2) CPU بیشتر از ۱ باشد
 *   3) روی لینوکس باشد (نه ویندوز — مشکل port sharing با SQLite)
 */
function isClusterEnabled() {
  if (IS_WINDOWS) return false; // Windows: cluster با SQLite مشکل دارد
  const raw = String(process.env.CLUSTER_ENABLED || '').trim().toLowerCase();
  if (raw !== 'true' && raw !== '1' && raw !== 'yes' && raw !== 'on') return false;
  return os.cpus().length > 1;
}

/**
 * اجرای master: workerها را fork می‌کند و مانیتور می‌کند.
 * @param {string} scriptPath — مسیر فایل server.js
 */
function runMaster(scriptPath) {
  console.log(`\n[CLUSTER] Master ${process.pid} starting ${WORKERS} workers (${os.cpus().length} CPUs available)\n`);

  // اطمینان از اینکه Node مسیر اسکریپت را می‌فهمد
  if (!process.argv[1]) process.argv[1] = scriptPath;

  const workers = new Map();
  let crashingWorkers = 0;
  let shuttingDown = false;

  function forkWorker() {
    const worker = cluster.fork();
    workers.set(worker.id, { pid: worker.process.pid, startedAt: Date.now() });
  }

  // شروع اولیه
  for (let i = 0; i < WORKERS; i++) forkWorker();

  // ری‌استارت خودکار وقتی worker کرش کرد.
  //
  // چرا این نسخه عوض شد: پیش‌تر شاخه‌ی «کرشِ زیرِ ۱۰ ثانیه» فقط شمارنده را
  // بالا می‌برد و هیچ fork‌ای نمی‌زد — یعنی workerی که موقعِ بالا آمدن
  // می‌مرد (پورت اشغال، مایگریشن شکسته، خطای کانفیگ) تا ابد مرده می‌مانْد و
  // سایت روی ظرفیت کم می‌رفت، بی‌هیچ خطایی جز یک warn. حالا کرشِ جوان هم
  // ری‌استارت می‌شود، با تعللِ پله‌ای (۱ تا ۵ ثانیه) تا محیطِ واقعاً خرابِ
  // startup را تبدیل به حلقه‌ی forkِ بی‌وقفه نکند؛ و فقط وقتی «همه»ی
  // workerها جوان مردند (یعنی مشکل در کانفیگ است، نه یک اتفاقِ گذرا) از
  // حالتِ cluster بیرون می‌آید.
  cluster.on('exit', (worker, code, signal) => {
    const info = workers.get(worker.id);
    workers.delete(worker.id);

    if (shuttingDown) return; // خاموشیِ عمدی — ری‌استارت ممنوع

    const livedMs = info ? Date.now() - info.startedAt : 0;
    const uptime = Math.round(livedMs / 1000);
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;

    if (info && livedMs >= YOUNG_CRASH_MS) {
      // عمرِ طولانی = سقوطِ گذرا؛ تاریخچه‌ی کرش‌های جوان پاک می‌شود
      crashingWorkers = 0;
      console.warn(`[CLUSTER] Worker ${worker.id} died (${reason}) after ${uptime}s — restarting`);
      forkWorker();
      return;
    }

    crashingWorkers++;
    if (crashingWorkers >= WORKERS) {
      console.error(`[CLUSTER] ${crashingWorkers} workers crashed within ${Math.round(YOUNG_CRASH_MS / 1000)}s of start — aborting cluster mode`);
      process.exit(1);
    }
    const delay = Math.min(1000 * crashingWorkers, 5000);
    console.warn(`[CLUSTER] Worker ${worker.id} died young (${reason}, ${uptime}s) — restart #${crashingWorkers} in ${delay}ms`);
    setTimeout(() => { if (!shuttingDown) forkWorker(); }, delay).unref();
  });

  // خاموشی تمیز
  function shutdownAll() {
    if (shuttingDown) return; // دوبار SIGINT/SIGTERM = یک خاموشی، نه دو تا
    shuttingDown = true;
    console.log(`[CLUSTER] Master ${process.pid}: shutting down ${workers.size} workers...`);
    // `cluster.workers` یک آبجکتِ ساده است (کلید = id)، نه Map؛ تا امروز
    // `for...of` رویش TypeError می‌داد و کلِ مسیرِ خاموشیِ تمیز در اولین گام
    // می‌مرد — نه SIGTERMی فرستاده می‌شد، نه SIGKILLی، و master با کدِ ۱ و
    // استکِ ناخوانا زمین می‌خورد. نگهبانِ tests/cluster-restart.js همین را
    // گرفت؛ `Object.values` تنها شکلِ درستِ پیمایش است.
    for (const w of Object.values(cluster.workers)) {
      // پیامِ {type:'shutdown'} اینجا بود ولی هیچ workerی listener نداشت؛
      // تنها مکانیزمِ واقعیِ خاموشی همان SIGTERM است (server.js شنونده‌اش است).
      try { w.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
    setTimeout(() => {
      for (const w of Object.values(cluster.workers)) {
        try { w.kill('SIGKILL'); } catch (e) { /* ignore */ }
      }
      process.exit(0);
    }, SHUTDOWN_GRACE_MS).unref();
  }

  process.on('SIGINT', shutdownAll);
  process.on('SIGTERM', shutdownAll);
}

function isWorker() {
  return cluster.isWorker;
}

module.exports = { isClusterEnabled, runMaster, isWorker, WORKERS };
