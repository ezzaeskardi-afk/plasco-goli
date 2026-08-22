// Rate Limiter مبتنی بر SQLite — مشترک بین cluster workers
//
// مشکل: rate-limit فعلی (Map درون‌حافظه) در حالت cluster مشترک نیست.
// اگر ۴ worker داشته باشیم و سقف ۳۰۰ باشد، هر worker ۳۰۰ تا می‌شمارد
// یعنی عملاً ۱۲۰۰ درخواست در دقیقه از هر کاربر عبور می‌کند.
//
// راه‌حل: شمارش در SQLite. همهٔ workers به یک فایل دسترسی دارند.
// WAL mode تضمین می‌کند خوانندگان منتظر نویسنده نمانند.
// busy_timeout=5000 از SQLITE_BUSY جلوگیری می‌کند.
//
// این فایل فقط وقتی فعال می‌شود که CLUSTER_ENABLED=true باشد.
// در حالت تک‌پروسه، rate-limit سادهٔ درون‌حافظه کافی و سریع‌تر است.

'use strict';

const { db } = require('./db');

// ساخت جدول اگر نباشد
db.exec(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    key   TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL
  )
`);

// تمیزکاری دوره‌ای ردیف‌های منقضی‌شده
const stmtCleanup = db.prepare(
  `DELETE FROM rate_limits WHERE window_start < ?`
);

// شمارش درخواست
const stmtGet = db.prepare(
  `SELECT count, window_start FROM rate_limits WHERE key = ?`
);
const stmtUpsert = db.prepare(`
  INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
  ON CONFLICT(key) DO UPDATE SET count = count + 1
`);
// پس‌دادنِ سهمیه بعد از یک درخواستِ موفق (skipSuccess).
//
// اینجا قبلاً `SET count = 1` بود و آن یک حفره‌ی واقعی می‌ساخت: شمارنده را
// صفر می‌کرد، نه یکی کم. یعنی مهاجم می‌توانست ۲۹ رمز غلط بزند، بعد یک
// درخواستِ موفقِ بی‌ضرر روی همان مسیر بفرستد و کل سابقه‌اش پاک شود —
// عملاً سقفِ بی‌نهایت. نسخه‌ی درون‌حافظه‌ای همیشه `count -= 1` می‌کرد؛
// این حالا با آن یکی است.
//
// شرطِ `window_start = ?` معادلِ همان `hits.get(key) === mine` در نسخه‌ی
// حافظه‌ای است: اگر در این فاصله پنجره‌ی تازه‌ای شروع شده باشد، از سهمیه‌ی
// پنجره‌ی جدید کم نمی‌کنیم.
const stmtGiveBack = db.prepare(
  `UPDATE rate_limits SET count = count - 1
     WHERE key = ? AND window_start = ? AND count > 0`
);
const stmtCount = db.prepare(
  `SELECT COUNT(*) AS n FROM rate_limits`
);

function requestKey(req, name = 'ip') {
  const value = name === 'user' && req.session?.userId
    ? `user:${req.session.userId}`
    : `ip:${req.ip || 'unknown'}`;
  return value;
}

/**
 * @param {object} opts
 * @param {number} opts.windowMs — پنجرهٔ زمانی به میلی‌ثانیه
 * @param {number} opts.max — حداکثر درخواست در پنجره
 * @param {string} [opts.message] — پیام خطا
 * @param {boolean} [opts.skipSuccess] — درخواست موفق از سقف کم نشود
 * @param {string} [opts.keyBy] — 'ip' یا 'user'
 */
function rateLimitSqlite({ windowMs, max, message, skipSuccess = false, keyBy = 'ip' }) {
  // پاک‌سازی هر دقیقه
  const sweepInterval = setInterval(() => {
    try { stmtCleanup.run(Date.now() - windowMs * 2); } catch (e) { /* ignore */ }
  }, Math.min(windowMs, 60000));
  if (sweepInterval.unref) sweepInterval.unref();

  return (req, res, next) => {
    const key = requestKey(req, keyBy);
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const row = stmtGet.get(key);

      if (!row || row.window_start <= windowStart) {
        // پنجره جدید — شمارش از ۱ شروع
        stmtUpsert.run(key, now);
      } else {
        // پنجره فعلی — شمارش +۱
        stmtUpsert.run(key, row.window_start);
      }

      // خواندن مقدار جدید
      const current = stmtGet.get(key);
      const count = current ? current.count : 1;

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));

      if (count > max) {
        const resetMs = (current ? current.window_start : now) + windowMs;
        res.setHeader('Retry-After', String(Math.ceil((resetMs - now) / 1000)));
        return res.status(429).json({
          error: message || 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید'
        });
      }

      if (skipSuccess) {
        const myWindow = current ? current.window_start : null;
        const myKey = key;
        res.on('finish', () => {
          if (res.statusCode < 400 && myWindow !== null) {
            try { stmtGiveBack.run(myKey, myWindow); } catch (e) { /* ignore */ }
          }
        });
      }

      next();
    } catch (err) {
      // اگر SQLite خطا داد (نادر)، اجازه عبور بده — بهتر از قفل‌کردن سایت
      next();
    }
  };
}

/** آمار (برای پنل ادمین) */
function getRateLimitStats() {
  try { return stmtCount.get(); } catch (e) { return { n: 0 }; }
}

module.exports = { rateLimitSqlite, getRateLimitStats };
