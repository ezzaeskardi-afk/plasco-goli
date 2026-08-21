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

function safeValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === 'string') return value.replace(/[\\r\\n\\t]/g, ' ').slice(0, 1000);
  if (Array.isArray(value)) return value.slice(0, 30).map((v) => safeValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      if (/password|secret|token|cookie|authorization|api[_-]?key|merchant|authority|otp|address|postal|phone|mobile/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = safeValue(item, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function line(level, msg, extra) {
  const time = new Date().toISOString();
  const cleanMsg = String(msg ?? '').replace(/[\\r\\n\\t]/g, ' ').slice(0, 1000);
  const cleanExtra = extra === undefined ? undefined : safeValue(extra);
  const rest = cleanExtra === undefined ? '' : ' ' + JSON.stringify(cleanExtra);
  return `${time} [${level}] ${cleanMsg}${rest}\\n`;
}

function info(msg, extra) {
  const l = line('INFO', msg, extra);
  streamFor('app').write(l);
  if (process.env.LOG_CONSOLE !== 'false') console.log(String(msg ?? '').replace(/[\\r\\n\\t]/g, ' ').slice(0, 1000));
}

function warn(msg, extra) {
  const l = line('WARN', msg, extra);
  streamFor('app').write(l);
  if (process.env.LOG_CONSOLE !== 'false') console.warn(`[WARN] ${String(msg ?? '').replace(/[\\r\\n\\t]/g, ' ').slice(0, 1000)}`);
}

function error(msg, err) {
  const detail = err ? { message: err.message, stack: err.stack } : undefined;
  const l = line('ERROR', msg, detail);
  streamFor('app').write(l);
  streamFor('error').write(l);
  if (process.env.LOG_CONSOLE !== 'false') console.error(`[ERROR] ${String(msg ?? '').replace(/[\\r\\n\\t]/g, ' ').slice(0, 1000)}`, err?.message || '');
}

// لاگ درخواست‌های HTTP (خطاها و درخواست‌های کند برای عیب‌یابی کافی‌اند)
function accessLog(req, res, ms) {
  if (res.statusCode >= 400 || ms > 1000) {
    // req.id همان کدی است که در هدر X-Request-Id به کاربر هم داده شده؛ با آن
    // می‌شود شکایت یک مشتری را مستقیم به همین خط لاگ وصل کرد.
    const pathOnly = String(req.originalUrl || req.path || '').split('?')[0].slice(0, 300);
    streamFor('access').write(line('HTTP', `${req.method} ${pathOnly} ${res.statusCode} ${ms}ms`, {
      ip: req.ip,
      rid: req.id,
      userAgent: String(req.get('user-agent') || '').slice(0, 160)
    }));
  }
}

function cleanupOldLogs() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  for (const f of fs.readdirSync(LOG_DIR)) {
    const full = path.join(LOG_DIR, f);
    try { if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full); } catch (e) { /* ignore */ }
  }
}

module.exports = { info, warn, error, accessLog, cleanupOldLogs, LOG_DIR, safeValue };
