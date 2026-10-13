/* ============================================================
   lib/totp.js — کدِ یک‌بارمصرفِ زمان‌محور (RFC 6238 / RFC 4226)

   ---------- چرا این فایل وجود دارد ----------
   شکافِ V6 نقشهٔ ASVS: ورودِ ادمین روی یک عامل بند بود. هر کس کدِ پیامکیِ
   شماره‌ی مدیر را بگیرد، ادمین است. عاملِ دوم یعنی «چیزی که فقط خودِ مدیر
   دارد» — نه چیزی که به همان کانال می‌رسد. TOTP همان است: کلیدی که یک بار
   ساخته می‌شود و در اپِ Authenticator می‌نشیند، بعد از آن هیچ‌وقت روی شبکه
   نمی‌رود.

   ---------- چرا وابستگی تازه اضافه نشد ----------
   TOTP یک HMAC است و HMAC در `crypto`ِ خودِ نود هست. کتابخانه‌های آماده
   (speakeasy/otplib) همین ۴۰ خط را دارند، منتها با یک درختِ وابستگی که باید
   به‌روز بماند. پروژه عمداً سه وابستگی دارد و این فایل دلیلی برای چهارمی
   نمی‌سازد.

   ---------- چرا HMAC-SHA-1؟ (این تناقض نیست) ----------
   RFC 6238 پیش‌فرض را SHA-1 گذاشته و *همه‌ی* اپ‌های Authenticator (Google،
   Authy، 1Password، اپ‌های ایرانی) فقط همین را پشتیبانی می‌کنند. اگر SHA-256
   بگذاریم، امن‌تر نمی‌شود — در عمل یعنی «کد روی گوشیِ مدیر نمی‌آید».
   همان چیزی که ASVS در بندِ CRYP از آن نهی می‌کند «الگوریتمِ شکسته برای
   درهم‌سازی» است (MD5/SHA-1 در امضای دیجیتال و مقاومتِ برخوردی). HMAC-SHA-1
   به حمله‌های برخوردی که SHA-1 را شکستند هیچ ربطی ندارد: HMAC بر پایهٔ PRF
   است، نه مقاومتِ برخوردی، و با کلیدِ ۱۶۰ بیتیِ تصادفی اینجا حمله‌ی عملی‌ای
   روی آن شناخته نشده. در `tests/wstg.js` همین تصمیم صریحاً سنجیده می‌شود
   (SHA-1 فقط داخلِ `createHmac` مجاز است، نه جای دیگری).

   ---------- چرا کد در تست باید مستقل بازمحاسبه شود ----------
   اگر آزمون از همین فایل کد بسازد و همان را پس بدهد، یک باگ در `hotp` هم
   تولید را خراب می‌کند هم سنجش را سبز نگه می‌دارد. پس `tests/wstg.js` یک
   پیاده‌سازیِ مستقلِ ۱۰ خطی دارد و بردارهای رسمیِ RFC 6238 را هم می‌سنجد.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const { normalizeDigits } = require('./phone');

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const DEFAULTS = { step: 30, digits: 6, window: 1, algorithm: 'sha1' };

/* ---------- Base32 (RFC 4648) ----------
   چرا خودمان: `Buffer.toString('base64')` معادلِ Base32 ندارد و این قالب تنها
   قالبی است که اپ‌های Authenticator و `otpauth://` می‌فهمند.

   سخت‌گیریِ عمدی: نویسه‌ی نامعتبر استثنا می‌دهد، نه اینکه نادیده گرفته شود.
   کلیدِ Base32 با یک نویسه‌ی غلط یک کلیدِ *دیگر* است؛ اگر آن را بی‌صدا
   بپذیریم، مدیر کلیدش را درست می‌بیند و کدهایش هیچ‌وقت کار نمی‌کنند —
   بدترین حالت: نه خطایی، نه راهی برای فهمیدن. */
function base32Decode(input) {
  const s = String(input ?? '')
    .toUpperCase()
    .replace(/[\s\-_]/g, '')
    .replace(/=+$/, '');
  if (!s) throw new Error('کلیدِ Base32 خالی است');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`نویسهٔ نامعتبرِ Base32: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** کلیدِ تازه — ۲۰ بایت (۱۶۰ بیت) که همان طولِ پیشنهادیِ RFC 4226 است. */
function randomSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/* ---------- HOTP (RFC 4226) ----------
   «برشِ پویا»: چهار بایت از HMAC از جایی خوانده می‌شود که آخرین بایتش
   می‌گوید (offset)، و بیتِ علامت پاک می‌شود تا عددِ منفی نسازد. */
function hotp(secret, counter, { digits = DEFAULTS.digits, algorithm = DEFAULTS.algorithm } = {}) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, key).update(counterBuf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24)
    | ((mac[offset + 1] & 0xff) << 16)
    | ((mac[offset + 2] & 0xff) << 8)
    | (mac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** کدِ لحظهٔ مشخص — همان چیزی که اپِ مدیر نشان می‌دهد. */
function totp(secret, atMs = Date.now(), opts = {}) {
  const { step } = { ...DEFAULTS, ...opts };
  return hotp(secret, Math.floor(atMs / 1000 / step), opts);
}

function timingSafeEqualText(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/* ---------- بازبینیِ کد ----------
   خروجی عمداً `{ ok, step }` است و نه فقط `true/false`: پله‌ی زمانیِ برنده
   همان چیزی است که جلوی «استفادهٔ دوباره از یک کد» را می‌گیرد (lib/mfa.js).
   اگر فقط بولی برمی‌گرداند، لایهٔ بالاتر نمی‌توانست بفهمد این کد مربوط به
   کدام پنجره بوده.

   پنجرهٔ ±۱ (±۳۰ ثانیه): ساعتِ گوشیِ مدیر با سرور یکی نیست و سخت‌گیرانه‌بودن
   اینجا یعنی «کدِ درست رد می‌شود». هزینه‌اش سه کدِ زنده در هر لحظه است که
   با سقفِ پنج‌تلاش و قفلِ تکراری‌نبودن بی‌اثر می‌شود.

   ارقام فارسی/عربی و فاصله‌ها پذیرفته می‌شوند: کاربر کد را از اپ کپی می‌کند و
   ممکن است «۱۲۳ ۴۵۶» یا «۱۲۳۴۵۶» بفرستد. ولی طول باید *دقیقاً* درست باشد —
   ورودیِ کوتاه/بلند همان اول رد می‌شود، نه اینکه با `padStart` سرهم‌بندی شود. */
function verify(secret, input, opts = {}) {
  const { step, digits, window } = { ...DEFAULTS, ...opts };
  const atMs = opts.atMs ?? Date.now();
  const code = normalizeDigits(input);
  if (code.length !== digits) return { ok: false, reason: 'format' };

  let key;
  try {
    key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  } catch (e) {
    return { ok: false, reason: 'secret' };
  }

  const current = Math.floor(atMs / 1000 / step);
  let match = null;
  for (let delta = -window; delta <= window; delta++) {
    const counter = current + delta;
    if (counter < 0) continue;
    const expected = hotp(key, counter, { digits, algorithm: opts.algorithm });
    // همه‌ی کاندیدها سنجیده می‌شوند (بدونِ break) تا زمانِ پاسخ نگوید کدام
    // پله نزدیک‌تر بود. `match` بزرگ‌ترین پلهٔ برنده را نگه می‌دارد.
    if (timingSafeEqualText(expected, code) && (match === null || counter > match)) match = counter;
  }
  return match === null ? { ok: false, reason: 'mismatch' } : { ok: true, step: match };
}

/** نشانیِ `otpauth://` برای اسکن‌کردن در اپِ Authenticator (یا ورودِ دستی). */
function otpauthUri({ secret, account, issuer = 'فروشگاه پلاسکو گلی' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: String(secret),
    issuer,
    algorithm: DEFAULTS.algorithm.toUpperCase(),
    digits: String(DEFAULTS.digits),
    period: String(DEFAULTS.step),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = {
  base32Decode,
  base32Encode,
  randomSecret,
  hotp,
  totp,
  verify,
  otpauthUri,
  DEFAULTS,
};
