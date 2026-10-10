// static-compress.js — فشرده‌سازی فایل‌های متنی (CSS/JS/SVG/HTML) قبل از ارسال
//
// چرا: style.css امروز حدود ۱۷۰ کیلوبایت است و با brotli به ~۳۶ کیلوبایت
// می‌رسد (سنجشِ زندهٔ همین ماشین)؛ یعنی صفحه‌ی اول روی اینترنت موبایل چند
// برابر سریع‌تر باز می‌شود.
//
// چطور: نتیجه‌ی فشرده‌سازی هر فایل در حافظه کش می‌شود و اعتبارِ کش با
// **اثرِ انگشتِ محتوا** سنجیده می‌شود، نه با (mtime، size). پس اگر شما
// style.css را ویرایش کنید، همان درخواست بعدی نسخه‌ی تازه را می‌بیند —
// نیازی به ری‌استارت یا مرحله‌ی build نیست.
//
// چرا محتوا و نه mtime: کلیدِ قبلی `(mtimeMs, size)` بود و یک تغییرِ بایتی
// که mtime و اندازه را دست نمی‌زد (restore از بکاپ با حفظِ timestamp، کپی با
// `cp -p`، یا ادیتی که در همان میلی‌ثانیه بنشیند) **بی‌صدا** بدنه‌ی کهنه را
// تا ابد زنده نگه می‌داشت؛ سرور ۲۰۰ می‌داد ولی بایت‌ها مالِ قبل بودند. این را
// سنجشِ زنده گرفت (بدنه با دیسک یکی نبود، با آن‌که اندازه به‌ظاهر برابر بود؛
// امروز نگهبانِ همان درس `tests/static-compress-cache.js` است).
// حالا برای هر درخواست فایل خوانده و
// ۶۴ بیتِ اولِ sha1‌اش حساب می‌شود؛ اندازه‌گیریِ همین ماشین: خواندن + هشِ
// style.css (~۱۷۰KB) حدود ۰٫۱۵ms، در برابر ~۳٫۸ms فشرده‌سازیِ brotli q6
// (و ~۲٫۷ms برای gzip) که همچنان کش‌شده می‌ماند.
//
// بدون هیچ پکیج اضافه‌ای؛ فقط zlib و crypto خودِ Node.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// فقط فایل‌های متنی. عکس‌ها و woff2 خودشان از قبل فشرده‌اند و دوباره‌فشردن
// هم CPU می‌سوزاند هم گاهی حجم را بیشتر می‌کند.
const TEXT_EXT = /\.(css|js|mjs|svg|json|xml|txt|map|html)$/i;

// زیر یک کیلوبایت ارزش سربار فشرده‌سازی را ندارد
const MIN_SIZE = 1024;

// `${file}|${encoding}` → { hash, buf } — `hash` اثرِ انگشتِ محتوایی است که
// `buf` از آن ساخته شده؛ همین است که «تازه است یا نه» را تعیین می‌کند.
const cache = new Map();

// ۶۴ بیتِ اولِ sha1 برای هویتِ محتوای یک فایلِ استاتیک بیش از کافی است
// (تصادمِ تصادفی در این مقیاس عملاً ناممکن است) و هم‌زمان ETag را کوتاه نگه
// می‌دارد. خودِ sha1 را موتورِ native حساب می‌کند، پس هزینه‌اش چشمگیر نیست.
function contentHash(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
}

// شمارنده‌های تست: ثابت می‌کنند بارِ دومِ همان محتوا واقعاً از کش می‌آید
// (یعنی رفعِ باگ، کش را بی‌اثر نکرده) و تغییرِ بایت واقعاً یک بارِ فشرده‌سازیِ
// تازه هزینه می‌دهد.
let fileHits = 0;
let fileMisses = 0;
const fileCacheStats = () => ({ entries: cache.size, hits: fileHits, misses: fileMisses });

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

    // محتوا خوانده می‌شود، نه فقط stat: (mtime، size) می‌تواند با تغییرِ بایت
    // ثابت بماند و آن‌وقت کش بدنه‌ی کهنه را بی‌صدا سرو می‌کند. mtime فقط برای
    // هدرِ Last-Modified می‌ماند و ستونِ اعتبارِ کش نیست.
    //
    // هزینه‌ی این خواندن+هش (اندازه‌گیری‌شده: ~۰٫۱۵ms برای ~۱۷۰KB) در برابر
    // فشرده‌سازیِ ~۳٫۸ms ای که کش می‌شود عملاً هیچ است؛ سرِ همین معامله است
    // که «کشِ سریع ولی دروغین» به «کشِ درست» تبدیل می‌شود.
    let raw;
    try { raw = fs.readFileSync(full); } catch (e) { return next(); }
    if (raw.length < MIN_SIZE) return next();

    const key = `${full}|${encoding}`;
    const hash = contentHash(raw);
    let hit = cache.get(key);
    if (!hit || hit.hash !== hash) {
      fileMisses++;
      try {
        hit = { hash, buf: compressBuffer(raw, encoding) };
      } catch (e) {
        return next(); // هر مشکلی پیش آمد، مسیر عادی و بدون فشرده‌سازی
      }
      cache.set(key, hit);
    } else {
      fileHits++;
    }

    // ETag هم از محتوا ساخته می‌شود، نه از (اندازه، mtime). اگر نسخه‌ی قبلی
    // ETag را از mtime می‌گرفت، مرورگری که «همان» ETag را داشت ۳۰۴ می‌گرفت و
    // بدنه‌ی کهنه‌اش را نگه می‌داشت — یعنی باگ حتی پس از رفعِ کشِ سرور هم از
    // سمت مرورگر برمی‌گشت. حالا تغییرِ بایت = ETagِ تازه = بدنه‌ی تازه.
    const etag = `W/"${hash}-${encoding}"`;

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
//
// ---------- هویتِ کش: همان ۶۴ بیتِ محتوا، نه یک هشِ ۳۲ بیتی ----------
//
// کلیدِ قبلی `${encoding}|${buf0.length}|${hash32(html)}` بود، با یک FNV-1a
// ۳۲ بیتی. باگ «۳۲ بیت کم است» نبود؛ باگ این بود که *خودِ هش* بخشی از هویتِ
// کش بود، پس هر تصادمِ ۳۲ بیتی یعنی دو سندِ متفاوتِ هم‌اندازه **یک کلید**
// می‌گرفتند و کش بی‌سروصدا بدنه‌ی سندِ اول را برای سندِ دوم می‌فرستاد: ۲۰۰،
// `Content-Length` درست، بایت‌ها مالِ صفحه‌ی دیگری. یعنی سندِ جابه‌جا‌شده سرو
// می‌شد — همان دسته‌باگی که در کشِ فایل‌های استاتیک با `(mtime، size)` داشتیم،
// این‌بار از سمتِ اثرِ انگشت. طول هم در کلید بود، ولی دقیقاً همان طولِ برابر
// شرطِ وقوعِ تصادم است؛ پس هیچ محافظتی نمی‌کرد و برداشتنش چیزی را ضعیف نکرد.
//
// و «تصادمِ ۳۲ بیتی» آن‌قدر هم که به‌نظر می‌رسد دور نبود: FNV-1a روی
// ورودی‌های *هم‌تعداد-واحدِ کد* یک‌به‌یک است (هر گام XOR و ضرب در عددی فرد،
// پس برگشت‌پذیر)، ولی کلید طولِ **بایتِ UTF-8** را می‌سنجید و هش روی
// **واحدهای کدِ UTF-16** می‌گشت. همین ناهم‌خوانیِ واحد جفت می‌سازد: بایتِ
// برابر، واحدِ نابرابر. آزمون همین جفت را در زمانِ اجرا پیدا می‌کند.
//
// حالا HTML و فایل‌های استاتیک **یک هویتِ محتواییِ مشترک** دارند: ۶۴ بیتِ اولِ
// sha1. تصادمِ عمدیِ sha1 خارج از توان است و تصادمِ تصادفی در مقیاسِ چند ده
// سند عملاً ناممکن؛ پس کلید دیگر نمی‌تواند به بدنه‌ی سندِ دیگری اشاره کند.
// هزینه‌اش هم همان هشِ ارزانی است که برای هر فایلِ استاتیک می‌گیریم
// (اندازه‌گیری‌شده: ~۳۰ میکروثانیه برای ۳۰KB، در برابر ~۰٫۶ms فشرده‌سازیِ
// brotli که کش می‌شود). آزمونِ «سندِ جابه‌جا‌شده» همین را می‌سنجد و جفتِ
// تصادم‌دارِ ۳۲ بیتی را در زمانِ اجرا می‌سازد تا به ثابتِ دستی گره نخورد.
const htmlCache = new Map();
const HTML_CACHE_MAX = 24; // چند صفحه × چند دامنه × دو انکدینگ

// شمارنده‌های تست: ثابت می‌کنند سندِ دومِ هم‌اندازه واقعاً *دوباره* فشرده شده
// (یعنی کش بین دو سندِ متفاوت قاطی نشده) و بارِ سومِ همان سند از کش می‌آید
// (یعنی سخت‌گیریِ تازه، کش را بی‌اثر نکرده).
let htmlHits = 0;
let htmlMisses = 0;
const htmlCacheStats = () => ({ entries: htmlCache.size, hits: htmlHits, misses: htmlMisses });

function sendHtml(req, res, html) {
  res.type('html');
  const encoding = pickEncoding(req.headers['accept-encoding']);
  const buf0 = Buffer.from(html, 'utf8');
  if (!encoding || buf0.length < MIN_SIZE) return res.end(buf0);

  const key = `${encoding}|${contentHash(buf0)}`;
  let buf = htmlCache.get(key);
  if (!buf) {
    htmlMisses++;
    try { buf = compressBuffer(buf0, encoding); } catch (e) { return res.end(buf0); }
    // ساده‌ترین سیاست بیرون‌اندازی: قدیمی‌ترین کلید. تعداد کلیدها طبیعتاً
    // کوچک است، پس چیز پیچیده‌تری لازم نیست.
    if (htmlCache.size >= HTML_CACHE_MAX) htmlCache.delete(htmlCache.keys().next().value);
    htmlCache.set(key, buf);
  } else {
    htmlHits++;
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

module.exports = {
  staticCompress, compressJson, sendHtml,
  jsonCacheStats, fileCacheStats, htmlCacheStats
};
