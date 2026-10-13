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

const crypto = require('crypto');
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

/* ---------- پوششِ عاملِ دوم روی مدیرها ----------

   سؤالِ «آیا اصلاً کسی کلید دارد؟» یک پرسشِ *سیاستی* است، نه یک جزئیاتِ نمایشی،
   پس جایش همین‌جاست و نه در routes و نه در رابط. دو مصرف‌کننده دارد و اگر هر
   کدام قاعده را خودش حساب کند، روزی از هم می‌افتند:

     • `lib/security-config.js` → `validateAdminSecondFactor`: در production اگر
       شماره‌ای جا بماند سرور **بالا نمی‌آید**. آن یکی با پارامتر کار می‌کند
       (کلیدها را از بیرون می‌گیرد چون مستقیماً آزمون می‌شود)، این یکی از
       پیکربندیِ زنده‌ی همین پروسه می‌خواند. هر دو یک قاعده را می‌گویند:
       «هر شماره‌ی ADMIN_PHONE که کلید ندارد، پوشش‌نداده است».
     • `/api/admin/system-status` → همین. تا امروز پنلِ در حالِ اجرا هیچ‌جا
       نمی‌گفت یک‌عاملی است: اجبارِ production فقط در لحظه‌ی بوت اثر داشت، پس
       روی سروری که از قبل بالا آمده بود (یا در توسعه، که هیچ‌وقت اجباری نبود)
       هیچ‌کس این را نمی‌دید.

   ---------- چرا `noneCovered` و نه «آیا کلید هست» ----------
   حالتِ هشدار عمداً فقط «هیچ مدیری کلید ندارد» است. پوششِ ناقص (یکی از دو
   مدیر کلید دارد) هشدار نیست، چون آن یکی مدیر واقعاً یک‌عاملی وارد می‌شود ولی
   *قفل‌شدنِ او* هم پیامد دارد؛ سنجیدنش تصمیمِ جداگانه‌ای است، نه چیزی که
   بی‌صدا زیرِ عنوانِ «نبودِ عاملِ دوم» جا بزنیم. پس این تابع فقط واقعیت را
   می‌دهد (`admins`/`covered`) و آن بولی را که پنل به‌عنوانِ هشدار نشان می‌دهد.

   `admins.length > 0` عمداً شرط است: اگر `ADMIN_PHONE` خالی باشد، کسی نیست که
   سد روی او معنا داشته باشد و هشدارِ همیشگی فقط نویز می‌شود. */
function coverage(adminPhones) {
  const admins = [...new Set((adminPhones || []).map((p) => normalizePhone(p)).filter(Boolean))];
  const covered = admins.filter((p) => PARSED.map.has(p));
  return {
    admins: admins.length,
    covered: covered.length,
    noneCovered: admins.length > 0 && covered.length === 0,
  };
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

/* ============================================================
   کدِ پشتیبان (recovery code) — «گم‌شدنِ گوشی نباید قفل‌شدن باشد»

   ---------- خطری که خودِ سد ساخت ----------
   عاملِ دوم کلیدش فقط در گوشیِ مدیر است. تا امروز اگر آن گوشی گم می‌شد
   (یا عوض، ریست، یا اپش پاک می‌شد)، ورودِ پنل برای همیشه بسته می‌ماند و
   هیچ راهی جز دست‌بردن در `.env` سرور نبود. یعنی سدی که برای بالا بردنِ
   امنیت گذاشته شده بود، خودش به یک حملهٔ از‌کار‌انداختن تبدیل می‌شد —
   ارزان‌ترین راهِ بستنِ پنل، برداشتنِ گوشیِ مدیر بود.

   کدِ پشتیبان همان چیزی است که این را می‌بندد: چند رشتهٔ یک‌بارمصرف که
   مدیر روی کاغذ نگه می‌دارد و هر کدام *یک بار* کار می‌کند.

   ---------- چهار تصمیم که این بخش را تعریف می‌کنند ----------

   ۱. **کدها هم در `.env` می‌نشینند، نه در دیتابیس و نه در پنل.**
      همان دلیلی که کلیدِ TOTP را بیرون از کانالِ ورود نگه داشت
      (بالاتر توضیح داده شد) این‌جا هم دقیقاً برقرار است: اگر ادمین
      می‌توانست داخلِ پنل کدِ پشتیبان بسازد، همان کسی که کدِ پیامکی را
      گرفته بود اول برای خودش کد می‌ساخت. کدها با
      `node tools/admin-recovery.js` روی دستگاهِ خودِ مدیر زاده می‌شوند.

   ۲. **فقط هشِ کد در پیکربندی می‌نشیند، نه خودِ کد.**
      `.env` جای راز است، ولی فرق دارد بین «جایی که راز می‌نشیند» و
      «جایی که اگر لو رفت فوراً پنل را بدهد». مدیر ممکن است همین فایل را
      برای پشتیبان‌گیری کپی کند، در تیکت بگذارد یا در اسکرین‌شات بفرستد.
      با هش، آن لو رفتن یک لیستِ بی‌مصرف است. برای همین هم هر ورودی‌ای که
      *شکلِ کد* داشته باشد (نه شکلِ هش) ناخوانا شمرده می‌شود: یک اشتباهِ
      رایج این است که کسی خطِ کدها را به‌جای خطِ هش‌ها کپی کند، و آن‌وقت
      مدیر کدهایش را «تنظیم‌شده» می‌بیند ولی هیچ‌کدام کار نمی‌کند.
      الگوریتمِ هش عمداً SHA-256 ساده است و نه KDF: این کدها گذرواژه نیستند
      — ۶۰ بیت تصادفیِ تولیدشدهٔ خودمان‌اند، پس حملهٔ دیکشنری و جدولِ رنگین‌کمانی معنا ندارد و
      کندکردنِ هش فقط ورودِ اضطراری را کند می‌کند.

   ۳. **قالبِ کد از قالبِ کدِ اپ جداست، و همین تفکیکِ مسیر را می‌سازد.**
      کدِ اپ دقیقاً ۶ رقم است؛ کدِ پشتیبان ۱۲ نویسهٔ Base32 به شکلِ
      `XXXX-XXXX-XXXX`. پس مسیرِ ورود بدونِ اینکه چیزی را «حدس بزند»
      می‌فهمد کدام را باید بسنجد — و یک کدِ ۶ رقمی هرگز به سمتِ کدِ
      پشتیبان نمی‌رود. حروفِ بزرگ/کوچک، خطِ تیره و فاصله موقعِ تایپ نادیده
      گرفته می‌شوند: مدیر دارد از روی کاغذ کپی می‌کند.

   ۴. **مصرفِ کد دائمی است.**
      پلهٔ TOTP را می‌شد در `makeSharedStore` با TTL نگه داشت (چون خودِ کد
      با زمان عوض می‌شود)، ولی کدِ پشتیبان تاریخ انقضا ندارد: اگر «مصرف‌شده»
      بعد از چند دقیقه فراموش شود، همان کاغذ دوباره کار می‌کند. پس حالتش در
      جدولِ خودش در SQLite می‌نشیند (`lib/db.js → consumeRecoveryCode`) و
      تطبیق/پیکربندی همین‌جا می‌ماند — `lib/mfa.js` همچنان دیتابیس را باز
      نمی‌کند، چون نگهبانِ قاعده آن را در یک پروسه‌ی بی‌دیتابیس می‌خواند.
   ============================================================ */
const RECOVERY = { groups: 3, groupLen: 4, defaultCount: 8 };
const RECOVERY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // همان Base32
const RECOVERY_HASH_RE = /^[0-9a-f]{64}$/;
const RECOVERY_CODE_LEN = RECOVERY.groups * RECOVERY.groupLen;
const RECOVERY_SHAPE_RE = new RegExp(`^[A-Z2-7]{${RECOVERY_CODE_LEN}}$`);

/** کدِ کاربر → شکلِ مقایسه‌پذیر. مدیر از روی کاغذ می‌خواند: خط تیره، فاصله و بزرگی/کوچکی حرف بی‌اثر است. */
function normalizeRecoveryCode(input) {
  return String(input ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
}

/** همان هشی که در `ADMIN_RECOVERY_CODES` می‌نشیند. */
function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

/** شکلِ نمایشی: `XXXX-XXXX-XXXX` (فقط برای خواندنِ آدم). */
function formatRecoveryCode(code) {
  return normalizeRecoveryCode(code).replace(new RegExp(`(.{${RECOVERY.groupLen}})`, 'g'), '$1-').replace(/-$/, '');
}

/** آیا این ورودی *شکلِ* کدِ پشتیبان دارد (در برابر کدِ ۶ رقمیِ اپ)؟ */
function recoveryShaped(input) {
  return RECOVERY_SHAPE_RE.test(normalizeRecoveryCode(input));
}

/** کدهای تازه — همان چیزی که ابزار چاپ می‌کند و در `.env` فقط هششان می‌نشیند. */
function generateRecoveryCodes(count = RECOVERY.defaultCount) {
  const out = [];
  while (out.length < count) {
    const raw = crypto.randomBytes(RECOVERY_CODE_LEN);
    let code = '';
    // `byte % 32`: ۲۵۶ بر ۳۲ بخش‌پذیر است، پس این نگاشت دقیقاً یکنواخت است
    // (با الفبای غیرِ توانِ دو، همین یک خط سوگیری می‌ساخت).
    for (const byte of raw) code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * قالب:
 *   ADMIN_RECOVERY_CODES="09121234567:<هش> <هش> …,0913…:<هش>"
 *
 * شکل همان «شماره:مقدار»ِ `ADMIN_TOTP_SECRETS` است و کاما بینِ شماره‌ها؛
 * فقط مقدار این‌جا یک فهرستِ فاصله‌جداشده است (هر مدیر چند کد دارد). یک هش
 * تنها هم پذیرفته می‌شود.
 */
function parseRecoveryCodes(raw) {
  const map = new Map();
  const invalid = [];
  for (const part of String(raw || '').split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const at = entry.indexOf(':');
    if (at === -1) { invalid.push(entry); continue; }
    const phone = normalizePhone(entry.slice(0, at));
    const hashes = entry.slice(at + 1).trim().split(/\s+/).filter(Boolean);
    if (!phone || hashes.length === 0 || !hashes.every((h) => RECOVERY_HASH_RE.test(h))) {
      // یک ورودیِ ناخوانا کلِ سطر را کنار می‌گذارد، نه فقط آن هش را: نیمه‌خواندنِ
      // یک گروه یعنی «۳ از ۸ کدِ این مدیر بی‌صدا کار می‌کند» و کسی هم نمی‌فهمد چرا
      // کدهای بعدی رد می‌شوند. صریح رد کن، بالا گزارش بده.
      invalid.push(entry);
      continue;
    }
    const current = map.get(phone) || [];
    map.set(phone, [...new Set([...current, ...hashes])]);
  }
  return { map, invalid };
}

const PARSED_RECOVERY = parseRecoveryCodes(process.env.ADMIN_RECOVERY_CODES);

/** چند کدِ پشتیبان برای این شماره پیکربندی شده (۰ = هیچ). */
function recoveryCountFor(phone) {
  return (PARSED_RECOVERY.map.get(normalizePhone(phone)) || []).length;
}

/** شماره‌هایی که کدِ پشتیبان دارند. */
function configuredRecoveryPhones() {
  return [...PARSED_RECOVERY.map.keys()];
}

/** ورودی‌های ناخوانای `ADMIN_RECOVERY_CODES` — برای گزارشِ راه‌اندازی. */
function recoveryInvalidEntries() {
  return [...PARSED_RECOVERY.invalid];
}

/** خطِ آمادهٔ `.env` — تنها جایی که کدِ خام به هش تبدیل می‌شود و خودِ کد دور ریخته می‌شود. */
function recoveryEnvLine(phone, codes) {
  const p = normalizePhone(phone);
  const hashes = (Array.isArray(codes) ? codes : [codes]).map(hashRecoveryCode);
  return `ADMIN_RECOVERY_CODES=${p}:${hashes.join(' ')}`;
}

/**
 * تطبیقِ کدِ پشتیبان با هش‌های پیکربندی‌شده — **بدونِ مصرف‌کردن**.
 *
 * خروجی: { ok: true, hash } یا { ok: false, reason }
 * reason ∈ format | not-configured | mismatch
 * «مصرف‌شده» این‌جا نیست چون حالتش در دیتابیس است، نه در پیکربندی؛
 * مصرف را صدا‌زنندهٔ همین تابع انجام می‌دهد (`lib/db.js → consumeRecoveryCode`).
 */
function matchRecoveryCode(phone, input) {
  const stored = PARSED_RECOVERY.map.get(normalizePhone(phone)) || [];
  if (stored.length === 0) return { ok: false, reason: 'not-configured' };
  const normalized = normalizeRecoveryCode(input);
  if (!RECOVERY_SHAPE_RE.test(normalized)) return { ok: false, reason: 'format' };

  const candidate = Buffer.from(hashRecoveryCode(normalized), 'hex');
  let match = null;
  // همهٔ کاندیدها سنجیده می‌شوند و هیچ‌جا `break` نیست: زمانِ پاسخ نباید
  // بگوید کد به کدام خانه نزدیک‌تر بود. (همان قاعده‌ای که در lib/totp.js بود.)
  for (const hash of stored) {
    const a = Buffer.from(hash, 'hex');
    if (a.length === candidate.length && crypto.timingSafeEqual(a, candidate)) match = hash;
  }
  return match ? { ok: true, hash: match } : { ok: false, reason: 'mismatch' };
}

/* ---------- شکافِ پوشش: «کدام مدیر می‌تواند قفل شود» ----------
   برخلافِ `coverage` (که فقط «هیچ مدیری کلید ندارد» را هشدار می‌داند، چون
   کلید داشتن یا نداشتن یک *سیاست* است)، این‌جا پوششِ ناقص واقعاً خطر است و
   باید دیده شود: هر مدیری که کلید دارد ولی کدِ پشتیبان ندارد، با گم‌شدنِ
   گوشی‌اش برای همیشه از پنل بیرون می‌ماند. فقط همین دسته شمرده می‌شود —
   شماره‌ای که کلید ندارد اصلاً به این پله نمی‌رسد و حساب‌کردنش عدد را
   دروغین می‌کند. */
function recoveryGap(adminPhones) {
  const admins = [...new Set((adminPhones || []).map((p) => normalizePhone(p)).filter(Boolean))];
  const keyed = admins.filter((p) => PARSED.map.has(p));
  const missing = keyed.filter((p) => !PARSED_RECOVERY.map.has(p));
  return { keyed: keyed.length, covered: keyed.length - missing.length, missing: missing.length };
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
  coverage,
  verifyCode,
  lastAcceptedStep,
  parseSecrets,
  // ---------- کدِ پشتیبان ----------
  RECOVERY,
  parseRecoveryCodes,
  normalizeRecoveryCode,
  formatRecoveryCode,
  hashRecoveryCode,
  generateRecoveryCodes,
  recoveryShaped,
  recoveryCountFor,
  configuredRecoveryPhones,
  recoveryInvalidEntries,
  recoveryEnvLine,
  matchRecoveryCode,
  recoveryGap,
};
