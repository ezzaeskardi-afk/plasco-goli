// image-encode.js — پیدا کردنِ انکودرِ عکس و ساختِ نسخه‌ی WebP / سایزهای کوچک
//
// چرا این فایل ساخته شد: منطقِ «کدام ابزارِ تبدیلِ عکس روی این سیستم هست» فقط
// داخل tools/optimize-images.js بود، یعنی فقط وقتی کار می‌کرد که مالک آن دستور
// را *به‌یاد بیاورد*. عکسی که از پنل آپلود می‌شد نسخه‌ی سبک نمی‌گرفت و سنگین
// سرو می‌شد. با ۹۶ عکسِ در راه، «یادش می‌ماند» تکیه‌گاهِ خوبی نیست.
//
// حالا هر دو مسیر از همین‌جا استفاده می‌کنند، پس خروجی‌شان بیت‌به‌بیت یکی است و
// اگر روزی کیفیت یا عرض‌ها عوض شود، یک جا عوض می‌شود.
//
// ---------- تفاوتِ مهم با ابزار: همگام یا ناهمگام ----------
// ابزارِ خطِ فرمان می‌تواند spawnSync بزند؛ کسی منتظر نیست.
// مسیرِ آپلود **نباید**: موتورِ ما همگام است و spawnSync کلِ سایت را برای
// چند صد میلی‌ثانیه (تا چند ثانیه) قفل می‌کند — همان گناهی که در نسخه‌ی ۱۱ سرِ
// فشرده‌سازی گرفتیم. پس اینجا نسخه‌ی ناهمگام با spawn هست و مسیرِ آپلود اول
// جواب می‌دهد، بعد در پس‌زمینه تبدیل می‌شود.
//
// بدون هیچ پکیج npm. اگر هیچ ابزاری نبود، همه‌چیز مثل قبل کار می‌کند و فقط
// عکس‌ها سنگین می‌مانند (lib/webp-negotiate.js خودش به اصل برمی‌گردد).

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// کیفیت ۷۸: بینِ ۸۲ (که فایل را بی‌دلیل سنگین نگه می‌داشت) و ۷۵ (که روی لبه‌ی
// عکسِ محصول با پس‌زمینه‌ی روشن دیده می‌شد). در webp، فاصله‌ی ۸۲ تا ۷۸ حدود
// ۱۵-۲۰٪ حجم کم می‌کند و اختلافش روی عکسِ محصولِ ما با چشم دیده نمی‌شود —
// چون این عکس‌ها بافتِ ریزِ زیاد ندارند، سطحِ صافِ پلاستیک و چوب‌اند.
const QUALITY = 78;
const MAX_EDGE = 1400; // بزرگ‌تر از این روی هیچ صفحه‌ای دیده نمی‌شود

// عرض‌های کوچک و «حداقل عرضِ منبع» برای هر کدام. اگر منبع خودش کوچک‌تر از
// minSource باشد، ساختنِ نسخه‌ی کوچک‌تر صرف ندارد و رد می‌شود.
// این دو عدد با اندازه‌گیریِ واقعیِ کادرها انتخاب شده‌اند — توضیحِ کاملش در
// tools/optimize-images.js است و اینجا تکرار نمی‌شود.
const SMALL_SIZES = [
  { w: 320, minSource: 420 },
  { w: 560, minSource: 700 }
];

const PIL_SCRIPT = `
import sys
from PIL import Image
src, dst, q, m = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src)
if im.mode in ('P', 'LA'): im = im.convert('RGBA')
if max(im.size) > m:
    im.thumbnail((m, m), Image.LANCZOS)
im.save(dst, 'WEBP', quality=q, method=6)
`;

const has = (cmd) => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return cp.spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

// هر انکودر به شکلِ «دستور + آرگومان‌ها» توصیف می‌شود، نه به شکلِ تابعی که
// خودش اجرا می‌کند. دلیلش این است که همین توصیف را هم spawnSync (ابزار) و هم
// spawn (آپلود) می‌توانند اجرا کنند، بدون دو بار نوشتنِ آرگومان‌ها.
function pickEncoder() {
  if (has('cwebp')) {
    return {
      name: 'cwebp',
      cmd: 'cwebp',
      args: (src, dst, w) => ['-q', String(QUALITY), '-resize', String(w || 0), '0', src, '-o', dst]
    };
  }
  for (const im of ['magick', 'convert']) {
    if (!has(im)) continue;
    // ---------- تله‌ی ویندوز ----------
    // روی ویندوز `convert.exe` یک برنامه‌ی خودِ سیستم است که فایل‌سیستمِ FAT را
    // به NTFS تبدیل می‌کند — هیچ ربطی به عکس ندارد. `where convert` پیدایش
    // می‌کند و ما با آرگومان‌های عکس صداش می‌زدیم. خطرِ واقعی نیست (با آن
    // آرگومان‌ها کاری نمی‌کند و کدِ خطا می‌دهد) ولی نتیجه‌اش این است که مالک
    // فکر می‌کند انکودر دارد و هیچ نسخه‌ی سبکی ساخته نمی‌شود، بدون پیامِ روشن.
    // پس می‌پرسیم «تو ImageMagick هستی؟» و فقط اگر خودش گفت، قبول می‌کنیم.
    const v = cp.spawnSync(im, ['-version'], { encoding: 'utf8' });
    if (!/imagemagick/i.test(String(v.stdout || '') + String(v.stderr || ''))) continue;
    return {
      name: im,
      cmd: im,
      args: (src, dst, w) => [src, '-quality', String(QUALITY),
        '-resize', w ? `${w}x>` : `${MAX_EDGE}x${MAX_EDGE}>`, dst]
    };
  }
  if (has('ffmpeg')) {
    return {
      name: 'ffmpeg',
      cmd: 'ffmpeg',
      args: (src, dst, w) => ['-y', '-loglevel', 'error', '-i', src,
        '-vf', `scale='min(${w || MAX_EDGE},iw)':-1`, '-quality', String(QUALITY), dst]
    };
  }
  for (const py of ['python3', 'python']) {
    if (!has(py)) continue;
    if (cp.spawnSync(py, ['-c', 'import PIL'], { stdio: 'ignore' }).status !== 0) continue;
    return {
      name: `${py} + Pillow`,
      cmd: py,
      args: (src, dst, w) => ['-c', PIL_SCRIPT, src, dst, String(QUALITY), String(w || MAX_EDGE)]
    };
  }
  return null;
}

// انکودر یک بار پیدا می‌شود و کش می‌شود: has() برای هر بار چند spawnSync است و
// روی مسیرِ آپلود نباید تکرار شود.
let cachedEncoder;
let encoderResolved = false;
function encoder() {
  if (!encoderResolved) { cachedEncoder = pickEncoder(); encoderResolved = true; }
  return cachedEncoder;
}

// نامِ خروجی‌ها. سرور (lib/webp-negotiate.js) فقط webp را می‌گردد، پس نسخه‌ی
// کوچکِ jpg هیچ مصرف‌کننده‌ای ندارد و ساخته نمی‌شود.
const webpPathFor = (src) => src.replace(/\.(jpe?g|jfif|png)$/i, '.webp');
const smallPathFor = (src, w) => src.replace(/\.(jpe?g|jfif|png)$/i, `-${w}w.webp`);

// ---------- نسخه‌ی ناهمگام (برای مسیرِ آپلود) ----------
// یک صف با ظرفیتِ ۱: اگر مالک ۹۶ عکس را پشت‌سرهم آپلود کند، بدون صف ۹۶ پروسه
// هم‌زمان بالا می‌آید و ماشین را زمین می‌زند. یکی‌یکی، بی‌سروصدا، در پس‌زمینه.
const queue = [];
let running = false;

function runOne(enc, src, dst, width) {
  return new Promise((resolve) => {
    // spawn و نه spawnSync: موتور همگام است و spawnSync کلِ سایت را قفل می‌کند.
    const child = cp.spawn(enc.cmd, enc.args(src, dst, width), { stdio: 'ignore' });
    // نگهبانِ زمان: فایلِ خراب می‌تواند انکودر را معلق کند و آن پروسه تا ابد
    // بماند. ۳۰ ثانیه برای هر عکس با فاصله کافی است.
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 30_000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && fs.existsSync(dst) && fs.statSync(dst).size > 0);
    });
  });
}

async function drain(log) {
  if (running) return;
  running = true;
  while (queue.length) {
    const src = queue.shift();
    const enc = encoder();
    if (!enc) break;
    try {
      if (!fs.existsSync(src)) continue; // بین صف و اجرا حذف شده
      const srcSize = fs.statSync(src).size;
      const dim = require('./imagesize').imageSizeFromFile(src);
      const made = [];

      // ۱) نسخه‌ی کاملِ webp
      //
      // عرضِ هدف را فقط وقتی می‌دهیم که عکس واقعاً از MAX_EDGE بزرگ‌تر باشد.
      // دلیلش cwebp است: بقیه‌ی انکودرها «فقط کوچک کن» می‌فهمند (`1400x>` در
      // ImageMagick، `min(1400,iw)` در ffmpeg، thumbnail در Pillow) ولی cwebp
      // چنین حالتی ندارد و `-resize 1400 0` روی عکسِ ۸۰۰ پیکسلی آن را
      // **بزرگ** می‌کند — یعنی فایلِ سنگین‌ترِ تارتر. با این شرط، هیچ انکودری
      // به بزرگ‌کردن نمی‌رسد.
      const clamp = (dim && dim.width > MAX_EDGE) ? MAX_EDGE : 0;
      const full = webpPathFor(src);
      if (full !== src && await runOne(enc, src, full, clamp)) {
        // اگر webp از اصل بزرگ‌تر درآمد (روی عکسِ خیلی کوچک پیش می‌آید)
        // نگهش نمی‌داریم؛ وگرنه سرور نسخه‌ی *سنگین‌تر* را تحویل می‌دهد.
        if (fs.statSync(full).size < srcSize) made.push(path.basename(full));
        else { try { fs.unlinkSync(full); } catch (e) {} }
      }

      // ۲) سایزهای کوچک — فقط اگر منبع به‌قدر کافی بزرگ باشد
      for (const s of SMALL_SIZES) {
        if (dim && dim.width < s.minSource) continue;
        const out = smallPathFor(src, s.w);
        if (out !== src && await runOne(enc, src, out, s.w)) made.push(path.basename(out));
      }

      if (log && made.length) {
        log.info(`Image variants built for ${path.basename(src)}: ${made.join(', ')}`);
      } else if (log && !made.length) {
        log.warn(`Image variants FAILED for ${path.basename(src)} (encoder: ${enc.name})`);
      }
    } catch (e) {
      if (log) log.warn(`Image variant error for ${path.basename(src)}: ${e.message}`);
    }
  }
  running = false;
}

// مسیرِ آپلود این را صدا می‌زند و **منتظر نمی‌ماند**.
// اگر انکودری روی سیستم نباشد، یک بار هشدار می‌دهد و تمام: سایت درست کار
// می‌کند، فقط عکس‌ها سنگین می‌مانند.
let warnedNoEncoder = false;
function queueVariants(absPath, log) {
  if (!encoder()) {
    if (log && !warnedNoEncoder) {
      warnedNoEncoder = true;
      log.warn('No image encoder found (cwebp/ImageMagick/ffmpeg/Pillow) - uploaded images stay at full size. Install one to shrink them automatically.');
    }
    return false;
  }
  queue.push(absPath);
  // setImmediate تا پاسخِ HTTP اول برود
  setImmediate(() => { drain(log).catch(() => {}); });
  return true;
}

// برای تست: می‌خواهیم بشود منتظرِ تمام‌شدنِ صف ماند.
function pendingCount() { return queue.length + (running ? 1 : 0); }

module.exports = {
  QUALITY, MAX_EDGE, SMALL_SIZES,
  pickEncoder, encoder,
  webpPathFor, smallPathFor,
  queueVariants, pendingCount
};
