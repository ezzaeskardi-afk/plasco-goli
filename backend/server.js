require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const log = require('./lib/logger');
const {
  initDb, expireStaleOrders, cleanupExpired, backupNow, getPublicProducts, getPublicProduct,
  bumpVisit, cleanupOldVisits, getProductReviews, getSetting, getShippingQuote,
  closeDb, getDbHealth, getCategories, getCatalogSignature, checkpointWal
} = require('./lib/db');
const { SqliteSessionStore } = require('./lib/session-store');
const { rateLimit } = require('./lib/middleware');
const { boolEnv, boundedIntEnv, validateProductionConfig, newRequestId, validateRuntimeConfig } = require('./lib/security-config');
const { staticCompress, compressJson, sendHtml } = require('./lib/static-compress');
const { webpNegotiate } = require('./lib/webp-negotiate');
const { isLive: paymentLive } = require('./lib/payment');
const { reconcileStaleOrders } = require('./lib/reconcile');
const { metricsMiddleware } = require('./lib/metrics');

const productsRoute = require('./routes/products');
const cartRoute = require('./routes/cart');
const authRoute = require('./routes/auth');
const addressesRoute = require('./routes/addresses');
const ordersRoute = require('./routes/orders');
const wishlistRoute = require('./routes/wishlist');
const adminRoute = require('./routes/admin');
const shopRoute = require('./routes/shop');
const wholesaleRoute = require('./routes/wholesale');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
// لوگو و عکس محصولات. مسیر از lib/paths.js می‌آید تا با مسیری که آپلودِ پنل
// در آن می‌نویسد یکی بماند (هر دو `PG_PICTURE_DIR` را می‌بینند).
const { PICTURE_DIR } = require('./lib/paths');

// آماده‌سازی دیتابیس (مهاجرت خودکار از JSONهای قدیمی در اولین اجرا)
initDb(log);

// دانلود خودکار فونت وزیرمتن در اولین اجرا (غیرمسدودکننده)
const { ensureFonts } = require('./lib/ensure-fonts');
ensureFonts();

// ---------- اعتماد به پروکسی ----------
// این یک تنظیم امنیتی است، نه فقط رفاهی. با روشن بودنش Express آدرس کاربر را از
// هدر X-Forwarded-For می‌خواند. اگر سایت مستقیم روی اینترنت باشد (بدون nginx)،
// هر کسی می‌تواند این هدر را جعل کند و با هر درخواست یک «IP تازه» بسازد — یعنی
// همه‌ی سقف‌های نرخ بی‌اثر می‌شوند، از جمله سقف روزانه‌ی پیامک که هزینه‌ی واقعی
// دارد. پس پیش‌فرض خاموش است و فقط با TRUST_PROXY در .env روشن می‌شود.
const TRUST_PROXY = (() => {
  const raw = String(process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return 0;
  if (raw === 'true' || raw === 'on' || raw === 'yes') return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 10 ? n : 1; // تعداد لایه‌های پروکسی
})();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');

// ---------- میدل‌ورهای پایه ----------
app.use(express.json({ limit: '64kb' })); // بدنه‌ی بزهکارانه‌ی چندمگابایتی همان اول رد می‌شود

// هدرهای امنیتی پایه (بدون وابستگی به helmet)
const HTTPS_MODE = boolEnv('COOKIE_SECURE');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
validateProductionConfig({ isProduction: IS_PRODUCTION, cookieSecure: HTTPS_MODE, sessionSecret: process.env.SESSION_SECRET });

function requireProductionSecret(name, { minLength = 1 } = {}) {
  const value = String(process.env[name] || '');
  if (IS_PRODUCTION && value.length < minLength) {
    throw new Error(`${name} must be configured in production and be at least ${minLength} characters`);
  }
  return value;
}

// ---------- هشِ استایلِ درون‌خطیِ صفحه‌ی آفلاین ----------
// همه‌ی استایل‌های درون‌خطیِ سایت به style.css منتقل شدند تا 'unsafe-inline'
// از style-src برداشته شود — به‌جز offline.html. آن صفحه وقتی نشان داده می‌شود
// که مشتری *اینترنت ندارد*؛ اگر به style.css وابسته شود، دقیقاً همان لحظه‌ای که
// لازم است بی‌استایل بالا می‌آید. پس <style> خودش سرِ جایش می‌ماند و به‌جای
// مجوزِ کلی، فقط هشِ همین یک بلوک به CSP اضافه می‌شود: مرورگر این یکی را اجرا
// می‌کند و هر استایلِ درون‌خطیِ دیگری — از جمله تزریق‌شده — را نه.
//
// هش در زمانِ بالا آمدن از خودِ فایل حساب می‌شود، نه دستی. اگر روزی کسی آن
// استایل را عوض کند، هش خودکار همراهش می‌آید؛ ثابتِ دستی یعنی صفحه‌ی آفلاینِ
// بی‌استایل، و کسی هم نمی‌فهمد چون آن صفحه فقط در قطعیِ اینترنت دیده می‌شود.
const offlineStyleHashes = (() => {
  try {
    const html = fs.readFileSync(path.join(FRONTEND_DIR, 'offline.html'), 'utf8');
    const out = [];
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      out.push(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
    }
    if (!out.length) log.warn('offline.html: no inline <style> found — CSP hash skipped');
    return out;
  } catch (e) {
    // نبودِ فایل نباید جلوی بالا آمدن سرور را بگیرد؛ فقط آن صفحه بی‌استایل می‌شود
    log.warn('Could not hash offline.html inline style', { err: e.message });
    return [];
  }
})();

// سیاست امنیت محتوا (CSP): سد اصلی در برابر تزریق اسکریپت (XSS).
// فقط منابع خودِ سایت مجازند؛ اسکریپت بیگانه — حتی اگر جایی به HTML تزریق شود —
// اجرا نمی‌شود. style-src هم بسته است: 'unsafe-inline' برداشته شد چون با آن
// مرورگر نمی‌توانست استایلِ ما را از استایلِ تزریق‌شده تشخیص دهد، و استایل
// به‌تنهایی هم می‌تواند دکمه‌ی «تأیید سفارش» را نامرئی یا فرمِ جعلی درست کند.
// رشته یک بار ساخته می‌شود و در هر درخواست فقط ست می‌شود.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  ["style-src 'self'", ...offlineStyleHashes].join(' '),
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",   // سرویس‌ورکر خودِ سایت
  "frame-src 'none'",    // سایت هیچ iframe ندارد؛ پرداخت با ریدایرکت انجام می‌شود
  "form-action 'self' https://www.zarinpal.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // روی HTTPS، هر آدرس http:// که از قلم افتاده باشد خودکار ارتقا می‌یابد تا
  // مرورگر «محتوای ناامن» نشان ندهد
  ...(HTTPS_MODE ? ['upgrade-insecure-requests'] : []),
  // گزارش تخلف‌ها. چرا لازم است: CSP وقتی چیزی را بلاک می‌کند هیچ نشانه‌ای در
  // سایت دیده نمی‌شود — دقیقاً همان اتفاقی که برای اسکریپت درون‌خطیِ صفحه‌ی ۵۰۰
  // افتاد و دکمه‌ی «تلاش دوباره» ماه‌ها مرده بود بی‌آنکه کسی بفهمد.
  // هر دو نسخه نوشته می‌شود: report-uri قدیمی (فایرفاکس و سافاری) و
  // report-to جدید (کروم) که به هدر Reporting-Endpoints پایین وصل است.
  'report-uri /api/csp-report',
  'report-to csp'
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // دسترسی به سخت‌افزار حساس مرورگر را برای این سایت می‌بندیم (نیازی نداریم)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // پنجره‌ی سایت از هر پنجره‌ای که بازش کرده جدا می‌شود؛ جلوی دستکاری
  // window.opener را می‌گیرد (مهم چون از سایت به درگاه پرداخت می‌رویم)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Reporting-Endpoints', 'csp="/api/csp-report"');
  // اگر پشت HTTPS هستیم، مرورگر را وادار می‌کنیم همیشه از HTTPS استفاده کند
  if (HTTPS_MODE) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// اگر واقعاً پشت پروکسی هستیم ولی TRUST_PROXY تنظیم نشده، IP همه‌ی کاربرها یکی
// دیده می‌شود و سقف‌های نرخ بین همه‌شان مشترک می‌شود (یعنی یک نفر پرمصرف،
// بقیه را هم می‌بندد). یک بار بلند هشدار می‌دهیم و بس.
let warnedProxy = false;
app.use((req, res, next) => {
  if (!TRUST_PROXY && !warnedProxy && req.headers['x-forwarded-for']) {
    warnedProxy = true;
    log.warn('Requests carry X-Forwarded-For but TRUST_PROXY is off - set TRUST_PROXY=1 in .env if the site is behind nginx/Cloudflare');
  }
  next();
});

// شناسه‌ی درخواست — هر درخواست یک کد کوتاه می‌گیرد که هم در هدر پاسخ می‌آید و
// هم در همه‌ی لاگ‌های همان درخواست تکرار می‌شود.
//
// چرا لازم است: تا حالا وقتی مشتری می‌گفت «سفارشم ثبت نشد»، تنها راه پیدا کردنِ
// ردش در لاگ، حدس‌زدن از روی ساعت و IP بود — و در همان ثانیه ده درخواست دیگر
// هم هست. حالا کافی است کدِ توی صفحه‌ی خطا را بگوید و دقیقاً همان یک درخواست
// و خطای متناظرش پیدا می‌شود.
//
// اگر پروکسی جلویی خودش X-Request-Id گذاشته باشد، همان را نگه می‌داریم تا زنجیره
// از nginx تا اینجا یک شناسه‌ی مشترک داشته باشد.
app.use((req, res, next) => {
  const inbound = String(req.headers['x-request-id'] || '').trim();
  // شناسه‌ی بیرونی را فیلتر می‌کنیم: هر چیزی مستقیم داخل فایل لاگ می‌رود و
  // کاراکتر خط جدید یعنی کسی می‌تواند خطِ لاگ جعلی بسازد (log injection).
  req.id = /^[a-f0-9]{24}$/.test(inbound) || /^[A-Za-z0-9._-]{1,64}$/.test(inbound) ? inbound : newRequestId();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// لاگ دسترسی (فقط خطاها و درخواست‌های کند — فایل‌ها را بی‌دلیل باد نمی‌کند)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => log.accessLog(req, res, Date.now() - start));
  next();
});

// متریک درخواست/تأخیر برای پنل «کارایی سرور» (درون‌حافظه، بدون وابستگی)
app.use(metricsMiddleware);

// ---------- نبض سرویس ----------
// آدرس سبکی که مانیتورینگ (UptimeRobot، پروب داکر/کوبرنتیز، یا حتی یک اسکریپت
// ساده) هر چند ثانیه صدا می‌زند. عمداً *قبل* از سشن و فایل‌های استاتیک است تا
// نه سشن بسازد نه هیچ کار سنگینی بکند.
//
// چرا فقط «سرور بالاست» کافی نیست: پروسه می‌تواند زنده باشد ولی دیتابیس قفل یا
// دیسک پر باشد — آن وقت مانیتورینگ سبز است و مشتری خطا می‌بیند. پس یک کوئری
// واقعی هم زده می‌شود.
//
// خروجی عمداً بی‌اطلاعاتِ حساس است (نه نسخه‌ی Node، نه مسیر، نه تنظیمات) چون
// این آدرس بدون احراز هویت باز است. آمار کاملِ دیتابیس در پنل مدیریت هست.
let bootTime = Date.now();
// اینجا اعلام می‌شود و نه کنارِ shutdown() در انتهای فایل: /healthz پایین‌تر
// همین بلوک آن را می‌خواند و با `let`ِ انتهای فایل، در فاصله‌ی بین شروعِ ماژول و
// رسیدن به آن خط، خواندنش ReferenceError می‌داد (منطقه‌ی مرده‌ی زمانی). امروز
// خطا نمی‌دهد چون سرور قبل از پذیرشِ درخواست کلِ فایل را اجرا کرده، ولی این
// «تصادفاً امن» است نه «امن». مقدارِ اولیه همان‌جا که خوانده می‌شود تعریف شود.
let shuttingDown = false;
app.get('/healthz', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // در حال خاموش شدن: به لودبالانسر می‌گوییم دیگر ترافیک تازه نفرست، ولی
  // درخواست‌های در جریان همچنان تمام می‌شوند.
  if (shuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  let db = false;
  let dbMs = null;
  try {
    const h = getDbHealth();
    db = h.ok === true;
    dbMs = h.queryMs;
  } catch (e) {
    log.error('Health check: database probe failed', e);
  }
  res.status(db ? 200 : 503).json({
    status: db ? 'ok' : 'degraded',
    db,
    dbMs,
    uptimeSec: Math.round((Date.now() - bootTime) / 1000)
  });
});

// SESSION_SECRET: اگر تنظیم نشده بود، یک secret تصادفی برای این اجرا ساخته می‌شود
// (امن‌تر از secret ثابتِ داخل کد؛ ولی برای production حتماً در .env بگذارید)
const sessionSecret = (() => {
  const configured = String(process.env.SESSION_SECRET || '');
  if (IS_PRODUCTION) return requireProductionSecret('SESSION_SECRET', { minLength: 32 });
  if (configured) return configured;
  const generated = crypto.randomBytes(32).toString('hex');
  log.warn('SESSION_SECRET is not set in .env - generated a temporary one (users must log in again after each restart)');
  return generated;
})();

app.use(session({
  name: 'polasco.sid',
  store: new SqliteSessionStore(),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false, // برای بازدیدکننده‌های گذری سشن الکی ساخته نمی‌شود (مهم در ترافیک بالا)
  cookie: {
    httpOnly: true,
    sameSite: 'lax',                                      // سد اصلی CSRF
    secure: HTTPS_MODE,                                   // پشت HTTPS، COOKIE_SECURE را در .env روشن کنید
    maxAge: 30 * 24 * 60 * 60 * 1000 // ۳۰ روز
  }
}));

// ---------- محدودیت نرخ درخواست (چندلایه) ----------
// یک سقف واحد برای همه‌ی API یعنی یا برای خواندن محصولات خیلی سخت‌گیر است
// یا برای نوشتن خیلی دست‌ودل‌باز. پس سه لایه داریم:
//
//  ۱) سقف کلی، سخاوتمندانه — کاربر عادی هرگز نمی‌بیندش، ولی جلوی سیل درخواست را می‌گیرد
//  ۲) سقف سخت‌گیرانه‌تر روی «نوشتن» (POST/PUT/DELETE) — این‌ها به دیتابیس می‌نویسند و گران‌اند
//  ۳) سقف‌های اختصاصی داخل خود روت‌ها (ورود، OTP، ثبت سفارش) که از قبل بود
//
// کلیدِ هر دو لایه‌ی سراسری `user` است نه `ip`. چرا: اپراتورهای موبایل ایران
// CGNAT دارند، یعنی صدها مشتریِ واقعی از یک IP بیرونی می‌آیند. با کلیدِ IP،
// ۴۰۰ نفرِ همزمان (کمپین، عید) سقفِ یک IP مشترک را می‌خورند و همه ۴۲۹ می‌گیرند.
// keyBy:'user' یعنی کاربرِ واردشده سهمیه‌ی خودش را دارد؛ مهمان (بدون ورود) هم
// مثل قبل با IP شمرده می‌شود، پس سیلِ رباتِ مهمان هنوز محدود می‌ماند.
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: boundedIntEnv('API_RATE_LIMIT', 300, 1, 10000), keyBy: 'user' }));

const writeLimiter = rateLimit({
  // درخواست‌های نوشتاریِ واقعی باید محدود باشند؛ endpointهای حساس limiter مستقل دارند.
  // سقف پیش‌فرض طوری است که چند عملیات عادیِ یک کاربر در یک دقیقه را نگیرد.
  windowMs: 60 * 1000, max: boundedIntEnv('WRITE_RATE_LIMIT', 300, 1, 2000),
  keyBy: 'user',
  message: 'تعداد درخواست‌ها زیاد است؛ یک دقیقه صبر کنید و دوباره تلاش کنید'
});
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return writeLimiter(req, res, next);
});

// پاسخ‌های JSON بزرگ (مثل لیست محصولات) فشرده ارسال شوند
app.use('/api', compressJson);

// ---------- آدرس پایه‌ی سایت ----------
// برای canonical / og:url / sitemap و همچنین بررسی مبدأ درخواست‌ها.
// اولویت با SITE_URL در .env است (وقتی سایت پشت CDN یا پروکسی است و باید یک
// دامنه‌ی رسمی اعلام شود)، وگرنه از دامنه‌ی خودِ درخواست ساخته می‌شود.
// نبودن این تابع قبلاً باعث شده بود canonical صفحه‌ی اصلی روی یک دامنه‌ی نمونه
// بماند — که یعنی گوگل صفحه‌ی اصلی را به آدرسی که وجود ندارد نسبت می‌داد.
const SITE_URL = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
if (IS_PRODUCTION && !/^https:\/\/[^\s/]+$/.test(SITE_URL)) {
  throw new Error('SITE_URL must be a valid https:// URL in production');
}
const SITE_HOST = (() => {
  try { return SITE_URL ? new URL(SITE_URL).host : ''; } catch (e) { return ''; }
})();
function siteBase(req) {
  if (/^https?:\/\/[^\s/]+$/.test(SITE_URL)) return SITE_URL;
  return `${req.protocol}://${req.get('host')}`;
}

// ---------- پاسخ‌های API کش نمی‌شوند ----------
// پاسخی که هیچ هدر کشی ندارد را پروکسیِ میانی (یا خودِ مرورگر) می‌تواند با حدس
// خودش نگه دارد؛ برای /auth/me یا سفارش‌ها یعنی ریسک دیده‌شدن اطلاعات یک کاربر
// توسط نفر بعدی. پس پیش‌فرض no-store است و روت‌هایی که واقعاً عمومی‌اند (لیست
// محصولات، تنظیمات فروشگاه) خودشان با etagJson این هدر را بازنویسی می‌کنند.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ---------- گیرنده‌ی گزارش تخلف‌های CSP ----------
// عمداً *قبل* از سد مبدأ می‌نشیند: این گزارش‌ها را خودِ مرورگر می‌فرستد و در
// نسخه‌های جدید هدر Origin آن‌ها `null` است، پس سد پایین ردشان می‌کرد و ما
// هیچ‌وقت چیزی نمی‌دیدیم. گزارش هیچ عملیاتی روی داده انجام نمی‌دهد، فقط لاگ
// می‌شود، پس بازگذاشتنش خطری ندارد.
//
// ضدسیل: هر تخلف با کلیدِ «دستور + منبع بلاک‌شده» یک بار لاگ می‌شود. یک باگ
// واقعی معمولاً یک کلید یکتا می‌سازد ولی هزاران بازدیدکننده گزارشش می‌کنند؛
// بدون این، یک اشتباه کوچک کل فایل لاگ را پر می‌کرد.
//
// چرا Map و نه Set: قبلاً پر که می‌شد، کلِ حافظه clear() می‌شد. مهاجم با
// ۶۰ گزارشِ ساختگیِ بی‌تکرار حافظه را صفر می‌کرد و بعد تخلفِ *واقعی* دوباره
// «تازه» حساب می‌شد — یعنی همان سیلِ لاگی که این کد جلویش را می‌گرفت، با
// کمی تلاش دوباره ممکن بود. حالا فقط قدیمی‌ترین‌ها کنار می‌روند و کلیدهای
// اخیر — که احتمال دارد همان تخلفِ در جریان باشند — سرِ جایشان می‌مانند.
const cspSeen = new Map(); // key -> true (فقط برای ترتیبِ درج)
const CSP_SEEN_MAX = 60;
app.post(
  '/api/csp-report',
  express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '16kb'
  }),
  (req, res) => {
    // دو قالب متفاوت: مرورگرهای قدیمی یک شیء با کلید csp-report می‌فرستند،
    // کروم جدید آرایه‌ای از گزارش‌ها با کلید body.
    const body = req.body;
    const items = Array.isArray(body)
      ? body.map((r) => r && r.body).filter(Boolean)
      : [body && (body['csp-report'] || body)].filter(Boolean);

    for (const r of items) {
      const directive = String(r.effectiveDirective || r['effective-directive'] || r.violatedDirective || r['violated-directive'] || '?').slice(0, 60);
      const blocked = String(r.blockedURL || r['blocked-uri'] || r.blockedURI || '?').slice(0, 200);
      const doc = String(r.documentURL || r['document-uri'] || '?').slice(0, 200);
      const line = r.lineNumber || r['line-number'] || 0;
      const key = `${directive}|${blocked}`;
      if (cspSeen.has(key)) continue;
      if (cspSeen.size >= CSP_SEEN_MAX) {
        // قدیمی‌ترین ۱۰٪ کنار می‌رود، نه همه‌چیز
        const drop = Math.max(1, Math.ceil(CSP_SEEN_MAX / 10));
        let i = 0;
        for (const k of cspSeen.keys()) { cspSeen.delete(k); if (++i >= drop) break; }
      }
      cspSeen.set(key, true);
      log.warn('CSP violation', { directive, blocked, doc, line });
    }
    res.status(204).end();
  }
);

// ---------- سد دوم CSRF: بررسی مبدأ درخواست ----------
// کوکی با sameSite:'lax' جلوی بیشتر حمله‌های CSRF را می‌گیرد، ولی به رفتار درستِ
// مرورگر تکیه دارد. این لایه مستقل است: هر درخواست «نوشتن» که هدر Origin (یا در
// نبودش Referer) داشته باشد و میزبانش با میزبان سایت یکی نباشد، رد می‌شود.
//
// چرا نبودِ کامل این هدرها رد نمی‌شود: ابزارهای بدون مرورگر (تست خودکار، curl،
// اپ موبایل) این هدر را نمی‌فرستند، در حالی که مرورگرها روی درخواست نوشتن همیشه
// می‌فرستند. پس شرطِ «اگر بود و غریبه بود» هم امن است و هم چیزی را نمی‌شکند.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use('/api', (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const raw = req.headers.origin || req.headers.referer || '';
  if (!raw) return next();
  let host = '';
  try { host = new URL(raw).host; } catch (e) { return next(); } // مبدأ نامفهوم = قضاوت نمی‌کنیم
  // چند نام میزبان مجاز است: هدر Host، دامنه‌ی رسمیِ .env، و — فقط وقتی پشت
  // پروکسی هستیم — هدر x-forwarded-host.
  // چرا شرطِ TRUST_PROXY: بدون پروکسی، x-forwarded-host را *خودِ مهاجم* در
  // درخواست می‌گذارد. یعنی صفحه‌ی evil.com می‌توانست هم Origin: evil.com بفرستد
  // هم X-Forwarded-Host: evil.com و این سد را کامل دور بزند. وقتی پروکسی واقعی
  // جلو باشد (TRUST_PROXY روشن) این هدر را خودِ پروکسی بازنویسی می‌کند و
  // قابل‌اعتماد است. (بعضی پیکربندی‌های nginx هدر Host را به آدرس داخلی عوض
  // می‌کنند و بدون این، درخواست‌های نوشتنِ کاربران واقعی رد می‌شد.)
  const allowed = [req.get('host'), SITE_HOST];
  if (TRUST_PROXY) allowed.push(req.headers['x-forwarded-host']);
  const ok = new Set(allowed.filter(Boolean));
  if (!ok.has(host)) {
    log.warn('Cross-origin write blocked', { ip: req.ip, origin: raw, path: req.originalUrl });
    return res.status(403).json({ error: 'درخواست از مبدأ نامعتبر رد شد' });
  }
  next();
});

// ---------- روت‌های API ----------
app.use('/api/products', productsRoute);
app.use('/api/cart', cartRoute);
app.use('/api/auth', authRoute);
app.use('/api/addresses', addressesRoute);
app.use('/api/orders', ordersRoute);
app.use('/api/wishlist', wishlistRoute);
app.use('/api/wholesale', wholesaleRoute);
app.use('/api/admin', adminRoute);
app.use('/api/shop', shopRoute);

// ---------- وضعیت سلامت ----------
// نسخه‌ی کوتاه برای uptime robot: فقط ok/uptime — سریع و بدون کار اضافه.
// نسخه‌ی کامل با ?full=1 : وضعیت دیتابیس، حافظه، و عمر آخرین بکاپ.
// اگر دیتابیس جواب ندهد کد ۵۰۳ برمی‌گردد تا مانیتورینگ واقعاً خبردار شود
// (نه اینکه ۲۰۰ بگیرد و خیال کند همه‌چیز روبه‌راه است).
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const base = { ok: true, uptime: Math.round(process.uptime()), paymentLive };
  if (!req.query.full) return res.json(base);

  let db;
  try { db = getDbHealth(); } catch (e) {
    log.error('Health check: database is not responding', e);
    return res.status(503).json({ ...base, ok: false, db: { ok: false, error: 'database unavailable' } });
  }

  const mem = process.memoryUsage();
  res.json({
    ...base,
    ok: db.ok,
    node: process.version,
    memoryMb: {
      rss: Math.round(mem.rss / 1048576),
      heapUsed: Math.round(mem.heapUsed / 1048576)
    },
    db
  });
});

// شمارنده‌ی بازدید صفحه‌ها — سبک، بدون کوکی و ردیابی شخصی؛ فقط «کدام صفحه، چند بار»
app.use((req, res, next) => {
  if (req.method === 'GET') {
    const p = req.path;
    const isPage = p === '/' || p.endsWith('.html') || /^\/product\/\d+$/.test(p);
    if (isPage && p !== '/admin.html') bumpVisit(p === '/' ? '/index.html' : p);
  }
  next();
});

// مسیر تمیز صفحه‌ی محصول: /product/12 → product.html با متاهای سئوی «سرور-ساید»
// چرا سرور-ساید؟ تلگرام/واتساپ جاوااسکریپت اجرا نمی‌کنند؛ پیش‌نمایش لینک فقط از HTML خام
// ساخته می‌شود. عنوان، توضیح، عکس و canonical هر محصول همین‌جا داخل HTML تزریق می‌شود.
// نکته‌ی سئو: محصول حذف‌شده کد 410 واقعی می‌گیرد (نه soft-404) تا گوگل سریع از ایندکس خارجش کند.
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// آدرس پایه‌ی سایت (SITE_URL / siteBase) بالاتر — نزدیک میدل‌ورها — تعریف شده،
// چون بررسی مبدأ درخواست‌ها هم به همان میزبان رسمی نیاز دارد.
app.get('/product/:id', (req, res) => {
  const product = getPublicProduct(Number(req.params.id));
  if (!product) {
    return res.status(410).sendFile(path.join(FRONTEND_DIR, 'product-gone.html'));
  }
  let html;
  try {
    html = fs.readFileSync(path.join(FRONTEND_DIR, 'product.html'), 'utf-8');
  } catch (e) {
    return res.sendFile(path.join(FRONTEND_DIR, 'product.html'));
  }
  const base = siteBase(req);
  const title = `${product.title} | پلاسکو گلی`;
  const desc = `خرید ${product.title} — ${product.description} قیمت: ${Number(product.price).toLocaleString('fa-IR')} تومان.`;
  const img = product.image ? base + encodeURI(product.image) : '';
  html = html
    // product.html (پوسته‌ی بدون محتوا) noindex است؛ اما صفحه‌ی واقعیِ محصول با
    // آدرس تمیز /product/:id باید ایندکس شود. اینجا آن را برمی‌گردانیم.
    .replace('<meta name="robots" content="noindex, follow">', '<meta name="robots" content="index, follow, max-image-preview:large">')
    .replace('<title>محصول | پلاسکو گلی</title>', `<title>${escHtml(title)}</title>`)
    .replace('<meta name="description" content="مشخصات کامل، قیمت و خرید آنلاین از فروشگاه پلاسکو گلی.">',
      `<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${base}/product/${product.id}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="پلاسکو گلی">
<meta property="og:url" content="${base}/product/${product.id}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
${img ? `<meta property="og:image" content="${escHtml(img)}">
<meta property="og:image:alt" content="${escHtml(title)}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escHtml(title)}">
${img ? `<meta name="twitter:image" content="${escHtml(img)}">
<meta name="twitter:image:alt" content="${escHtml(title)}">` : ''}
<meta property="product:price:amount" content="${Number(product.price) * 10}">
<meta property="product:price:currency" content="IRR">
${Number(product.old_price) > Number(product.price) ? `<meta property="og:price:standard_amount" content="${Number(product.old_price) * 10}">` : ''}
${productJsonLd(product, base)}`);
  res.setHeader('Cache-Control', 'no-cache');
  sendHtml(req, res, html);
});

// داده‌ی ساختاریافته‌ی محصول (Product + Offer + AggregateRating + BreadcrumbList).
// چرا سمت سرور: نتیجه‌ی غنی گوگل (قیمت، موجودی، ستاره) از HTML خام خوانده می‌شود.
// نکته‌ی مهم: aggregateRating فقط وقتی اضافه می‌شود که نظرِ تأییدشده‌ی واقعی وجود
// داشته باشد. امتیاز ساختگی نقض راهنمای گوگل است و می‌تواند دامنه را جریمه کند.
function productJsonLd(product, base) {
  const url = `${base}/product/${product.id}`;
  const inStock = Number(product.stock) > 0;
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url + '#product',
    name: product.title,
    description: String(product.description || product.title),
    sku: `PG-${product.id}`,
    url,
    category: product.category || undefined,
    brand: { '@type': 'Brand', name: 'پلاسکو گلی' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'IRR',
      // گوگل قیمت را بدون جداکننده می‌خواهد. واحد سایت تومان است و IRR ریال،
      // پس ×۱۰ می‌شود تا عدد با واحد اعلام‌شده بخواند.
      price: Number(product.price) * 10,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'پلاسکو گلی' }
    }
  };

  // هزینه‌ی ارسال و شرایط مرجوعی داخل Offer.
  // چرا مهم است: گوگل از اواخر ۲۰۲۳ این دو را در نتیجه‌ی خرید نشان می‌دهد و
  // نبودشان در Search Console هشدارِ زرد می‌سازد. هر دو از منبعِ حقیقیِ خودمان
  // خوانده می‌شوند — نه عدد دلخواه:
  //   ارسال  ← getShippingQuote (همان چیزی که مشتری سر سبد می‌بیند)
  //   مرجوعی ← terms.html: «تا ۷ روز بعد از تحویل»
  // عمداً returnFees و priceValidUntil را ننوشتم: هیچ‌جای پروژه تعیین نشده که
  // هزینه‌ی پست مرجوعی با کیست یا قیمت تا چه تاریخی معتبر است، و ادعای بی‌پشتوانه
  // در داده‌ی ساختاریافته یعنی وعده‌ای که سر صفحه‌ی نتیجه به مشتری داده می‌شود.
  try {
    const q = getShippingQuote(Number(product.price) || 0);
    node.offers.shippingDetails = {
      '@type': 'OfferShippingDetails',
      shippingRate: {
        '@type': 'MonetaryAmount',
        // ×۱۰ چون واحد اعلام‌شده IRR است، مثل خود price
        value: Number(q.shippingFee) * 10,
        currency: 'IRR'
      },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IR' }
    };
  } catch (e) { /* تنظیمات ناخوانا نباید صفحه‌ی محصول را زمین بزند */ }

  node.offers.hasMerchantReturnPolicy = {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'IR',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 7,
    returnMethod: 'https://schema.org/ReturnByMail'
  };

  if (product.image) node.image = [base + encodeURI(product.image)];

  try {
    const r = getProductReviews(product.id);
    if (r && r.count > 0 && r.avg > 0) {
      node.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: r.avg,
        reviewCount: r.count,
        bestRating: 5,
        worstRating: 1
      };
    }
  } catch (e) { /* نبودِ امتیاز نباید صفحه‌ی محصول را زمین بزند */ }

  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: `${base}/` },
      ...(product.category
        ? [{ '@type': 'ListItem', position: 2, name: product.category, item: `${base}/?cat=${encodeURIComponent(product.category)}#products` }]
        : []),
      { '@type': 'ListItem', position: product.category ? 3 : 2, name: product.title, item: url }
    ]
  };

  // شناسه‌ی data-pg-ld: صفحه‌ی محصول سمت کلاینت هم می‌تواند همین داده را بسازد؛
  // با دیدن این نشانه دیگر نسخه‌ی تکراری تزریق نمی‌کند (دو Product schema روی یک
  // صفحه، ریسک تفسیر متناقض دارد).
  const dump = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return `<script type="application/ld+json" data-pg-ld="product">${dump(node)}</script>
<script type="application/ld+json" data-pg-ld="crumbs">${dump(crumbs)}</script>`;
}

// صفحه‌ی اصلی با متاهای درست‌شده.
// مشکل: canonical و og:url و کل داده‌ی ساختاریافته‌ی index.html روی یک دامنه‌ی
// نمونه (polasco-goli.example.com) نوشته شده بود. canonical غلط از نبودِ
// canonical بدتر است، چون به گوگل می‌گوید «نسخه‌ی اصلی من جای دیگری است» و
// می‌تواند باعث ایندکس نشدن کل صفحه شود. اینجا با دامنه‌ی واقعی جایگزین می‌شود.
const PLACEHOLDER_HOST = 'https://polasco-goli.example.com';
const seoPageCache = new Map(); // `${file}|${base}` -> { html, mtimeMs }
// سقف: کلید این کش شاملِ `base` است و base — تا وقتی SITE_URL در .env نباشد —
// از هدر Host خوانده می‌شود. یعنی هر کسی با فرستادنِ Host دلخواه یک ورودیِ
// تازه (به‌اندازه‌ی کلِ index.html) می‌سازد و حافظه بی‌سقف بالا می‌رود. عملاً
// دو-سه میزبانِ واقعی بیشتر نداریم (دامنه، www، localhost) پس ۸ با فاصله کافی
// است و بیشتر از آن یعنی کسی دارد بازی می‌کند.
const SEO_CACHE_MAX = 8;

// صفحه‌های ایندکس‌شدنی سایت (index، terms و products) از مسیر جایگزینی رد می‌شوند؛
// بقیه noindex اند و لازم نیست اینجا بیایند.
function renderSeoPage(fileName) {
  return function (req, res) {
    const base = siteBase(req);
    const file = path.join(FRONTEND_DIR, fileName);
    try {
      const mtimeMs = fs.statSync(file).mtimeMs;
      const key = fileName + '|' + base;
      const hit = seoPageCache.get(key);
      if (!hit || hit.mtimeMs !== mtimeMs) {
        const raw = fs.readFileSync(file, 'utf-8');
        if (!hit) {
          if (seoPageCache.size >= SEO_CACHE_MAX) seoPageCache.delete(seoPageCache.keys().next().value);
        }
        seoPageCache.set(key, { html: raw.split(PLACEHOLDER_HOST).join(base), mtimeMs });
      }
      res.setHeader('Cache-Control', 'no-cache');
      return sendHtml(req, res, seoPageCache.get(key).html);
    } catch (e) {
      // اگر خواندن فایل شکست خورد، همان فایل خام سرو می‌شود — بهتر از خطای ۵۰۰
      return res.sendFile(file);
    }
  };
}
app.get('/', renderSeoPage('index.html'));
app.get('/index.html', renderSeoPage('index.html'));
app.get('/terms.html', renderSeoPage('terms.html'));
app.get('/products.html', renderSeoPage('products.html'));

// robots.txt داینامیک — فایل ثابت قبلی دامنه‌ی نمونه را داشت و خط Sitemap هم
// دو بار تکرار شده بود. این نسخه همیشه دامنه‌ی واقعیِ همان درخواست را می‌نویسد،
// پس با هر دامنه‌ای که سایت بالا بیاید درست است و نیازی به تنظیم دستی ندارد.
app.get('/robots.txt', (req, res) => {
  const base = siteBase(req);
  res.type('text/plain').send(
    `User-agent: *
Allow: /

# صفحه‌های شخصی و مسیرهای فنی نباید ایندکس شوند
Disallow: /cart.html
Disallow: /checkout.html
Disallow: /login.html
Disallow: /account.html
Disallow: /order-success.html
Disallow: /admin.html
Disallow: /500.html
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`);
});

// نقشه‌ی سایت داینامیک — صفحه‌ی اصلی + همه‌ی محصولات (برای سئو)
// نکته: باید قبل از express.static باشد تا جای فایل sitemap.xml قدیمی را بگیرد
//
// کش: ساختنِ این فایل یعنی خواندنِ همه‌ی محصولات + همه‌ی دسته‌ها + یک statSync و
// بعد چسباندنِ یک رشته‌ی چندده‌کیلوبایتی. تا امروز این کار در *هر* درخواست
// تکرار می‌شد، در حالی که خروجی تا وقتی کاتالوگ عوض نشده حرف‌به‌حرف یکی است.
// خزنده‌ها هم این آدرس را مرتب می‌زنند. کلید همان امضای کاتالوگ است (با هر
// تغییر محصول عوض می‌شود) به‌علاوه‌ی base، پس تازه‌ماندن خودکار است.
let sitemapCache = null; // { key, xml }
const SITEMAP_MAX_URLS = 5000; // سقفِ استاندارد نقشه‌ی سایت ۵۰٬۰۰۰ است؛ خیلی قبل‌تر می‌ایستیم
app.get('/sitemap.xml', (req, res) => {
  const base = siteBase(req);
  const cacheKey = `${getCatalogSignature()}|${base}`;
  if (sitemapCache && sitemapCache.key === cacheKey) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.type('application/xml').send(sitemapCache.xml);
  }
  const products = getPublicProducts();
  const today = new Date().toISOString().slice(0, 10);
  // lastmod محصول از updated_at خودش می‌آید نه «امروز». تاریخِ امروز روی همه‌ی
  // آدرس‌ها به گوگل سیگنال دروغ می‌دهد که همه چیز هر روز عوض می‌شود و بعد از
  // چند بار، lastmod را کل نادیده می‌گیرد.
  const lastmodOf = (p) => {
    const d = String(p.updated_at || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
  };
  // همان استدلالِ بالا برای دو صفحه‌ی ثابت هم صادق است و قبلاً رعایت نشده بود:
  // `today` روی صفحه‌ی اصلی و قوانین یعنی «هر روز عوض می‌شوم» — دقیقاً همان
  // سیگنالِ دروغی که کامنت بالا هشدارش را می‌دهد.
  //   صفحه‌ی اصلی ← تازه‌ترین updated_at محصولات (چون محتوایش همان کاتالوگ است)
  //   قوانین      ← mtime خودِ فایل
  const homeLastmod = products.reduce((acc, p) => {
    const d = lastmodOf(p);
    return d > acc ? d : acc;
  }, '') || today;
  let termsLastmod = today;
  try {
    termsLastmod = new Date(fs.statSync(path.join(FRONTEND_DIR, 'terms.html')).mtimeMs)
      .toISOString().slice(0, 10);
  } catch (e) { /* نبودِ فایل نباید نقشه‌ی سایت را بشکند */ }

  // تگ image برای مغازه‌ای که فروشش با عکس است، ورودیِ جست‌وجوی تصویر می‌آورد.
  const imageTag = (p) => p.image
    ? `<image:image><image:loc>${escHtml(base + encodeURI(p.image))}</image:loc><image:title>${escHtml(p.title)}</image:title></image:image>`
    : '';

  // صفحه‌ی فهرست و صفحه‌های دسته.
  //
  // چرا فقط دسته و نه بقیه‌ی فیلترها: ترکیبِ قیمت/موجودی/مرتب‌سازی ده‌ها آدرس
  // با محتوای تقریباً یکسان می‌سازد. اگر آن‌ها را هم اینجا بیاوریم، گوگل
  // بودجه‌ی خزشش را روی نسخه‌های تکراری خرج می‌کند و صفحه‌ی خودِ محصول‌ها
  // دیرتر ایندکس می‌شوند. همان چیزی که فرانت هم با noindex روی همان ترکیب‌ها
  // اعلام می‌کند — این دو باید یک حرف بزنند.
  //
  // دسته‌ی خالی هم نمی‌آید: getCategories فقط دسته‌هایی را برمی‌گرداند که
  // کالای منتشرشده دارند، پس آدرسِ «صفحه‌ی خالی» به گوگل داده نمی‌شود.
  const catUrls = getCategories().map(c =>
    `  <url><loc>${base}/products.html?cat=${encodeURIComponent(c.category)}</loc><lastmod>${homeLastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`);

  const urls = [
    `  <url><loc>${base}/</loc><lastmod>${homeLastmod}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${base}/products.html</loc><lastmod>${homeLastmod}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`,
    ...catUrls,
    `  <url><loc>${base}/terms.html</loc><lastmod>${termsLastmod}</lastmod><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
    ...products.map(p =>
      `  <url><loc>${base}/product/${p.id}</loc><lastmod>${lastmodOf(p)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>${imageTag(p)}</url>`)
  ].slice(0, SITEMAP_MAX_URLS).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>`;
  sitemapCache = { key: cacheKey, xml };
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(xml);
});

// ---------- فایل‌های استاتیک ----------
// اول فشرده‌سازی: CSS/JS/SVG با gzip یا brotli ارسال می‌شوند (style.css از ۶۵KB
// به حدود ۱۴KB می‌رسد). نتیجه در حافظه کش می‌شود و با تغییر فایل خودکار تازه می‌شود.
app.use(staticCompress(FRONTEND_DIR));

// CSS/JS چون با ?v= نسخه‌بندی شده‌اند، یک ماه + immutable کش می‌شوند (بازدید دوم = صفر دانلود).
// HTML نه، تا تغییرات صفحات فوراً دیده شود.
app.use(express.static(FRONTEND_DIR, {
  maxAge: '7d',
  setHeaders(res, filePath) {
    const p = filePath.replace(/\\/g, '/').toLowerCase();
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    // سرویس‌ورکر و manifest استثنا: اگر کهنه کش شوند، مشتری با منطق کشِ قدیمی
    // گیر می‌افتد و خودش راهی برای بیرون آمدن ندارد.
    // icons.svg و favicon.svg هم بدون ?v= لود می‌شوند؛ immutable نبودنشان
    // یعنی تغییر آیکون‌ها فوراً به کاربر برسد.
    else if (p.endsWith('/sw.js') || p.endsWith('manifest.json') || p.endsWith('manifest.webmanifest')
      || p.endsWith('/assets/icons.svg') || p.endsWith('/assets/favicon.svg')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    else if (/\.(css|js|woff2?|svg)$/i.test(p)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
  }
}));
// اگر نسخه‌ی WebP کنارِ عکس باشد و مرورگر بپذیرد، همان تحویل می‌شود (حدود ۳۰٪
// سبک‌تر). باید قبل از express.static باشد وگرنه اصل زودتر فرستاده می‌شود.
app.use('/picture', webpNegotiate(PICTURE_DIR));
// سرو عکس‌ها از پوشه‌ی picture — نام فایل‌های آپلودی تصادفی است، پس کش بلند امن است
app.use('/picture', express.static(PICTURE_DIR, {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.toLowerCase().endsWith('.jfif')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
  }
}));

// 404 — برای API جوابِ JSON، برای صفحه‌ها صفحه‌ی ۴۰۴ اختصاصی (کد واقعی 404، نه soft-404)
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'چنین مسیری وجود ندارد' });
  }
  res.status(404).sendFile(path.join(FRONTEND_DIR, '404.html'), (sendErr) => {
    if (sendErr && !res.headersSent) {
      res.type('text/plain; charset=utf-8').send('چنین صفحه‌ای وجود ندارد.');
    }
  });
});

// ---------- مدیریت خطای سراسری ----------
// هر خطای پیش‌بینی‌نشده: لاگ کامل برای ما، پیام تمیز برای کاربر، و سرور بالا می‌ماند
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // خطای اعتبارسنجی ورودی، خطای سرور نیست — پیام روشن با کد ۴۰۰
  if (err && err.status === 400 && err.field) {
    return res.status(400).json({ error: err.message, field: err.field });
  }
  // بدنه‌ی JSON خراب (مثلاً کاراکتر اضافه) — این هم تقصیر سرور نیست
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'داده‌ی ارسالی معتبر نیست' });
  }
  // بدنه‌ی بزرگ‌تر از سقف: تا امروز کد ۵۰۰ و پیام «خطای داخلی سرور» می‌گرفت، در
  // حالی که هیچ خطایی رخ نداده بود — فقط فایل/فرم بزرگ بود. مدیری که عکس ۴
  // مگابایتیِ گوشی را آپلود می‌کرد، فکر می‌کرد سایت خراب است. حالا کد درست
  // (۴۱۳) با پیامی که می‌گوید باید چه کار کند.
  if (err && (err.status === 413 || err.statusCode === 413 || err.type === 'entity.too.large')) {
    log.warn(`Payload too large on ${req.method} ${req.originalUrl}`);
    const msg = req.originalUrl.includes('/upload-image')
      ? 'حجم عکس بیشتر از ۲ مگابایت است؛ عکس کوچک‌تر یا فشرده‌تری انتخاب کنید'
      : 'حجم اطلاعات ارسالی بیش از حد بزرگ است';
    if (req.originalUrl.startsWith('/api/')) return res.status(413).json({ error: msg });
    return res.status(413).type('text/plain; charset=utf-8').send(msg);
  }

  // شناسه‌ی درخواست را هم داخل پیام خطا می‌آوریم و هم به کاربر می‌دهیم: مشتری
  // همان کد را می‌گوید و ما مستقیم به این خط می‌رسیم، بدون گشتن بین ساعت و IP.
  log.error(`Error [${req.id}] ${req.method} ${req.originalUrl}`, err);
  const wantsJson = req.originalUrl.startsWith('/api/');
  if (wantsJson) {
    return res.status(500).json({
      error: 'خطای داخلی سرور؛ چند لحظه بعد دوباره تلاش کنید',
      ref: req.id
    });
  }

  // قبلاً index.html با کد ۵۰۰ فرستاده می‌شد: کاربر صفحه‌ی اصلیِ نیمه‌کاره
  // می‌دید و نمی‌فهمید خطا خورده. حالا صفحه‌ی اختصاصی ۵۰۰ می‌رود.
  // callback لازم است: اگر خودِ فایل هم خوانده نشود، به جای اینکه Express
  // دوباره وارد همین هندلر شود و حلقه بسازد، یک متن ساده می‌فرستیم.
  res.status(500).sendFile(path.join(FRONTEND_DIR, '500.html'), (sendErr) => {
    if (sendErr && !res.headersSent) {
      res.type('text/plain; charset=utf-8')
         .send('خطای داخلی سرور؛ چند لحظه بعد دوباره تلاش کنید.');
    }
  });
});

// خطاهای سطح پروسه — لاگ می‌شوند و فقط در وضعیت غیرقابل ادامه خارج می‌شویم
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception - shutting down to protect data', err);
  try { closeDb(log); } catch (e) { /* ignore */ } // WAL ادغام شود تا دیتا سالم بماند
  process.exit(1); // با StartSite.bat/pm2 دوباره اجرا کنید؛ SQLite دیتا را سالم نگه داشته
});

// ---------- کارهای دوره‌ای ----------
// آزادسازی موجودی سفارش‌های رهاشده + پاکسازی سشن/OTPهای منقضی
//
// دو مرحله دارد و ترتیبش عمدی است:
//   ۱) expireStaleOrders — فقط سفارش‌هایی که هرگز به درگاه نرسیدند. همگام و ارزان.
//   ۲) reconcileStaleOrders — سفارش‌هایی که authority دارند. از درگاه می‌پرسد
//      «پول گرفته شد؟» و تازه بعدش تصمیم می‌گیرد. ناهمگام است چون شبکه دارد.
// جزئیاتِ چراییِ مرحله‌ی دوم در lib/reconcile.js نوشته شده.
//
// نگهبانِ reconcileRunning لازم است: اگر درگاه کند باشد ممکن است یک اجرا بیش
// از پنج دقیقه طول بکشد و اجرای بعدی رویش سوار شود — یعنی پرسیدنِ هم‌زمانِ یک
// سفارش از درگاه و دو برابر شدنِ بارِ شبکه بدونِ هیچ فایده‌ای.
let reconcileRunning = false;
setInterval(() => {
  try {
    const n = expireStaleOrders();
    if (n > 0) log.info(`${n} order(s) that never reached the gateway expired; stock released`);
    cleanupExpired();
    checkpointWal(); // WAL را سبک ادغام می‌کند تا فایل -wal بی‌رویه بزرگ نشود
  } catch (e) { log.error('Periodic cleanup failed', e); }

  if (reconcileRunning) return;
  reconcileRunning = true;
  reconcileStaleOrders()
    .catch(e => log.error('Order reconciliation failed', e))
    .finally(() => { reconcileRunning = false; });
}, 5 * 60 * 1000).unref();

// بکاپ روزانه‌ی دیتابیس + پاکسازی لاگ‌ها و آمار بازدید قدیمی (هر ۶ ساعت چک می‌شود)
setInterval(() => {
  backupNow(log).catch(e => log.error('Backup failed', e));
  try { log.cleanupOldLogs(); } catch (e) { /* ignore */ }
  try { cleanupOldVisits(); } catch (e) { /* ignore */ }
}, 6 * 60 * 60 * 1000).unref();
backupNow(log).catch(e => log.error('Initial backup failed', e));

// ---------- اجرا ----------
const server = app.listen(PORT, () => {
  bootTime = Date.now(); // لحظه‌ی واقعیِ آماده‌شدن، نه لحظه‌ی بارگذاری فایل
  console.log(`\n[OK] Polasco Goli is running at http://localhost:${PORT}`);
  console.log(`     Payment gateway: ${paymentLive ? 'LIVE (Zarinpal)' : 'TEST mode'} | Database: SQLite\n`);
});

// مهلت‌های اتصال. اگر سایت پشت nginx برود، مهلت keep-alive سرور باید از مهلت
// پروکسی *بیشتر* باشد؛ وگرنه گاهی nginx روی اتصالی می‌نویسد که Node همان لحظه
// دارد می‌بنددش و کاربر یک ۵۰۲ تصادفی و غیرقابل‌بازتولید می‌گیرد.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;   // باید از keepAliveTimeout بیشتر باشد
// سقف زمان ارسال هدرها: جلوی اتصال‌های نیمه‌بازِ عمدی (حمله‌ی Slowloris) را
// می‌گیرد که با چند صد اتصالِ کند، سرور را بی‌جواب می‌کنند.
server.requestTimeout = 120_000;

// خاموشی تمیز: درخواست‌های در جریان تمام می‌شوند، دیتابیس بسته می‌شود،
// بعد پروسه خارج می‌شود. بستن دیتابیس مهم است: WAL در فایل اصلی ادغام
// می‌شود و دیسک بدون فایل جانبیِ نیمه‌کاره می‌ماند.
// (پرچمِ shuttingDown بالاتر، کنارِ /healthz که می‌خواندش، تعریف شده.)
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal} - graceful shutdown...`);
  // از همین لحظه /healthz کد ۵۰۳ می‌دهد (بالاتر) تا لودبالانسر ترافیک تازه
  // نفرستد، در حالی که سفارش‌های نیمه‌کاره‌ی همین لحظه فرصت تمام‌شدن دارند.

  const finish = (code = 0) => { try { closeDb(log); } catch (e) { /* ignore */ } process.exit(code); };

  server.close(() => finish(0));
  // اتصال‌های بی‌کارِ keep-alive خودشان بسته نمی‌شوند و server.close را معطل
  // نگه می‌دارند؛ Node ۱۸ به بعد این متد را دارد و همان‌ها را می‌بندد بی‌آنکه
  // به درخواستِ در جریان دست بزند.
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();

  // اگر کانکشنی گیر کرد، بعد از ۵ ثانیه به‌هرحال تمیز می‌بندیم
  setTimeout(() => { log.warn('Shutdown timed out - closing anyway'); finish(0); }, 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---------- چک‌لیست بوت برای پروداکشن ----------
// هیچ‌کدام سرور را نمی‌خواباند؛ فقط بلند و واضح هشدار می‌دهد.
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ZARINPAL_MERCHANT_ID) log.warn('[PROD] Payment gateway is in TEST mode (no ZARINPAL_MERCHANT_ID)');
  if (!process.env.SMS_API_KEY) log.warn('[PROD] SMS is in TEST mode (no SMS_API_KEY) - login codes go to console only');
  if (!process.env.BACKUP_DIR2) log.warn('[PROD] BACKUP_DIR2 not set - backups live on the same disk as the database');
}
