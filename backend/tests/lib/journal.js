/* ============================================================
   tests/lib/journal.js — «پشتیبانِ روی دیسک» برای هارنسِ تخریبی

   ---------- چه مشکلی را حل می‌کند ----------
   هارنسِ جهش، فایل‌های واقعیِ مخزن را عمداً می‌شکند تا ببیند نگهبان‌ها می‌گیرند
   یا نه. بازگردانی‌اش همیشه در **حافظه** بود: بایت‌های اصلی در یک `Map`
   می‌نشستند و با `process.on('exit')` و چند سیگنال‌گیرنده برمی‌گشتند. آن‌ها
   `SIGKILL`، قطعِ برق، یا بستنِ پنجره از Task Manager را پوشش نمی‌دهند — چون
   در آن حالت‌ها پروسه هیچ فرصتی برای اجرای کد ندارد. نتیجه: فایل‌های
   تخریب‌شده روی دیسک می‌مانند و «ابزارِ نگهبانی» خودش منبعِ خرابی می‌شود.

   ---------- قرارداد ----------
   پیش از هر جهش، بایت‌های اصلی در پوشهٔ `.guard-mutation-journal` نوشته
   می‌شود و یک `index.json` مسیر/وجود/هش/pid را نگه می‌دارد. اجرای بعدی، پیش
   از هر کاری، `recover()` را صدا می‌زند: اگر مالکِ ژورنال مرده باشد، فایل‌ها
   بایت‌به‌بایت برمی‌گردند؛ اگر زنده باشد، دست به کارش نمی‌زنیم (دو اجرای
   موازی نباید همدیگر را قربانی کنند).

   ---------- چرا ماژول جدا ----------
   همین قاعده دو مصرف‌کننده دارد: خودِ هارنس، و نگهبانِ `journal-recovery.js`
   که باید بتواند «اجرای کشته‌شده» را **قطعی** بسازد، نه با killِ زمان‌بندی‌شده
   (که آزمونِ لرزان می‌سازد). ماژول، ریشه و pid را پارامتر می‌گیرد تا آزمون
   بتواند در پوشهٔ موقت کار کند و به مخزنِ واقعی دست نزند.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** آیا آن PID هنوز زنده است؟ (`EPERM` یعنی زنده است ولی مالِ کاربرِ دیگری) */
function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * یک ژورنال روی یک ریشهٔ مشخص.
 *
 * @param {object} opts
 * @param {string} opts.root ریشه‌ای که مسیرهای نسبی به آن حساب می‌شوند
 * @param {number} [opts.pid] مالکِ اجرا (پیش‌فرض: همین پروسه)
 * @param {Function} [opts.log] جایی که گزارشِ بازیابی نوشته می‌شود
 */
function makeJournal({ root, pid = process.pid, log = console.error }) {
  const dir = path.join(root, '.guard-mutation-journal');
  const indexFile = path.join(dir, 'index.json');

  const read = () => {
    try {
      const j = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      return j && Array.isArray(j.entries) ? j : { pid: null, entries: [] };
    } catch {
      return { pid: null, entries: [] };
    }
  };

  const write = (j) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(indexFile, `${JSON.stringify(j, null, 2)}\n`);
  };

  const removeDir = () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* بی‌اهمیت */ }
  };

  /**
   * پیش از جهش: بایت‌های اصلی را روی دیسک می‌نشاند (یک بار برای هر فایل).
   * `original === null` یعنی فایل از قبل نبوده و باید در بازگردانی حذف شود.
   */
  const journalize = (abs, original) => {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const j = read();
    if (j.entries.some((e) => e.file === rel)) return;
    const bak = `${crypto.createHash('sha1').update(rel).digest('hex')}.bak`;
    if (original !== null) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, bak), original);
    }
    j.pid = pid;
    j.entries.push({
      file: rel,
      pid,
      existed: original !== null,
      sha: original === null ? null : sha(original),
      bak,
      at: new Date().toISOString(),
    });
    write(j);
  };

  /** فایل بازگردانده شد؛ سطرِ خودیِ همان فایل از ژورنال می‌رود. */
  const dejournalize = (abs) => {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const j = read();
    const mine = (e) => !e.pid || e.pid === pid;
    const kept = j.entries.filter((e) => !(e.file === rel && mine(e)));
    if (kept.length === j.entries.length) return;
    j.entries = kept;
    if (!kept.length) return clear();
    return write(j);
  };

  /**
   * پایانِ خوشِ یک اجرا: **فقط مالِ خودمان** را می‌برد.
   *
   * این تفکیک از یک حادثهٔ واقعی آمد: اجرایی با SIGKILL کشته شد و ژورنالش
   * ماند؛ اجرای بعدی نتوانست بازیابی کند (مالک هنوز زنده به نظر می‌رسید) ولی
   * سرِ پایانِ خودش کلِ پوشه را پاک کرد — و با آن، تنها پشتیبانِ بایت‌به‌بایتِ
   * فایلِ تخریب‌شده هم رفت. یعنی «پاک‌سازیِ موفق» یک خرابیِ بی‌ربط را دائمی
   * می‌کرد.
   */
  function clear() {
    const j = read();
    const foreign = j.entries.filter((e) => e.pid && e.pid !== pid);
    if (foreign.length) {
      j.entries = foreign;
      write(j);
      return;
    }
    removeDir();
  }

  /**
   * پیش از هر جهش اجرا می‌شود: اگر اجرای قبلی سخت کشته شده باشد، فایل‌های
   * تخریب‌شده را برمی‌گرداند.
   *
   * خروجی: `{ restored, problems, skippedAlive }`.
   */
  function recover() {
    const j = read();
    if (!j.entries.length) {
      removeDir(); // پوشهٔ نیمه‌مانده از اجرای قبلی
      return { restored: [], problems: [], skippedAlive: false };
    }
    if (pidAlive(j.pid) && j.pid !== pid) {
      log(
        `\n⚠️  ژورنالی از پروسهٔ زندهٔ ${j.pid} هست؛ دست به فایل‌هایش نمی‌زنم.\n`
        + '   اگر آن اجرا واقعاً تمام شده، پوشهٔ .guard-mutation-journal را پاک کن.',
      );
      return { restored: [], problems: [], skippedAlive: true };
    }

    const restored = [];
    const problems = [];
    const unresolved = [];
    for (const e of j.entries) {
      const abs = path.join(root, e.file);
      try {
        if (!e.existed) {
          fs.rmSync(abs, { force: true });
          restored.push(e.file);
          continue;
        }
        const bakPath = path.join(dir, e.bak);
        if (!fs.existsSync(bakPath)) {
          problems.push(`${e.file} (پشتیبان پیدا نشد)`);
          unresolved.push(e);
          continue;
        }
        const bytes = fs.readFileSync(bakPath);
        fs.writeFileSync(abs, bytes);
        if (sha(bytes) !== e.sha) {
          problems.push(`${e.file} (هش با فهرست نمی‌خواند)`);
          unresolved.push(e);
        } else {
          restored.push(e.file);
        }
      } catch (err) {
        problems.push(`${e.file} (${err.message})`);
        unresolved.push(e);
      }
    }

    // ژورنال مستقل از مالکیت بسته می‌شود (خودمان بازیابی کردیم)، ولی اگر
    // فایلی بازنگشت سطرش می‌ماند تا پشتیبانش برای برگرداندنِ دستی از بین نرود.
    if (unresolved.length) write({ pid: null, entries: unresolved });
    else removeDir();

    if (restored.length) {
      log(`\n♻️  اجرای قبلی وسطِ راه سخت کشته شده بود؛ ${restored.length} فایلِ جهش‌دیده بایت‌به‌بایت برگشت:`);
      for (const f of restored) log(`   • ${f}`);
    }
    if (problems.length) {
      log(`\n❌ بازگردانیِ ژورنال ناتمام ماند (${problems.length}):`);
      for (const p of problems) log(`   • ${p}`);
      log('   این فایل‌ها را با گیت مقایسه و دستی برگردان.');
    }
    return { restored, problems, skippedAlive: false };
  }

  return { dir, indexFile, read, write, journalize, dejournalize, clear, recover };
}

module.exports = { makeJournal, pidAlive, sha };
