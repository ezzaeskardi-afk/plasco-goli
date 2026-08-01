/* ============================================================
   image-clean.js — پاک‌کردنِ اطلاعاتِ پنهانِ داخلِ عکس، قبل از ذخیره
   ------------------------------------------------------------
   مسئله‌ای که این فایل حل می‌کند:

   عکسی که با گوشی از یک کالا گرفته می‌شود، فقط تصویر نیست. کنارِ
   پیکسل‌ها یک بسته‌ی اطلاعاتی به نام EXIF هم نوشته می‌شود که معمولاً
   شامل این‌هاست: مختصات دقیق GPS محلِ عکس‌برداری، تاریخ و ساعت، مدل
   گوشی، شماره‌سریال دوربین، و گاهی نامِ صاحبِ دستگاه.

   یعنی اگر صاحب مغازه داخل مغازه از کالا عکس بگیرد و همان فایل روی
   سایت برود، هر کسی با یک ابزار رایگان می‌تواند مختصاتِ مغازه را از
   دلِ عکسِ یک سطلِ پلاستیکی دربیاورد. این اطلاعات هیچ‌وقت عمداً منتشر
   نشده — فقط کسی آن را پاک نکرده.

   چرا خودمان می‌نویسیم و از کتابخانه استفاده نمی‌کنیم:
   کتابخانه‌های پردازشِ تصویر (مثل sharp) باینریِ نیتیو دارند، حجمشان
   ده‌ها مگابایت است و روی هاست اشتراکی نصبشان دردسر است. کارِ ما هم
   پردازشِ تصویر نیست — فقط برداشتنِ چند بلوکِ مشخص است. پیکسل‌ها اصلاً
   لمس نمی‌شوند، پس نه کیفیت کم می‌شود نه دوباره فشرده‌سازی رخ می‌دهد.

   رویکردِ محافظه‌کارانه: اگر ساختارِ فایل چیزی بود که کامل نمی‌فهمیم،
   دست نمی‌زنیم و همان اصل را برمی‌گردانیم. «شاید خرابش کنم» بدتر از
   «شاید یک بایتِ اضافه بماند» است — چون فایلِ خراب یعنی عکسِ نمایش‌داده‌نشده
   روی سایت، و آن را مشتری می‌بیند.
   ============================================================ */
'use strict';

// ---------- JPEG ----------
// ساختار: 0xFFD8 و بعد زنجیره‌ای از «سگمنت»ها. هر سگمنت با 0xFF و یک
// نشانگر شروع می‌شود و دو بایتِ بعدی طولش را می‌گوید. کافی است سگمنت‌های
// فراداده را رد کنیم و بقیه را عیناً بنویسیم.
//
// چه چیزهایی حذف می‌شوند:
//   APP1 (0xE1) → EXIF و XMP؛ همان‌جایی که GPS می‌نشیند
//   APP2..APPF  → پروفایل‌های سازنده، داده‌ی نرم‌افزارها، Ducky و مشابه
//   COM  (0xFE) → کامنتِ متنی
//
// APP0 (JFIF) عمداً می‌ماند: چگالیِ تصویر را دارد و بعضی نمایشگرهای قدیمی
// بدونش عکس را کج نشان می‌دهند. چیزی هم لو نمی‌دهد.
//
// نکته‌ی مهمِ چرخش: EXIF فیلدی به نام Orientation دارد که می‌گوید «این عکس
// را ۹۰ درجه چرخانده نشان بده». با حذفِ EXIF، عکسی که گوشی عمودی گرفته
// ممکن است خوابیده دیده شود. برای همین اگر Orientation چیزی جز حالتِ عادی
// بود، اصلِ فایل دست‌نخورده برمی‌گردد: عکسِ چرخیده روی سایت، بدتر از
// نگه‌داشتنِ EXIF است. مدیر می‌تواند عکس را درست‌کرده دوباره بفرستد.
const JPEG_KEEP_APP0 = 0xE0;

function readOrientation(buf) {
  // فقط دنبالِ APP1 با نشانِ "Exif\0\0" می‌گردیم و داخلش تگ 0x0112 را
  // می‌خوانیم. TIFF داخلِ EXIF می‌تواند little یا big endian باشد.
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xFF) return 1;
    const marker = buf[i + 1];
    if (marker === 0xDA || marker === 0xD9) return 1; // شروعِ داده‌ی تصویر
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return 1;
    if (marker === 0xE1 && buf.toString('ascii', i + 4, i + 10) === 'Exif\0\0') {
      const t = i + 10;                       // شروعِ هدرِ TIFF
      if (t + 8 > buf.length) return 1;
      const le = buf.toString('ascii', t, t + 2) === 'II';
      const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
      const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
      const ifd = t + u32(t + 4);
      if (ifd + 2 > buf.length) return 1;
      const n = u16(ifd);
      for (let e = 0; e < n; e++) {
        const off = ifd + 2 + e * 12;
        if (off + 12 > buf.length) return 1;
        if (u16(off) === 0x0112) return u16(off + 8) || 1;
      }
      return 1;
    }
    i += 2 + len;
  }
  return 1;
}

function cleanJpeg(buf) {
  if (readOrientation(buf) !== 1) return buf;   // چرخش دارد؛ دست نمی‌زنیم

  const out = [buf.subarray(0, 2)];             // SOI
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xFF) return buf;            // ساختار غیرمنتظره
    const marker = buf[i + 1];
    // از SOS به بعد داده‌ی فشرده‌ی تصویر است و سگمنت‌بندی ندارد
    if (marker === 0xDA) { out.push(buf.subarray(i)); break; }
    if (marker === 0xD9) { out.push(buf.subarray(i)); break; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf;
    const isApp = marker >= 0xE0 && marker <= 0xEF;
    const drop = (isApp && marker !== JPEG_KEEP_APP0) || marker === 0xFE;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  const res = Buffer.concat(out);
  // شبکه‌ی ایمنی: خروجی باید هنوز JPEG معتبر به نظر برسد
  return (res.length > 4 && res[0] === 0xFF && res[1] === 0xD8) ? res : buf;
}

// ---------- PNG ----------
// ساختار: امضای ۸ بایتی و بعد زنجیره‌ی «چانک». هر چانک = طول(۴) + نوع(۴)
// + داده + CRC(۴). چون طول و CRC داخلِ خودِ چانک است، حذفِ یک چانکِ کامل
// هیچ‌چیزِ دیگری را خراب نمی‌کند.
//
// چانک‌های حذف‌شده: eXIf (همان EXIF)، tEXt/zTXt/iTXt (متنِ آزاد؛ خیلی از
// نرم‌افزارها مسیرِ کاملِ فایل روی کامپیوتر را اینجا می‌نویسند)، tIME.
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function cleanPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (len > buf.length || end > buf.length) return buf;   // خراب؛ دست نزن
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  const res = Buffer.concat(out);
  return res.length > 8 ? res : buf;
}

// ---------- WebP ----------
// ساختار RIFF: "RIFF" + طولِ کل + "WEBP" + زنجیره‌ی چانک. چانک‌ها به
// مرزِ زوج پد می‌شوند و طولِ کل در هدر باید بعد از حذف بازنویسی شود —
// وگرنه فایل خراب می‌شود.
const WEBP_DROP = new Set(['EXIF', 'XMP ']);

function cleanWebp(buf) {
  if (buf.length < 12) return buf;
  const parts = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const padded = len + (len % 2);
    const end = i + 8 + padded;
    if (len > buf.length || end > buf.length) return buf;
    if (!WEBP_DROP.has(type)) parts.push(buf.subarray(i, end));
    i = end;
  }
  if (!parts.length) return buf;
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length + 4, 4);       // طول = "WEBP" + بدنه
  head.write('WEBP', 8, 'ascii');
  return Buffer.concat([head, body]);
}

/**
 * فرادادهٔ عکس را پاک می‌کند. پیکسل‌ها دست‌نخورده می‌مانند.
 * اگر فرمت ناشناخته بود یا ساختار غیرمنتظره، همان بافرِ ورودی برمی‌گردد.
 * @param {Buffer} buf
 * @param {'.jpg'|'.png'|'.webp'} ext
 * @returns {{ buf: Buffer, removed: number }} removed = بایتِ حذف‌شده
 */
function stripImageMetadata(buf, ext) {
  let out;
  try {
    if (ext === '.jpg') out = cleanJpeg(buf);
    else if (ext === '.png') out = cleanPng(buf);
    else if (ext === '.webp') out = cleanWebp(buf);
    else out = buf;
  } catch (e) {
    // هر خطایی یعنی فرضی از ساختارِ فایل غلط بوده. عکسِ اصلی سالم است و
    // همان می‌رود روی دیسک؛ نبودِ این پاکسازی نباید آپلود را بشکند.
    out = buf;
  }
  // اگر نتیجه بزرگ‌تر شد یا خالی، یعنی جایی اشتباه کرده‌ایم
  if (!out || !out.length || out.length > buf.length) out = buf;
  return { buf: out, removed: buf.length - out.length };
}

module.exports = { stripImageMetadata };
