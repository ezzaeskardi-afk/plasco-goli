/* ============================================================
   makepng.js — ساختِ PNG معتبر با ابعادِ دلخواه، برای تست‌ها
   ------------------------------------------------------------
   چرا لازم شد؟ مسیرِ آپلود حالا ابعادِ عکس را هم می‌سنجد (کمتر از ۸۰ پیکسل
   رد، بیشتر از ۴۰۰۰ پیکسل رد). یعنی تست باید بتواند عکسی با اندازه‌ی مشخص
   بسازد. پیش از این هر دو تستِ آپلود از یک رشته‌ی base64 ثابتِ ۱×۱ استفاده
   می‌کردند؛ هم اندازه‌اش از نگاه‌کردن معلوم نبود، هم با نگهبانِ تازه رد می‌شد.

   خروجی یک PNG کاملاً درست است — سرِ دست‌کاری‌شده نیست — تا تست همان مسیری
   را برود که عکسِ واقعیِ کاربر می‌رود. zlib در خودِ نود هست، پس هیچ وابستگیِ
   تازه‌ای به پروژه اضافه نمی‌شود.

   یک جا نگه داشته شده تا اگر روزی حدِ ابعاد عوض شد، دو نسخه‌ی واگرا نداشته باشیم.

   دو سازنده دارد و تفاوتشان مهم است: `makePng` یکدست است (برای سنجشِ ابعاد و
   حجم)، `makeNoisePng` نویزی است و فشرده نمی‌شود (برای سنجشِ مسیرِ انکودر،
   جایی که باید حجمِ خروجی با حجمِ منبع مقایسه شود).
   ============================================================ */

const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** بدنه‌ی PNGِ خاکستریِ ۸بیتی را با هدر/چانک‌های درست بسته‌بندی می‌کند.
 *  جدا شد تا سازنده‌های مختلف (یکدست و نویزی) یک مسیرِ بسته‌بندی داشته باشند. */
function pngFromRaw(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // عمقِ بیت
  ihdr[9] = 0;   // خاکستریِ ساده — سبک‌ترین حالتِ ممکن
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/** یک PNG خاکستریِ یکدست به ابعادِ w×h. @returns {Buffer} */
function makePng(w, h) {
  // هر خطِ PNG یک بایتِ «نوعِ فیلتر» جلوش دارد. همه صفر ⇒ zlib خیلی کوچکش
  // می‌کند، پس حتی ۴۵۰۰×۴۵۰۰ هم چند کیلوبایت می‌شود و زیرِ سقفِ ۲ مگابایتیِ
  // آپلود می‌ماند؛ یعنی تست واقعاً نگهبانِ *ابعاد* را می‌سنجد نه نگهبانِ حجم.
  const raw = Buffer.alloc(h * (w + 1));
  return pngFromRaw(w, h, raw);
}

/**
 * یک PNGِ **نویزیِ** خاکستری به ابعادِ w×h.
 *
 * چرا جدا از `makePng`: آن یکی عمداً یکدست است و zlib آن را به چند کیلوبایت
 * می‌رساند. برای سنجیدنِ مسیرِ انکودرِ عکس این بی‌فایده است: هر انکودری روی
 * تصویرِ یکدست فایلِ *کوچک‌تری* از منبعِ چندکیلوبایتی می‌سازد یا نه، و مقایسه‌ی
 * حجم معنی ندارد. نویزِ شبه‌تصادفیِ زیر قابلِ فشرده‌سازی نیست، پس PNGِ منبع
 * واقعاً بزرگ می‌ماند — همان حالتی که «WebP کوچک‌تر است» را قابلِ سنجش می‌کند.
 *
 * عددِ شبه‌تصادفی از یک xorshiftِ بانویِ ثابت می‌آید: هر اجرا همان بایت‌ها را
 * می‌دهد، پس سنجش تصادفی نیست و در دو پای CI یک چیز را می‌سنجد.
 * @returns {Buffer}
 */
function makeNoisePng(w, h) {
  const raw = Buffer.alloc(h * (w + 1));
  let seed = 0x2545F491;
  for (let y = 0; y < h; y++) {
    const row = y * (w + 1);
    for (let x = 0; x < w; x++) {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      raw[row + 1 + x] = seed & 0xFF;
    }
  }
  return pngFromRaw(w, h, raw);
}

/**
 * یک PNG با چانک‌های فرادادهٔ آلوده: tEXt (مسیرِ فایل روی کامپیوترِ کاربر)
 * و eXIf. برای سنجیدنِ اینکه مسیرِ آپلود این‌ها را قبل از ذخیره پاک می‌کند.
 * @returns {{ bytes: Buffer, secrets: string[] }}
 */
function makePngWithMetadata(w, h) {
  const png = makePng(w, h);
  const secretPath = 'C:/Users/goli/Pictures/private/store-front.png';
  const text = pngChunk('tEXt', Buffer.concat([
    Buffer.from('Comment\0', 'latin1'), Buffer.from(secretPath, 'latin1')
  ]));
  // eXIf با یک TIFF کوچک که Make را دارد؛ همان چیزی که گوشی می‌نویسد
  const tiff = Buffer.concat([
    Buffer.from('II', 'ascii'), Buffer.from([0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]),
    Buffer.from([0x01, 0x00]),                              // ۱ ورودی
    Buffer.from([0x0F, 0x01, 0x02, 0x00, 0x07, 0x00, 0x00, 0x00, 0x1A, 0x00, 0x00, 0x00]), // Make
    Buffer.alloc(4),                                        // پایانِ IFD
    Buffer.from('Xiaomi\0', 'ascii')
  ]);
  const exif = pngChunk('eXIf', tiff);
  // قبل از IDAT تزریق می‌شود (جای معتبرِ چانک‌های کمکی)
  const at = png.indexOf(Buffer.from('IDAT', 'ascii')) - 4;
  return {
    bytes: Buffer.concat([png.subarray(0, at), text, exif, png.subarray(at)]),
    secrets: [secretPath, 'Xiaomi']
  };
}

module.exports = { makePng, makeNoisePng, makePngWithMetadata };
