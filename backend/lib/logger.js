// لاگر سبک فایل‌محور — بدون وابستگی خارجی.
// لاگ‌ها در backend/logs/ روزانه ذخیره می‌شوند و ۱۴ روز نگه داشته می‌شوند.
// خطاها جداگانه در error-*.log هم می‌روند تا پیدا کردنشان سریع باشد.

const fs = require('fs');
const path = require('path');

/* مثل lib/db.js به PG_DATA_DIR احترام می‌گذاریم تا سرورِ تست در پوشه‌ی لاگِ
   واقعی ننویسد. تا قبل از این، هر اجرای تست چند خط داخل backend/logs می‌ریخت
   و — مهم‌تر — cleanupOldLogs روی همان پوشه اجرا می‌شد، یعنی تست می‌توانست
   لاگ‌های واقعیِ قدیمی‌تر از ۱۴ روز را پاک کند. همان دیوارِ داده‌ای که برای
   دیتابیس داریم باید برای لاگ هم برقرار باشد. */
const LOG_DIR = process.env.PG_DATA_DIR
  ? path.join(path.resolve(process.env.PG_DATA_DIR), 'logs')
  : path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const RETENTION_DAYS = 14;

function today() { return new Date().toISOString().slice(0, 10); }

const streams = new Map(); // name -> { day, stream }
function streamFor(name) {
  const day = today();
  let s = streams.get(name);
  if (!s || s.day !== day) {
    s?.stream.end();
    s = { day, stream: fs.createWriteStream(path.join(LOG_DIR, `${name}-${day}.log`), { flags: 'a' }) };
    streams.set(name, s);
  }
  return s.stream;
}

function line(level, msg, extra) {
  const time = new Date().toISOString();
  const rest = extra ? ' ' + JSON.stringify(extra) : '';
  return `${time} [${level}] ${msg}${rest}\n`;
}

function info(msg, extra) {
  const l = line('INFO', msg, extra);
  streamFor('app').write(l);
  console.log(msg);
}

function warn(msg, extra) {
  const l = line('WARN', msg, extra);
  streamFor('app').write(l);
  console.warn(`[WARN] ${msg}`);
}

function error(msg, err) {
  const detail = err ? { message: err.message, stack: err.stack } : undefined;
  const l = line('ERROR', msg, detail);
  streamFor('app').write(l);
  streamFor('error').write(l);
  console.error(`[ERROR] ${msg}`, err?.message || '');
}

// لاگ درخواست‌های HTTP (خطاها و درخواست‌های کند برای عیب‌یابی کافی‌اند)
function accessLog(req, res, ms) {
  if (res.statusCode >= 400 || ms > 1000) {
    // req.id همان کدی است که در هدر X-Request-Id به کاربر هم داده شده؛ با آن
    // می‌شود شکایت یک مشتری را مستقیم به همین خط لاگ وصل کرد.
    streamFor('access').write(line('HTTP', `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`, { ip: req.ip, rid: req.id }));
  }
}

function cleanupOldLogs() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  for (const f of fs.readdirSync(LOG_DIR)) {
    const full = path.join(LOG_DIR, f);
    try { if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full); } catch (e) { /* ignore */ }
  }
}

module.exports = { info, warn, error, accessLog, cleanupOldLogs, LOG_DIR };
