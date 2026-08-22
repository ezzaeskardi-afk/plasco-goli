const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const { findOrCreateUser, stmtUserById, updateUserName, ensureAdmin, setUserPassword, getUserByPhone, otp, logAdminAction } = require('../lib/db');
// makeRateLimit با نامِ rateLimit — سقف‌ها در حالت cluster مشترک می‌مانند.
// این فایل حساس‌ترین سقف‌ها را دارد (پیامک، ورود با رمز)، پس اشتراک واجب است.
const { asyncHandler, makeRateLimit: rateLimit, validate, V } = require('../lib/middleware');
const { sendOtpSms } = require('../lib/sms');
const { normalizeDigits, normalizePhone, isValidIranPhone, isAdminPhone } = require('../lib/phone');
const { lockState, registerFail, registerSuccess, waitText } = require('../lib/login-guard');
const { destroyOtherSessions, countUserSessions } = require('../lib/session-store');
const { makeSharedStore } = require('../lib/shared-state');
const log = require('../lib/logger');

const router = express.Router();

// شماره‌ی کامل را در دفتر رویدادها نمی‌نویسیم. دفتر از پنل قابل‌دیدن است و
// روزی ممکن است اسکرین‌شاتش جایی برود؛ چهار رقم آخر برای شناختن کافی است.
function maskPhone(phone) {
  const s = String(phone || '');
  return s.length > 4 ? '****' + s.slice(-4) : s;
}

// اثرِ انگشتِ دستگاه برای دفتر رویدادها: IP + نامِ کوتاهِ مرورگر/سیستم.
// عمداً کلِ User-Agent را ذخیره نمی‌کنیم — رشته‌ای ۲۰۰ کاراکتری که ستون را
// می‌ترکاند و چیزی بیشتر از این چند کلمه به مدیر نمی‌گوید.
function clientFingerprint(req) {
  const ua = String(req.get('user-agent') || '');
  const os = /Android/i.test(ua) ? 'اندروید'
    : /iPhone|iPad|iOS/i.test(ua) ? 'آی‌او‌اس'
      : /Windows/i.test(ua) ? 'ویندوز'
        : /Mac OS/i.test(ua) ? 'مک'
          : /Linux/i.test(ua) ? 'لینوکس' : 'نامشخص';
  // ترتیب مهم است: کروم هم «Safari» دارد، اِج هم «Chrome» دارد
  const br = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
      : /Firefox\//i.test(ua) ? 'Firefox'
        : /Chrome\//i.test(ua) ? 'Chrome'
          : /Safari\//i.test(ua) ? 'Safari' : 'نامشخص';
  return `IP ${req.ip || '?'} — ${br} روی ${os}`;
}

/* ---------- رمز عبور (هش scrypt با salt یکتا) ----------
   **چرا ناهمگام و نه scryptSync:** نود تک‌نخی است. scrypt عمداً کُند است
   (روی همین سرور ۲۶ میلی‌ثانیه) و نسخه‌ی `Sync` این ۲۶ms را روی خودِ
   event loop می‌سوزاند — یعنی در تمام آن مدت *کلِ سایت* متوقف است، نه فقط
   لاگین: صفحه‌ی محصول، سبد، ثبت سفارشِ بقیه، همه صف می‌شوند.

   حساب سرانگشتی: ۲۶ms یعنی سقفِ ~۳۸ ورود در ثانیه، و آن هم وقتی سرور هیچ
   کار دیگری نکند. هزار نفر که در یک دقیقه با رمز وارد شوند ۲۶ ثانیه قفلِ
   خالص می‌سازند — نزدیک نیمی از آن دقیقه.

   بدتر از کندی، این یک اهرمِ حمله است: verifyPassword روی مسیرِ **قبل از**
   احراز هویت است، پس رمزِ غلط هم همان ۲۶ms را از سرور می‌گیرد. مهاجم با
   چند IP می‌تواند با درخواست‌های ارزان، هزینه‌ی گرانِ سرور را بالا ببرد
   (سقف‌های نرخ تعداد را کم می‌کنند ولی هزینه‌ی هر کدام را نه).

   نسخه‌ی ناهمگام همان کار را در **استخر نخِ libuv** انجام می‌دهد؛ event loop
   آزاد می‌ماند و چند هش می‌توانند هم‌زمان (روی چند هسته) پیش بروند.
   قدرتِ رمزنگاری ذره‌ای تغییر نمی‌کند — همان الگوریتم و همان پارامترها. */
const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const derived = await scrypt(String(password), Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch (e) { return false; }
}

const OTP_TTL_MS = 2 * 60 * 1000;   // اعتبار کد
const RESEND_COOLDOWN_MS = 30 * 1000; // حداقل فاصله بین دو پیامک برای یک شماره
const MAX_ATTEMPTS = 5;              // حداکثر تلاش برای یک کد
const MAX_SMS_PER_PHONE_PER_DAY = 10;
// قابل‌تنظیم با env فقط برای محیط تست؛ مقدار واقعی همان ۳۰ است
const MAX_SMS_PER_IP_PER_DAY = Number(process.env.MAX_SMS_PER_IP_PER_DAY) || 30;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// مقایسه‌ی مقاوم در برابر timing attack
function safeEqual(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

// challenge token یک‌بارمصرف — جلوی ربات‌هایی که مستقیم POST می‌زنند را می‌گیرد
// client باید اول GET /otp/challenge بزند، token بگیرد، و آن را با درخواست OTP بفرستد
//
// چرا makeSharedStore و نه Map: توکن را یک worker می‌سازد و درخواستِ بعدی
// ممکن است به worker دیگری برسد. با Map، توکن آن‌جا پیدا نمی‌شود و کاربر
// «درخواست نامعتبر است؛ صفحه را رفرش کنید» می‌گیرد — پیامی که هیچ کمکی هم
// نمی‌کند چون رفرش باز همان قرعه‌کشی است. با N worker یعنی ورود با پیامک
// (N−۱)/N بار شکست می‌خورد. در تک‌پروسه دقیقاً همان Map قبلی برگردانده می‌شود.
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // ۵ دقیقه
// سقف تعداد توکن‌های زنده. بدون این سقف، صدا زدن پیوسته‌ی همین مسیر حافظه‌ی
// سرور را بالا می‌برد چون هر توکن ۵ دقیقه می‌ماند.
const MAX_CHALLENGES = 5000;
const challenges = makeSharedStore('otp-challenge', {
  ttlMs: CHALLENGE_TTL_MS,
  maxKeys: MAX_CHALLENGES,
});

// این مسیر قبلاً هیچ محدودیتی نداشت؛ سقف سخاوتمندانه است ولی جلوی سیل درخواست را می‌گیرد
const challengeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, message: 'درخواست‌های زیاد؛ چند دقیقه بعد تلاش کنید' });

router.get('/otp/challenge', challengeLimiter, (req, res) => {
  // هرس و بیرون‌انداختنِ قدیمی‌ترها هر دو داخل خودِ انبارک انجام می‌شود.
  const token = crypto.randomBytes(16).toString('hex');
  challenges.set(token, { ip: req.ip });
  res.json({ token });
});

// لایه‌ی اول: rate limit عمومی روی IP (جلوی اسکریپت‌های خام را همین می‌گیرد)
const otpIpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: 'درخواست‌های زیاد؛ چند دقیقه بعد تلاش کنید' });

// rate limit مستقل روی «چک کردن کد» بر اساس IP — لایه‌ای مکملِ سقفِ «۵ تلاش برای هر شماره».
// جلوی حدس زدن سریع کد از یک منبع، حتی روی شماره‌های مختلف، را می‌گیرد.
// skipSuccess: ورودِ موفق سهمیه نمی‌سوزاند — سقف فقط برای حدس‌زدن کد است.
const otpVerifyLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, skipSuccess: true, message: 'تلاش‌های زیاد برای ورود؛ چند دقیقه بعد دوباره تلاش کنید' });

router.post('/otp/request', otpIpLimiter, validate({
  phone: V.phone(),
  challenge: V.str({ min: 16, max: 128 })
}), asyncHandler(async (req, res) => {
  // بررسی challenge token — جلوی ربات‌هایی که مستقیم POST می‌زنند را می‌گیرد
  //
  // خواندن و پاک‌کردن باید یک عملِ اتمیک باشد. با `get` و بعد `delete`ِ جدا،
  // دو درخواستِ هم‌زمان با یک توکن هر دو موفق می‌شوند (هر دو قبل از پاک‌شدن
  // خوانده‌اند) و خاصیتِ «یک‌بارمصرف» — که کلِ دلیلِ وجودِ این توکن است —
  // از بین می‌رود. mutate هر دو کار را داخل یک تراکنش انجام می‌دهد.
  const token = req.valid.challenge;
  let ch;
  challenges.mutate(token, (cur) => { ch = cur; return null; });
  if (!ch) return res.status(400).json({ error: 'درخواست نامعتبر است؛ صفحه را رفرش کنید' });

  const phone = req.valid.phone;
  if (!isValidIranPhone(phone)) {
    return res.status(400).json({ error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹' });
  }

  const now = Date.now();
  const day = todayStr();
  const existing = otp.get.get(phone);

  // فاصله‌ی الزامی بین دو پیامک (جلوی بمباران پیامکی یک شماره)
  if (existing && now - existing.last_sent_at < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.last_sent_at)) / 1000);
    return res.status(429).json({ error: `کد قبلاً ارسال شده؛ ${wait} ثانیه دیگر دوباره تلاش کنید`, retryAfter: wait });
  }

  // سقف روزانه برای هر شماره (هزینه‌ی پنل پیامک را نگه می‌دارد)
  if (existing && existing.sent_day === day && existing.sent_today >= MAX_SMS_PER_PHONE_PER_DAY) {
    return res.status(429).json({ error: 'سقف پیامک امروز برای این شماره پر شده؛ فردا تلاش کنید یا با فروشگاه تماس بگیرید' });
  }

  // سقف روزانه برای هر IP (جلوی ارسال به هزاران شماره‌ی مختلف از یک منبع)
  const ipCount = otp.ipGet.get(req.ip, day)?.count || 0;
  if (ipCount >= MAX_SMS_PER_IP_PER_DAY) {
    log.warn('Daily OTP cap reached for IP', { ip: req.ip });
    return res.status(429).json({ error: 'درخواست‌های زیاد از این اتصال؛ فردا دوباره تلاش کنید' });
  }

  const code = String(crypto.randomInt(10000, 99999));
  otp.upsert.run({ phone, code_hash: hashCode(code), expires_at: now + OTP_TTL_MS, now, day });
  otp.ipBump.run(req.ip, day);

  const result = await sendOtpSms(phone, code);
  if (!result.ok) {
    return res.status(502).json({ error: result.error || 'ارسال پیامک ناموفق بود؛ کمی بعد دوباره تلاش کنید' });
  }
  // مهلت ارسال مجدد و عمر کد را برمی‌گردانیم تا فرانت ثانیه‌شمار زنده نشان دهد.
  // بدون این اعداد، فرانت مجبور بود خودش حدس بزند و با تغییر مقدار سرور ناهمگام می‌شد.
  res.json({
    ok: true,
    mode: result.mode,
    retryAfter: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    expiresIn: Math.ceil(OTP_TTL_MS / 1000)
  });
}));

router.post('/otp/verify', otpVerifyLimiter, validate({
  phone: V.phone(),
  code: V.str({ min: 5, max: 5 })
}), asyncHandler(async (req, res) => {
  const phone = req.valid.phone;
  // کد با normalizeDigits تمیز می‌شود نه normalizePhone — کد ۵ رقمی نباید
  // قواعد پیش‌شماره‌ی موبایل را بخورد (کد ۹۸۱۲۳ نباید بشود ۰۱۲۳).
  const code = normalizeDigits(req.valid.code);

  const record = otp.get.get(phone);
  if (!record) return res.status(400).json({ error: 'ابتدا درخواست کد کنید' });
  if (Date.now() > record.expires_at) {
    otp.del.run(phone);
    return res.status(400).json({ error: 'کد منقضی شده، دوباره درخواست کنید' });
  }

  // شمارش تلاش قبل از مقایسه — brute force با ری‌استارت هم پاک نمی‌شود چون در DB است
  otp.bumpAttempts.run(phone);
  if (record.attempts + 1 > MAX_ATTEMPTS) {
    otp.del.run(phone);
    return res.status(429).json({ error: 'تعداد تلاش زیاد بود، دوباره درخواست کد بدید' });
  }

  if (!code || !safeEqual(hashCode(code), record.code_hash)) {
    return res.status(400).json({ error: 'کد وارد شده اشتباه است' });
  }

  otp.del.run(phone);

  const user = await establishSession(req, phone);
  res.json({ ok: true, user: publicUser(user) });
}));

// شکل عمومی و امن اطلاعات کاربر (بدون هش رمز و فیلدهای داخلی)
function publicUser(u) {
  return {
    id: u.id, phone: u.phone, fullName: u.full_name || '',
    isAdmin: Boolean(u.is_admin), isStaff: Boolean(u.is_staff), hasPassword: Boolean(u.password_hash)
  };
}

// ورود را نهایی می‌کند: ساخت/یافتن کاربر، ارتقای ادمین در صورت لزوم، بازسازی امن سشن
async function establishSession(req, phone) {
  let user = findOrCreateUser(phone);

  // اگر شماره جزو مدیرهاست، پرچم ادمین در دیتابیس ثبت می‌شود (یک‌طرفه و امن)
  if (isAdminPhone(phone) && !user.is_admin) {
    user = ensureAdmin(user.id);
    log.info(`Admin access enabled for ${phone}`);
  }

  // بازسازی سشن بعد از لاگین (جلوگیری از session fixation) — سبد خرید حفظ می‌شود
  const cart = req.session.cart || [];
  await new Promise((resolve, reject) => {
    req.session.regenerate(err => err ? reject(err) : resolve());
  });
  req.session.userId = user.id;
  req.session.isAdmin = Boolean(user.is_admin);
  req.session.cart = cart;
  return user;
}

// ---------- ورود با رمز عبور ----------
// سقفِ IP سرِ جایش می‌ماند (جلوی سیلِ درخواست از یک خط را می‌گیرد) ولی
// حالا قفلِ حسابی هم کنارش هست. عدد فقط برای محیط تست قابل‌تنظیم است، چون
// تستِ خودِ قفل ناچار است ده‌ها رمزِ غلط از یک IP بفرستد.
const passwordLoginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: Number(process.env.PASSWORD_LOGIN_LIMIT) || 20, skipSuccess: true, message: 'تلاش‌های زیاد برای ورود؛ چند دقیقه بعد دوباره تلاش کنید' });

router.post('/password/login', passwordLoginLimiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (!isValidIranPhone(phone) || !password) {
    return res.status(400).json({ error: 'شماره یا رمز عبور وارد نشده' });
  }

  // قفلِ حسابی — جدا از سقفِ IP. چرایی‌اش کامل در lib/login-guard.js نوشته شده.
  // این چک قبل از خواندن دیتابیس و قبل از verifyPassword است تا حتی هزینه‌ی
  // هش‌کردن هم به مهاجم تحمیل نشود.
  const locked = lockState(phone);
  if (locked.locked) {
    // ۴۲۹ نه ۴۰۱: به کاربرِ واقعی می‌گوید «مشکل رمزت نیست، صبر کن»
    return res.status(429).json({
      error: `به‌خاطر چند تلاش ناموفق، ورود این شماره موقتاً بسته است. ${waitText(locked.retryAfter)} دیگر دوباره امتحان کنید.`,
      retryAfter: locked.retryAfter
    });
  }

  const found = getUserByPhone(phone);
  // پیام یکسان برای «کاربر نیست» و «رمز غلط» تا شماره‌ها لو نروند
  if (!found || !found.password_hash || !(await verifyPassword(password, found.password_hash))) {
    const r = registerFail(phone);
    // ورودِ ناموفقِ مدیر در دفتر رویدادها ثبت می‌شود تا صاحب فروشگاه ببیند
    // کسی دارد رمزش را امتحان می‌کند. برای مشتری عادی ثبت نمی‌کنیم؛ دفتر
    // رویدادها جای گزارش تلاش‌های روزمره نیست و شلوغ‌شدنش یعنی دیده‌نشدنِ
    // موردِ مهم. اطلاعاتِ ثبت‌شده حداقلی است: IP و نامِ کوتاهِ مرورگر.
    if (found && (found.is_admin || found.is_staff)) {
      logAdminAction(found.id, 'login_failed', maskPhone(phone), clientFingerprint(req));
      log.warn('Failed panel login', { phone: maskPhone(phone), ip: req.ip });
    }
    if (r.locked) {
      return res.status(429).json({
        error: `به‌خاطر چند تلاش ناموفق، ورود این شماره موقتاً بسته است. ${waitText(r.retryAfter)} دیگر دوباره امتحان کنید.`,
        retryAfter: r.retryAfter
      });
    }
    // گفتنِ «۲ تلاش مانده» عمدی است: کاربرِ واقعی می‌فهمد باید مکث کند، و
    // مهاجم چیزی یاد نمی‌گیرد که با شمردنِ خودش نداند.
    return res.status(401).json({
      error: 'شماره یا رمز عبور اشتباه است',
      remaining: r.remaining
    });
  }

  registerSuccess(phone);
  const fresh = await establishSession(req, phone);
  if (fresh.is_admin || fresh.is_staff) {
    logAdminAction(fresh.id, 'login_ok', maskPhone(phone), clientFingerprint(req));
  }
  res.json({ ok: true, user: publicUser(fresh) });
}));

// آیا این شماره رمز دارد؟ (برای اینکه صفحه‌ی ورود گزینه‌ی «ورود با رمز» را نشان دهد)
// محدودسازی لازم است: این مسیر وگرنه یک اوراکل است که با آن می‌شود فهرست
// شماره‌های ثبت‌نام‌شده‌ی فروشگاه را کشف کرد.
const hasPasswordLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, message: 'درخواست‌های زیاد؛ چند دقیقه بعد تلاش کنید' });

router.post('/has-password', hasPasswordLimiter, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  // برای جلوگیری از افشای فهرست حساب‌ها، پاسخ همیشه وضعیت عمومی می‌دهد؛
  // مسیر ورود واقعی همچنان رمز/OTP را اعتبارسنجی می‌کند.
  if (!isValidIranPhone(phone)) return res.json({ hasPassword: false });
  const user = getUserByPhone(phone);
  res.json({ hasPassword: Boolean(user && user.password_hash) });
}));

/* تعیین/تغییر رمز عبور (کاربر باید وارد شده باشد)
   عوض‌کردنِ رمز همه‌ی نشست‌های **دیگر** را می‌کشد. این کارِ استانداردی است و
   دلیلش سرراست است: آدم معمولاً وقتی رمزش را عوض می‌کند که نگران است کسی
   به حسابش دسترسی دارد. اگر نشستِ آن کس زنده بماند، تغییرِ رمز فقط یک حسِ
   امنیتِ کاذب داده — مهاجم هنوز تو است.

   **چرا رمزِ فعلی پرسیده می‌شود:** تا پیش از این، داشتنِ نشست به‌تنهایی برای
   گذاشتنِ رمزِ تازه کافی بود. یعنی هر کسی که یک بار به حسابِ باز دست پیدا
   می‌کرد — گوشیِ قفل‌نشده روی میز، لپ‌تاپِ مشترک، کوکیِ دزدیده‌شده — می‌توانست
   رمز را عوض کند و همان لحظه با destroyOtherSessions صاحبِ اصلی را از همه‌ی
   دستگاه‌هایش بیرون بیندازد. دسترسیِ موقت تبدیل می‌شد به تصاحبِ دائمیِ حساب،
   و صاحبش حتی راهِ برگشتِ سریع نداشت.

   با پرسیدنِ رمزِ فعلی، آن پنجره بسته می‌شود: کسی که فقط نشست را دارد و رمز را
   نمی‌داند، نمی‌تواند قفل را عوض کند. برای کاربری که هنوز رمز نگذاشته (فقط با
   پیامک وارد می‌شود) چیزی پرسیده نمی‌شود — رمزِ فعلی‌ای وجود ندارد که بپرسیم،
   و خودِ ورودِ با پیامک همان لحظه هویت را ثابت کرده است. */
const passwordSetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 10, skipSuccess: true,
  message: 'تلاش‌های زیاد؛ چند دقیقه بعد دوباره تلاش کنید'
});

router.post('/password/set', passwordSetLimiter, asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'برای ادامه باید وارد حساب‌تان شوید' });
  const password = String(req.body?.password || '');
  if (password.length < 6 || password.length > 100) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  }

  const current = stmtUserById.get(req.session.userId);
  if (!current) return res.status(401).json({ error: 'برای ادامه باید وارد حساب‌تان شوید' });

  if (current.password_hash) {
    const currentPassword = String(req.body?.currentPassword || '');
    if (!currentPassword) {
      return res.status(400).json({ error: 'برای تغییر رمز، اول رمز فعلی را وارد کنید', needCurrent: true });
    }
    if (!(await verifyPassword(currentPassword, current.password_hash))) {
      log.warn('Wrong current password on change attempt', { userId: current.id, ip: req.ip });
      return res.status(401).json({ error: 'رمز فعلی اشتباه است', needCurrent: true });
    }
  }

  const user = setUserPassword(req.session.userId, await hashPassword(password));
  const killed = destroyOtherSessions(req.session.userId, req.sessionID);
  if (killed) log.info('Other sessions revoked after password change', { userId: req.session.userId, killed });
  res.json({ ok: true, user: publicUser(user), revoked: killed });
}));

/* خروج از همه‌ی دستگاه‌های دیگر — بدون عوض‌کردنِ رمز.
   چرا جدا لازم است: کسی که گوشی‌اش را جا گذاشته لزوماً نمی‌خواهد رمزش را
   عوض کند (شاید اصلاً رمز نگذاشته باشد و فقط با پیامک وارد می‌شود). تا حالا
   تنها راهِ چنین کاربری این بود که ۳۰ روز صبر کند تا کوکی خودش منقضی شود. */
router.post('/logout-others', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'ابتدا وارد شوید' });
  const killed = destroyOtherSessions(req.session.userId, req.sessionID);
  log.info('User revoked other sessions', { userId: req.session.userId, killed });
  res.json({ ok: true, revoked: killed });
});

// چند دستگاه همین حالا به این حساب وارد است (برای نشان‌دادن در صفحه‌ی حساب)
router.get('/sessions', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'ابتدا وارد شوید' });
  res.json({ count: countUserSessions(req.session.userId) });
});

// حذف رمز عبور (برگشت به ورود فقط با پیامک)
// نکته‌ی امنیتی: حذفِ رمز نباید فقط «رمزش را بردارد»؛ هر دستگاهِ دیگری که
// با این رمز وارد شده باید از نشستش بیرون بیفتد. اگر رمز خالی بماند و نشست‌ها
// سر جاشان باشند، کسی که بعداً رمز را بازمی‌گذارد مطمئن نیست که هیچ
// نشستِ قدیمیِ بی‌رمز هنوز زنده نمانده باشد. همان رفتار /password/set:
// همه‌ی نشست‌های دیگر را می‌کشد و رویداد را لاگ می‌کند.
//
// اینجا هم مثل /password/set رمزِ فعلی پرسیده می‌شود، و دلیلش حتی سرراست‌تر
// است: برداشتنِ رمز یعنی پایین‌آوردنِ یک سدِ امنیتی. کسی که نشستِ دزدیده را
// دارد نباید بتواند قفلِ حساب را بردارد و بعد بقیه‌ی دستگاه‌ها را هم بیرون
// بیندازد. اگر کاربر رمزش را فراموش کرده، راهِ درست ورودِ با پیامک است، نه
// حذفِ رمز از داخلِ نشستی که معلوم نیست مالِ کیست.
router.post('/password/remove', passwordSetLimiter, asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'ابتدا وارد شوید' });

  const current = stmtUserById.get(req.session.userId);
  if (!current) return res.status(401).json({ error: 'ابتدا وارد شوید' });

  if (current.password_hash) {
    const currentPassword = String(req.body?.currentPassword || '');
    if (!currentPassword) {
      return res.status(400).json({ error: 'برای برداشتن رمز، اول رمز فعلی را وارد کنید', needCurrent: true });
    }
    if (!(await verifyPassword(currentPassword, current.password_hash))) {
      log.warn('Wrong current password on remove attempt', { userId: current.id, ip: req.ip });
      return res.status(401).json({ error: 'رمز فعلی اشتباه است', needCurrent: true });
    }
  }

  const user = setUserPassword(req.session.userId, null);
  const killed = destroyOtherSessions(req.session.userId, req.sessionID);
  log.info('User removed password and revoked other sessions', { userId: req.session.userId, killed });
  res.json({ ok: true, user: publicUser(user), revoked: killed });
}));

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  let user = stmtUserById.get(req.session.userId);
  if (!user) return res.json({ user: null });
  // چک پویا: اگر شماره‌ی این کاربر بعداً به ADMIN_PHONE اضافه شده باشد،
  // بدون نیاز به خروج/ورود دوباره ادمین می‌شود
  if (!user.is_admin && isAdminPhone(user.phone)) {
    user = ensureAdmin(user.id);
    log.info(`Admin access enabled for ${user.phone} (via /me)`);
  }
  res.json({ user: publicUser(user) });
});

// تکمیل/ویرایش پروفایل (فعلاً فقط نام؛ شماره همان هویت ورود است)
router.post('/profile', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'برای ادامه باید وارد حساب‌تان شوید' });
  const fullName = String(req.body?.fullName || '').trim().slice(0, 60);
  if (!fullName) return res.status(400).json({ error: 'نام را وارد کنید' });
  const user = updateUserName(req.session.userId, fullName);
  res.json({ ok: true, user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

module.exports = router;
