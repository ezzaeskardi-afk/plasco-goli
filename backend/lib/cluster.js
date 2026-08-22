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

  function forkWorker() {
    const worker = cluster.fork();
    workers.set(worker.id, { pid: worker.process.pid, startedAt: Date.now() });
    crashingWorkers = 0; // ریست بعد از شروع موفق
  }

  // شروع اولیه
  for (let i = 0; i < WORKERS; i++) forkWorker();

  // ری‌استارت خودکار وقتی worker کرش کرد
  cluster.on('exit', (worker, code, signal) => {
    const info = workers.get(worker.id);
    workers.delete(worker.id);

    const uptime = info ? Math.round((Date.now() - info.startedAt) / 1000) : 0;
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;

    if (uptime < 10) {
      crashingWorkers++;
      if (crashingWorkers >= WORKERS) {
        console.error(`[CLUSTER] All workers crashed at startup — aborting cluster mode`);
        process.exit(1);
      }
    } else {
      console.warn(`[CLUSTER] Worker ${worker.id} died (${reason}) after ${uptime}s — restarting`);
      forkWorker();
    }
  });

  // خاموشی تمیز
  function shutdownAll() {
    console.log(`[CLUSTER] Master ${process.pid}: shutting down ${workers.size} workers...`);
    for (const [, w] of cluster.workers) {
      try { w.send({ type: 'shutdown' }); } catch (e) { /* ignore */ }
      try { w.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
    setTimeout(() => {
      for (const [, w] of cluster.workers) {
        try { w.kill('SIGKILL'); } catch (e) { /* ignore */ }
      }
      process.exit(0);
    }, 10000).unref();
  }

  process.on('SIGINT', shutdownAll);
  process.on('SIGTERM', shutdownAll);
}

function isWorker() {
  return cluster.isWorker;
}

module.exports = { isClusterEnabled, runMaster, isWorker, WORKERS };
