// حالتِ گذرای مشترک بین cluster workers
//
// مشکلی که این فایل حل می‌کند
// ---------------------------
// چند جای پروژه داده‌ی کوتاه‌عمر را در یک `Map` نگه می‌داشتند:
//   • توکنِ یک‌بارمصرفِ challenge برای درخواست پیامک (routes/auth.js)
//   • شمارنده‌ی تلاش‌های ناموفقِ ورود، یعنی قفلِ حساب (lib/login-guard.js)
//
// در حالت تک‌پروسه این انتخاب درست است: سریع‌ترین حالتِ ممکن و صفر I/O.
// ولی به‌محض روشن‌شدن CLUSTER_ENABLED هر worker یک Map جدا دارد و:
//
//   • توکنِ challenge را worker شماره‌ی ۱ می‌سازد و درخواستِ بعدی به worker
//     شماره‌ی ۵ می‌رسد؛ توکن پیدا نمی‌شود و کاربر پیام «صفحه را رفرش کنید»
//     می‌گیرد. با N worker، ورود با پیامک (N−۱)/N بار شکست می‌خورد — یعنی
//     با ۸ هسته، ۷ بار از ۸ بار. این خرابیِ عملکردی است، نه فقط امنیتی.
//
//   • قفلِ حساب N برابر ضعیف می‌شود: هر worker جدا تا ۵ تلاش می‌شمارد، پس
//     مهاجم ۵×N رمز می‌تواند امتحان کند. دقیقاً همان سوراخی که login-guard
//     برای بستنش نوشته شده بود.
//
// راه‌حل
// ------
// یک انتزاعِ نازک با دو پیاده‌سازی. انتخاب در زمانِ ساخت انجام می‌شود:
//
//   تک‌پروسه → همان Map. رفتار و سرعت مو‌به‌مو مثل قبل؛ هیچ کوئری‌ای اضافه
//              نمی‌شود. یعنی حالتی که واقعاً امروز اجرا می‌شود دست‌نخورده است.
//   کلاستر   → جدولِ SQLite. همه‌ی workerها یک فایل را می‌بینند.
//
// چرا SQLite و نه Redis: پروژه عمداً سه وابستگی دارد و SQLite همین‌جا هست.
// افزودن Redis یعنی یک سرویسِ دیگر که باید نصب، پایش و پشتیبان‌گیری شود —
// برای فروشگاهی در این مقیاس هزینه‌اش از فایده‌اش بیشتر است.
//
// دربارهٔ نگرانیِ «هر تلاشِ ناموفق یک write است»
// ---------------------------------------------
// کامنتِ قدیمیِ login-guard درست می‌گفت که نوشتن در دیتابیس به‌ازای هر رمزِ
// غلط، خودش یک اهرم برای مهاجم است. ولی آن استدلال فقط در تک‌پروسه معنی دارد
// و همان‌جا هم رعایت شده: مسیرِ SQLite فقط در کلاستر فعال می‌شود، جایی که
// rate limiter هم از قبل به‌ازای هر درخواست می‌نویسد. WAL باز است و
// busy_timeout تنظیم شده، پس چند هزار نوشتن در ثانیه مسئله‌ای نیست.

'use strict';

const { isClusterEnabled } = require('./cluster');

// ---------------------------------------------------------------
// پیاده‌سازی ۱: Map — تک‌پروسه
// ---------------------------------------------------------------
function makeMapStore(name, { ttlMs, maxKeys }) {
  const map = new Map(); // key → { value, expiresAt }

  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of map) if (v.expiresAt <= now) map.delete(k);
  };

  // اگر بعد از هرسِ منقضی‌ها باز هم پر بود، فقط بخشی از قدیمی‌ترین‌ها بیرون
  // می‌روند. پاک‌کردنِ کلِ Map یعنی هر کسی که حافظه را با کلیدهای یک‌بارمصرف
  // پر کند، سهمیه/توکنِ کاربرانِ واقعی را هم با خودش می‌برد.
  const evictIfFull = () => {
    if (!maxKeys || map.size < maxKeys) return;
    sweep();
    if (map.size < maxKeys) return;
    let drop = Math.ceil(maxKeys / 10);
    for (const k of map.keys()) { if (drop-- <= 0) break; map.delete(k); }
  };

  return {
    shared: false,
    get(key) {
      const rec = map.get(String(key));
      if (!rec) return undefined;
      if (rec.expiresAt <= Date.now()) { map.delete(String(key)); return undefined; }
      return rec.value;
    },
    set(key, value, ttl = ttlMs) {
      evictIfFull();
      map.set(String(key), { value, expiresAt: Date.now() + ttl });
    },
    delete(key) { return map.delete(String(key)); },
    // در تک‌پروسه، JS تک‌رشته است؛ پس این تابع به‌خودی‌خود اتمیک است.
    mutate(key, fn, ttl = ttlMs) {
      const k = String(key);
      const cur = this.get(k);
      const next = fn(cur);
      if (next === null || next === undefined) { map.delete(k); return next; }
      const wanted = typeof ttl === 'function' ? ttl(next) : ttl;
      evictIfFull();
      map.set(k, { value: next, expiresAt: Date.now() + wanted });
      return next;
    },
    size() { sweep(); return map.size; },
    sweep,
    clear() { map.clear(); },
  };
}

// ---------------------------------------------------------------
// پیاده‌سازی ۲: SQLite — کلاستر
// ---------------------------------------------------------------
let sqliteReady = false;
function initSqlite(db) {
  if (sqliteReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_state (
      store      TEXT    NOT NULL,
      key        TEXT    NOT NULL,
      value      TEXT    NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (store, key)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_state_exp ON shared_state(expires_at);
  `);
  sqliteReady = true;
}

function makeSqliteStore(name, { ttlMs, maxKeys }) {
  const { db } = require('./db');
  initSqlite(db);

  const qGet = db.prepare(
    'SELECT value, expires_at FROM shared_state WHERE store = ? AND key = ?');
  const qSet = db.prepare(`
    INSERT INTO shared_state (store, key, value, expires_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(store, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`);
  const qDel = db.prepare('DELETE FROM shared_state WHERE store = ? AND key = ?');
  const qSweep = db.prepare('DELETE FROM shared_state WHERE store = ? AND expires_at <= ?');
  const qCount = db.prepare(
    'SELECT COUNT(*) AS n FROM shared_state WHERE store = ? AND expires_at > ?');
  // قدیمی‌ترین‌ها بر اساس زمانِ انقضا؛ چون TTL ثابت است، همان ترتیبِ ورود است.
  const qOldest = db.prepare(
    'SELECT key FROM shared_state WHERE store = ? ORDER BY expires_at ASC LIMIT ?');
  const qClear = db.prepare('DELETE FROM shared_state WHERE store = ?');

  const sweep = () => { try { qSweep.run(name, Date.now()); } catch { /* ignore */ } };

  const evictIfFull = () => {
    if (!maxKeys) return;
    if (qCount.get(name, Date.now()).n < maxKeys) return;
    sweep();
    if (qCount.get(name, Date.now()).n < maxKeys) return;
    for (const r of qOldest.all(name, Math.ceil(maxKeys / 10))) qDel.run(name, r.key);
  };

  const read = (key) => {
    const row = qGet.get(name, String(key));
    if (!row) return undefined;
    if (row.expires_at <= Date.now()) { qDel.run(name, String(key)); return undefined; }
    try { return JSON.parse(row.value); } catch { return undefined; }
  };

  return {
    shared: true,
    get: read,
    set(key, value, ttl = ttlMs) {
      evictIfFull();
      qSet.run(name, String(key), JSON.stringify(value), Date.now() + ttl);
    },
    delete(key) { return qDel.run(name, String(key)).changes > 0; },
    // read-modify-write باید اتمیک باشد وگرنه دو worker هم‌زمان یک شمارنده را
    // می‌خوانند، هر دو «۴» می‌بینند و هر دو «۵» می‌نویسند — یعنی یک تلاشِ
    // ناموفق گم می‌شود. BEGIN IMMEDIATE قفلِ نوشتن را همان اول می‌گیرد.
    mutate(key, fn, ttl = ttlMs) {
      const k = String(key);
      let out;
      let inTx = false;
      try {
        db.exec('BEGIN IMMEDIATE');
        inTx = true;
        const cur = read(k);
        out = fn(cur);
        if (out === null || out === undefined) {
          qDel.run(name, k);
        } else {
          const wanted = typeof ttl === 'function' ? ttl(out) : ttl;
          qSet.run(name, k, JSON.stringify(out), Date.now() + wanted);
        }
        db.exec('COMMIT');
        inTx = false;
      } catch (err) {
        if (inTx) { try { db.exec('ROLLBACK'); } catch { /* ignore */ } }
        throw err;
      }
      return out;
    },
    size() { sweep(); return qCount.get(name, Date.now()).n; },
    sweep,
    clear() { try { qClear.run(name); } catch { /* ignore */ } },
  };
}

/**
 * یک انبارکِ کلید-مقدارِ کوتاه‌عمر می‌سازد که در کلاستر بین workerها مشترک است.
 *
 * @param {string} name — نامِ فضای کلید (مثلاً 'otp-challenge')
 * @param {object} opts
 * @param {number} opts.ttlMs — عمرِ پیش‌فرضِ هر کلید
 * @param {number} [opts.maxKeys] — سقفِ تعداد کلیدِ زنده؛ ۰ یعنی بی‌سقف
 * @param {number} [opts.sweepMs] — فاصله‌ی هرسِ خودکار
 */
function makeSharedStore(name, { ttlMs, maxKeys = 0, sweepMs = 60000 } = {}) {
  const store = isClusterEnabled()
    ? makeSqliteStore(name, { ttlMs, maxKeys })
    : makeMapStore(name, { ttlMs, maxKeys });

  // unref تا این تایمر جلوی بسته‌شدنِ پروسه را در تست‌ها نگیرد.
  if (sweepMs > 0) {
    const t = setInterval(() => store.sweep(), Math.min(sweepMs, Math.max(ttlMs, 1000)));
    if (t.unref) t.unref();
  }
  return store;
}

// فقط برای تست: مسیرِ SQLite را حتی روی ویندوز (که کلاستر خاموش است) می‌سازد،
// وگرنه نیمی از کد هرگز اجرا نمی‌شود و باگش تا روزِ استقرار پنهان می‌ماند.
function _makeSqliteStoreForTest(name, opts) { return makeSqliteStore(name, opts); }
function _makeMapStoreForTest(name, opts) { return makeMapStore(name, opts); }

module.exports = { makeSharedStore, _makeSqliteStoreForTest, _makeMapStoreForTest };
