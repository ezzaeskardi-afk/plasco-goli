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
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const PROJECT_DIR = path.join(BACKEND_DIR, '..');
const PICTURE_PRODUCTS = path.join(PROJECT_DIR, 'picture', 'products');
const REAL_DATA_DIR = path.join(BACKEND_DIR, 'data');

// ساخت پوشه‌ی داده‌ی یک‌بارمصرف با کپیِ دیتابیس واقعی.
// فایل‌های `-wal` و `-shm` هم کپی می‌شوند: اگر سرورِ ویندوزیِ کاربر روشن باشد،
// آخرین نوشته‌ها فقط داخل WAL هستند و کپیِ تنهای `.db` وضعیتی چند دقیقه عقب‌تر
// می‌داد — تستی که دنبال محصول شماره‌ی ۱ است الکی رد می‌شد.
function makeSandboxData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-test-'));
  const realDb = path.join(REAL_DATA_DIR, 'polasco.db');
  if (fs.existsSync(realDb)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const src = realDb + suffix;
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, 'polasco.db' + suffix));
    }
  }
  return dir;
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
    MAX_SMS_PER_IP_PER_DAY: '10000',
    API_RATE_LIMIT: '10000',
    WRITE_RATE_LIMIT: '10000',
    TRUST_PROXY: '0',
    ...extra
  };
}

module.exports = {
  BACKEND_DIR, PROJECT_DIR, PICTURE_PRODUCTS, REAL_DATA_DIR,
  makeSandboxData, removeSandboxData, serverEnv
};
