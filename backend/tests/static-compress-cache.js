#!/usr/bin/env node
// tests/static-compress-cache.js — نگهبانِ کشِ فشرده‌سازیِ فایل‌های استاتیک
//
// ---------- چرا این آزمون وجود دارد ----------
// کشِ `lib/static-compress.js` کلیدش `(mtimeMs, size)` بود. یعنی سروری که
// فایلِ CSS/JS را با gzip/brotli می‌فرستاد، «تازه است یا نه» را از دو عددی
// می‌فهمید که هیچ‌کدام *محتوا* را توصیف نمی‌کنند. یک تغییرِ بایتی که mtime و
// اندازه را دست نزند (restore از بکاپ با حفظِ timestamp، `cp -p`، یا ادیتی
// که در همان میلی‌ثانیه بنشیند) پس از آن بی‌صدا بدنه‌ی کهنه را زنده نگه
// می‌داشت: سرور ۲۰۰ می‌داد، Content-Length هم درست بود، ولی بایت‌ها مالِ قبل
// بودند. هیچ نگهبانی این را نمی‌گرفت؛ تنها چیزی که گرفت، سنجشِ زندهٔ
// `scripts/static-paths-live.mjs` بود که بدنه را با دیسک بایت‌به‌بایت
// مقایسه می‌کند و در اولین اجرای واقعی گزارش داد:
//     ✖ بدنه یکی نیست (دیسک 48175B · سرور 48175B)
//
// از آن به بعد اعتبارِ کش با اثرِ انگشتِ محتوا (۶۴ بیتِ اولِ sha1) سنجیده
// می‌شود و ETag هم از همان ساخته می‌شود، وگرنه مرورگری که ETagِ قدیمی را
// داشت ۳۰۴ می‌گرفت و بدنه‌ی کهنه‌اش را نگه می‌داشت — باگ از سمت کلاینت
// برمی‌گشت. این مجموعه هر دو لبه را می‌سنجد و یک چیز سوم را هم: که رفعِ باگ
// **کش را بی‌اثر نکرده باشد** (بار دومِ همان محتوا باید از کش بیاید).
//
// ---------- لبه‌ی دوم: کشِ HTML (که کلیدش هشِ ۳۲ بیتی بود) ----------
// همان باگ در کشِ HTMLِ `sendHtml` بود، ولی این‌بار به‌جای `(mtime، size)` از
// سمتِ *هش*: کلید `${encoding}|${buf0.length}|${hash32(html)}` بود و FNV-1a
// ۳۲ بیتی است. هر تصادمِ ۳۲ بیتی یعنی دو سندِ متفاوتِ هم‌اندازه یک کلید
// می‌گیرند و کش بدنه‌ی سندِ اول را برای سندِ دوم می‌فرستد — ۲۰۰ با
// Content-Length درست ولی بایت‌های صفحه‌ی دیگر؛ یعنی «سندِ جابه‌جا‌شده سرو
// می‌شود». حالا HTML هم مثل فایل‌های استاتیک با همان ۶۴ بیتِ اولِ sha1 هویت
// می‌گیرد. این مجموعه خودش یک جفتِ تصادم‌دارِ ۳۲ بیتی می‌سازد و نشان می‌دهد
// بدنه‌ی سروشده از **محتوا** پیروی می‌کند، نه از آن هشِ کم‌عرض.
//
// ---------- چرا اجرا و نه الگو ----------
// «هش در فایل هست» چیزِ کمی را ثابت می‌کند. این‌جا خودِ میان‌افزار با
// req/res جعلی و یک پوشهٔ موقتِ واقعی **اجرا** می‌شود و خروجیِ فشرده با
// zlib از حالت فشرده درمی‌آید تا با بایت‌های دیسک مقایسه شود؛ چون سنجه‌ی
// نهایی همان چیزی است که کاربر می‌گیرد، نه تصمیمِ داخلی.
//
// اجرا: node tests/static-compress-cache.js

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { staticCompress, sendHtml, fileCacheStats, htmlCacheStats } = require('../lib/static-compress');

let pass = 0, fail = 0;
function check(label, condition, detail = '') {
  if (condition) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ---------- قالبِ جعلیِ req/res ----------
function fakeRes() {
  const headers = {};
  const out = {
    statusCode: 200, body: null, nextCalled: false,
    setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return headers[String(k).toLowerCase()]; },
    status(c) { out.statusCode = c; return out; },
    type(t) { out.contentType = t; return out; },
    end(b) { out.body = b === undefined ? Buffer.alloc(0) : Buffer.from(b); return out; },
    _headers: headers,
    header: (k) => headers[String(k).toLowerCase()],
  };
  return out;
}
function drive(middleware, reqPath, { method = 'GET', encoding = 'br', inm = null } = {}) {
  const req = { method, path: reqPath, headers: {} };
  if (encoding) req.headers['accept-encoding'] = encoding;
  if (inm) req.headers['if-none-match'] = inm;
  const res = fakeRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  res.nextCalled = nextCalled;
  return res;
}
const decodeBody = (res, encoding) => {
  if (!res.body) return null;
  return (encoding === 'br' ? zlib.brotliDecompressSync(res.body) : zlib.gunzipSync(res.body)).toString('utf8');
};

// ---------- پوشهٔ موقت ----------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-compress-guard-'));
const CSS = path.join(TMP, 'app.css');
const OTHER = path.join(TMP, 'other.css');
const TINY = path.join(TMP, 'tiny.css');
const IMG = path.join(TMP, 'photo.png');
const MIDDLEWARE = staticCompress(TMP);

// mtimeِ ثابت با دقتِ ثانیه — تا روی هر فایل‌سیستمی قابلِ بازتولید باشد
const FIXED_MTIME = new Date(Math.floor(Date.now() / 1000) * 1000 - 120000);
const writeFixed = (file, text) => {
  fs.writeFileSync(file, text, 'utf8');
  fs.utimesSync(file, FIXED_MTIME, FIXED_MTIME);
};
const FILLER = 'پلاسکو گلی | آزمونِ کشِ فشرده‌سازی | ';
const bodyA = FILLER.repeat(80) + 'MARK=AAA;' + FILLER.repeat(20) + '\n';
const bodyB = bodyA.replace('MARK=AAA;', 'MARK=BBB;');
// برچسبِ ثانویه: همان محتوای B با مسیرِ دیگر (کلیدِ کش باید مسیر را هم داشته باشد)
const bodyNewMtime = bodyA.replace('MARK=AAA;', 'MARK=CCC;');

console.log('\n=== Static compress cache guard (content-addressed, not mtime) ===\n');

(async () => {
  check('آماده‌سازی: متنِ آزمون از کفِ فشرده‌سازی (۱KB) بزرگ‌تر است',
    Buffer.byteLength(bodyA) > 1024, `${Buffer.byteLength(bodyA)}B`);
  check('آماده‌سازی: دو نسخه هم‌اندازه‌اند (شرطِ سناریوی mtime+size ثابت)',
    Buffer.byteLength(bodyA) === Buffer.byteLength(bodyB));

  // ---------- ۱) سناریوی اصلی: تغییرِ بایت با mtime و اندازهٔ *ثابت* ----------
  writeFixed(CSS, bodyA);
  const stA = fs.statSync(CSS);

  const first = drive(MIDDLEWARE, '/app.css');
  check('درخواستِ اول: میان‌افزار پاسخ می‌دهد (next صدا زده نمی‌شود)', !first.nextCalled);
  check('درخواستِ اول: بدنه‌ی br پس از بازکردن دقیقاً بایت‌های دیسک است',
    decodeBody(first, 'br') === bodyA);
  const etagA = first.header('etag');
  const statsAfterFirst = fileCacheStats();
  check('درخواستِ اول: یک بار فشرده‌سازی ثبت شد (miss)', statsAfterFirst.misses === 1, JSON.stringify(statsAfterFirst));

  const second = drive(MIDDLEWARE, '/app.css');
  check('همان محتوا، بارِ دوم: از کش می‌آید و فشرده‌سازی تکرار نمی‌شود (hit)',
    fileCacheStats().hits === 1 && fileCacheStats().misses === 1, JSON.stringify(fileCacheStats()));
  check('همان محتوا: ETagِ پایدار (مرورگر می‌تواند ۳۰۴ بگیرد)',
    second.header('etag') === etagA, `${etagA} ≠ ${second.header('etag')}`);

  // حالا بایت عوض می‌شود، ولی mtime و اندازه دست نمی‌خورند
  writeFixed(CSS, bodyB);
  const stB = fs.statSync(CSS);
  check('آماده‌سازی: mtime واقعاً ثابت مانده', stA.mtimeMs === stB.mtimeMs, `${stA.mtimeMs} ≠ ${stB.mtimeMs}`);
  check('آماده‌سازی: اندازه واقعاً ثابت مانده', stA.size === stB.size, `${stA.size} ≠ ${stB.size}`);
  // خودآزمون: همان تصمیمی که کلیدِ قدیمی می‌گرفت — اگر این درست نباشد،
  // سناریو اصلاً همان باگِ گذشته را بازتولید نمی‌کند و بررسی‌های بالا بی‌معناست.
  check('خودآزمون: کلیدِ (mtime, size) این تغییر را «تغییر» نمی‌دید',
    stA.mtimeMs === stB.mtimeMs && stA.size === stB.size);

  const missBefore = fileCacheStats().misses;
  const third = drive(MIDDLEWARE, '/app.css');
  check('تغییرِ بایت با mtime+size ثابت: بدنه‌ی تازه سرو می‌شود (نه نسخه‌ی کهنه)',
    decodeBody(third, 'br') === bodyB,
    decodeBody(third, 'br') === bodyA ? 'بدنه = نسخه‌ی کهنه' : 'بدنه نامنتظر');
  check('تغییرِ بایت: دوباره فشرده شده (missِ تازه، نه hitِ کهنه)',
    fileCacheStats().misses === missBefore + 1, JSON.stringify(fileCacheStats()));
  check('تغییرِ بایت: ETag عوض شده (کلاینتِ قدیمی ۳۰۴ نمی‌گیرد)',
    third.header('etag') !== etagA, `${etagA} = ${third.header('etag')}`);

  const fourth = drive(MIDDLEWARE, '/app.css');
  check('پس از تغییر هم کش کار می‌کند: بارِ سومِ محتوای تازه از کش می‌آید',
    decodeBody(fourth, 'br') === bodyB && fileCacheStats().hits >= 2);

  // ---------- ۲) حالِ عادی: تغییرِ محتوا با mtimeِ تازه هم دیده شود ----------
  writeFixed(CSS, bodyNewMtime);
  fs.utimesSync(CSS, new Date(), new Date()); // mtimeِ تازه، مثلِ یک ادیتِ واقعی
  const normal = drive(MIDDLEWARE, '/app.css');
  check('ادیتِ معمولی (mtimeِ تازه): بدنه‌ی تازه سرو می‌شود',
    decodeBody(normal, 'br') === bodyNewMtime);
  check('ادیتِ معمولی: ETag یکتای خودش را دارد',
    normal.header('etag') !== third.header('etag'));

  // ---------- ۳) کدگذاری‌ها ----------
  writeFixed(OTHER, bodyA);
  const gz = drive(MIDDLEWARE, '/other.css', { encoding: 'gzip' });
  check('gzip: بدنه با gunzip دقیقاً همان بایت‌های دیسک است', decodeBody(gz, 'gzip') === bodyA);
  check('gzip: هدرِ Content-Encoding درست است', gz.header('content-encoding') === 'gzip');
  check('gzip: Vary: Accept-Encoding ست شده (کشِ واسط اشتباه نکند)',
    String(gz.header('vary')).includes('Accept-Encoding'));
  const both = drive(MIDDLEWARE, '/other.css', { encoding: 'gzip, br, deflate' });
  check('هر دو کدگذاری پذیرفته شود: br ترجیح دارد', both.header('content-encoding') === 'br');
  check('بر و gzip ورودیِ کشِ جدا دارند', fileCacheStats().entries >= 3, JSON.stringify(fileCacheStats()));
  const brOnly = drive(MIDDLEWARE, '/other.css', { encoding: 'br' });
  check('همان مسیر، انکدینگِ دیگر: بدنه درست است',
    decodeBody(brOnly, 'br') === bodyA && brOnly.header('content-encoding') === 'br');

  // ---------- ۴) هدرها، ۳۰۴ و HEAD ----------
  const cur = drive(MIDDLEWARE, '/other.css', { encoding: 'br' });
  check('ETag: ضعیف (W/) و شاملِ انکدینگ است',
    /^W\/"[0-9a-f]{16}-br"$/.test(String(cur.header('etag'))), String(cur.header('etag')));
  check('Last-Modified از mtimeِ فایل می‌آید',
    cur.header('last-modified') === FIXED_MTIME.toUTCString(), String(cur.header('last-modified')));
  check('Content-Length برابرِ طولِ بدنه‌ی فشرده است',
    Number(cur.header('content-length')) === cur.body.length);
  check('Cache-Control برای .css سیاستِ بلندِ immutable است',
    String(cur.header('cache-control')).includes('immutable'), String(cur.header('cache-control')));

  const notModified = drive(MIDDLEWARE, '/other.css', { encoding: 'br', inm: String(cur.header('etag')) });
  check('If-None-Matchِ منطبق: ۳۰۴ و بدنه‌ی خالی',
    notModified.statusCode === 304 && notModified.body.length === 0, `status=${notModified.statusCode}`);
  const otherEtag = drive(MIDDLEWARE, '/other.css', { encoding: 'br', inm: 'W/"0000000000000000-br"' });
  check('If-None-Matchِ نامنطبق: ۲۰۰ با بدنه', otherEtag.statusCode === 200 && otherEtag.body.length > 0);

  const head = drive(MIDDLEWARE, '/other.css', { method: 'HEAD', encoding: 'br' });
  check('HEAD: هدرها می‌آید ولی بدنه‌ای فرستاده نمی‌شود',
    head.body.length === 0 && String(head.header('etag')).startsWith('W/"'));

  // ---------- ۵) چیزهایی که نباید دست بخورند ----------
  fs.writeFileSync(TINY, 'x'.repeat(100), 'utf8');
  const tiny = drive(MIDDLEWARE, '/tiny.css');
  check('فایلِ کوچک‌تر از کفِ ۱KB: به مسیرِ عادی واگذار می‌شود', tiny.nextCalled);

  fs.writeFileSync(IMG, Buffer.alloc(4096, 7));
  const img = drive(MIDDLEWARE, '/photo.png');
  check('پسوندِ غیرمتنی (png): دست نمی‌خورد', img.nextCalled);

  const noEnc = drive(MIDDLEWARE, '/app.css', { encoding: null });
  check('بدونِ Accept-Encoding: بدونِ فشرده‌سازی رد می‌شود', noEnc.nextCalled);

  const post = drive(MIDDLEWARE, '/app.css', { method: 'POST' });
  check('متدِ غیرِ GET/HEAD: رد می‌شود', post.nextCalled);

  const esc = drive(MIDDLEWARE, '/../package.json', { encoding: 'br' });
  check('خروج از ریشه (path traversal): رد می‌شود و فایلی بیرونِ ریشه سرو نمی‌شود',
    esc.nextCalled && esc.body === null);

  const missing = drive(MIDDLEWARE, '/does-not-exist.css');
  check('فایلِ ناموجود: به static/۴۰۴ واگذار می‌شود', missing.nextCalled);

  // ---------- ۶) آخرین سنجه: مقایسه با دیسک، همان‌طور که سنجشِ زنده می‌کند ----------
  fs.writeFileSync(CSS, bodyB, 'utf8'); // mtime خودش عوض می‌شود؛ این‌جا مهم نیست
  const disk = fs.readFileSync(CSS, 'utf8');
  const live = drive(MIDDLEWARE, '/app.css');
  check('مقایسهٔ نهایی: بدنه‌ی سروشده بایت‌به‌بایت با دیسک یکی است (حتی اگر طول‌ها برابر باشند)',
    decodeBody(live, 'br') === disk);

  // ---------- ۷) کشِ HTML: هویتِ محتوا، نه هشِ ۳۲ بیتی ----------
  //
  // نگهبان دستش به هشِ داخلی نمی‌رسد (و نباید برسد)؛ پس همان تصمیمی را که
  // کلیدِ *قدیمی* می‌گرفت بازسازی می‌کند: FNV-1a ۳۲ بیتی روی کدهای نویسه،
  // و در زمانِ اجرا می‌گردد تا دو سندِ هم‌اندازه پیدا کند که این هش برایشان
  // یکی است. اگر چنین جفتی پیدا نشود (یا ثابتِ دستیِ خراب)، خودآزمونِ پایین
  // قرمز می‌شود و آن‌وقت همه‌ی بررسی‌های این بخش بی‌معنا اعلام می‌شوند.
  const fnv1a32From = (h, str) => {
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  const fnv1a32 = (str) => fnv1a32From(0x811c9dc5, str);
  // همان اثرِ انگشتِ محتوایی که کتابخانه می‌سازد (۶۴ بیتِ اولِ sha1)
  const contentHashLike = (str) => crypto.createHash('sha1')
    .update(Buffer.from(str, 'utf8')).digest('hex').slice(0, 16);

  const HTML_HEAD = '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
    + '<title>پلاسکو گلی — آزمونِ کشِ HTML</title></head><body><div id="app">';
  const HTML_TAIL = '</div></body></html>';
  const htmlBase = HTML_HEAD + FILLER.repeat(40) + HTML_TAIL;

  // چرا برای پیدا کردنِ تصادم باید دو «خانواده» را آزمود؟
  //
  // FNV-1a روی ورودی‌های **هم‌طول** تابعی یک‌به‌یک است: هر گام
  // `(h XOR c) * P` است و چون `P` فرد است، ضرب در پیمانه‌ی ۲^۳۲ برگشت‌پذیر
  // است؛ پس دو رشته‌ی هم‌تعداد-واحدِ کد **هرگز** تصادم نمی‌کنند (این را با
  // جست‌وجوی خالیِ اولین نسخه‌ی همین آزمون دیدم: ۴۰۰هزار نامزدِ هم‌طول، صفر
  // تصادم). شکاف از ناهم‌خوانیِ واحدِ اندازه‌گیری می‌آید: کلیدِ قدیمی
  // `buf0.length` یعنی طولِ **بایتِ UTF-8** را می‌سنجید ولی `hash32` روی
  // **واحدهای کدِ UTF-16** می‌گشت. پس چهار نویسه‌ی فارسی (۸ بایت، ۴ واحد) و
  // هشت نویسه‌ی ASCII (۸ بایت، ۸ واحد) هم‌طولِ بایتی‌اند، از دو خانواده‌ی
  // متفاوت‌اند، و *می‌توانند* تصادم کنند — و همان‌وقت کلیدشان یکسان می‌شد.
  //
  // هر نامزد ارزان است (پیشوند یک بار هش و بعد فقط برچسبِ کوچک)، توالی
  // قطعی است (بی‌لرزش) و آزمون به هیچ ثابتِ دستیِ شکننده گره نمی‌خورد.
  const hBase = fnv1a32(htmlBase);
  const faTag = (i) => {
    let s = '';
    for (let k = 0; k < 4; k++) s += String.fromCharCode(0x0620 + ((i >> (k * 5)) & 31));
    return s;
  };
  const asciiTag = (i) => i.toString(16).padStart(8, '0');
  const seen32 = new Map();
  for (let i = 0; i < 200000; i++) { const t = faTag(i); seen32.set(fnv1a32From(hBase, t), t); }
  let pair = null;
  let scanned = 0;
  for (let i = 0; i < 400000 && !pair; i++) {
    const t = asciiTag(i);
    scanned++;
    const other = seen32.get(fnv1a32From(hBase, t));
    if (other !== undefined) pair = [other, t];
  }
  const docFa = htmlBase + (pair ? pair[0] : '');
  const docAscii = htmlBase + (pair ? pair[1] : '');
  // همان کلیدی که نسخهٔ قدیمی می‌ساخت — با همان واحدهای اندازه‌گیریِ متناقض
  const oldKey = (html, encoding) =>
    `${encoding}|${Buffer.byteLength(html)}|${fnv1a32(html).toString(36)}`;

  check('آماده‌سازی: بسترِ HTML بزرگ‌تر از کفِ فشرده‌سازی (۱KB) است',
    Buffer.byteLength(htmlBase) > 1024, `${Buffer.byteLength(htmlBase)}B`);
  check('آماده‌سازی: جفتِ سندِ متفاوت با کلیدِ قدیمیِ یکسان پیدا شد',
    !!pair, `${scanned} نامزد (۱۰× بزرگ‌تر از انتظارِ تصادم) اسکن شد`);
  check('خودآزمون: شکاف همان ناهم‌خوانیِ واحد است (بایت برابر، واحدِ کد نابرابر)',
    !!pair && Buffer.byteLength(docFa) === Buffer.byteLength(docAscii)
      && docFa.length !== docAscii.length);
  check('خودآزمون: کلیدِ قدیمیِ (۳۲ بیتی) این دو سند را یکی می‌دید',
    !!pair && docFa !== docAscii && oldKey(docFa, 'br') === oldKey(docAscii, 'br'),
    `«${oldKey(docFa, 'br')}»`);
  check('خودآزمون: هشِ ۶۴ بیتیِ محتوا این دو را از هم جدا می‌کند',
    !!pair && contentHashLike(docFa) !== contentHashLike(docAscii));

  const htmlReq = (encoding = 'br') => ({ method: 'GET', path: '/', headers: { 'accept-encoding': encoding } });
  const sendDoc = (doc) => {
    const res = fakeRes();
    sendHtml(htmlReq(), res, doc);
    return res;
  };
  const stat0 = htmlCacheStats();

  const servedOld = sendDoc(docFa);
  check('سندِ اول: بدنه‌ی br پس از بازکردن دقیقاً همان سند است',
    decodeBody(servedOld, 'br') === docFa);
  check('سندِ اول: هدرِ Content-Encoding بر است و Vary ست شده',
    servedOld.header('content-encoding') === 'br'
      && String(servedOld.header('vary')).includes('Accept-Encoding'));
  check('سندِ اول: یک بار فشرده‌سازی ثبت شد (miss)',
    htmlCacheStats().misses === stat0.misses + 1, JSON.stringify(htmlCacheStats()));

  // اینجا سندِ دوم *هم‌طول* و با همان هشِ ۳۲ بیتی می‌آید. با کلیدِ قبلی این
  // درخواست همان ورودیِ کش را می‌گرفت و بدنه‌ی سندِ اول را تحویل می‌داد.
  const servedSwapped = sendDoc(docAscii);
  check('سندِ جابه‌جا‌شده (هم‌طول با هشِ ۳۲ بیتیِ یکسان): سندِ خودش سرو می‌شود، نه سندِ قبلی',
    decodeBody(servedSwapped, 'br') === docAscii,
    decodeBody(servedSwapped, 'br') === docFa ? 'بدنه = سندِ قبلی (جابه‌جا سرو شد)' : 'بدنه نامنتظر');
  check('سندِ جابه‌جا‌شده: واقعاً دوباره فشرده شد (کش دو سند را قاطی نکرد)',
    htmlCacheStats().misses === stat0.misses + 2
      && htmlCacheStats().entries === stat0.entries + 2, JSON.stringify(htmlCacheStats()));

  const servedOldAgain = sendDoc(docFa);
  check('سندِ اول، بارِ دوم: باز هم سندِ خودش است و از کش می‌آید (hit)',
    decodeBody(servedOldAgain, 'br') === docFa
      && htmlCacheStats().hits === stat0.hits + 1
      && htmlCacheStats().misses === stat0.misses + 2, JSON.stringify(htmlCacheStats()));

  const htmlSmall = sendDoc('<!doctype html><title>کوچک</title>');
  check('HTMLِ کوچک‌تر از کفِ ۱KB: بدونِ فشرده‌سازی و بدونِ ورودیِ کش می‌رود',
    Buffer.from(htmlSmall.body).toString('utf8') === '<!doctype html><title>کوچک</title>'
      && htmlSmall.header('content-encoding') === undefined);
  const htmlRaw = fakeRes();
  sendHtml({ method: 'GET', path: '/', headers: {} }, htmlRaw, docFa);
  check('بدونِ Accept-Encoding: HTMLِ خام فرستاده می‌شود',
    Buffer.from(htmlRaw.body).toString('utf8') === docFa
      && htmlRaw.header('content-encoding') === undefined);

  // ---------- پاک‌سازی و گزارش ----------
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* پوشهٔ موقت */ }
  check('پوشهٔ موقت پاک شد', !fs.existsSync(TMP));

  console.log('\n------------------------------------------------------------');
  console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
  console.log('------------------------------------------------------------\n');
  process.exit(fail === 0 ? 0 : 1);
})();
