/* ============================================================
   imagesize.js — خواندن ابعاد واقعیِ عکس از خودِ فایل، بدون هیچ پکیج
   ------------------------------------------------------------
   چرا لازم است؟ دو دلیلِ کاملاً عملی:

   ۱) اگر <img> عرض و ارتفاع نداشته باشد، مرورگر تا لحظه‌ی رسیدنِ عکس
      نمی‌داند چقدر جا بگیرد؛ صفحه بعدِ لود «می‌پرد». گوگل همین پرش را
      با نامِ CLS اندازه می‌گیرد و در رتبه‌بندی حساب می‌کند. برای نوشتنِ
      عرض/ارتفاع باید ابعاد را بدانیم.

   ۲) موقعِ آپلود باید بشود جلوی عکسِ ۶۰۰۰ پیکسلی را گرفت. چنین فایلی
      روی موبایلِ مشتری چند مگابایت دانلود و چند ثانیه رمزگشایی می‌خواهد،
      در حالی که در کارت محصول ۳۰۰ پیکسل دیده می‌شود.

   کتابخانه نصب نمی‌کنیم چون کلِ کارِ لازم خواندنِ چند بایتِ اولِ فایل است
   و پروژه عمداً فقط سه وابستگی دارد.
   ============================================================ */

const fs = require('fs');

// ---------- JPEG ----------
// ساختار JPEG زنجیره‌ای از «قطعه»هاست: 0xFF بعد نوعِ قطعه بعد طولِ دو بایتی.
// ابعاد داخل قطعه‌های SOF (Start Of Frame) است: 0xC0 تا 0xCF، منهای
// 0xC4/0xC8/0xCC که جدولِ هافمن‌اند نه فریم.
function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }          // بایتِ پرکننده — رد شو
    const marker = buf[i + 1];
    if (marker === 0xFF) { i++; continue; }
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    const isSOF = marker >= 0xC0 && marker <= 0xCF &&
      marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
    if (isSOF) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), type: 'jpeg' };
    }
    i += 2 + len;
  }
  return null;
}

// ---------- PNG ----------
// امضای ۸ بایتی، بعد قطعه‌ی IHDR که همیشه اول است: عرض و ارتفاع ۴ بایتی.
function pngSize(buf) {
  if (buf.length < 24) return null;
  if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
}

// ---------- GIF ----------
function gifSize(buf) {
  if (buf.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' };
}

// ---------- WebP ----------
// سه گونه دارد و هر سه جای ابعاد را جای دیگری گذاشته‌اند:
//   VP8  (باخت‌دار)   → دو عدد ۱۴ بیتی بعد از امضای 0x9D012A
//   VP8L (بی‌باخت)    → ۲۸ بیت فشرده: ۱۴ بیت عرض−۱ و ۱۴ بیت ارتفاع−۱
//   VP8X (توسعه‌یافته) → دو عدد ۲۴ بیتیِ little-endian، هر کدام منهای یک
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    if (buf.length < 30) return null;
    return {
      width: buf.readUInt16LE(26) & 0x3FFF,
      height: buf.readUInt16LE(28) & 0x3FFF,
      type: 'webp'
    };
  }
  if (kind === 'VP8L') {
    if (buf.length < 25) return null;
    const bits = buf.readUInt32LE(21);
    return {
      width: (bits & 0x3FFF) + 1,
      height: ((bits >> 14) & 0x3FFF) + 1,
      type: 'webp'
    };
  }
  if (kind === 'VP8X') {
    if (buf.length < 30) return null;
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { width: w + 1, height: h + 1, type: 'webp' };
  }
  return null;
}

/** ابعادِ عکس از یک Buffer. اگر نشناسد null می‌دهد (هیچ‌وقت throw نمی‌کند). */
function imageSizeFromBuffer(buf) {
  if (!buf || buf.length < 16) return null;
  try {
    return jpegSize(buf) || pngSize(buf) || webpSize(buf) || gifSize(buf);
  } catch (e) {
    // فایلِ بریده یا دست‌کاری‌شده نباید سرور را بیندازد
    return null;
  }
}

/** همان، ولی از مسیرِ فایل. فقط ۶۴ کیلوبایتِ اول خوانده می‌شود — ابعاد همیشه
 *  در سرِ فایل است و خواندنِ کاملِ یک عکسِ چندمگابایتی بی‌دلیل است. */
function imageSizeFromFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    return imageSizeFromBuffer(buf.subarray(0, read));
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* بسته‌شده */ }
  }
}

module.exports = { imageSizeFromBuffer, imageSizeFromFile };
