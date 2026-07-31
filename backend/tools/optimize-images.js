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

const PICTURE_DIR = path.join(__dirname, '..', '..', 'picture');
const QUALITY = 82;              // آستانه‌ی عملی: پایین‌تر از این، لبه‌ها روی عکسِ محصول دیده می‌شود
const MAX_EDGE = 1400;           // بزرگ‌ترین ضلعِ خروجی؛ بزرگ‌تر از این روی هیچ صفحه‌ای دیده نمی‌شود
const FORCE = process.argv.includes('--force');

const has = (cmd) => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return cp.spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

// انکودرها به ترتیبِ کیفیت/سرعت. هر کدام یک تابع می‌سازد که true/false برمی‌گرداند.
function pickEncoder() {
  if (has('cwebp')) {
    return {
      name: 'cwebp',
      run: (src, dst) => cp.spawnSync('cwebp', ['-q', String(QUALITY), '-resize', '0', '0', src, '-o', dst], { stdio: 'ignore' }).status === 0,
      // cwebp خودش JPEG نمی‌سازد؛ نسخه‌ی کوچک را هم webp می‌دهیم و همان کافی است
      resize: (src, dst, w) => cp.spawnSync('cwebp', ['-q', String(QUALITY), '-resize', String(w), '0', src, '-o', dst.replace(/\.[a-z0-9]+$/i, '.webp')], { stdio: 'ignore' }).status === 0
    };
  }
  for (const im of ['magick', 'convert']) {
    if (!has(im)) continue;
    return {
      name: im,
      run: (src, dst) => cp.spawnSync(im, [src, '-quality', String(QUALITY), '-resize', `${MAX_EDGE}x${MAX_EDGE}>`, dst], { stdio: 'ignore' }).status === 0,
      resize: (src, dst, w) => cp.spawnSync(im, [src, '-quality', String(QUALITY), '-resize', `${w}x>`, dst], { stdio: 'ignore' }).status === 0
    };
  }
  if (has('ffmpeg')) {
    return {
      name: 'ffmpeg',
      run: (src, dst) => cp.spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src,
        '-vf', `scale='min(${MAX_EDGE},iw)':-1`, '-quality', String(QUALITY), dst], { stdio: 'ignore' }).status === 0,
      resize: (src, dst, w) => cp.spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src,
        '-vf', `scale='min(${w},iw)':-1`, '-quality', String(QUALITY), dst], { stdio: 'ignore' }).status === 0
    };
  }
  // آخرین تیر: پایتون با Pillow. روی خیلی از سیستم‌ها هست حتی وقتی ابزارِ عکس نیست.
  for (const py of ['python3', 'python']) {
    if (!has(py)) continue;
    const ok = cp.spawnSync(py, ['-c', 'import PIL'], { stdio: 'ignore' }).status === 0;
    if (!ok) continue;
    const script = `
import sys
from PIL import Image
src, dst, q, m = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src)
if im.mode in ('P', 'LA'): im = im.convert('RGBA')
if max(im.size) > m:
    im.thumbnail((m, m), Image.LANCZOS)
im.save(dst, 'WEBP', quality=q, method=6)
`;
    return {
      name: `${py} + Pillow`,
      run: (s, d) => cp.spawnSync(py, ['-c', script, s, d, String(QUALITY), String(MAX_EDGE)], { stdio: 'ignore' }).status === 0,
      resize: (s, d, w) => cp.spawnSync(py, ['-c', script, s, d, String(QUALITY), String(w)], { stdio: 'ignore' }).status === 0
    };
  }
  return null;
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
const SMALL_SIZES = [
  { w: 320, minSource: 420 },   // منبعی که خودش نزدیکِ ۳۲۰ است، کوچک‌کردن ندارد
  { w: 560, minSource: 700 },
];
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
console.log('  بهینه‌سازی عکس‌ها — ساختِ نسخه‌ی WebP');
console.log('════════════════════════════════════════════\n');

const enc = pickEncoder();
if (!enc) {
  console.log('  هیچ ابزارِ تبدیلِ عکسی روی این سیستم پیدا نشد.');
  console.log('  یکی از این‌ها را نصب کنید و دوباره اجرا کنید:');
  console.log('    • cwebp  (بسته‌ی webp گوگل — سبک‌ترین گزینه)');
  console.log('    • ImageMagick');
  console.log('    • ffmpeg');
  console.log('    • Python با کتابخانه‌ی Pillow');
  console.log('\n  سایت بدون این کار هم درست کار می‌کند؛ فقط عکس‌ها سنگین‌تر می‌مانند.\n');
  process.exit(0);
}
console.log(`  انکودر: ${enc.name}   کیفیت: ${QUALITY}   بزرگ‌ترین ضلع: ${MAX_EDGE}px\n`);

const files = walk(PICTURE_DIR)
  .filter(f => /\.(jpe?g|jfif|png)$/i.test(f))
  // خروجی‌های خودمان نباید ورودیِ دورِ بعد شوند
  .filter(f => !/-\d+w\.[a-z0-9]+$/i.test(f));
if (!files.length) {
  console.log('  عکسی برای تبدیل پیدا نشد.\n');
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
    console.log(`  ✗ ${rel} — تبدیل نشد`);
    return null;
  }

  const dstSize = fs.statSync(dst).size;
  // اگر WebP بزرگ‌تر درآمد (روی عکس‌های خیلی کوچک یا از قبل فشرده پیش می‌آید)
  // نگهش نمی‌داریم؛ داشتنش فقط دیسک می‌خورد و سرور را گمراه می‌کند.
  if (dstSize >= srcSize) {
    fs.unlinkSync(dst);
    skipped++;
    console.log(`  · ${rel} — WebP بزرگ‌تر شد (${kb(dstSize)} > ${kb(srcSize)})، همان اصل می‌ماند`);
    return null;
  }

  made++;
  before += srcSize;
  after += dstSize;
  console.log(`  ✓ ${rel}  ${kb(srcSize)} → ${kb(dstSize)}  (${Math.round((1 - dstSize / srcSize) * 100)}% کمتر)`);
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
        console.log(`      └ نسخه‌ی ${s.w}px  ${kb(nowSize)} → ${kb(tSize)}`);
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
      console.log(`      └ نسخه‌ی ${w}px  ${kb(vs)}`);
    }
  }
}

console.log('');
console.log('════════════════════════════════════════════');
console.log(`  ساخته‌شده: ${made}   بندانگشتی: ${thumbsMade}   نسخه‌ی کم‌عرض: ${variants}   رد‌شده: ${skipped}   ناموفق: ${failed}`);
if (made) {
  const cut = Math.round((1 - after / before) * 100);
  console.log(`  حجم: ${kb(before)} → ${kb(after)}  یعنی ${cut}% کمتر`);
}
if (fullBytes) {
  const cut = Math.round((1 - thumbBytes / fullBytes) * 100);
  console.log(`  بندانگشتی‌ها (کادرِ کوچکِ جست‌وجو/سبد/پنل): ${kb(fullBytes)} → ${kb(thumbBytes)}  یعنی ${cut}% کمتر`);
}
if (oversized.length) {
  console.log('\n  عکس‌های بی‌دلیل بزرگ (بهتر است در پنل با نسخه‌ی کوچک‌تر عوض شوند):');
  for (const o of oversized) console.log('    ⚠  ' + o);
}
console.log('════════════════════════════════════════════\n');

process.exit(failed ? 1 : 0);
