// سشن‌استور مبتنی بر SQLite — لاگین و سبد خرید کاربران با ری‌استارت سرور نمی‌پرد.
// جایگزین MemoryStore پیش‌فرض express-session که فقط برای توسعه است.

const { Store } = require('express-session');
const { db } = require('./db');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const stmtGet = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?');
const stmtSet = db.prepare(`
  INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
  ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at
`);
const stmtTouch = db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?');
const stmtDestroy = db.prepare('DELETE FROM sessions WHERE sid = ?');
const stmtCount = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at >= ?');

function expiryOf(session) {
  const maxAge = session?.cookie?.maxAge;
  return Date.now() + (typeof maxAge === 'number' ? maxAge : 30 * ONE_DAY_MS);
}

class SqliteSessionStore extends Store {
  get(sid, cb) {
    try {
      const row = stmtGet.get(sid);
      if (!row || row.expires_at < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch (err) { cb(err); }
  }

  set(sid, session, cb) {
    try {
      stmtSet.run(sid, JSON.stringify(session), expiryOf(session));
      cb?.(null);
    } catch (err) { cb?.(err); }
  }

  touch(sid, session, cb) {
    try {
      stmtTouch.run(expiryOf(session), sid);
      cb?.(null);
    } catch (err) { cb?.(err); }
  }

  destroy(sid, cb) {
    try {
      stmtDestroy.run(sid);
      cb?.(null);
    } catch (err) { cb?.(err); }
  }

  length(cb) {
    try { cb(null, stmtCount.get(Date.now()).n); } catch (err) { cb(err); }
  }
}

/* ---------- باطل‌کردنِ نشست‌های دیگرِ یک کاربر ----------
   سناریویی که این را لازم می‌کند: کوکیِ نشست به هر دلیلی از دستِ کاربر
   در رفته — گوشیِ گم‌شده، لپ‌تاپِ کافی‌نت، بدافزار. کوکی ۳۰ روز اعتبار
   دارد و تا امروز **هیچ راهی** برای کشتنش نبود؛ حتی عوض‌کردنِ رمز هم فقط
   ورودِ *بعدی* را سخت می‌کرد و نشستِ بازِ مهاجم دست‌نخورده می‌ماند. یعنی
   کاربری که می‌فهمید حسابش لو رفته، عملاً کاری از دستش برنمی‌آمد.

   چرا json_extract: جدولِ sessions فقط sid و یک ستونِ متنیِ data دارد؛
   شناسه‌ی کاربر داخلِ همان JSON است. SQLiteِ نود تابع json_extract را
   دارد، پس بدونِ تغییرِ ساختارِ جدول می‌شود همه‌ی نشست‌های یک کاربر را پیدا
   کرد. اسکن روی چند صد ردیفِ نشست ارزان است و این کار فقط موقعِ تغییر رمز
   یا فشردنِ دکمه‌ی «خروج از همه‌ی دستگاه‌ها» انجام می‌شود، نه در هر درخواست.

   keepSid: نشستِ خودِ همین مرورگر نگه داشته می‌شود، وگرنه کاربر با عوض‌کردنِ
   رمزِ خودش از حسابِ خودش هم پرت می‌شود بیرون و فکر می‌کند چیزی خراب شده. */
const stmtKillOthers = db.prepare(
  `DELETE FROM sessions WHERE json_extract(data,'$.userId') = ? AND sid <> ?`
);

function destroyOtherSessions(userId, keepSid = '') {
  if (!userId) return 0;
  try {
    return stmtKillOthers.run(Number(userId), String(keepSid || '')).changes || 0;
  } catch (e) {
    // اگر روزی json_extract نبود، نباید تغییرِ رمز شکست بخورد — بدترین حالت
    // این است که نشست‌های دیگر بمانند، نه اینکه کاربر نتواند رمزش را عوض کند.
    return 0;
  }
}

// شمردنِ نشست‌های فعالِ یک کاربر — برای نشان‌دادنِ «۳ دستگاه وارد است».
const stmtCountUser = db.prepare(
  `SELECT COUNT(*) AS n FROM sessions WHERE json_extract(data,'$.userId') = ? AND expires_at >= ?`
);
function countUserSessions(userId) {
  if (!userId) return 0;
  try { return stmtCountUser.get(Number(userId), Date.now()).n || 0; } catch (e) { return 0; }
}

module.exports = { SqliteSessionStore, destroyOtherSessions, countUserSessions };
