// static-compress.js — فشرده‌سازی فایل‌های متنی (CSS/JS/SVG/HTML) قبل از ارسال
//
// چرا: style.css حدود ۶۵ کیلوبایت است و با gzip به ~۱۴ کیلوبایت می‌رسد؛ یعنی
// صفحه‌ی اول روی اینترنت موبایل چند برابر سریع‌تر باز می‌شود.
//
// چطور: نتیجه‌ی فشرده‌سازی هر فایل در حافظه کش می‌شود و کلید کش «زمان آخرین
// تغییر فایل» است. پس اگر شما style.css را ویرایش کنید، همان درخواست بعدی
// نسخه‌ی تازه را می‌بیند — نیازی به ری‌استارت یا مرحله‌ی build نیست.
//
// بدون هیچ پکیج اضافه‌ای؛ فقط zlib خودِ Node.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// فقط فایل‌های متنی. عکس‌ها و woff2 خودشان از قبل فشرده‌اند و دوباره‌فشردن
// هم CPU می‌سوزاند هم گاهی حجم را بیشتر می‌کند.
const TEXT_EXT = /\.(css|js|mjs|svg|json|xml|txt|map|html)$/i;

// زیر یک کیلوبایت ارزش سربار فشرده‌سازی را ندارد
const MIN_SIZE = 1024;

const cache = new Map(); // `${file}|${encoding}` → { mtimeMs, size, buf }

function compressBuffer(buf, encoding) {
  return encoding === 'br'
    ? zlib.brotliCompressSync(buf, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 6, // تعادل خوب بین سرعت و حجم
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length
        }
      })
    : zlib.gzipSync(buf, { level: 6 });
}

function pickEncoding(header = '') {
  const h = String(header).toLowerCase();
  if (/\bbr\b/.test(h)) return 'br';
  if (/\bgzip\b/.test(h)) return 'gzip';
  return null;
}

// سیاست کش — باید *دقیقاً* همان چیزی باشد که express.static در server.js می‌دهد.
// چرا مهم است: این میان‌افزار قبل از express.static می‌نشیند، پس هر CSS/JS از
// همین‌جا جواب می‌گیرد و هدر express.static هیچ‌وقت اجرا نمی‌شود. قبلاً اینجا
// یک ساعت نوشته شده بود، یعنی سیاست «یک ماه + immutable» در عمل هرگز اعمال
// نمی‌شد و مشتریِ برگشته هر ساعت دوباره style.css و همه‌ی JSها را می‌گرفت.
function cachePolicy(pathname) {
  const p = pathname.toLowerCase();
  if (p.endsWith('.html')) return 'no-cache';
  // سرویس‌ورکر و manifest هرگز نباید بلندمدت کش شوند: اگر sw.js کهنه بماند،
  // مشتری تا مدت‌ها با نسخه‌ی قدیمی منطق کش گیر می‌کند و راه بیرون آمدن ندارد.
  if (p === '/sw.js' || p.endsWith('manifest.json') || p.endsWith('manifest.webmanifest')) {
    return 'no-cache';
  }
  // icons.svg و favicon.svg بدون ?v= لود می‌شوند. قبلاً no-cache بودند یعنی هر
  // بار جابه‌جایی بین صفحه‌ها یک ۳۰۴ بیهوده انجام می‌شد (حدود ۵۰–۸۰ میلی‌ثانیه).
  // حالا ۵ دقیقه کش می‌شوند — سرویس‌ورکر با cache:'reload' روی install همان
  // لحظه‌ی دیپلوی نسخه‌ی تازه را می‌گیرد، پس کاربر قدیمی نهایتاً ۵ دقیقه بعد از
  // دیپلوی آیکونِ تازه را می‌بیند. در عمل خیلی زودتر چون SW ماشه‌اش update است.
  if (p === '/assets/icons.svg' || p === '/assets/favicon.svg') {
    return 'public, max-age=300';
  }
  // این‌ها با ?v= نسخه‌بندی می‌شوند (یا نامشان تصادفی است) پس امن است
  if (/\.(css|js|mjs|woff2?|svg|map)$/.test(p)) return 'public, max-age=2592000, immutable';
  return 'public, max-age=604800'; // ۷ روز — مثل maxAge خودِ express.static
}

function staticCompress(rootDir) {
  const root = path.resolve(rootDir);

  return function compressMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch (e) { return next(); }
    if (!TEXT_EXT.test(pathname)) return next();

    const encoding = pickEncoding(req.headers['accept-encoding']);
    if (!encoding) return next();

    // جلوگیری از path traversal (مثل /../../etc/passwd)
    const full = path.resolve(root, '.' + pathname);
    if (full !== root && !full.startsWith(root + path.sep)) return next();

    let st;
    try { st = fs.statSync(full); } catch (e) { return next(); } // فایل نیست → بگذار static یا 404 کارش را بکند
    if (!st.isFile() || st.size < MIN_SIZE) return next();

    const key = `${full}|${encoding}`;
    let hit = cache.get(key);
    if (!hit || hit.mtimeMs !== st.mtimeMs || hit.size !== st.size) {
      try {
        hit = { mtimeMs: st.mtimeMs, size: st.size, buf: compressBuffer(fs.readFileSync(full), encoding) };
      } catch (e) {
        return next(); // هر مشکلی پیش آمد، مسیر عادی و بدون فشرده‌سازی
      }
      cache.set(key, hit);
    }

    const etag = `W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}-${encoding}"`;

    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', new Date(st.mtimeMs).toUTCString());
    res.setHeader('Cache-Control', cachePolicy(pathname));

    // مرورگر همین نسخه را دارد؟ پس بدنه نفرست
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(/,\s*/).includes(etag)) {
      return res.status(304).end();
    }

    res.type(path.extname(pathname)); // Content-Type درست
    res.setHeader('Content-Encoding', encoding);
    res.setHeader('Content-Length', hit.buf.length);

    if (req.method === 'HEAD') return res.end();
    res.end(hit.buf);
  };
}

// ---------------------------------------------------------------
// ارسال HTMLِ ساخته‌شده در حافظه (صفحه‌ی اصلی و صفحه‌ی محصول که متاهای سئو
// در آن‌ها سمت سرور تزریق می‌شود) — با فشرده‌سازی.
//
// چرا لازم شد: آن صفحه‌ها با res.send() از مسیر express.static رد نمی‌شوند، پس
// میان‌افزار staticCompress هیچ‌وقت به آن‌ها نمی‌رسید و index.html با حجم کامل
// ۳۱ کیلوبایت فرستاده می‌شد — درست همان صفحه‌ای که اولین برخورد مشتری است.
//
// نتیجه در حافظه کش می‌شود؛ کلید کش از خودِ محتوا ساخته می‌شود، پس اگر HTML
// عوض شود (مثلاً دامنه‌ی دیگری در متاها تزریق شود) خودکار دوباره فشرده می‌شود.
const htmlCache = new Map();
const HTML_CACHE_MAX = 24; // چند صفحه × چند دامنه × دو انکدینگ

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function sendHtml(req, res, html) {
  res.type('html');
  const encoding = pickEncoding(req.headers['accept-encoding']);
  const buf0 = Buffer.from(html, 'utf8');
  if (!encoding || buf0.length < MIN_SIZE) return res.end(buf0);

  const key = `${encoding}|${buf0.length}|${hash32(html)}`;
  let buf = htmlCache.get(key);
  if (!buf) {
    try { buf = compressBuffer(buf0, encoding); } catch (e) { return res.end(buf0); }
    // ساده‌ترین سیاست بیرون‌اندازی: قدیمی‌ترین کلید. تعداد کلیدها طبیعتاً
    // کوچک است، پس چیز پیچیده‌تری لازم نیست.
    if (htmlCache.size >= HTML_CACHE_MAX) htmlCache.delete(htmlCache.keys().next().value);
    htmlCache.set(key, buf);
  }
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Encoding', encoding);
  res.setHeader('Content-Length', buf.length);
  if (req.method === 'HEAD') return res.end();
  res.end(buf);
}

// ---------------------------------------------------------------
// کشِ بایتِ فشرده‌شده‌ی پاسخ‌های JSON
//
// چرا لازم شد: پاسخِ فهرستِ محصولات برای همه‌ی بازدیدکننده‌ها بایت‌به‌بایت
// یکسان است، ولی تا امروز برای هر درخواست از نو JSON.stringify و بعد brotli
// می‌شد. با ۱۰۰ محصول این ۰٫۶۵ میلی‌ثانیه است — و چون موتورِ ما همگام است،
// آن ۰٫۶۵ میلی‌ثانیه *کلِ سایت* را قفل می‌کند، نه فقط همان درخواست.
// اندازه‌گیری: stringify ۰٫۰۸ms + brotli q6 ۰٫۶۱ms روی ۵۰ کیلوبایت.
// با ۵۰۰ محصول می‌شود ~۳ms و با ۱۰۰۰ محصول ~۶٫۵ms در هر درخواست.
//
// کلیدِ کش عمداً **ETag** است، نه آدرس. دلیلش این است که ETag را خودِ روت از
// امضای کاتالوگ می‌سازد؛ پس تا لحظه‌ای که کاتالوگ عوض نشده، این بایت‌ها معتبرند
// و لحظه‌ای که عوض شد، کلید خودبه‌خود عوض می‌شود. هیچ باطل‌سازیِ دستی لازم نیست.
//
// این حرف تا وقتی درست است که امضا **واقعاً** با هر تغییر عوض شود. سرِ همین کش
// فهمیدم که نمی‌شد: امضا از MAX(updated_at) می‌آمد و دقتش یک ثانیه بود، پس دو
// ویرایش در یک ثانیه یک امضا می‌دادند و ویرایشِ دوم گم می‌شد. آن باگ از قبل
// وجود داشت و روی کشِ لیست و ETagِ مرورگر هم اثر داشت؛ با شمارنده‌ی catalog_rev
// در db.js بسته شد. اگر روزی این کش داده‌ی کهنه داد، اول همان شمارنده را
// نگاه کن — کش خودش حافظه‌ی مستقلی از امضا ندارد.
//
// ---------- دو شرطِ کش‌شدن (هر دو باید برقرار باشند) ----------
//
// ۱) پاسخ ETag داشته باشد — یعنی روت آگاهانه گفته «این پاسخ تابعِ کاتالوگ است».
//
// ۲) Cache-Control شامل `public` باشد و no-store/private نباشد.
//
// **شرطِ ۲ است که امنیت را تضمین می‌کند، نه شرطِ ۱.** این را با تست ثابت کردم،
// چون یک بار برعکسش را باور کرده بودم: نوشته بودم «هر ETagی که اینجا می‌بینیم
// لزوماً از etagJson آمده، چون ETagِ خودکارِ Express در res.send ساخته می‌شود که
// بعد از ما اجرا می‌شود». آن جمله در عمل درست است ولی *تکیه‌کردن* بر آن اشتباه
// بود: یک جزئیاتِ پیاده‌سازیِ Express است که با نسخه‌ی بعدی یا یک میان‌افزارِ
// واسط می‌تواند عوض شود. پس شرطِ ۲ را طوری نوشتم که حتی اگر شرطِ ۱ روزی
// بی‌معنا شد، پاسخِ شخصی باز هم رد شود — و همین را با پاسخِ جعلیِ
// «no-store + ETag» و «private + ETag» آزمودم: هر دو رد می‌شوند.
//
// (اگر پاسخی هم ETag داشته باشد و هم `public` باشد ولی واقعاً شخصی باشد، آن باگ
// از کشِ من مستقل است — هر پروکسی و CDNی هم همان را کش می‌کرد. یعنی این کش
// هیچ‌وقت از قواعدِ خودِ HTTP فراتر نمی‌رود؛ همان تضمین، در حافظه.)
//
// مسیرهای شخصی (سبد، حساب، پنل) با no-store پاسخ می‌دهند — server.js آن را برای
// کلِ /api پیش‌فرض گذاشته — پس از شرطِ ۲ رد می‌شوند.
//
// نکته‌ی جانبی برای آینده: پاسخِ بزرگ‌ترِ از MIN_SIZE از res.end رد می‌شود نه
// res.send، پس ETagِ خودکارِ Express را *نمی‌گیرد*. برای مسیرهای عمومی مهم نیست
// (خودشان با etagJson ETag دارند) و برای no-store هم ETag به‌کار نمی‌آید. رفتارِ
// قبلیِ همین فایل است و تغییرش ندادم؛ فقط اگر روزی کسی دنبالِ ETagِ گم‌شده گشت،
// جوابش اینجاست.
const jsonCache = new Map(); // `${etag}|${encoding}` → Buffer
let jsonCacheBytes = 0;

// سقف بر مبنای *بایت* است نه تعداد، چون حجمِ هر پاسخ با رشدِ کاتالوگ بالا می‌رود:
// همین حالا فهرستِ کامل ۶٫۶KB فشرده است، با ۱۰۰۰ محصول ~۶۶KB می‌شود. سقفِ
// «۱۲۰ ورودی» آن روز بی‌سروصدا تبدیل به ۸ مگابایت می‌شد. دو کدگذاری (br و gzip)
// هم برای یک محتوا دو ورودی می‌سازند و همین سقف خودش حسابشان را دارد.
const JSON_CACHE_MAX_BYTES = 4 * 1024 * 1024;

function cacheableJson(res) {
  if (!res.getHeader('ETag')) return false;
  const cc = String(res.getHeader('Cache-Control') || '');
  return cc.includes('public') && !/no-store|private/.test(cc);
}

function cachedCompress(cacheKey, text, encoding) {
  if (!cacheKey) return compressBuffer(Buffer.from(text), encoding);
  const hit = jsonCache.get(cacheKey);
  if (hit) return hit;
  const buf = compressBuffer(Buffer.from(text), encoding);
  // قدیمی‌ترین‌ها می‌روند تا زیر سقف برگردیم. Map ترتیبِ درج را نگه می‌دارد.
  jsonCache.set(cacheKey, buf);
  jsonCacheBytes += buf.length;
  while (jsonCacheBytes > JSON_CACHE_MAX_BYTES && jsonCache.size > 1) {
    const oldest = jsonCache.keys().next().value;
    jsonCacheBytes -= jsonCache.get(oldest).length;
    jsonCache.delete(oldest);
  }
  return buf;
}

// برای تست: می‌خواهیم بشود ثابت کرد که بارِ دوم واقعاً از کش آمده.
const jsonCacheStats = () => ({ entries: jsonCache.size, bytes: jsonCacheBytes });

// فشرده‌سازی پاسخ‌های JSON (مثل لیست محصولات که با رشد فروشگاه بزرگ می‌شود).
// روی res.json سوار می‌شود و اگر بدنه به‌قدر کافی بزرگ بود، gzip/br می‌فرستد.
function compressJson(req, res, next) {
  const encoding = pickEncoding(req.headers['accept-encoding']);
  if (!encoding) return next();

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    let text;
    try { text = JSON.stringify(body); } catch (e) { return originalJson(body); }
    if (!text || Buffer.byteLength(text) < MIN_SIZE) return originalJson(body);

    // ETag و Cache-Control را روت قبل از res.json ست کرده (etagJson).
    const etag = res.getHeader('ETag');
    const cacheKey = cacheableJson(res) ? `${etag}|${encoding}` : '';

    let buf;
    try { buf = cachedCompress(cacheKey, text, encoding); } catch (e) { return originalJson(body); }

    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Encoding', encoding);
    res.setHeader('Content-Length', buf.length);
    return res.end(buf);
  };
  next();
}

module.exports = { staticCompress, compressJson, sendHtml, jsonCacheStats };
