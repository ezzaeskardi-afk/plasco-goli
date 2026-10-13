const crypto = require('crypto');

function boolEnv(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function boundedIntEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function validateProductionConfig({ isProduction, cookieSecure, sessionSecret }) {
  if (!isProduction) return;
  if (cookieSecure !== true) throw new Error('COOKIE_SECURE must be true in production');
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }
}

function newRequestId() {
  return crypto.randomBytes(6).toString('hex');
}

/* ---------- عاملِ دومِ ورودِ پنل: اجبارِ production ----------

   شکافِ V6 نقشهٔ ASVS این بود: «ورودِ ادمین روی یک عامل بند است». کدی که
   این را می‌بندد، اگر در production اجباری نباشد، شکاف را نمی‌بندد — فقط
   یک امکانِ اختیاری اضافه می‌کند که ممکن است هیچ‌وقت روشن نشود. پس همان جایی
   که SESSION_SECRET و COOKIE_SECURE اجباری می‌شوند، این هم اجباری می‌شود:
   اگر ADMIN_PHONE ست باشد و شماره‌ای کلیدِ دوم نداشته باشد، سرور بالا نمی‌آید.

   چرا *توقف* و نه فقط یک هشدار: هشداری که سرور را بالا می‌آورد، در لاگی که
   کسی نمی‌خواند گم می‌شود و پنلِ یک‌عاملی سر جایش می‌ماند. اینجا هزینهٔ
   اشتباه یک دقیقه مکثِ راه‌اندازی است، ولی هزینهٔ سکوت یک پنلِ باز است.

   پیامِ خطا عمداً «چه کار کنم» را می‌گوید: دستورِ ساختنِ کلید و همان خطی
   که باید در .env بنشیند. خطایی که فقط بگوید «کلید ندارید»، مدیر را به
   جست‌وجو می‌فرستد.

   خارج از production هیچ‌چیز اجباری نیست: توسعه و آزمون خودکار بدونِ کلید هم
   باید کار کنند، وگرنه هر کسی که پروژه را clone می‌کند به یک دیوار می‌خورد. */
function validateAdminSecondFactor({ isProduction, adminPhones, totpSecretPhones }) {
  if (!isProduction) return;
  const admins = [...new Set((adminPhones || []).filter(Boolean))];
  if (admins.length === 0) return;
  const covered = new Set(totpSecretPhones || []);
  const missing = admins.filter((p) => !covered.has(p));
  if (missing.length === 0) return;
  throw new Error(
    'ADMIN_TOTP_SECRETS must cover every admin in ADMIN_PHONE in production '
    + `(missing: ${missing.join(', ')}). Generate one with: node tools/admin-totp.js ${missing[0]}`,
  );
}

/* ---------- کدِ پشتیبان: اجبارِ production ----------

   کلیدِ TOTP یک ریسکِ تازه می‌سازد که خودش قبا‌لاً نبود: گوشیِ گم‌شده یعنی
   کلیدِ گم‌شده، یعنی قفل‌شدنِ ابدیِ پنل. سدی که راهِ پشتیبان ندارد، سد نیست —
   تله است. پس همان‌جا که کلید در production اجباری می‌شود، این هم می‌شود.

   چرا فقط مدیرانِ *کلیددار* هدف‌اند: مدیرِ بی‌کلید اصلاً به پلهٔ دوم نمی‌رسد،
   پس خواستنِ کدِ پشتیبان از او یک اجبارِ بی‌ربط است که فقط سرِ هر راه‌اندازی
   خطا می‌سازد. شرط دقیقاً همان «کسی که می‌تواند قفل شود» است.

   چرا *توقف* و نه هشدار: همان استدلالِ بالا. و پیام عمداً «چه کار کنم» را
   می‌گوید (دستورِ ساختِ کدها و نامِ همان متغیرِ محیطی)؛ خطایی که فقط بگوید
   «کد ندارید»، مدیر را به جست‌وجو می‌فرستد.

   خارج از production هیچ‌چیز اجباری نمی‌شود: توسعه و آزمون باید بدونِ کدِ
   پشتیبان هم بالا بیایند. */
function validateAdminRecovery({ isProduction, adminsWithKeys, adminsWithRecovery }) {
  if (!isProduction) return;
  const covered = new Set(adminsWithRecovery || []);
  const keyed = [...new Set((adminsWithKeys || []).filter(Boolean))];
  const missing = keyed.filter((p) => !covered.has(p));
  if (missing.length === 0) return;
  throw new Error(
    'ADMIN_RECOVERY_CODES must cover every admin that has a TOTP key in production '
    + `(missing: ${missing.join(', ')}). Generate them with: node tools/admin-recovery.js ${missing[0]}`,
  );
}

function validateRuntimeConfig({ isProduction, siteUrl, adminPhones, totpSecretPhones, recoveryCodePhones }) {
  if (!isProduction) return;
  if (!/^https:\/\/[^\s/]+$/.test(String(siteUrl || ''))) {
    throw new Error('SITE_URL must be a valid https:// URL in production');
  }
  validateAdminSecondFactor({ isProduction, adminPhones, totpSecretPhones });
  // فقط بعد از آن یکی: پیامِ «کلید ندارید» جملهٔ اولِ کارِ مدیر است و اگر
  // ترتیب برعکس شود، مدیرِ بی‌کلید خطای «کدِ پشتیبان ندارید» می‌گیرد که هنوز
  // موضوعش مطرح نیست.
  validateAdminRecovery({ isProduction, adminsWithKeys: totpSecretPhones, adminsWithRecovery: recoveryCodePhones });
}

module.exports = {
  boolEnv,
  boundedIntEnv,
  validateProductionConfig,
  validateRuntimeConfig,
  validateAdminSecondFactor,
  validateAdminRecovery,
  newRequestId,
};
