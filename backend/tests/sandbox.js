// کمکِ مشترکِ تست‌ها: یک «دیتابیسِ یک‌بارمصرف» می‌سازد و مسیرها را از روی محلِ
// همین فایل پیدا می‌کند.
//
// چرا: تست‌های امنیت و تخفیف قبلاً مسیر پوشه را به‌صورت ثابت داخل کد داشتند، پس
// روی کامپیوتر دیگری اجرا نمی‌شدند. مهم‌تر از آن، سرورِ تست را روی **دیتابیس
// واقعیِ مغازه** بالا می‌آوردند. تست تخفیف محصول می‌سازد و ویرایش گروهی می‌زند و
// تست امنیت عکس آپلود می‌کند؛ هر خطای وسط راه یعنی آشغال ماندن روی داده‌ی واقعی.
// یک بار همین دست‌درازی به فایل واقعی ۵۴ عدد از موجودی مغازه را خورد.
//
// حالا کپیِ دیتابیس در پوشه‌ی موقتِ سیستم ساخته می‌شود و سرور با `PG_DATA_DIR`
// روی همان کپی بالا می‌آید. هر چه تست بکند روی کپی است و آخر کار پاک می‌شود.
//
// همین کار برای **پوشه‌ی عکس** هم انجام می‌شود (`PG_PICTURE_DIR`). دلیلش یک
// اتفاقِ واقعی بود: تستِ امنیت عکس آپلود می‌کند و آخرِ کار پاکشان می‌کند، ولی
// وقتی پاک‌کردن شکست خورد (پوشه‌ی مانت‌شده اجازه‌ی حذف نداد) دو فایلِ آشغالِ
// `p-….png` در پوشه‌ی عکسِ **واقعیِ** مغازه جا ماندند. حالا آپلود اصلاً به
// پوشه‌ی واقعی نمی‌رسد؛ کپی می‌شود و کلِ کپی آخرِ کار دور ریخته می‌شود.
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const PROJECT_DIR = path.join(BACKEND_DIR, '..');
const REAL_PICTURE_DIR = path.join(PROJECT_DIR, 'picture');
const REAL_PICTURE_PRODUCTS = path.join(REAL_PICTURE_DIR, 'products');
const REAL_DATA_DIR = path.join(BACKEND_DIR, 'data');

// ساخت پوشه‌ی داده‌ی یک‌بارمصرف با کپیِ دیتابیس واقعی.
// فایل‌های `-wal` و `-shm` هم کپی می‌شوند: اگر سرورِ ویندوزیِ کاربر روشن باشد،
// آخرین نوشته‌ها فقط داخل WAL هستند و کپیِ تنهای `.db` وضعیتی چند دقیقه عقب‌تر
// می‌داد — تستی که دنبال محصول شماره‌ی ۱ است الکی رد می‌شد.
//
// عکس‌ها هم کنارش کپی می‌شوند (زیرپوشه‌ی `picture`). **کپیِ کامل** لازم است نه
// پوشه‌ی خالی: تست‌های V24 و V26 نسخه‌ی webp و بندانگشتیِ عکس‌های واقعی را
// می‌سنجند و روی پوشه‌ی خالی الکی قرمز می‌شدند. کلِ پوشه حدود ۱ مگابایت است.
function makeSandboxData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-test-'));
  const realDb = path.join(REAL_DATA_DIR, 'polasco.db');
  if (fs.existsSync(realDb)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const src = realDb + suffix;
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, 'polasco.db' + suffix));
    }
  }
  if (fs.existsSync(REAL_PICTURE_DIR)) {
    fs.cpSync(REAL_PICTURE_DIR, path.join(dir, 'picture'), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, 'picture', 'products'), { recursive: true });
  return dir;
}

// پوشه‌ی عکسِ سندباکس که با همان `dataDir` برگشتیِ بالا ساخته شده.
// تست‌ها باید **این** را ببینند، نه پوشه‌ی واقعی را.
function sandboxPictureDir(dataDir) {
  return path.join(dataDir, 'picture');
}
function sandboxPictureProducts(dataDir) {
  return path.join(dataDir, 'picture', 'products');
}

// پاک‌کردنِ پوشه‌ی موقت. هرگز throw نمی‌کند: اگر ویندوز فایل را قفل نگه داشته
// باشد، شکستِ پاک‌سازی نباید نتیجه‌ی تست را عوض کند.
function removeSandboxData(dir) {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* بی‌اهمیت */ }
}

// محیطِ استاندارد سرورِ تست: سقف‌های نرخ باز (وگرنه خودِ تست‌ها سهمیه را تمام
// می‌کنند)، پیامک خاموش، و دیتابیسِ یک‌بارمصرف.
function serverEnv(dataDir, extra = {}) {
  return {
    ...process.env,
    PG_DATA_DIR: dataDir,
    // بدونِ این خط، آپلودِ تست در پوشه‌ی عکسِ واقعیِ مغازه می‌نشیند.
    PG_PICTURE_DIR: sandboxPictureDir(dataDir),
    MAX_SMS_PER_IP_PER_DAY: '10000',
    API_RATE_LIMIT: '10000',
    WRITE_RATE_LIMIT: '10000',
    TRUST_PROXY: '0',
    ...extra
  };
}

module.exports = {
  BACKEND_DIR, PROJECT_DIR, REAL_DATA_DIR,
  REAL_PICTURE_DIR, REAL_PICTURE_PRODUCTS,
  sandboxPictureDir, sandboxPictureProducts,
  makeSandboxData, removeSandboxData, serverEnv
};
