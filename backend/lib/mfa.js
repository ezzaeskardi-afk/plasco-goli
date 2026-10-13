/* ============================================================
   lib/mfa.js — عاملِ دومِ ورودِ پنل: پیکربندی، و سنجشِ کد

   ---------- دو تصمیمی که این فایل را تعریف می‌کنند ----------

   ۱. کلید از `ِ.env` می‌آید، نه از یک مسیرِ «ثبت‌نام» در پنل.
      اگر ادمین می‌توانست خودش داخلِ پنل کلیدش را بسازد، سد دور می‌خورد:
      همان کسی که کدِ پیامکیِ شماره را گرفته، اولین کاری که می‌کرد ثبتِ
      *کلیدِ خودش* بود و از آن به بعد با یک عامل وارد می‌شد. یعنی «دو
      عاملی» فقط تا اولین حمله دوام می‌آورد. پس کلید بیرون از کانالِ ورود
      زاده می‌شود: با `node tools/admin-totp.js` روی دستگاهِ خودِ مدیر، و در
      `ADMIN_TOTP_SECRETS` می‌نشیند. هیچ مسیری در API کلید نمی‌سازد و
      نمی‌خواند — کلید هیچ‌وقت از سرور بیرون نمی‌رود.

   ۲. هر کد فقط یک بار پذیرفته می‌شود.
      بدونِ این، یک کدِ ۳۰ثانیه‌ای که کسی روی صفحه دیده (یا از لاگِ پروکسی
      درآورده) تا پایانِ پنجره قابلِ استفادهٔ مجدد است. RFC 6238 خودش این را
      به‌عنوانِ وظیفهٔ پیاده‌سازیِ پذیرنده می‌گذارد و برای همین `verify()` در
      `lib/totp.js` پله‌ی برنده را برمی‌گرداند و نه فقط «درست بود».
      «آخرین پلهٔ پذیرفته‌شده» در `makeSharedStore` می‌نشیند تا در حالتِ
      cluster هم همه‌ی workerها یک حافظه ببینند — همان دلیلی که قفلِ حساب و
      توکنِ challenge از آن استفاده می‌کنند. نبودش یعنی با ۸ worker، یک کد ۸
      بار خرج می‌شود.
   ============================================================ */
'use strict';

const { makeSharedStore } = require('./shared-state');
const { normalizePhone } = require('./phone');
const totp = require('./totp');

/* ---------- قالبِ پیکربندی ----------
   ADMIN_TOTP_SECRETS="09121234567:GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ,0913...:..."

   چرا «شماره:کلید» و نه فقط یک کلیدِ تنها: `ADMIN_PHONE` از اول تا امروز یک
   فهرست است (با کاما). یک کلیدِ تنها یعنی مجبور شویم حدس بزنیم کدام مدیر
   صاحبش است — و در روزی که مدیر دوم اضافه شود، همه‌ی ادمین‌ها یک کلید
   مشترک دارند که سد را به «یک چیزی که همه می‌دانند» تبدیل می‌کند.

   خطای پیکربندی عمداً سرخ است، نه بی‌صدا: کلیدِ غلط یعنی قفل‌شدنِ مدیر از پنل.
   اگر اینجا خاموش رد شود، مدیر فقط می‌بیند «کدت غلط است» و کسی هم نمی‌گوید چرا. */
function parseSecrets(raw) {
  const map = new Map();
  const invalid = [];
  for (const part of String(raw || '').split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const at = entry.indexOf(':');
    if (at === -1) { invalid.push(entry); continue; }
    const phone = normalizePhone(entry.slice(0, at));
    const secret = entry.slice(at + 1).trim();
    if (!phone || !secret) { invalid.push(entry); continue; }
    try {
      totp.base32Decode(secret); // اعتبارسنجیِ قالب، نه فقط «خالی نبودن»
      map.set(phone, secret.toUpperCase().replace(/[\s\-_=]/g, ''));
    } catch (e) {
      invalid.push(entry);
    }
  }
  return { map, invalid };
}

const PARSED = parseSecrets(process.env.ADMIN_TOTP_SECRETS);

/* کلیدها یک بار در زمانِ بارگذاری خوانده می‌شوند — مثل `ADMIN_PHONE` در
   lib/phone.js. دلیلش هم همان است: پیکربندی در زمانِ اجرا عوض نمی‌شود و
   خواندنِ دوباره‌ی آن به‌ازای هر ورود، فقط یک درِ پنهان باز می‌کند. */
function secretFor(phone) {
  return PARSED.map.get(normalizePhone(phone)) || null;
}

/** شماره‌هایی که کلیدِ دوم دارند — برای اعتبارسنجیِ production. */
function configuredPhones() {
  return [...PARSED.map.keys()];
}

/** ورودی‌های ناخوانا (اگر کسی قالب را غلط بنویسد) — برای گزارشِ راه‌اندازی. */
function invalidEntries() {
  return [...PARSED.invalid];
}

/* ---------- چه کسی باید عاملِ دوم بدهد ----------
   قاعده عمداً «نقش» نیست، «کلید» است: هر شماره‌ای که کلید داشته باشد باید
   آن را هم بدهد. این باعث می‌شود:
     • کارمند هم بتواند عاملِ دوم بگیرد (پنل برایش سفارش‌ها را نشان می‌دهد)،
       بدون اینکه مجبور شود؛
     • شماره‌ی بدونِ کلید رفتارش مو‌به‌مو مثل قبل بماند — پس فعال‌کردنِ این
       ویژگی برای یک مدیر، هیچ چیزِ دیگری را جابه‌جا نمی‌کند. */
function requiredFor(user) {
  return Boolean(user && secretFor(user.phone));
}

/* ---------- ارتقای پویا به ادمین باید از همین سد بگذرد ----------
   یک درِ ورودِ *دیگر* به پنل هست و باید همان سدی را داشته باشد که ورودِ تازه
   دارد. تصویرِ حمله: مهاجمی با SIMِ دزدیده یک بار با کدِ پیامکی وارد می‌شود
   (هنوز نقشِ ادمین در دیتابیس نیست، پس کدِ دوم هم از او خواسته نشده)، بعد
   مدیر شماره را به `ADMIN_PHONE` اضافه می‌کند و نشستِ همان مهاجم بی‌سر‌و‌صدا
   ادمین می‌شود — بدونِ هیچ لحظه‌ای که کدِ اپ پرسیده شود. سد فقط وقتی معنا
   دارد که *همهٔ* راه‌های رسیدن به پنل از آن بگذرند.

   پس ارتقا فقط وقتی مجاز است که یا کلیدی برای این شماره پیکربندی نشده باشد
   (حالتی که نمی‌توان کدِ دومی خواست)، یا همین نشست قبلاً عاملِ دوم را داده
   باشد (`mfaAt` که /totp/verify می‌نشاند).

   این تابع در `lib/` است و نه در یکی از routes، چون دو جا لازمش دارند
   (`/me` و `requireAdmin`) و «دو کپی از یک قاعده» همان چیزی است که روزی از
   هم می‌افتند — یکی به‌روز می‌شود و دیگری نه. */
function allowAdminUpgrade(session, user) {
  if (!secretFor(user.phone)) return true;
  return Boolean(session && session.mfaAt);
}

const usedSteps = makeSharedStore('totp-used-step', { ttlMs: 5 * 60 * 1000, maxKeys: 5000 });

/** آخرین پله‌ی پذیرفته‌شده — فقط برای تست و تشخیص (هرگز در پاسخِ API نمی‌آید). */
function lastAcceptedStep(userId) {
  const v = usedSteps.get(String(userId));
  return typeof v === 'number' ? v : null;
}

/* ---------- سنجشِ کد ----------
   `userId` کلیدِ قفلِ تکراری‌نبودن است، نه شماره: اگر مدیر شماره‌اش را عوض
   کند دو حساب می‌شود و نباید پله‌های قبلیِ حسابِ دیگر را قرض بگیرد.
   `phone` هم لازم است چون کلید با شماره گره خورده.

   خروجی: { ok: true } یا { ok: false, reason }
   reason ∈ format | secret | mismatch | replay | not-configured */
function verifyCode({ userId, phone, code, atMs = Date.now() }) {
  const secret = secretFor(phone);
  if (!secret) return { ok: false, reason: 'not-configured' };

  const result = totp.verify(secret, code, { atMs });
  if (!result.ok) return result;

  const key = String(userId);
  let accepted = false;
  // read-modify-write اتمیک: دو درخواستِ هم‌زمان با یک کد، هر دو «پله‌ی
  // قبلی» را یکسان نمی‌بینند و دومی رد می‌شود.
  usedSteps.mutate(key, (cur) => {
    if (typeof cur === 'number' && result.step <= cur) return cur;
    accepted = true;
    return result.step;
  });
  return accepted ? { ok: true } : { ok: false, reason: 'replay' };
}

module.exports = {
  secretFor,
  requiredFor,
  allowAdminUpgrade,
  configuredPhones,
  invalidEntries,
  verifyCode,
  lastAcceptedStep,
  parseSecrets,
};
