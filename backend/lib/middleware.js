// میدل‌ورهای مشترک: احراز هویت، مدیریت خطای async، rate limit، ETag و اعتبارسنجی

const crypto = require('crypto');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'برای ادامه باید وارد حساب‌تان شوید' });
  }
  next();
}

// روت‌های async را می‌پیچد تا reject شدن promise به‌جای کرش کردن پروسه،
// به error handler سراسری برسد (پاشنه‌آشیل Express 4).
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// rate limit پنجره‌ی لغزان ساده — برای یک پروسه کافی و بدون وابستگی.
// خانه‌تکانی داخلی دارد تا حافظه با IPهای یک‌بارمصرف بزرگ نشود.
//
// دو نکته برای آینده:
//  ۱) شمارش درون همین پروسه است. اگر روزی سایت را با pm2 در حالت cluster
//     (چند پروسه) اجرا کردید، سقف عملاً در تعداد پروسه‌ها ضرب می‌شود.
//     در آن حالت یا cluster را خاموش بگذارید یا شمارش را به Redis ببرید.
//  ۲) MAX_KEYS جلوی حمله‌ی «هزاران IP جعلی در یک پنجره» را می‌گیرد تا
//     حافظه‌ی سرور با کلیدهای یک‌بارمصرف پر نشود.
const MAX_KEYS = 20000;

// skipSuccess=true یعنی درخواستی که موفق بوده (کد کمتر از ۴۰۰) از سقف کم
// نمی‌شود. چرا لازم است: اپراتورهای موبایل ایران CGNAT دارند، یعنی ده‌ها مشتری
// واقعی از یک IP بیرونی می‌آیند. اگر ورودِ *موفق* هم شمرده شود، در یک شب شلوغ
// نفر بیست‌ویکم پیغام «تلاش‌های زیاد برای ورود» می‌گیرد در حالی که رمزش درست
// است. چیزی که باید محدود شود حدس‌زدنِ رمز است، نه ورود درست.
function rateLimit({ windowMs, max, message, skipSuccess = false }) {
  const hits = new Map(); // key -> { count, resetAt }
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  };
  setInterval(sweep, Math.min(windowMs, 60000)).unref();

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      if (hits.size >= MAX_KEYS) {
        sweep();                                  // اول منقضی‌ها را پاک کن
        // اگر باز هم پر بود، فقط قدیمی‌ترین‌ها بیرون می‌روند. پاک‌کردن کل Map
        // یعنی هر کسی که حافظه را با کلیدهای یک‌بارمصرف پر کند، سقف همه‌ی
        // کاربران واقعی را هم با خودش ریست می‌کند.
        if (hits.size >= MAX_KEYS) {
          let drop = Math.ceil(MAX_KEYS / 10);
          for (const k of hits.keys()) { hits.delete(k); if (--drop <= 0) break; }
        }
      }
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count += 1;
    if (rec.count > max) {
      res.setHeader('Retry-After', Math.ceil((rec.resetAt - now) / 1000));
      return res.status(429).json({ error: message || 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' });
    }
    if (skipSuccess) {
      // پس‌دادن سهمیه فقط وقتی رکورد همان رکورد است؛ اگر پنجره در این فاصله
      // ریست شده باشد، از سهمیه‌ی پنجره‌ی جدید کم نمی‌کنیم.
      const mine = rec;
      res.on('finish', () => {
        if (res.statusCode < 400 && hits.get(key) === mine && mine.count > 0) mine.count -= 1;
      });
    }
    next();
  };
}

// ---------------------------------------------------------------
// ETag برای پاسخ‌های JSON
// ---------------------------------------------------------------
// چرا: لیست محصولات در هر بازدید صفحه‌ی اول دوباره دانلود می‌شود. با ETag،
// مرورگر امضای نسخه‌ای که دارد را می‌فرستد و اگر چیزی عوض نشده باشد سرور
// فقط «۳۰۴ Not Modified» می‌دهد — بدون بدنه. یعنی پهنای باند تقریباً صفر و
// پاسخ در چند میلی‌ثانیه، حتی با هزاران بازدیدکننده‌ی هم‌زمان.
//
// امضا را خودِ روت می‌سازد (مثلاً از تعداد و آخرین ویرایش محصولات)، پس
// نیازی نیست کل JSON ساخته و هش شود؛ کار حتی قبل از کوئری تمام می‌شود.
function etagJson(req, res, signature, { maxAge = 30 } = {}) {
  // هدرهای HTTP فقط ASCII می‌پذیرند و امضا ممکن است شامل عبارت جستجوی فارسی
  // باشد؛ پس همیشه هش می‌شود. سود جانبی: هدر کوتاه و یکدست می‌ماند.
  const etag = `W/"${crypto.createHash('sha1').update(String(signature)).digest('base64url').slice(0, 22)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', `public, max-age=${maxAge}, must-revalidate`);
  res.setHeader('Vary', 'Accept-Encoding');

  const inm = req.headers['if-none-match'];
  if (inm && inm.split(/,\s*/).some(t => t.trim() === etag)) {
    res.status(304).end();
    return true; // یعنی پاسخ داده شد؛ روت باید همین‌جا برگردد
  }
  return false;
}

// ---------------------------------------------------------------
// اعتبارسنجی متمرکز ورودی
// ---------------------------------------------------------------
// تا امروز هر روت خودش با if های دستی ورودی را چک می‌کرد؛ نتیجه‌اش قانونِ
// پراکنده و پیام‌های ناهماهنگ بود. اینجا یک لایه‌ی کوچک داریم که:
//   ۱) مقدار را «تمیز» می‌کند (trim، تبدیل عدد، تبدیل ارقام فارسی به لاتین)
//   ۲) اگر نامعتبر بود، خطای فارسیِ یکدست با کد ۴۰۰ می‌دهد
//   ۳) خروجی تمیزشده را در req.valid می‌گذارد تا روت با داده‌ی مطمئن کار کند
class ValidationError extends Error {
  constructor(message, field) { super(message); this.status = 400; this.field = field; }
}

// ارقام فارسی/عربی → لاتین (کاربر ایرانی معمولاً با کیبورد فارسی عدد می‌زند)
const DIGIT_MAP = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const latinDigits = (s) => String(s).replace(/[۰-۹٠-٩]/g, d => DIGIT_MAP[d]);

const V = {
  // رشته: trim، حذف کاراکترهای کنترلی، محدودیت طول
  str({ min = 0, max = 200, optional = false, fallback = '', truncate = false } = {}) {
    return (raw, field) => {
      if (raw === undefined || raw === null || raw === '') {
        if (optional) return fallback;
        throw new ValidationError(`«${field}» لازم است`, field);
      }
      const s = String(raw).replace(/[\u0000-\u001F\u007F]/g, '').trim();
      if (s.length < min) throw new ValidationError(`«${field}» باید حداقل ${min} کاراکتر باشد`, field);
      // برشِ خاموشِ طول، ورودیِ بزهکارانه را بی‌صدا می‌پذیرد و بعد داده‌ی
      // بریده‌شده وارد دیتابیس می‌شود. پیش‌فرض: طولِ زیاد خطاست؛ جایی که برش
      // واقعاً خواسته شده (فیلد جست‌وجو) باید صریحاً truncate: true بدهد.
      if (s.length > max) {
        if (truncate) return s.slice(0, max);
        throw new ValidationError(`«${field}» نباید بیشتر از ${max} کاراکتر باشد`, field);
      }
      return s;
    };
  },
  // عدد صحیح با بازه — ارقام فارسی هم پذیرفته می‌شود
  int({ min = -Infinity, max = Infinity, optional = false, fallback = undefined } = {}) {
    return (raw, field) => {
      if (raw === undefined || raw === null || raw === '') {
        if (optional) return fallback;
        throw new ValidationError(`«${field}» لازم است`, field);
      }
      const n = parseInt(latinDigits(raw), 10);
      if (!Number.isFinite(n)) throw new ValidationError(`«${field}» باید عدد باشد`, field);
      if (n < min) throw new ValidationError(`«${field}» نباید کمتر از ${min} باشد`, field);
      if (n > max) throw new ValidationError(`«${field}» نباید بیشتر از ${max} باشد`, field);
      return n;
    };
  },
  // فقط یکی از مقادیر مجاز (برای sort، status و مانند آن)
  enum(values, { optional = true, fallback = values[0] } = {}) {
    return (raw, field) => {
      if (raw === undefined || raw === null || raw === '') {
        if (optional) return fallback;
        throw new ValidationError(`«${field}» لازم است`, field);
      }
      const s = String(raw);
      if (!values.includes(s)) throw new ValidationError(`مقدار «${field}» معتبر نیست`, field);
      return s;
    };
  },
  bool({ fallback = false } = {}) {
    return (raw) => {
      if (raw === undefined || raw === null || raw === '') return fallback;
      return raw === true || raw === 'true' || raw === '1' || raw === 1;
    };
  },
  // موبایل ایران — همان قاعده‌ای که در ورود استفاده می‌شود
  phone({ optional = false } = {}) {
    return (raw, field) => {
      if (!raw && optional) return '';
      const s = latinDigits(raw || '').replace(/\D/g, '');
      const norm = s.startsWith('98') ? '0' + s.slice(2) : (s.startsWith('9') && s.length === 10 ? '0' + s : s);
      if (!/^09\d{9}$/.test(norm)) throw new ValidationError('شماره موبایل معتبر نیست (مثل ۰۹۱۲۱۲۳۴۵۶۷)', field);
      return norm;
    };
  }
};

// schema: { fieldName: validatorFn }  — source: 'query' | 'body' | 'params'
function validate(schema, source = 'body') {
  const entries = Object.entries(schema);
  return (req, res, next) => {
    const src = req[source] || {};
    const out = {};
    try {
      for (const [field, fn] of entries) out[field] = fn(src[field], field);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, field: err.field });
      }
      return next(err);
    }
    req.valid = { ...(req.valid || {}), ...out };
    next();
  };
}

module.exports = { requireAuth, asyncHandler, rateLimit, etagJson, validate, V, ValidationError };
