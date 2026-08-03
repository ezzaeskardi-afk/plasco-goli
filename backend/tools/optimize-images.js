#!/usr/bin/env node
/* ============================================================
   optimize-images.js — ساختِ نسخه‌ی WebP کنارِ هر عکس
   ------------------------------------------------------------
   WebP معمولاً ۲۵ تا ۴۵ درصد کوچک‌تر از JPEG با کیفیتِ چشمیِ یکسان است.
   روی اینترنتِ موبایلِ ایران این تفاوت مستقیم به «چند ثانیه زودتر دیدنِ
   محصول» ترجمه می‌شود، و سرعتِ لود در رتبه‌ی گوگل هم حساب می‌شود.

   روشِ کار عمداً «کنار» است نه «جایگزین»: فایلِ اصلی دست‌نخورده می‌ماند و
   یک هم‌نامِ .webp کنارش ساخته می‌شود. سرور (lib/webp-negotiate.js) اگر
   مرورگر WebP بپذیرد همان را می‌دهد، وگرنه اصل را. یعنی:
     • هیچ HTML و JS ای عوض نمی‌شود
     • اگر این ابزار هرگز اجرا نشود، سایت مثل قبل کار می‌کند
     • اگر مرورگرِ قدیمی بیاید، عکس را می‌بیند نه کادرِ خالی

   انکودر: پروژه عمداً وابستگی npm اضافه نمی‌کند، پس از هر ابزاری که روی
   سیستم باشد استفاده می‌کنیم (cwebp → magick → convert → ffmpeg → PIL).
   اگر هیچ‌کدام نبود، ابزار با پیامِ روشن تمام می‌شود، نه با خطای گنگ.

   اجرا (از پوشه‌ی backend):  node tools/optimize-images.js
                              node tools/optimize-images.js --force
   ============================================================ */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { imageSizeFromFile } = require('../lib/imagesize');
// انکودر و اعدادِ کیفیت از کتابخانه‌ی مشترک می‌آیند، نه از اینجا.
// چرا: همین منطق در مسیرِ آپلودِ پنل هم لازم شد. دو نسخه یعنی روزی یکی درست
// می‌شود و دیگری نه — مثل تله‌ی `convert.exe` ویندوز که فقط یک طرف بسته می‌شد.
const IMGENC = require('../lib/image-encode');

const PICTURE_DIR = path.join(__dirname, '..', '..', 'picture');
const { QUALITY, MAX_EDGE } = IMGENC;  // آستانه‌ی کیفیت و بزرگ‌ترین ضلع — تعریفشان در lib/image-encode.js
const FORCE = process.argv.includes('--force');

// انکودر همان چیزی است که مسیرِ آپلود استفاده می‌کند؛ اینجا فقط حالتِ همگامش
// را می‌سازیم. ابزارِ خطِ فرمان اجازه‌ی spawnSync دارد چون کسی منتظرش نیست —
// برخلافِ سرور که با آن قفل می‌شود.
function pickEncoder() {
  const e = IMGENC.pickEncoder();
  if (!e) return null;
  const runSync = (src, dst, w) =>
    cp.spawnSync(e.cmd, e.args(src, dst, w), { stdio: 'ignore' }).status === 0;
  return {
    name: e.name,
    // w=0 یعنی «فقط اگر لازم شد کوچک کن» و برای هر چهار انکودر همان رفتارِ
    // قبلیِ این ابزار را می‌دهد.
    run: (src, dst) => runSync(src, dst, 0),
    resize: (src, dst, w) => runSync(src, dst, w)
  };
}

/* نسخه‌های کم‌عرض برای srcset — عمداً پیش‌فرض خاموش است. چرا؟
   اولش قصد داشتم به عکس‌های هیرو srcset بدهم. قبل از نوشتنش اندازه‌ی واقعیِ
   رندر را حساب کردم و نتیجه برعکسِ انتظار بود:

     کادرِ hg-a روی موبایلِ ۳۹۰ پیکسلی ۱۷۹×۳۰۴ است و عکس با object-fit:cover
     می‌نشیند. وقتی کادر از عکس بلندتر باشد، این «ارتفاع» است که تعیین می‌کند
     چقدر از عرضِ منبع لازم است: ۳۰۴ × نسبتِ ۱٫۲۳ ≈ ۳۷۵ پیکسلِ CSS. روی
     صفحه‌ی DPR ۲ یعنی ۷۵۰ پیکسلِ واقعی و روی DPR ۳ یعنی ۱۱۲۵.

   ولی مرورگر برای انتخاب از srcset فقط به «عرضِ» کادر نگاه می‌کند (۱۷۹px)،
   نه به این حسابِ ارتفاع. پس با sizes="179px" روی موبایلِ DPR۲ نسخه‌ی ۴۸۰
   انتخاب می‌شد در حالی که ۷۵۰ لازم بود — یعنی عکسِ اصلیِ صفحه، همان که نمره‌ی
   LCP را می‌سازد، روی گوشی تار می‌شد. دقیقاً برعکسِ هدف.

   اگر sizes را با همان حسابِ ارتفاع بنویسیم (۳۷۵px موبایل، ۵۲۳px دسکتاپ)
   درست کار می‌کند، ولی آن‌وقت نسخه‌ی ۴۸۰ هیچ‌جا انتخاب نمی‌شود؛ یعنی وجودش
   بی‌فایده است. برنده‌ی واقعیِ این صفحه همان WebP بود: ۶۶۰KB → ۲۹۵KB.

   پس ساختِ نسخه‌ی کم‌عرض با پرچمِ --variants دستی می‌شود. */
const WANT_VARIANTS = process.argv.includes('--variants');
const VARIANT_WIDTHS = [480];
const VARIANT_MIN_SOURCE = 700;   // زیر این عرض، ساختنِ نسخه‌ی کوچک‌تر صرف ندارد

/* ── بندانگشتی (۳۲۰px) — برخلافِ بالا، این یکی پیش‌فرض روشن است ──────────
   فرقش با نسخه‌های srcset این است که مصرف‌کننده‌ی مشخص و کادرِ ثابت دارد:
   لیستِ پیشنهادِ جست‌وجو (۴۴px)، ردیفِ سبد (۷۶px)، فهرستِ کالای پنل (۴۰px).
   هیچ‌کدام «واکنش‌گرا» نیستند، پس حدس در کار نیست و نمی‌شود اشتباه انتخاب شود.

   بزرگ‌ترینشان ۷۶px است؛ روی DPR۳ یعنی ۲۲۸ پیکسلِ واقعی روی ضلعِ کوچک.
   عرضِ ۳۲۰ برای عکسِ افقیِ ۱٫۲۳ یعنی ارتفاعِ ۲۶۰ — بالای ۲۲۸ با حاشیه.

   سرور با `?w=320` سراغش می‌رود (lib/webp-negotiate.js). نبودنِ فایل چیزی را
   نمی‌شکند: عکسِ کامل می‌رود، فقط سنگین‌تر. پس اجرای این ابزار «لازم» نیست،
   «سودمند» است. */
/* ── و عرضِ دومی: ۵۶۰px برای کارتِ محصول ───────────────────────────────
   کادرِ کارت مربع است و اندازه‌اش به چیدمانِ گرید بستگی دارد. اندازه گرفتم:
   ۴ ستونه ۲۶۸px، ۳ ستونه ۳۲۷px، ۲ ستونه ۲۸۳px، و **۱ ستونه روی موبایل ۳۸۲px**.
   یعنی برخلافِ انتظار، کارت روی موبایل از کارتِ دسکتاپ *بزرگ‌تر* است؛ پس
   «عکسِ کوچک‌تر برای موبایل» از پایه غلط بود.

   جایی که واقعاً می‌شود صرفه‌جویی کرد صفحه‌های DPR۱ است (اکثر مانیتورها).
   بزرگ‌ترین کادرِ ممکن ۳۸۲px است و چون object-fit:cover است، عرضِ لازمِ منبع
   ۳۸۲ × نسبتِ عکس می‌شود؛ پهن‌ترین عکسِ فعلی نسبتِ ۱٫۳۵ دارد → ۵۱۶px.
   ۵۶۰ با حاشیه پوششش می‌دهد، و چون به عرضِ پنجره کار ندارد، تغییرِ اندازه‌ی
   پنجره هم نمی‌تواند خرابش کند. روی DPR ≥۲ اصلاً سراغش نمی‌رویم. */
const { SMALL_SIZES } = IMGENC;  // { w:320, minSource:420 } و { w:560, minSource:700 }
const SKIP_THUMBS = process.argv.includes('--no-thumbs');

function makeVariant(enc, src, width) {
  const out = src.replace(/(\.[a-z0-9]+)$/i, `-${width}w$1`);
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return out;
  const ok = enc.resize
    ? enc.resize(src, out, width)
    : false;
  return ok && fs.existsSync(out) ? out : null;
}

// برخلافِ makeVariant، خروجی همیشه .webp است — چون سرور فقط webp را
// برای ?w می‌گردد و ساختِ نسخه‌ی jpgِ کوچک هیچ مصرف‌کننده‌ای ندارد.
function makeThumb(enc, src, width) {
  const out = src.replace(/\.(jpe?g|jfif|png)$/i, `-${width}w.webp`);
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
    return { out, fresh: false };
  }
  if (!enc.resize) return null;
  if (!enc.resize(src, out, width) || !fs.existsSync(out)) return null;
  return { out, fresh: true };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const kb = (n) => (n / 1024).toFixed(0) + 'KB';

console.log('\n════════════════════════════════════════════');
console.log('  Image optimization - building WebP versions');
console.log('════════════════════════════════════════════\n');

const enc = pickEncoder();
if (!enc) {
  console.log('  No image encoder found on this system.');
  console.log('  Install one of these and run again:');
  console.log('    - cwebp        (Google webp package - lightest option)');
  console.log('    - ImageMagick');
  console.log('    - ffmpeg');
  console.log('    - Python with the Pillow library');
  console.log('\n  The site works fine without this; images just stay heavier.\n');
  process.exit(0);
}
console.log(`  Encoder: ${enc.name}   Quality: ${QUALITY}   Max edge: ${MAX_EDGE}px\n`);

const files = walk(PICTURE_DIR)
  .filter(f => /\.(jpe?g|jfif|png)$/i.test(f))
  // خروجی‌های خودمان نباید ورودیِ دورِ بعد شوند
  .filter(f => !/-\d+w\.[a-z0-9]+$/i.test(f));
if (!files.length) {
  console.log('  No images found to convert.\n');
  process.exit(0);
}

let made = 0, skipped = 0, failed = 0, before = 0, after = 0, variants = 0;
let thumbsMade = 0, thumbBytes = 0, fullBytes = 0;
const oversized = [];

// ── مرحله‌ی ۱: نسخه‌ی webpِ کامل ─────────────────────────────────────
// جدا شد تا `return`های زودهنگامش مرحله‌ی بندانگشتی را نپرانند. قبلاً همه‌ی
// این‌ها `continue` بودند؛ آن‌وقت در اجرای دومِ ابزار — که همه‌ی عکس‌ها «رد‌شده»
// می‌شوند — هیچ بندانگشتی‌ای ساخته نمی‌شد و ابزار بی‌صدا کارِ نصفه می‌کرد.
function buildFullWebp(src, rel, srcSize) {
  const dst = src.replace(/\.(jpe?g|jfif|png)$/i, '.webp');

  // اگر خروجی هست و تازه‌تر از منبع است، دوباره نمی‌سازیم — اجرای دوباره
  // باید ارزان باشد وگرنه کسی اجرایش نمی‌کند.
  if (!FORCE && fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) {
    skipped++;
    return dst;
  }

  if (!enc.run(src, dst) || !fs.existsSync(dst)) {
    failed++;
    console.log(`  [FAIL] ${rel} - could not convert`);
    return null;
  }

  const dstSize = fs.statSync(dst).size;
  // اگر WebP بزرگ‌تر درآمد (روی عکس‌های خیلی کوچک یا از قبل فشرده پیش می‌آید)
  // نگهش نمی‌داریم؛ داشتنش فقط دیسک می‌خورد و سرور را گمراه می‌کند.
  if (dstSize >= srcSize) {
    fs.unlinkSync(dst);
    skipped++;
    console.log(`  [SKIP] ${rel} - WebP came out larger (${kb(dstSize)} > ${kb(srcSize)}), keeping the original`);
    return null;
  }

  made++;
  before += srcSize;
  after += dstSize;
  console.log(`  [OK]   ${rel}  ${kb(srcSize)} -> ${kb(dstSize)}  (${Math.round((1 - dstSize / srcSize) * 100)}% smaller)`);
  return dst;
}

for (const src of files) {
  const rel = path.relative(PICTURE_DIR, src).replace(/\\/g, '/');
  const srcSize = fs.statSync(src).size;

  const dim = imageSizeFromFile(src);
  if (dim && Math.max(dim.width, dim.height) > MAX_EDGE * 1.5) {
    oversized.push(`${rel} (${dim.width}×${dim.height})`);
  }

  const fullWebp = buildFullWebp(src, rel, srcSize);

  // ── مرحله‌ی ۲: نسخه‌های کم‌عرضِ webp (۳۲۰ و ۵۶۰) ─────────────────────
  // اندازه را با «چیزی که واقعاً امروز می‌رود» می‌سنجیم، نه با فایلِ اصلی:
  // مرورگرِ مدرن الان webpِ کامل را می‌گیرد، پس صرفه‌جویی نسبت به همان است.
  const nowSize = fullWebp && fs.existsSync(fullWebp) ? fs.statSync(fullWebp).size : srcSize;
  if (!SKIP_THUMBS && dim) {
    for (const s of SMALL_SIZES) {
      if (dim.width < s.minSource) continue;
      const t = makeThumb(enc, src, s.w);
      if (!t) continue;
      const tSize = fs.statSync(t.out).size;
      if (tSize >= nowSize) {
        fs.unlinkSync(t.out);   // کوچک‌کردن جواب نداده؛ نگه‌داشتنش فقط گمراه‌کننده است
        continue;
      }
      if (s.w === 320) { thumbBytes += tSize; fullBytes += nowSize; }
      if (t.fresh) {
        thumbsMade++;
        console.log(`           ${s.w}px version  ${kb(nowSize)} -> ${kb(tSize)}`);
      }
    }
  }

  // نسخه‌های کم‌عرض برای srcset (پیش‌فرض خاموش — بالا توضیح داده شده)
  if (WANT_VARIANTS && fullWebp && dim && dim.width >= VARIANT_MIN_SOURCE) {
    for (const w of VARIANT_WIDTHS) {
      if (w >= dim.width) continue;
      const v = makeVariant(enc, src, w);
      if (!v) continue;
      // نسخه‌ی webp همان عرض را هم بساز تا مذاکره‌ی سرور برایش هم کار کند
      const vWebp = v.replace(/\.[a-z0-9]+$/i, '.webp');
      if (!fs.existsSync(vWebp)) enc.run(v, vWebp);
      variants++;
      const vs = fs.existsSync(vWebp) ? fs.statSync(vWebp).size : fs.statSync(v).size;
      console.log(`           ${w}px version  ${kb(vs)}`);
    }
  }
}

console.log('');
console.log('════════════════════════════════════════════');
console.log(`  Built: ${made}   Thumbnails: ${thumbsMade}   Narrow versions: ${variants}   Skipped: ${skipped}   Failed: ${failed}`);
if (made) {
  const cut = Math.round((1 - after / before) * 100);
  console.log(`  Size: ${kb(before)} -> ${kb(after)}  =  ${cut}% smaller`);
}
if (fullBytes) {
  const cut = Math.round((1 - thumbBytes / fullBytes) * 100);
  console.log(`  Thumbnails (small boxes in search/cart/panel): ${kb(fullBytes)} -> ${kb(thumbBytes)}  =  ${cut}% smaller`);
}
if (oversized.length) {
  console.log('\n  Needlessly large images (better replaced with smaller ones in the panel):');
  for (const o of oversized) console.log('    [!] ' + o);
}
console.log('════════════════════════════════════════════\n');

process.exit(failed ? 1 : 0);
