/* ============================================================
   webp-negotiate.js — تحویلِ خودکارِ نسخه‌ی WebP اگر موجود و پذیرفته باشد
   ------------------------------------------------------------
   ایده در یک خط: مرورگر /picture/products/x.jpg را می‌خواهد؛ اگر
   x.webp کنارش باشد و مرورگر بگوید WebP می‌فهمم، همان را می‌گیرد.

   چرا این‌طور و نه با <picture> و srcset در HTML؟
     • عکسِ محصول در چند فایل JS ساخته می‌شود (کارت، سبد، پنل، جست‌وجو).
       هر کدام باید <picture> می‌شد و هر کدام یک جای شکستن.
     • مسیرِ عکس در دیتابیس است. اگر HTML به .webp اشاره کند، برای
       محصولی که نسخه‌ی webp ندارد کادرِ خالی می‌ماند.
     • این‌طور اگر فایل‌های .webp را پاک کنید، سایت بی‌صدا به حالتِ قبل
       برمی‌گردد. هیچ چیزی نمی‌شکند.

   نکته‌ی مهمِ کش: هدرِ Vary: Accept فرستاده می‌شود. بدونش، پروکسی یا CDN
   نسخه‌ی webp را برای مرورگرِ قدیمی هم پس می‌دهد و کاربر عکسِ خراب می‌بیند.

   ── لایه‌ی دوم: بندانگشتی (?w=320) ─────────────────────────
   بعضی جاها عکس در کادرِ خیلی کوچکی می‌نشیند که اندازه‌اش در CSS *ثابت* است:
   لیستِ پیشنهادِ جست‌وجو ۴۴px، ردیفِ سبد ۷۶px، فهرستِ کالا در پنل ۴۰px.
   تا امروز برای هر کدام همان فایلِ ۹۳۸ پیکسلی می‌رفت. یک جست‌وجوی ساده با ۶
   پیشنهاد ۳۶۶KB خرج می‌کرد برای شش مربعِ ۴۴ پیکسلی.

   حالا اگر URL پارامترِ `?w=320` داشته باشد و فایلِ `x-320w.webp` ساخته شده
   باشد، همان می‌رود. اگر ساخته نشده باشد، همین مسیرِ عادی ادامه پیدا می‌کند و
   عکسِ کامل می‌رود — یعنی نبودِ فایل هیچ چیزی را نمی‌شکند، فقط سنگین می‌ماند.

   چرا ۳۲۰؟ بزرگ‌ترینِ این کادرها ۷۶px است و روی صفحه‌ی DPR۳ سه برابر پیکسلِ
   واقعی می‌خواهد: ۲۲۸. عکس با object-fit:cover می‌نشیند، پس *ضلعِ کوچک‌ترِ*
   منبع باید ≥۲۲۸ باشد. با نسبتِ ۱٫۲۳ عکس‌های افقی، عرضِ ۳۲۰ یعنی ارتفاعِ ۲۶۰
   که با حاشیه بالای ۲۲۸ است؛ برای عکسِ عمودی هم خودِ ۳۲۰ ضلعِ کوچک است.
   یعنی هیچ‌کدام از این سه کادر تار نمی‌شود.

   عمداً فقط webp: مرورگرِ بی‌webp دقیقاً همان چیزی را می‌گیرد که امروز
   می‌گیرد، پس هیچ چیزی برایش بدتر نمی‌شود و تعدادِ فایل‌ها دو برابر نمی‌شود.
   ============================================================ */

const fs = require('fs');
const path = require('path');

// نتیجه‌ی «آیا فایلِ webp هست؟» را کش می‌کنیم. بدون کش، هر درخواستِ عکس یک
// stat روی دیسک است. با TTL کوتاه تا عکسِ تازه‌آپلودشده هم زود دیده شود.
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();   // absolutePath → { exists, at }

// عرض‌های مجاز برای ?w — فهرستِ بسته، نه هر عددی که کاربر بفرستد.
// اگر باز بود، یک نفر می‌توانست با w=1..9999 کشِ سرور و CDN را پر کند
// در حالی که هیچ‌کدام از آن فایل‌ها اصلاً وجود ندارند.
// ۳۲۰ برای کادرهای بندانگشتی، ۵۶۰ برای کارتِ محصول روی صفحه‌ی DPR۱.
const ALLOWED_WIDTHS = new Set([320, 560]);

function webpExists(absPath) {
  const now = Date.now();
  const hit = cache.get(absPath);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.exists;
  let exists = false;
  try { exists = fs.statSync(absPath).isFile(); } catch (e) { exists = false; }
  // سقفِ ساده روی حجمِ کش: پوشه‌ی عکس بی‌نهایت بزرگ نمی‌شود ولی
  // نگذاریم یک درخواستِ ساختگی با مسیرهای عجیب حافظه را باد کند.
  if (cache.size > 2000) cache.clear();
  cache.set(absPath, { exists, at: now });
  return exists;
}

/**
 * @param {string} rootDir پوشه‌ی فیزیکیِ عکس‌ها
 * @param {string} [mountAt] مسیرِ URL که این پوشه زیرش سرو می‌شود (مثل '/picture')
 */
function webpNegotiate(rootDir, mountAt = '') {
  return function (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // مسیرِ درخواست ممکن است درصدهای خراب داشته باشد (مثلاً %ZZ). آن‌وقت
    // decodeURIComponent خطا می‌دهد و چون این میدل‌ور روی مسیرِ عکس است، یک
    // درخواستِ ساده‌ی دستکاری‌شده می‌توانست جوابِ ۵۰۰ بگیرد. اینجا فقط رد می‌شویم
    // و می‌گذاریم express.static خودش تصمیم بگیرد.
    let urlPath;
    try { urlPath = decodeURIComponent(req.path || ''); } catch (e) { return next(); }
    if (!/\.(jpe?g|jfif|png)$/i.test(urlPath)) return next();

    // هر جوابی برای این مسیر به هدرِ Accept وابسته است — حتی وقتی اصل را
    // می‌فرستیم — وگرنه کشِ میانی جوابِ یک مرورگر را به آن یکی می‌دهد.
    //
    // عمداً res.vary است نه setHeader: setHeader هدرِ قبلی را پاک می‌کند و اگر
    // روزی یک لایه‌ی فشرده‌سازی جلوتر از این بنشیند و Vary: Accept-Encoding
    // گذاشته باشد، آن را می‌خوردیم و کشِ نسخه‌ی gzip خراب می‌شد. vary اضافه می‌کند.
    res.vary('Accept');

    const accept = String(req.headers.accept || '');
    if (!/image\/webp/i.test(accept)) return next();

    const relative = mountAt && urlPath.startsWith(mountAt)
      ? urlPath.slice(mountAt.length)
      : urlPath;

    // ضدِ path traversal: مسیرِ نهایی باید واقعاً زیرِ همین پوشه بماند.
    // این لایه قبل از express.static می‌نشیند، پس محافظتِ آن به ما نمی‌رسد.
    const base = path.resolve(rootDir, '.' + path.posix.normalize(relative));
    const rootResolved = path.resolve(rootDir) + path.sep;
    if (!base.startsWith(rootResolved)) return next();

    const full = base.replace(/\.(jpe?g|jfif|png)$/i, '.webp');

    // اگر کادرِ مقصد کوچک است و نسخه‌ی کم‌عرضش ساخته شده، همان می‌رود.
    // ترتیب مهم است: اول کوچک، بعد کامل. اگر کوچک نبود بی‌صدا می‌افتیم روی کامل.
    const wantW = Number(req.query && req.query.w);
    let target = null;
    if (ALLOWED_WIDTHS.has(wantW)) {
      const small = base.replace(/\.(jpe?g|jfif|png)$/i, `-${wantW}w.webp`);
      if (webpExists(small)) target = small;
    }
    if (!target && webpExists(full)) target = full;
    if (!target) return next();

    res.setHeader('Content-Type', 'image/webp');
    // همان سیاستِ کشِ عکس‌های اصلی؛ اگر اینجا فرق کند، نسخه‌ی webp و jpg
    // با دو عمرِ مختلف کش می‌شوند و رفتار غیرقابلِ‌پیش‌بینی می‌شود.
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.sendFile(target, (err) => {
      // اگر فایل همین لحظه پاک شد یا خواندنش نشد، برگرد سرِ مسیرِ عادی
      if (err && !res.headersSent) next();
    });
  };
}

module.exports = { webpNegotiate, _cache: cache };
