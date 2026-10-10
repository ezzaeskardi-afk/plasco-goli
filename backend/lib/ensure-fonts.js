// ensure-fonts.js — بررسی وجود فونت‌های لوکال در بالا آمدن سرور
//
// فونت‌ها به‌صورت لوکال در `next-frontend/public/assets/fonts` نگهداری می‌شوند تا
// سایت به هیچ CDN خارجی وابسته نباشد (مهم برای سرعت و برای کاربر ایرانی).
// چرا این‌جا (بک‌اند) چک می‌شوند: این فایل آخرین بازمانده‌ی نگهبانِ فونتِ عصرِ
// Express است و اولِ بالا آمدن همه‌جا اجرا می‌شود؛ ولی مرجعش دیگر پوشهٔ Next است،
// چون همان‌جاست که فروشگاه (و @font-face در globals.css) از آن سرو می‌شود.
// این فایل دیگر چیزی دانلود نمی‌کند — فقط چک می‌کند فایل‌هایی که CSS
// صدا می‌زند سرِ جایشان هستند و اگر نبودند یک هشدار روشن چاپ می‌کند.
// اگر فونتی نبود سایت کرش نمی‌کند؛ مرورگر می‌افتد روی فونت جایگزین سیستم.

const fs = require('fs');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', '..', 'next-frontend', 'public', 'assets', 'fonts');

// همان فایل‌هایی که در @font-face های `next-frontend/src/app/globals.css` آمده‌اند.
// اولی (وزن ۴۰۰) حیاتی است؛ بقیه اگر نباشند فقط ضخامت‌ها یکسان می‌شوند.
const REQUIRED = ['Vazir-FD-WOL.woff2'];
const OPTIONAL = [
  'Vazir-Thin-FD-WOL.woff2',
  'Vazir-Light-FD-WOL.woff2',
  'Vazir-Medium-FD-WOL.woff2',
  'Vazir-Bold-FD-WOL.woff2'
];

// فایل woff2 معتبر با امضای «wOF2» شروع می‌شود
function isValidWoff2(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.toString('ascii') === 'wOF2' && fs.statSync(file).size > 5000;
  } catch (e) {
    return false;
  }
}

async function ensureFonts() {
  const missing = [];
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    if (!isValidWoff2(path.join(FONT_DIR, name))) missing.push(name);
  }
  if (!missing.length) return;

  const criticalMissing = missing.some((m) => REQUIRED.includes(m));
  const level = criticalMissing ? '[WARN]' : '[NOTE]';
  console.warn(`${level} Missing local font file(s) in next-frontend/public/assets/fonts: ${missing.join(', ')}`);
  if (criticalMissing) {
    console.warn('       The site will fall back to a system font (Tahoma). Put the .woff2 files there and restart.');
  }
}

module.exports = { ensureFonts };
