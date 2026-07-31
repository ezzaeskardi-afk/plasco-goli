// ابزار مشترک شماره موبایل + شماره‌های مدیر
// (قبلاً این منطق در auth.js و admin.js کپی شده بود — حالا یک‌جا)

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

// «فقط ارقام»: فارسی/عربی → لاتین و حذف هر چیز دیگر.
//
// این تابع جداست و عمداً هیچ قاعده‌ی پیش‌شماره‌ای ندارد، چون برای «کد ورود»
// هم استفاده می‌شود. اگر کد را با normalizePhone پاک‌سازی کنیم، کدی مثل
// ۹۸۱۲۳ به ۰۱۲۳ تبدیل می‌شود و کاربر با کد درست هم رد می‌شود.
// کدها ۵ رقمی و در بازه‌ی ۱۰۰۰۰..۹۹۹۹۸ هستند، پس حدود ۱٪ آن‌ها با ۹۸ شروع
// می‌شوند — یعنی این تفکیک واقعاً لازم است نه احتیاطِ تئوری.
function normalizeDigits(input) {
  return String(input ?? '')
    .replace(/[۰-۹]/g, d => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
    .replace(/\D/g, '');
}

// شماره‌ی موبایل ایران را به شکل یکدست 09XXXXXXXXX درمی‌آورد.
// همه‌ی این‌ها یک شماره‌اند و همه باید پذیرفته شوند:
//   09123456789 · ۰۹۱۲۳۴۵۶۷۸۹ · 0912 345 6789 · 0912-345-6789
//   +989123456789 · 989123456789 · 00989123456789 · 9123456789
//
// چرا مهم است: کاربر ایرانی شماره را به هر شکلی می‌نویسد و اگر فقط یک شکل را
// قبول کنیم، ورودیِ درست را «نامعتبر» اعلام می‌کنیم — بدترین نوع خطا.
function normalizePhone(phone) {
  let s = normalizeDigits(phone);

  if (s.startsWith('00')) s = s.slice(2);        // 00989123456789 → 989123456789

  // پیش‌شماره‌ی کشور فقط وقتی برداشته می‌شود که باقی‌مانده خودش شکل موبایل
  // داشته باشد. شرط لازم است: شماره‌ی داخلیِ 0989xxxxxxx (پیش‌شماره ۰۹۸)
  // نباید اشتباهی به عنوان کد کشور بریده شود.
  if (s.startsWith('98')) {
    const rest = s.slice(2);
    if (/^9\d{9}$/.test(rest) || /^09\d{9}$/.test(rest)) s = rest;
  }

  if (/^9\d{9}$/.test(s)) s = '0' + s;           // 9123456789 → 09123456789

  return s;
}

function isValidIranPhone(phone) {
  return /^09\d{9}$/.test(phone);
}

// شماره‌(های) مدیر فروشگاه از .env — ADMIN_PHONE=0911...,0912...
const ADMIN_PHONES = String(process.env.ADMIN_PHONE || '')
  .split(',').map(normalizePhone).filter(Boolean);

function isAdminPhone(phone) {
  return ADMIN_PHONES.includes(phone);
}

module.exports = { normalizeDigits, normalizePhone, isValidIranPhone, isAdminPhone, ADMIN_PHONES };
