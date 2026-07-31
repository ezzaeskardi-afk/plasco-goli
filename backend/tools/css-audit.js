#!/usr/bin/env node
/* ============================================================
   css-audit.js — بازرسِ ریسپانسیو و سلامت استایل
   ------------------------------------------------------------
   بدون هیچ پکیج بیرونی. سه کار می‌کند:
     ۱) هر @media را می‌خواند و برای عرض‌های واقعی گوشی/تبلت/دسکتاپ
        «آبشار» را حساب می‌کند تا ببیند هر سلکتور نهایتاً چه مقداری می‌گیرد.
     ۲) متغیرهای CSS استفاده‌شده ولی تعریف‌نشده را پیدا می‌کند.
     ۳) خطرهای رایج موبایل را گزارش می‌دهد: اینپوت زیر ۱۶px (زوم iOS)،
        عرض ثابتِ بزرگ‌تر از صفحه، هدف لمسی کوچک‌تر از ۴۰px.

   اجرا:  node tools/css-audit.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const CSS_FILE = path.join(__dirname, '..', '..', 'frontend', 'css', 'style.css');
const css = fs.readFileSync(CSS_FILE, 'utf8');

// عرض‌هایی که واقعاً مهم‌اند (گوشی‌های رایج ایران + تبلت + لپ‌تاپ)
const VIEWPORTS = [
  { w: 320, name: 'گوشی خیلی کوچک' },
  { w: 360, name: 'اندروید معمولی' },
  { w: 390, name: 'آیفون ۱۴/۱۵' },
  { w: 430, name: 'آیفون پرو مکس' },
  { w: 540, name: 'گوشی بزرگ افقی' },
  { w: 640, name: 'مرز موبایل/تبلت' },
  { w: 768, name: 'تبلت عمودی' },
  { w: 900, name: 'تبلت افقی' },
  { w: 1080, name: 'لپ‌تاپ کوچک' },
  { w: 1280, name: 'دسکتاپ' },
  { w: 1920, name: 'مانیتور بزرگ' }
];

// ---------- تجزیه‌ی ساده‌ی CSS ----------
// کامنت‌ها را برمی‌داریم تا داخلشان دنبال قاعده نگردیم
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

// همه‌ی بلاک‌های @media با محدوده‌شان
function parseBlocks(text) {
  const rules = [];        // {media:null|string, selector, body}
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('@media', i);
    if (at === -1) { collectRules(text.slice(i), null, rules); break; }
    collectRules(text.slice(i, at), null, rules);
    const braceStart = text.indexOf('{', at);
    const cond = text.slice(at + 6, braceStart).trim();
    // پیدا کردن آکولاد بسته‌ی متناظر
    let depth = 0, j = braceStart;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) break; }
    }
    collectRules(text.slice(braceStart + 1, j), cond, rules);
    i = j + 1;
  }
  return rules;
}

function collectRules(chunk, media, out) {
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(chunk))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ media, selector, body: m[2].trim() });
  }
}

// آیا این @media در عرض داده‌شده فعال است؟
function mediaMatches(cond, width) {
  if (!cond) return true;
  if (/prefers-reduced-motion|hover\s*:|print|forced-colors/.test(cond)) return false;
  let ok = true;
  const max = cond.match(/max-width\s*:\s*(\d+)px/);
  const min = cond.match(/min-width\s*:\s*(\d+)px/);
  if (max) ok = ok && width <= Number(max[1]);
  if (min) ok = ok && width >= Number(min[1]);
  return ok;
}

const RULES = parseBlocks(clean);

// آخرین مقدارِ یک property برای یک سلکتور در عرض مشخص
function resolve(selectorExact, prop, width) {
  let val = null;
  for (const r of RULES) {
    if (!mediaMatches(r.media, width)) continue;
    const sels = r.selector.split(',').map(s => s.trim());
    if (!sels.includes(selectorExact)) continue;
    const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
    const hit = r.body.match(re);
    if (hit) val = hit[1].trim();
  }
  return val;
}

let problems = 0;
const warn = (msg) => { problems++; console.log('  ⚠  ' + msg); };

console.log('\n════════════════════════════════════════════');
console.log('  بازرسی ریسپانسیو — پلاسکو گلی');
console.log('════════════════════════════════════════════\n');

// ---------- ۱) شبکه‌ها در هر عرض ----------
const GRIDS = [
  ['.product-grid', 'گرید محصولات'],
  ['.cat-grid', 'دسته‌بندی‌ها'],
  ['.feature-grid', 'ویژگی‌ها'],
  ['.testi-grid', 'نظرات'],
  ['.footer-grid', 'فوتر'],
  ['.hero-grid', 'هیرو'],
  ['.about-grid', 'درباره ما'],
  ['.contact-grid', 'تماس'],
  ['.cart-layout', 'سبد خرید'],
  ['.account-grid', 'حساب کاربری'],
  ['.pd-layout', 'صفحه محصول'],
  ['.qv-dialog', 'نمای سریع']
];

console.log('┌─ تعداد ستون‌ها در هر عرض صفحه\n');
const header = 'شبکه'.padEnd(22) + VIEWPORTS.map(v => String(v.w).padStart(5)).join('');
console.log('  ' + header);
console.log('  ' + '─'.repeat(header.length));

for (const [sel, label] of GRIDS) {
  const row = VIEWPORTS.map(v => {
    const val = resolve(sel, 'grid-template-columns', v.w);
    if (!val) return '  — ';
    const rep = val.match(/repeat\((\d+)/);
    let n = rep ? Number(rep[1]) : val.split(/\s+(?![^(]*\))/).length;
    return String(n).padStart(5);
  });
  console.log('  ' + label.padEnd(22) + row.join(''));
}

// هیچ شبکه‌ای نباید روی موبایل بیشتر از ۲ ستون بماند
console.log('\n┌─ بررسی سلامت\n');
for (const [sel, label] of GRIDS) {
  for (const v of VIEWPORTS.filter(x => x.w <= 430)) {
    const val = resolve(sel, 'grid-template-columns', v.w);
    if (!val) continue;
    const rep = val.match(/repeat\((\d+)/);
    const n = rep ? Number(rep[1]) : val.split(/\s+(?![^(]*\))/).length;
    if (n > 2) warn(`${label} (${sel}) در عرض ${v.w}px هنوز ${n} ستون است — روی گوشی له می‌شود`);
  }
}

// ---------- ۲) متغیرهای تعریف‌نشده ----------
// var(--x, fallback) عمداً بی‌تعریف می‌ماند: مقدارش را JS در زمان اجرا می‌گذارد و
// fallback حالتِ «نگذاشته» را پوشش می‌دهد. پس فقط varهای بی‌fallback خطرناک‌اند.
const used = new Set([...clean.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(m => m[1]));
const defined = new Set([...clean.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
for (const u of used) if (!defined.has(u)) warn(`متغیر ${u} استفاده شده ولی هیچ‌جا تعریف نشده`);

// ---------- ۳) خطرهای موبایل ----------
// اینپوت‌های زیر ۱۶px که باعث زوم خودکار iOS می‌شوند
for (const r of RULES) {
  if (!/input|select|textarea/.test(r.selector)) continue;
  if (/::placeholder|::-webkit/.test(r.selector)) continue;
  const fs_ = r.body.match(/font-size\s*:\s*([\d.]+)px/);
  if (!fs_) continue;
  const size = Number(fs_[1]);
  if (size >= 16) continue;
  // اگر قاعده‌ی جبرانی موبایل داریم مشکلی نیست
  const fixed = RULES.some(x =>
    x.media && /max-width\s*:\s*(9\d\d|[1-9]\d{3})px/.test(x.media) &&
    /input/.test(x.selector) && /font-size\s*:\s*16px/.test(x.body));
  if (!fixed) warn(`«${r.selector}» فونت ${size}px دارد — سافاری iOS موقع تایپ زوم می‌کند`);
}

// عرض ثابتِ بزرگ‌تر از باریک‌ترین گوشی
for (const r of RULES) {
  const m = r.body.match(/(?:^|;)\s*width\s*:\s*(\d+)px/);
  if (!m) continue;
  const w = Number(m[1]);
  if (w <= 320) continue;
  if (/min-width|max-width/.test(r.body.slice(Math.max(0, r.body.indexOf(m[0]) - 10), r.body.indexOf(m[0])))) continue;
  // آیا در بریک‌پوینتی اصلاح شده؟ دو راه‌حل معتبر است: عرض عوض شود، یا المان
  // روی موبایل کلاً مخفی شود (display:none) — چیزی که رسم نمی‌شود سرریز هم نمی‌کند.
  // نمونه‌اش هاله‌های تزئینیِ صفحه‌ی ورود است که فقط روی دسکتاپ دیده می‌شوند.
  const fixedLater = RULES.some(x => x.media && mediaMatches(x.media, 360) &&
    x.selector.split(',').map(s => s.trim()).includes(r.selector.trim()) &&
    (/width\s*:/.test(x.body) || /display\s*:\s*none/.test(x.body)));
  if (!fixedLater) warn(`«${r.selector.slice(0, 46)}» عرض ثابت ${w}px دارد — روی گوشی ۳۲۰px سرریز می‌کند`);
}

// هدف‌های لمسی کوچک — لیست دستی نگه نمی‌داریم چون هر دکمه‌ی تازه‌ای که اضافه
// می‌شود از قلم می‌افتد؛ خودمان هر انتخابگری که بوی «دکمه» می‌دهد را جمع می‌کنیم.
const TOUCHY = /(^|[\s.#])([\w-]*(btn|button|close|toggle|chip|tab|remove|edit|del)[\w-]*)$/i;
const touchSels = new Set(['.wish-btn', '.ft-clear', '.qv-close', '.icon-btn', '.to-top']);
for (const r of RULES) {
  for (const s of r.selector.split(',')) {
    const sel = s.trim();
    // فقط انتخابگرهای ساده؛ ترکیب‌های عمیق و حالت‌ها (hover/disabled) را رد می‌کنیم
    if (/[:>\[+~]|\s/.test(sel)) continue;
    if (TOUCHY.test(sel)) touchSels.add(sel);
  }
}
for (const sel of [...touchSels].sort()) {
  // پنل مدیریت استثناست: با ماوس روی دسکتاپ استفاده می‌شود و بعضی دکمه‌هایش
  // (مثل حذفِ روی بندانگشتیِ ۶۴px) اگر ۴۰px شوند خودِ تصویر را می‌پوشانند.
  if (/^\.(ad-|pm-|ps-|admin)/.test(sel)) continue;
  const h = resolve(sel, 'height', 390) || resolve(sel, 'min-height', 390);
  if (!h) continue;
  const px = Number((h.match(/([\d.]+)px/) || [])[1]);
  if (px && px < 40) warn(`${sel} روی موبایل ${px}px است — هدف لمسی توصیه‌شده ۴۰px به بالاست`);
}

// متن خیلی ریز روی موبایل.
// آستانه ۱۰px است نه ۱۱: بج‌ها و شمارنده‌ها (تعداد سبد، درصد تخفیف، برچسب
// «جدید») عمداً ۱۰.۵px هستند و چون فقط یک-دو رقم/کلمه‌اند خوانا می‌مانند —
// هشدار دادن برایشان باعث می‌شود آدم به کل خروجی این ابزار بی‌اعتماد شود.
// پنل مدیریت هم استثناست: با ماوس و روی دسکتاپ استفاده می‌شود.
const TINY_SKIP = /^\.(ad-|pm-|ps-|chart-|admin)|::(before|after|placeholder)|\bsup\b|count|badge|arrow/i;
for (const r of RULES) {
  if (r.media && !mediaMatches(r.media, 390)) continue;
  if (TINY_SKIP.test(r.selector.trim())) continue;
  const m = r.body.match(/font-size\s*:\s*([\d.]+)px/);
  if (!m || Number(m[1]) >= 10) continue;
  warn(`«${r.selector.slice(0, 46)}» فونت ${m[1]}px دارد — روی گوشی تقریباً ناخواناست`);
}

// نوارهای چسبیده به کف صفحه بدون در نظر گرفتن ناحیه‌ی امن آیفون: روی گوشی‌های
// بدون دکمه‌ی هوم، نوار خانه‌ی سیستم رویشان می‌افتد و دکمه غیرقابل‌لمس می‌شود.
for (const r of RULES) {
  if (!/position\s*:\s*fixed/.test(r.body)) continue;
  if (!/(?:^|;)\s*bottom\s*:\s*0/.test(r.body)) continue;
  const sel = r.selector.trim();
  const hasSafe = RULES.some(x => x.selector.split(',').map(s => s.trim()).includes(sel) &&
    /safe-area-inset-bottom/.test(x.body));
  if (!hasSafe) warn(`«${sel.slice(0, 46)}» به کف چسبیده ولی safe-area-inset-bottom ندارد — روی آیفون زیر نوار خانه می‌رود`);
}

// ---------- ۴) گزارش پایانی ----------
console.log('');
console.log('════════════════════════════════════════════');
if (problems === 0) {
  console.log('  ✓ هیچ ایرادی پیدا نشد — همه‌ی بخش‌ها ریسپانسیو‌اند');
} else {
  console.log(`  ${problems} مورد برای بررسی پیدا شد`);
}
console.log(`  ${RULES.length} قاعده‌ی CSS در ${new Set(RULES.filter(r => r.media).map(r => r.media)).size} @media بررسی شد`);
console.log('════════════════════════════════════════════\n');

process.exit(0);
