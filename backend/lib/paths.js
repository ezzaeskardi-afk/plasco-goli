// paths.js — تنها منبعِ حقیقت برای محلِ پوشه‌ی عکس‌ها.
//
// چرا این فایل ساخته شد:
// مسیرِ پوشه‌ی `picture` قبلاً در **دو جا** جداگانه حساب می‌شد — یک بار در
// `server.js` (برای سرو کردن) و یک بار در `routes/admin.js` (برای ذخیره‌ی
// آپلود). تا وقتی هر دو ثابت بودند مشکلی نبود، ولی به محضِ اینکه یکی‌شان
// قابلِ تغییر شود و دیگری نه، سرور از پوشه‌ی الف می‌خواند و آپلود در پوشه‌ی
// ب می‌نویسد و عکسِ تازه‌آپلودشده «۴۰۴» می‌شود. با یک ماژولِ مشترک این
// دو هرگز از هم جدا نمی‌افتند.
//
// `PG_PICTURE_DIR` دقیقاً همان نقشی را دارد که `PG_DATA_DIR` برای دیتابیس
// دارد و تنها دلیلِ وجودش تست است: تستِ امنیت عکس آپلود می‌کند و اگر روی
// پوشه‌ی واقعی بنشیند، هر خطای وسطِ راه یعنی فایلِ آشغال در پوشه‌ی عکسِ
// مغازه جا می‌ماند. (این یک بار واقعاً اتفاق افتاد: دو فایلِ `p-…​.png`
// چون پاک‌سازیِ آخرِ تست شکست خورد، در پوشه‌ی واقعی ماندند.)
//
// مثل `PG_DATA_DIR`، اگر ست باشد با بنرِ پررنگ اعلام می‌شود — وگرنه یک نفر
// ندانسته سایتِ واقعی را روی پوشه‌ی خالی بالا می‌آورد و فکر می‌کند همه‌ی
// عکس‌های محصولات پریده است.
const path = require('path');

const REAL_PICTURE_DIR = path.join(__dirname, '..', '..', 'picture');

const PICTURE_DIR = process.env.PG_PICTURE_DIR
  ? path.resolve(process.env.PG_PICTURE_DIR)
  : REAL_PICTURE_DIR;

if (process.env.PG_PICTURE_DIR) {
  console.warn('\n' + '='.repeat(64));
  console.warn('  [!] PG_PICTURE_DIR is set — this is NOT the real picture folder.');
  console.warn(`      using : ${PICTURE_DIR}`);
  console.warn(`      real  : ${REAL_PICTURE_DIR}`);
  console.warn('      Unset PG_PICTURE_DIR to run the real site.');
  console.warn('='.repeat(64) + '\n');
}

// عکسِ محصولات؛ جایی که آپلودِ پنل می‌نشیند.
const PRODUCTS_PICTURE_DIR = path.join(PICTURE_DIR, 'products');

module.exports = { PICTURE_DIR, PRODUCTS_PICTURE_DIR, REAL_PICTURE_DIR };
