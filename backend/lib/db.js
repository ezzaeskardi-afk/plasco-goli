// ============================================================
// دیتابیس SQLite — با ماژول داخلی خود Node (node:sqlite)
//
// چرا ماژول داخلی؟ هیچ پکیج native/کامپایلی لازم ندارد؛ یعنی نصب
// روی هر ویندوزی بدون کامپایلر و بدون دردسرِ اسکریپت‌های npm انجام
// می‌شود. همان تضمین‌ها را هم دارد:
//   - تراکنش واقعی (ACID): سفارش نصفه‌کاره ثبت نمی‌شود
//   - WAL: خواندن و نوشتن هم‌زمان، دو سفارش هم‌زمان تداخل ندارند
//   - خرابی برق/کرش: دیتا سالم می‌ماند
// ============================================================

const fs = require('fs');
const path = require('path');
const jalali = require('./jalali');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n[ERROR] Your Node.js version is too old and lacks the built-in SQLite module.');
  console.error('        Please install the latest LTS from https://nodejs.org (Node 22.5 or newer).\n');
  process.exit(1);
}

// پوشه‌ی داده. با `PG_DATA_DIR` می‌شود جای دیگری بردش و تنها دلیل وجود این
// متغیر تست است: تست باید روی **کپیِ** دیتابیس اجرا شود، نه روی فایل واقعیِ
// مغازه. یک بار تست دود ۵۴ عدد از موجودی واقعی را خورد؛ نگهبان موجودی الان
// جلویش را می‌گیرد، ولی راه‌حل درست این است که تست از اول به فایل واقعی دسترسی
// نداشته باشد.
// خطرش این است که کسی ندانسته سایت واقعی را روی یک پوشه‌ی خالی بالا بیاورد و
// فکر کند همه‌ی محصولات و سفارش‌ها پرید. پس اگر ست باشد، با بنر پررنگ اعلام
// می‌شود و مسیر واقعی هم کنارش چاپ می‌شود.
const DATA_DIR = process.env.PG_DATA_DIR
  ? path.resolve(process.env.PG_DATA_DIR)
  : path.join(__dirname, '..', 'data');
if (process.env.PG_DATA_DIR) {
  console.warn('\n' + '='.repeat(64));
  console.warn('  [!] PG_DATA_DIR is set — this is NOT the real shop database.');
  console.warn(`      using : ${DATA_DIR}`);
  console.warn(`      real  : ${path.join(__dirname, '..', 'data')}`);
  console.warn('      Unset PG_DATA_DIR to run the real site.');
  console.warn('='.repeat(64) + '\n');
}
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'polasco.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const isNewDb = !fs.existsSync(DB_FILE);

const db = new DatabaseSync(DB_FILE);

// WAL بهترین حالت است (خواندن و نوشتن هم‌زمان بدون قفل شدن)، ولی روی چند
// فایل‌سیستم خاص — درایو شبکه، پوشه‌ی همگام‌شده با OneDrive/Dropbox، یا
// دیسک مجازیِ مانت‌شده — فعال کردنش «disk I/O error» می‌دهد.
// در آن حالت به‌جای بالا نیامدنِ کل سایت، به journal معمولی برمی‌گردیم:
// کمی کندتر است ولی کاملاً سالم و بی‌خطر.
try {
  db.exec('PRAGMA journal_mode = WAL;');   // خواندن و نوشتن هم‌زمان بدون قفل شدن
} catch (e) {
  try {
    db.exec('PRAGMA journal_mode = DELETE;');
    console.warn('[WARN] WAL mode is not available on this filesystem - using the classic journal instead.');
    console.warn('       Data stays safe. For best performance keep the project on a local disk');
    console.warn('       (not a network drive or a OneDrive/Dropbox-synced folder).');
  } catch (e2) { throw e; } // اگر این هم نشد، مشکل جدی‌تر است و باید دیده شود
}
db.exec('PRAGMA synchronous = NORMAL;'); // تعادل سرعت/ایمنی (با WAL امن است)
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');

// ---------- کشِ prepared statement ----------
// node:sqlite هر بار db.prepare() را از نو کامپایل می‌کند؛ کوئری‌هایی که در هر
// درخواست با همان متن (یا متن‌های محدود و قابل‌پیش‌بینی) اجرا می‌شوند نباید
// هر بار پارس شوند. این کش متنِ SQL را به Statement نگاشت می‌کند و با سقفِ
// FIFO جلوی رشدِ بی‌نهایت را می‌گیرد (در جستجوی فازی SQL پویا ساخته می‌شود).
const STMT_CACHE_MAX = 1024;
const stmtCache = new Map();
function prep(sql) {
  let s = stmtCache.get(sql);
  if (s) return s;
  s = db.prepare(sql);
  if (stmtCache.size >= STMT_CACHE_MAX) {
    const oldest = stmtCache.keys().next().value;
    stmtCache.delete(oldest);
  }
  stmtCache.set(sql, s);
  return s;
}

// ---------- تراکنش (با پشتیبانی از تراکنش تو در تو از طریق SAVEPOINT) ----------
let txDepth = 0;
function transaction(fn) {
  return function (...args) {
    const level = txDepth;
    const sp = `sp_${level}`;
    const undo = () => {
      try {
        if (level === 0) db.exec('ROLLBACK;');
        else { db.exec(`ROLLBACK TO SAVEPOINT ${sp};`); db.exec(`RELEASE SAVEPOINT ${sp};`); }
      } catch (e) { /* دیگر کاری نمی‌شود کرد */ }
    };

    if (level === 0) db.exec('BEGIN IMMEDIATE;');
    else db.exec(`SAVEPOINT ${sp};`);
    txDepth++;

    let result;
    try {
      result = fn(...args);
    } catch (err) {
      txDepth--;
      undo();
      throw err;
    }

    // شمارنده *قبل* از بستن پایین می‌آید تا اگر بستن هم شکست خورد، عمق درست بماند.
    txDepth--;
    try {
      if (level === 0) db.exec('COMMIT;');
      else db.exec(`RELEASE SAVEPOINT ${sp};`);
    } catch (commitErr) {
      // COMMIT خودش هم می‌تواند شکست بخورد (دیسک پر، قفلِ زمان‌گرفته). اگر فقط
      // خطا بدهیم، تراکنش *باز* می‌ماند و چون عمق صفر شده، درخواست بعدی BEGIN
      // می‌زند و «cannot start a transaction within a transaction» می‌گیرد —
      // یعنی از آن لحظه تا ری‌استارت، هیچ نوشتنی در سایت کار نمی‌کند: نه سفارش،
      // نه ثبت‌نام. پس باید حتماً بسته شود، حتی به قیمت از دست رفتن این یک تراکنش.
      undo();
      throw commitErr;
    }
    return result;
  };
}

// ---------- ساخت جدول‌ها ----------
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  category    TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'i-package',
  image       TEXT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL CHECK (price >= 0),
  badge       TEXT NOT NULL DEFAULT '',
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  phone      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  full_name    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  province     TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL,
  address_line TEXT NOT NULL,
  postal_code  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  items      TEXT NOT NULL,             -- عکس لحظه‌ای اقلام (JSON) با قیمت روز خرید
  address    TEXT NOT NULL,             -- عکس لحظه‌ای آدرس (JSON)
  total      INTEGER NOT NULL CHECK (total > 0),
  status     TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment | paid | failed
  authority  TEXT,
  ref_id     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at    TEXT,
  expires_at INTEGER,                   -- سفارش پرداخت‌نشده بعد از این زمان منقضی و موجودی آزاد می‌شود
  idempotency_key TEXT                   -- کلید یکتا برای جلوگیری از ثبت دوباره‌ی سفارش
);
CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id, created_at DESC);
-- authority ستون سوم است تا کوئریِ «سفارش‌های منقضی» پوشا (covering) بماند:
-- آن کوئری هر پنج دقیقه اجرا می‌شود و حالا باید authority را هم ببیند تا بفهمد
-- سفارش اصلاً به درگاه رسیده یا نه (lib/reconcile.js). بدون این ستون، موتور
-- مجبور بود برای هر ردیفِ پیداشده یک بار هم به خودِ جدول سر بزند.
CREATE INDEX IF NOT EXISTS idx_orders_pending ON orders(status, expires_at, authority);

CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone        TEXT PRIMARY KEY,
  code_hash    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER NOT NULL,
  sent_day     TEXT NOT NULL,
  sent_today   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS otp_ip_log (
  ip    TEXT NOT NULL,
  day   TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);

CREATE TABLE IF NOT EXISTS wishlist (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);

-- تنظیمات فروشگاه (کلید/مقدار) — از پنل قابل ویرایش، بدون دست‌زدن به کد
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- دفتر رویدادهای پنل: چه کسی، چه کاری، روی چه چیزی، کِی
CREATE TABLE IF NOT EXISTS admin_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,          -- مثلاً order_status | product_update | product_delete
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_adminlog_time ON admin_log(created_at DESC);

-- ایندکس‌های کاتالوگ: فیلتر دسته‌بندی و بازه‌ی قیمت را از «اسکن کل جدول» نجات می‌دهند
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_price    ON products(price);
-- «چند نفر این محصول را پسندیده‌اند» و گزارش ناموجودهای محبوب
CREATE INDEX IF NOT EXISTS idx_wishlist_product  ON wishlist(product_id);
-- صفحه‌ی سفارش‌های پنل: فیلتر وضعیت + مرتب‌سازی زمانی، هر دو با یک ایندکس
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status, created_at DESC);

-- ---------- شمارنده‌ی نسخه‌ی کاتالوگ (catalog_rev) ----------
-- چرا لازم شد: امضای کاتالوگ از MAX(updated_at) استفاده می‌کند و دقتِ
-- datetime('now') فقط **یک ثانیه** است. اگر مدیر دو قیمت را در یک ثانیه ذخیره
-- کند — کاری که «ذخیره‌ی سریعِ جدول» در پنل دقیقاً انجام می‌دهد — تعداد و
-- مجموعِ موجودی هم عوض نمی‌شوند، پس امضا **یکسان** می‌ماند. نتیجه: ویرایشِ دوم
-- نه ۳۰ ثانیه، بلکه تا تغییرِ بعدیِ کاتالوگ نامرئی می‌ماند؛ هم در کشِ حافظه‌ی
-- سرور و هم در کشِ مرورگرِ مشتری (چون ETag هم از همین امضا ساخته می‌شود).
-- این با تست ثابت شد، حدس نیست: دو adminUpdateProduct پشت‌سرهم، یک امضا.
--
-- این شمارنده یکنواخت بالا می‌رود، پس هر نوشتنی امضا را عوض می‌کند — مستقل از
-- ساعتِ سیستم، دقتِ ثانیه، و اینکه کدام ستون عوض شده باشد.
--
-- چرا تریگر و نه بالابردنِ دستی در کد: روی products از جاهای زیادی نوشته می‌شود
-- (ویرایش، ساخت، حذف، انتشار، رزرو موجودی، برگشت موجودی، ذخیره‌ی گروهی، ایمپورت،
-- ابزار seed). اگر یک جا فراموش شود، باگ بی‌صدا برمی‌گردد و همین‌جور باگ است که
-- ماه‌ها کسی نمی‌فهمدش. از تریگر هیچ مسیری فرار نمی‌کند — حتی sqlite3 با دست.
--
-- شرطِ published عمدی است و ادامه‌ی همان تصمیمِ امضاست: پیش‌نویس را مشتری
-- نمی‌بیند، پس ویرایشش نباید کشِ او را باطل کند. (مالک همین حالا ۸۸ پیش‌نویس را
-- برای گذاشتنِ عکس ویرایش می‌کند؛ بدون این شرط هر ذخیره‌ی او کشِ همه‌ی
-- بازدیدکننده‌ها را دور می‌ریخت.) ولی *منتشر کردن* و *پنهان کردن* باید فوراً
-- باطل کند — و چون یکی از دو طرفِ OR برقرار است، می‌کند.
CREATE TRIGGER IF NOT EXISTS trg_catalog_rev_upd AFTER UPDATE ON products
WHEN new.published = 1 OR old.published = 1
BEGIN
  INSERT INTO settings (key, value) VALUES ('catalog_rev','1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
                                 updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS trg_catalog_rev_ins AFTER INSERT ON products
WHEN new.published = 1
BEGIN
  INSERT INTO settings (key, value) VALUES ('catalog_rev','1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
                                 updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS trg_catalog_rev_del AFTER DELETE ON products
WHEN old.published = 1
BEGIN
  INSERT INTO settings (key, value) VALUES ('catalog_rev','1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
                                 updated_at = datetime('now');
END;
`);

// ستون‌های جدید سفارش: یادداشت داخلی، کد رهگیری پستی، دلیل لغو، هزینه ارسال، دلیل مرجوعی
const orderCols = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
if (!orderCols.includes('admin_note')) db.exec("ALTER TABLE orders ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
if (!orderCols.includes('tracking_code')) db.exec("ALTER TABLE orders ADD COLUMN tracking_code TEXT NOT NULL DEFAULT ''");
if (!orderCols.includes('cancel_reason')) db.exec("ALTER TABLE orders ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT ''");
if (!orderCols.includes('shipping_fee')) db.exec('ALTER TABLE orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0');
if (!orderCols.includes('return_reason')) db.exec("ALTER TABLE orders ADD COLUMN return_reason TEXT NOT NULL DEFAULT ''");
if (!orderCols.includes('delivered_at')) db.exec('ALTER TABLE orders ADD COLUMN delivered_at TEXT'); // مبنای مهلت ۷ روزه‌ی مرجوعی
if (!orderCols.includes('coupon_code')) db.exec("ALTER TABLE orders ADD COLUMN coupon_code TEXT NOT NULL DEFAULT ''");
if (!orderCols.includes('discount')) db.exec('ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0');
// شمارنده‌ی تلاش‌های «تطبیق با درگاه» (lib/reconcile.js). وقتی درگاه در دسترس
// نیست نمی‌دانیم پول گرفته شده یا نه؛ سفارش را باطل نمی‌کنیم و دوباره می‌پرسیم.
// این شمارنده فقط برای دیده‌شدن در پنل و لاگ است — تصمیمِ «تسلیم شدن» بر پایه‌ی
// زمان گرفته می‌شود نه تعداد، چون فاصله‌ی اجراها ممکن است عوض شود.
if (!orderCols.includes('reconcile_tries')) db.exec('ALTER TABLE orders ADD COLUMN reconcile_tries INTEGER NOT NULL DEFAULT 0');
if (!orderCols.includes('idempotency_key')) db.exec('ALTER TABLE orders ADD COLUMN idempotency_key TEXT');
if (!orderCols.includes('payment_url')) db.exec("ALTER TABLE orders ADD COLUMN payment_url TEXT NOT NULL DEFAULT ''");
// کلید سفارش برای هر کاربر یکتا است؛ ساختنش بعد از مهاجرت امن است چون سفارش‌های
// قدیمی مقدار NULL دارند و چند NULL در UNIQUE مجاز است.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency ON orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL');

// دیتابیس‌هایی که از قبل وجود دارند idx_orders_pending را با دو ستون ساخته‌اند و
// `CREATE INDEX IF NOT EXISTS` بالاتر سراغشان نمی‌رود (اسم که هست، پس رد می‌شود).
// اینجا اگر ستون سومی نداشت، بازسازی‌اش می‌کنیم. روی یک جدولِ سفارش در این ابعاد
// کارِ لحظه‌ای است.
if (db.prepare('PRAGMA index_info(idx_orders_pending)').all().length < 3) {
  db.exec('DROP INDEX IF EXISTS idx_orders_pending');
  db.exec('CREATE INDEX idx_orders_pending ON orders(status, expires_at, authority)');
}

// ---------- کدهای تخفیف ----------
// «مصرف» از خود جدول سفارش‌ها شمرده می‌شود (نه ستون شمارنده) تا هیچ‌وقت ناهماهنگ نشود.
db.exec(`
CREATE TABLE IF NOT EXISTS coupons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type           TEXT NOT NULL DEFAULT 'percent',   -- percent | fixed
  value          INTEGER NOT NULL CHECK (value > 0),
  min_total      INTEGER NOT NULL DEFAULT 0,
  max_discount   INTEGER NOT NULL DEFAULT 0,        -- سقف تخفیفِ درصدی؛ 0 = بدون سقف
  expires_at     TEXT,                              -- YYYY-MM-DD یا NULL = بدون انقضا
  usage_limit    INTEGER NOT NULL DEFAULT 0,        -- کل استفاده‌ها؛ 0 = نامحدود
  per_user_limit INTEGER NOT NULL DEFAULT 1,        -- هر مشتری چند بار؛ 0 = نامحدود
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_coupon ON orders(coupon_code);
`);

// ---------- دسته‌بندی‌ها (مدیریت از پنل؛ منو و کارت‌های سایت از همین جدول ساخته می‌شوند) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT 'i-package',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
// seed یک‌باره از دسته‌های موجود محصولات (با همان آیکون‌های تاریخی سایت)
if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
  const CAT_ICONS = {
    'تشت و لگن': 'i-tub', 'صندلی و میز': 'i-chair', 'ظروف نگهداری': 'i-box',
    'سبد و جالباسی': 'i-basket', 'لوازم آشپزخانه': 'i-dishrack', 'لوازم نظافت': 'i-broom'
  };
  const insCat = db.prepare('INSERT INTO categories (name, icon, sort) VALUES (?,?,?)');
  db.prepare('SELECT category FROM products GROUP BY category ORDER BY COUNT(*) DESC').all()
    .forEach((r, i) => insCat.run(r.category, CAT_ICONS[r.category] || 'i-package', i));
}

// ---------- نظرات و امتیاز محصول ----------
// هر کاربر برای هر محصول یک نظر (ویرایش = برگشت به صف تأیید). نمایش فقط بعد از تأیید ادمین.
db.exec(`
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending',
  is_buyer   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_queue   ON reviews(status, created_at DESC);
-- نقشه‌ی امتیازها (getRatingsMap) در «هر» بار باز شدن صفحه‌ی اول اجرا می‌شود و
-- روی status فیلتر می‌کند بعد بر product_id گروه می‌بندد. ایندکس‌های بالا با
-- product_id شروع می‌شوند، پس آن کوئری مجبور بود کل جدول نظرات را بخواند.
-- ترتیب برعکس (status اول) همان کوئری را به یک جست‌وجوی ایندکس تبدیل می‌کند.
CREATE INDEX IF NOT EXISTS idx_reviews_status  ON reviews(status, product_id);

-- شمارنده‌ی بازدید صفحه‌ها (بدون ردیابی شخصی): روز + مسیر + تعداد
CREATE TABLE IF NOT EXISTS visits (
  day  TEXT NOT NULL,
  path TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
`);

// ---------- CRM (مدیریت ارتباط با مشتری) ----------
// برچسب‌ها (سگمنت‌ها) — هر فروشگاه برچسب‌های خودش را می‌سازد: «ویژه»، «عمده‌خر»، «پیگیری بعد»…
db.exec(`
CREATE TABLE IF NOT EXISTS crm_tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT NOT NULL DEFAULT '#2BD9BC',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS crm_user_tags (
  user_id INTEGER NOT NULL REFERENCES users(id),
  tag_id  INTEGER NOT NULL REFERENCES crm_tags(id),
  PRIMARY KEY (user_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_user_tags_tag ON crm_user_tags(tag_id);

-- یادداشت‌های پرونده‌ی مشتری (تایم‌لاین ارتباط‌ها)
CREATE TABLE IF NOT EXISTS crm_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  admin_id   INTEGER REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crm_notes_user ON crm_notes(user_id, id DESC);

-- پیگیری‌ها/یادآورها — مثلاً «پس‌فردا زنگ بزن برای موجودی»
CREATE TABLE IF NOT EXISTS crm_tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  admin_id   INTEGER REFERENCES users(id),
  title      TEXT NOT NULL,
  due_at     TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_user ON crm_tasks(user_id, done, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_open  ON crm_tasks(done, due_at);
`);

// ستون‌های جدید محصول: گالری چندعکسه و جدول مشخصات (هر دو JSON)
const productCols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
if (!productCols.includes('images')) db.exec(`ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`);
if (!productCols.includes('specs')) db.exec(`ALTER TABLE products ADD COLUMN specs TEXT NOT NULL DEFAULT '[]'`);
if (!productCols.includes('title_norm')) db.exec(`ALTER TABLE products ADD COLUMN title_norm TEXT NOT NULL DEFAULT ''`);
if (!productCols.includes('title_fold')) db.exec(`ALTER TABLE products ADD COLUMN title_fold TEXT NOT NULL DEFAULT ''`);
// قیمت قبلی (برای نمایش «قیمت خط‌خورده» و درصد تخفیف).
// ۰ یعنی تخفیفی نیست. عمداً یک عدد جدا است نه «درصد تخفیف»، چون مشتری باید
// عدد واقعیِ قبلی را ببیند؛ درصد از روی همین دو عدد حساب می‌شود و قابل جعل نیست.
if (!productCols.includes('old_price')) db.exec('ALTER TABLE products ADD COLUMN old_price INTEGER NOT NULL DEFAULT 0');

// «منتشر شده» — پیش‌نویس در برابر عمومی.
//
// چرا لازم شد: وقتی می‌خواهی ده‌ها محصول را یک‌جا وارد کنی، تا قبل از آماده شدن
// عکس و قیمتِ واقعی نباید جلوی چشم مشتری باشند. بدون این ستون تنها راه، «موجودی
// صفر» بود که یعنی سایت پر از کارتِ «ناموجود» — ظاهرِ فروشگاهِ خالی.
//
// پیش‌فرض ۱ است، پس هم محصولات فعلی و هم هر محصولی که پنل ادمین بسازد مثل قبل
// عمومی‌اند و هیچ رفتاری عوض نمی‌شود. فقط واردکردنِ دسته‌جمعی عمداً ۰ می‌گذارد.
if (!productCols.includes('published')) db.exec('ALTER TABLE products ADD COLUMN published INTEGER NOT NULL DEFAULT 1');
// «دسته‌ی واردات» — نشانه‌ای که می‌گوید این سطر از کدام اجرای اسکریپتِ واردات آمده.
// خالی یعنی دستی ساخته شده. با همین یک ستون، یک وارداتِ اشتباه با یک کوئری
// (DELETE FROM products WHERE import_batch = '...') کامل برمی‌گردد.
if (!productCols.includes('import_batch')) db.exec("ALTER TABLE products ADD COLUMN import_batch TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_products_published ON products(published, id DESC)');

// نرمال‌سازی متن فارسی برای جستجو — «ي» عربی، «ك» عربی، نیم‌فاصله و... یکدست می‌شوند
// تا مشتری با هر صفحه‌کلیدی که تایپ کند، جنس را پیدا کند.
function normFaText(s) {
  return String(s || '')
    .replace(/[يئ]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[أإ]/g, 'ا').replace(/[ةۀ]/g, 'ه')
    .replace(/‌/g, ' ').replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

// ---------- تاشدنِ هم‌آواها (برای جستجوی مقاوم به غلط املایی) ----------
// مشتری «صتل» می‌نویسد و منظورش «سطل» است. حروفی که در فارسی هم‌صدا هستند
// (س/ص/ث، ت/ط، ز/ذ/ض/ظ، ق/غ، ه/ح، ا/آ/ع) به یک نماینده تا می‌شوند؛
// پس هر دو نوشتار به یک رشته‌ی یکسان می‌رسند و LIKE پیدایشان می‌کند.
// این ستون فقط برای جستجوست و هیچ‌جا به کاربر نشان داده نمی‌شود.
const FOLD_MAP = {
  'ص': 'س', 'ث': 'س', 'س': 'س',
  'ذ': 'ز', 'ض': 'ز', 'ظ': 'ز', 'ز': 'ز',
  'ط': 'ت', 'ت': 'ت',
  'ح': 'ه', 'ه': 'ه',
  'غ': 'ق', 'ق': 'ق',
  'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ع': 'ا', 'ء': 'ا', 'ا': 'ا',
  'ي': 'ی', 'ئ': 'ی', 'ی': 'ی',
  'ك': 'ک', 'ک': 'ک',
  'ؤ': 'و', 'و': 'و'
};
// ارقام فارسی/عربی → لاتین، تا «۱۰ لیتری» با «10 لیتری» یکی شود
const DIGIT_MAP = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

function foldFaText(s) {
  // اعراب و علامت‌های کوچک حذف می‌شوند (کسی موقع جستجو تایپشان نمی‌کند)
  const base = normFaText(s).replace(/[ً-ْٰٕٔ]/g, '');
  let out = '';
  for (const ch of base) out += FOLD_MAP[ch] || DIGIT_MAP[ch] || ch;
  return out;
}

// مهاجرت: عنوان‌هایی که نسخه‌ی نرمال/تاشده ندارند ساخته می‌شوند.
// اگر روزی نگاشت بالا عوض شد، فقط FOLD_REV را یکی بالا ببر تا همه از نو ساخته شوند.
const FOLD_REV = '1';
{
  db.exec(`CREATE TABLE IF NOT EXISTS search_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  const stored = db.prepare(`SELECT v FROM search_meta WHERE k = 'fold_rev'`).get();
  const stale = !stored || stored.v !== FOLD_REV;
  const rows = stale
    ? db.prepare('SELECT id, title FROM products').all()
    : db.prepare(`SELECT id, title FROM products WHERE title_norm = '' OR title_fold = ''`).all();
  if (rows.length) {
    const up = db.prepare('UPDATE products SET title_norm = ?, title_fold = ? WHERE id = ?');
    for (const r of rows) up.run(normFaText(r.title), foldFaText(r.title), r.id);
  }
  if (stale) db.prepare(`INSERT INTO search_meta (k, v) VALUES ('fold_rev', ?)
    ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(FOLD_REV);
}

// مهاجرت سبک: دیتابیس‌های قدیمی ستون نام کاربر را ندارند
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('full_name')) {
  db.exec("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''");
}
// ستون ادمین (پنل مدیریت) — کاربری که شماره‌اش در ADMIN_PHONE باشد موقع ورود ادمین می‌شود
if (!userCols.includes('is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}
// کارمند — فقط به بخش سفارش‌ها دسترسی دارد، نه تنظیمات/محصولات/مشتریان
if (!userCols.includes('is_staff')) {
  db.exec('ALTER TABLE users ADD COLUMN is_staff INTEGER NOT NULL DEFAULT 0');
}
// رمز عبور اختیاری — کاربر می‌تواند به‌جای کد پیامکی با رمز وارد شود (هش scrypt)
if (!userCols.includes('password_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
}

// ---------- مهاجرت یک‌باره از فایل‌های JSON قدیمی ----------
function readLegacyJson(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { return null; }
}

function archiveLegacyJson(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (fs.existsSync(file)) fs.renameSync(file, `${file}.imported.bak`);
}

const migrateLegacy = transaction(() => {
  const insUser = db.prepare('INSERT OR IGNORE INTO users (id, phone, created_at) VALUES (?, ?, ?)');
  const insAddr = db.prepare(`INSERT OR IGNORE INTO addresses
    (id, user_id, full_name, phone, province, city, address_line, postal_code) VALUES (?,?,?,?,?,?,?,?)`);
  const insOrder = db.prepare(`INSERT OR IGNORE INTO orders
    (id, user_id, items, address, total, status, authority, ref_id, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);

  (readLegacyJson('users') || []).forEach(u => {
    if (u?.id && u?.phone) insUser.run(u.id, u.phone, u.createdAt || new Date().toISOString());
  });
  (readLegacyJson('addresses') || []).forEach(a => {
    if (a?.id && a?.userId) insAddr.run(a.id, a.userId, a.fullName || '', a.phone || '',
      a.province || '', a.city || '', a.addressLine || '', a.postalCode || '');
  });
  (readLegacyJson('orders') || []).forEach(o => {
    if (o?.id && o?.userId) insOrder.run(o.id, o.userId, JSON.stringify(o.items || []),
      JSON.stringify(o.address || {}), o.total || 0, o.status || 'failed',
      o.authority || null, o.refId || null, o.createdAt || new Date().toISOString(), o.paidAt || null);
  });

  // محصولات: اگر فایل قدیمی داشت (مثلاً قیمت‌ها را دستی عوض کرده بودید) همان مبناست
  const legacyProducts = readLegacyJson('products');
  if (legacyProducts?.length) upsertProductsTx(legacyProducts);
});

// ---------- محصولات ----------
const upsertProduct = db.prepare(`
  INSERT INTO products (id, category, icon, image, title, title_norm, title_fold, description, price, badge, stock)
  VALUES (@id, @category, @icon, @image, @title, @title_norm, @title_fold, @description, @price, @badge, @stock)
  ON CONFLICT(id) DO UPDATE SET
    category=excluded.category, icon=excluded.icon, image=excluded.image,
    title=excluded.title, title_norm=excluded.title_norm, title_fold=excluded.title_fold,
    description=excluded.description,
    price=excluded.price, badge=excluded.badge, stock=excluded.stock,
    updated_at=datetime('now')
`);

function upsertProductsTx(list) {
  for (const p of list) {
    upsertProduct.run({
      id: p.id, category: p.category, icon: p.icon || 'i-package', image: p.image || null,
      title: p.title, title_norm: normFaText(p.title), title_fold: foldFaText(p.title),
      description: p.description || '', price: p.price,
      badge: p.badge || '', stock: typeof p.stock === 'number' ? p.stock : 0
    });
  }
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count === 0) {
    const seed = require('./seed');
    transaction(() => upsertProductsTx(seed))();
  }
}

// ---------- آمار برنامه‌ریز کوئری ----------
// بدون جدول sqlite_stat1، SQLite اندازه‌ی جدول‌ها را «حدس» می‌زند و همین باعث
// می‌شود ایندکسِ موجود را نادیده بگیرد. اندازه‌گیری واقعی روی همین دیتابیس:
// کوئری نظرات یک محصول و کوئری امتیاز، هر دو کل جدول را می‌خواندند؛ فقط با
// یک بار ANALYZE (بدون هیچ ایندکس جدید) هر دو به جست‌وجوی ایندکس تبدیل شدند.
//
// چرا فقط یک بار: ANALYZE روی جدول بزرگ هزینه دارد. بعد از این، خودِ
// `PRAGMA optimize` در بکاپ روزانه آمار را تازه نگه می‌دارد.
function ensureQueryStats(log = console) {
  try {
    const has = db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'"
    ).get().n > 0;
    if (has) return false;
    db.exec('ANALYZE');
    (log.info || console.log).call(log, '[OK] Query planner statistics built (ANALYZE)');
    return true;
  } catch (e) {
    // آمار نبودن فقط یعنی کوئری‌ها کندتر — دلیلی برای بالا نیامدن سایت نیست
    (log.warn || console.warn).call(log, `ANALYZE skipped: ${e.message}`);
    return false;
  }
}

function initDb(log = console) {
  if (isNewDb) {
    migrateLegacy();
    ['users', 'addresses', 'orders', 'products'].forEach(archiveLegacyJson);
  }
  seedIfEmpty();
  ensureQueryStats(log);
  (log.info || console.log).call(log, '[OK] SQLite database (built into Node) is ready');
}

const stmtAllProducts = db.prepare('SELECT * FROM products ORDER BY id');
const stmtProductById = db.prepare('SELECT * FROM products WHERE id = ?');

// دو خانواده‌ی جدا و عمداً هم‌نام‌نبودنشان مهم است:
//
//   getProducts / getProduct        → *همه‌چیز*، برای پنل ادمین
//   getPublicProducts / getPublicProduct → فقط منتشرشده‌ها، برای مشتری
//
// اگر یکی بودند، اولین جایی که یادمان می‌رفت شرط را بگذاریم، پیش‌نویس‌ها را
// لو می‌داد. با دو نام جدا، هر بار که در یک روتِ عمومی نام بدونِ Public دیده
// شود، خودش یک پرچم قرمز در بازبینی کد است.
const stmtPublicProducts = db.prepare('SELECT * FROM products WHERE published = 1 ORDER BY id');
const stmtPublicProductById = db.prepare('SELECT * FROM products WHERE id = ? AND published = 1');

function getProducts() { return stmtAllProducts.all(); }
function getProduct(id) { return stmtProductById.get(Number(id)); }
function getPublicProducts() { return stmtPublicProducts.all(); }
function getPublicProduct(id) { return stmtPublicProductById.get(Number(id)); }

// ---------- امضای کاتالوگ (برای ETag) ----------
// یک رشته‌ی کوتاه که با هر تغییر واقعیِ کاتالوگ عوض می‌شود:
//  n = تعداد محصولات (حذف/افزودن)، m = آخرین ویرایش (تغییر قیمت/عنوان/عکس)،
//  s = مجموع موجودی (فروش یا برگشت موجودی).
// هزینه‌اش یک کوئری تجمیعیِ ناچیز است، ولی باعث می‌شود مرورگرها به‌جای دانلود
// دوباره‌ی کل لیست، پاسخ ۳۰۴ بگیرند.
// فقط روی سطرهای منتشرشده حساب می‌شود: چیزی که مشتری نمی‌بیند نباید کش مرورگرِ
// او را باطل کند، ولی *منتشر کردن* یا *پنهان کردن* یک محصول باید فوراً باطلش کند
// — و چون COUNT(*) عوض می‌شود، می‌کند.
const stmtCatalogSig = db.prepare(
  "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at),'') AS m, COALESCE(SUM(stock),0) AS s FROM products WHERE published = 1"
);
// جزءِ c از تریگرهای trg_catalog_rev_* می‌آید (بالای همین فایل) و تنها جزئی است
// که *تضمین* می‌کند امضا با هر نوشتنِ دیده‌شدنی عوض می‌شود. n و m و s بدونش
// می‌توانند هر سه ثابت بمانند و همان باگِ «ویرایشِ دوم در یک ثانیه گم می‌شود» را
// بدهند. آن سه را نگه داشته‌ام چون ارزان‌اند و امضا را برای آدم خواناتر می‌کنند.
const stmtCatalogRev = db.prepare("SELECT value FROM settings WHERE key = 'catalog_rev'");
function getCatalogSignature() {
  const r = stmtCatalogSig.get();
  // نسخه‌ی نظرات هم داخل امضاست تا با تأیید/رد نظر، ETag لیست (و ستاره‌ی کارت‌ها) باطل شود
  return `${r.n}.${String(r.m).replace(/\D/g, '')}.${r.s}.r${getSetting('reviews_rev') || 0}` +
    `.c${stmtCatalogRev.get()?.value || 0}`;
}

// شمارشِ کنارِ هر دسته باید *دقیقاً* همان چیزی باشد که مشتری بعد از کلیک می‌بیند.
// اگر پیش‌نویس‌ها را بشمارد، روی فیلتر می‌نویسد «سبد (۱۸)» و بعد ۶ تا نشان می‌دهد.
// دسته‌های *دیده‌شدنی* با شمارش. LEFT JOIN به جدولِ categories عمدی است:
// آیکون از آنجا می‌آید، ولی اگر دسته‌ای در جدول نبود (محصولی با دسته‌ی
// تایپ‌شده) هم از فهرست نمی‌افتد — فقط آیکونِ پیش‌فرض می‌گیرد. ترتیب هم از
// sortِ خودِ جدول است تا فهرستِ فیلترِ سایت با ترتیبی که مدیر در پنل چیده
// یکی باشد؛ ترتیبِ «پرتعدادترین اول» با هر انتشار جابه‌جا می‌شد و مشتری
// هر بار دسته را جای دیگری پیدا می‌کرد.
function getCategories() {
  return prep(`
    SELECT p.category AS category, COUNT(*) AS n,
           COALESCE(c.icon, 'i-package') AS icon
    FROM products p LEFT JOIN categories c ON c.name = p.category
    WHERE p.published = 1
    GROUP BY p.category
    ORDER BY COALESCE(c.sort, 9999), n DESC`
  ).all();
}

// ---------- جستجو/فیلتر/مرتب‌سازی سمت سرور ----------
// تا وقتی چند ده محصول داریم مرورگر هم از پسش برمی‌آید، ولی با چند هزار محصول
// فرستادن کل کاتالوگ در هر بازدید کمرشکن است. این تابع همان کار را در SQLite
// انجام می‌دهد: فقط همان صفحه‌ای که کاربر می‌بیند از دیتابیس بیرون می‌آید.
//
// نکته‌ی امنیتی: نام ستون‌ها هرگز از ورودی کاربر ساخته نمی‌شود؛ فقط از این
// جدولِ سفید انتخاب می‌شود. بقیه‌ی مقادیر هم پارامتری‌اند (بدون SQL Injection).
const SORT_SQL = {
  newest: 'id DESC',
  oldest: 'id ASC',
  'price-asc': 'price ASC, id DESC',
  'price-desc': 'price DESC, id DESC',
  title: 'title COLLATE NOCASE ASC',
  stock: 'stock DESC, id DESC'
};
const MAX_PAGE_SIZE = 60;

// ---------- فاصله‌ی ویرایشی (دامرا-لِوِنشتاین) ----------
// برای غلط تایپی واقعی: حرف جا افتاده، حرف اضافه، دو حرف جابه‌جا.
// با سقف (max) کار می‌کند و به‌محض عبور از سقف زود برمی‌گردد تا سریع بماند.
function editDistance(a, b, max) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (!la) return lb > max ? max + 1 : lb;
  if (!lb) return la > max ? max + 1 : la;
  if (Math.abs(la - lb) > max) return max + 1;

  let prev2 = new Array(lb + 1).fill(0);
  let prev = new Array(lb + 1);
  let cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowBest = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // جابه‌جایی دو حرف پشت‌سرهم («سلط» ↔ «سطل») یک خطا حساب می‌شود نه دو
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowBest) rowBest = v;
    }
    if (rowBest > max) return max + 1;
    const spare = prev2; prev2 = prev; prev = cur; cur = spare;
  }
  return prev[lb];
}

// سقف خطای مجاز بر اساس طول عبارت — کلمه‌ی کوتاه نباید هر چیزی را برگرداند
function fuzzyTolerance(len) {
  if (len <= 3) return 1;
  if (len <= 6) return 1;
  if (len <= 9) return 2;
  return 3;
}

// شناسه‌ی محصولاتی که «نزدیک» عبارت جستجو هستند، به ترتیب نزدیکی.
// فقط وقتی صدا زده می‌شود که جستجوی معمولی هیچ نتیجه‌ای نداشته باشد،
// پس هزینه‌اش روی جستجوهای موفق صفر است.
const FUZZY_SCAN_CAP = 3000;
function fuzzyProductIds(q, cap = MAX_PAGE_SIZE) {
  const fq = foldFaText(q).slice(0, 60);
  if (fq.length < 2) return [];
  const qTokens = fq.split(' ').filter(t => t.length >= 2);
  const rows = prep(
    `SELECT id, title, title_fold, stock FROM products WHERE published = 1 LIMIT ${FUZZY_SCAN_CAP}`
  ).all();

  const scored = [];
  for (const p of rows) {
    const ft = p.title_fold || foldFaText(p.title);
    if (!ft) continue;
    const tol = fuzzyTolerance(Math.min(fq.length, ft.length));
    let best = editDistance(fq, ft, tol);

    // عبارت جستجو ممکن است فقط یکی از کلمه‌های عنوان باشد («صتل» در «سطل زباله بزرگ»)
    if (best > tol) {
      for (const tok of ft.split(' ')) {
        if (tok.length < 2) continue;
        const t2 = fuzzyTolerance(Math.min(fq.length, tok.length));
        const d = editDistance(fq, tok, t2);
        if (d <= t2 && d < best) best = d;
        if (best === 0) break;
      }
    }
    // چند کلمه‌ای: هر کلمه‌ی جستجو نزدیک یکی از کلمه‌های عنوان باشد
    if (best > tol && qTokens.length > 1) {
      const titleTokens = ft.split(' ').filter(Boolean);
      let sum = 0, all = true;
      for (const qt of qTokens) {
        const t2 = fuzzyTolerance(qt.length);
        let bd = t2 + 1;
        for (const tt of titleTokens) {
          const d = editDistance(qt, tt, t2);
          if (d < bd) bd = d;
          if (bd === 0) break;
        }
        if (bd > t2) { all = false; break; }
        sum += bd;
      }
      if (all) best = Math.min(best, Math.max(1, Math.round(sum / qTokens.length)));
    }

    if (best <= fuzzyTolerance(Math.max(fq.length, 4))) scored.push({ id: p.id, d: best, inStock: p.stock > 0 });
  }

  scored.sort((x, y) => x.d - y.d || (y.inStock - x.inStock) || (y.id - x.id));
  return scored.slice(0, cap).map(s => s.id);
}

function queryProducts(opts = {}) {
  // فیلترهای غیر از عبارت جستجو جدا نگه داشته می‌شوند، چون در مسیر «نتیجه‌ی نزدیک»
  // باید دوباره و بدون شرط متن اعمال شوند (دسته و قیمت هنوز باید محترم باشند).
  const base = [];
  const baseArgs = [];

  // پیش‌نویس‌ها هرگز در نتیجه‌ی عمومی نمی‌آیند. این شرط عمداً *اول* همه و داخل
  // `base` است، نه `where`: مسیر «نتیجه‌ی نزدیک» فقط `base` را دوباره اعمال
  // می‌کند، پس اگر اینجا نبود، جست‌وجوی فازی از کنارش رد می‌شد و پیش‌نویس‌ها را
  // لو می‌داد — دقیقاً همان‌جایی که کسی فکرش را نمی‌کند.
  if (!opts.includeUnpublished) base.push('published = 1');

  if (opts.category && opts.category !== 'all') {
    base.push('category = ?');
    baseArgs.push(String(opts.category));
  }
  if (Number.isFinite(opts.minPrice)) { base.push('price >= ?'); baseArgs.push(Math.trunc(opts.minPrice)); }
  if (Number.isFinite(opts.maxPrice)) { base.push('price <= ?'); baseArgs.push(Math.trunc(opts.maxPrice)); }
  if (opts.inStock) base.push('stock > 0');

  const where = [...base];
  const args = [...baseArgs]; // پارامترهای ترتیبی — هیچ مقداری داخل رشته‌ی SQL نمی‌رود

  const rawQ = opts.q ? String(opts.q).slice(0, 60) : '';
  if (rawQ) {
    // سه لایه: عین نوشته، نسخه‌ی نرمال‌شده (ي/ك عربی و نیم‌فاصله)،
    // و نسخه‌ی تاشده (س/ص/ث و ت/ط و…) که غلط املایی را هم می‌گیرد
    where.push('(title LIKE ? OR description LIKE ? OR category LIKE ? OR title_norm LIKE ? OR title_fold LIKE ?)');
    const like = `%${rawQ}%`;
    args.push(like, like, like, `%${normFaText(rawQ)}%`, `%${foldFaText(rawQ)}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // ناموجودها همیشه ته لیست — چه کاربر روی قیمت مرتب کند چه روی تازگی
  const orderSql = `ORDER BY (stock > 0) DESC, ${SORT_SQL[opts.sort] || SORT_SQL.newest}`;
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 12, 1), MAX_PAGE_SIZE);

  const total = prep(`SELECT COUNT(*) AS n FROM products ${whereSql}`).get(...args).n;

  // هیچ نتیجه‌ای نبود؟ سراغ «نزدیک‌ترین‌ها» می‌رویم تا مشتری دست‌خالی برنگردد
  if (total === 0 && rawQ) {
    const ids = fuzzyProductIds(rawQ, MAX_PAGE_SIZE);
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const w2 = [...base, `id IN (${ph})`];
      const a2 = [...baseArgs, ...ids];
      const wSql2 = `WHERE ${w2.join(' AND ')}`;
      const total2 = prep(`SELECT COUNT(*) AS n FROM products ${wSql2}`).get(...a2).n;
      if (total2 > 0) {
        // ترتیب نزدیکی حفظ می‌شود (idها اعداد دیتابیس‌اند، پس داخل CASE بی‌خطرند)
        const rank = ids.map((id, i) => `WHEN ${Number(id)} THEN ${i}`).join(' ');
        const pages2 = Math.max(1, Math.ceil(total2 / limit));
        const page2 = Math.min(Math.max(parseInt(opts.page, 10) || 1, 1), pages2);
        const rows2 = prep(
          `SELECT * FROM products ${wSql2} ORDER BY (stock > 0) DESC, CASE id ${rank} END LIMIT ? OFFSET ?`
        ).all(...a2, limit, (page2 - 1) * limit);
        return {
          rows: rows2, total: total2, page: page2, pages: pages2, limit,
          fuzzy: true, suggestion: rows2[0] ? rows2[0].title : ''
        };
      }
    }
  }

  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(opts.page, 10) || 1, 1), pages);

  const rows = prep(
    `SELECT * FROM products ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
  ).all(...args, limit, (page - 1) * limit);

  return { rows, total, page, pages, limit, fuzzy: false, suggestion: '' };
}

// بازه‌ی قیمت و دسته‌بندی‌ها برای ساختن فیلترها بدون دانلود کل کاتالوگ
function getCatalogFacets() {
  const r = prep(
    'SELECT COALESCE(MIN(price),0) AS min, COALESCE(MAX(price),0) AS max FROM products WHERE published = 1'
  ).get();
  return { minPrice: r.min, maxPrice: r.max, categories: getCategories() };
}

// ---------- موجودی (اتمی — قلب جلوگیری از فروشِ بیش از انبار) ----------
const stmtDecStock = db.prepare('UPDATE products SET stock = stock - ?, updated_at = datetime(\'now\') WHERE id = ? AND stock >= ?');
const stmtIncStock = db.prepare('UPDATE products SET stock = stock + ?, updated_at = datetime(\'now\') WHERE id = ?');

// تعداد باید عدد صحیحِ مثبت باشد و کف منطقیِ فروشگاه را رد نکند.
//
// چرا این چک در «قلب» عملیات است و نه فقط در روت سبد: شرط ایمنی انبار
// `stock >= ?` است. با تعداد منفی، `stock - (-5)` موجودی را *زیاد* می‌کند و
// `stock >= -5` هم همیشه درست است — یعنی هم انبار دروغ می‌شود و هم مبلغ سفارش
// منفی. هر مسیری که به موجودی دست می‌زند (سبد، سفارش دستیِ پنل، هر روت آینده)
// از همین‌جا می‌گذرد، پس درست‌ترین جا برای بستن این در همین‌جاست.
const MAX_LINE_QTY = 1000;

// خروجی، اقلامِ *نرمال‌شده* است و همان باید به دیتابیس برود.
// چرا این نکته مهم است: اگر مقدار را تبدیل کنیم ولی مقدار خام را به کوئری
// بدهیم، عملاً چیزی را اعتبارسنجی کرده‌ایم که استفاده نمی‌شود. مثلاً qty="۲ "
// از چک رد می‌شود ولی همان رشته به SQLite می‌رسد و آنجا ممکن است صفر تفسیر
// شود — یعنی سفارش ثبت شود و از انبار چیزی کم نشود.
//
// عمداً رشته‌ی عددی («2») پذیرفته و تبدیل می‌شود، نه رد: کلاینت درست ممکن است
// عدد را در JSON رشته‌ای بفرستد و رد کردنش یعنی مشتریِ بی‌گناه خطا بگیرد.
function cleanQtyItems(items) {
  const bad = () => {
    const err = new Error('تعداد یا شناسه‌ی کالا معتبر نیست');
    err.code = 'BAD_QTY';
    return err;
  };
  if (!Array.isArray(items) || !items.length) {
    const err = new Error('سبد خرید خالی است');
    err.code = 'BAD_QTY';
    throw err;
  }
  return items.map((it) => {
    if (!it || typeof it !== 'object') throw bad();
    const qty = Number(String(it.qty).trim());
    const productId = Number(String(it.productId).trim());
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QTY) throw bad();
    if (!Number.isInteger(productId) || productId < 1) throw bad();
    return { ...it, qty, productId };
  });
}

// اگر موجودی هر قلم کافی نبود، کل تراکنش برمی‌گردد و لیست کمبودها برگردانده می‌شود
const reserveStock = transaction((rawItems) => {
  const items = cleanQtyItems(rawItems);
  const shortages = [];
  for (const it of items) {
    const res = stmtDecStock.run(it.qty, it.productId, it.qty);
    if (res.changes === 0) {
      const p = getProduct(it.productId);
      shortages.push({ productId: it.productId, title: it.title, available: p ? p.stock : 0 });
    }
  }
  if (shortages.length) {
    const err = new Error('کمبود موجودی');
    err.code = 'STOCK_SHORTAGE';
    err.shortages = shortages;
    throw err;
  }
});

// برگرداندن موجودی عمداً *خطا نمی‌دهد*: این تابع وقتی صدا زده می‌شود که سفارش
// دارد لغو/مرجوع می‌شود. اگر یک قلمِ خراب در سفارشِ قدیمی باعث throw شود، لغو
// سفارش هم برمی‌گردد و مشتری با سفارشی گیر می‌کند که نه پرداخت شده نه لغو.
// پس قلم مشکوک نادیده گرفته می‌شود و بقیه برمی‌گردند.
const releaseStock = transaction((items) => {
  if (!Array.isArray(items)) return;
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const q = Number(String(it.qty).trim());
    const pid = Number(String(it.productId).trim());
    if (!Number.isInteger(q) || q < 1 || q > MAX_LINE_QTY || !Number.isInteger(pid) || pid < 1) continue;
    stmtIncStock.run(q, pid);
  }
});

// ---------- کاربران ----------
const stmtUserByPhone = db.prepare('SELECT * FROM users WHERE phone = ?');
const stmtUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtInsertUser = db.prepare('INSERT INTO users (phone) VALUES (?)');

function findOrCreateUser(phone) {
  let user = stmtUserByPhone.get(phone);
  if (!user) {
    const info = stmtInsertUser.run(phone);
    user = stmtUserById.get(info.lastInsertRowid);
  }
  return user;
}

const stmtUpdateUserName = db.prepare('UPDATE users SET full_name = ? WHERE id = ?');
function updateUserName(userId, fullName) {
  stmtUpdateUserName.run(fullName, userId);
  return stmtUserById.get(userId);
}

// ---------- رمز عبور ----------
const stmtSetPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
function setUserPassword(userId, hash) { stmtSetPassword.run(hash, userId); return stmtUserById.get(userId); }
function getUserByPhone(phone) { return stmtUserByPhone.get(phone); }

// ---------- ادمین ----------
const stmtSetAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?');
function ensureAdmin(userId) { stmtSetAdmin.run(userId); return stmtUserById.get(userId); }

const stmtSetStaff = db.prepare('UPDATE users SET is_staff = ? WHERE id = ?');
function setStaff(userId, on) { stmtSetStaff.run(on ? 1 : 0, userId); return stmtUserById.get(userId); }

// لیست همه‌ی مشتری‌ها + آمار خرید هرکدام (برای تب مشتری‌های پنل)
const stmtAllUsers = db.prepare(`
  SELECT u.id, u.phone, u.full_name, u.is_admin, u.is_staff, u.created_at,
         (u.password_hash IS NOT NULL) AS has_password,
         COUNT(CASE WHEN o.status IN ('paid','shipped','delivered','return_requested') THEN 1 END) AS paid_orders,
         COALESCE(SUM(CASE WHEN o.status IN ('paid','shipped','delivered','return_requested') THEN o.total END),0) AS total_spent,
         MAX(CASE WHEN o.status IN ('paid','shipped','delivered','return_requested') THEN o.created_at END) AS last_order_at
  FROM users u LEFT JOIN orders o ON o.user_id = u.id
  GROUP BY u.id ORDER BY u.created_at DESC LIMIT 1000`);
function getAllUsers() {
  return stmtAllUsers.all().map(u => ({
    id: u.id, phone: u.phone, fullName: u.full_name || '', isAdmin: Boolean(u.is_admin), isStaff: Boolean(u.is_staff),
    hasPassword: Boolean(u.has_password), createdAt: u.created_at,
    paidOrders: u.paid_orders, totalSpent: u.total_spent, lastOrderAt: u.last_order_at
  }));
}

// آدرس‌های ثبت‌شده‌ی یک مشتری + همه‌ی سفارش‌ها + علاقه‌مندی‌ها (نمای کامل مشتری در پنل)
function getUserDetail(userId) {
  const u = stmtUserById.get(Number(userId));
  if (!u) return null;
  const orders = getUserOrders(u.id);
  const paid = orders.filter(o => ['paid', 'shipped', 'delivered', 'return_requested'].includes(o.status));
  const spent = paid.reduce((s, o) => s + o.total, 0);
  return {
    id: u.id, phone: u.phone, fullName: u.full_name || '',
    isAdmin: Boolean(u.is_admin), isStaff: Boolean(u.is_staff), hasPassword: Boolean(u.password_hash),
    createdAt: u.created_at,
    addresses: getAddresses(u.id),
    orders,
    wishlist: getWishlist(u.id).map(p => ({ id: p.id, title: p.title, price: p.price, stock: p.stock })),
    summary: {
      paidOrders: paid.length,
      totalOrders: orders.length,
      totalSpent: spent,
      avgOrder: paid.length ? Math.round(spent / paid.length) : 0,
      firstOrderAt: paid.length ? paid[paid.length - 1].createdAt : null,
      lastOrderAt: paid.length ? paid[0].createdAt : null
    }
  };
}

// ---------- CRM ----------
// خطای اعتبارسنجی با کد HTTP مشخص؛ روت‌ها آن را برمی‌گردانند.
function crmErr(msg, status = 400) { return Object.assign(new Error(msg), { status }); }
const CRM_PAID = "('paid','shipped','delivered','return_requested')";

const stmtCrmTags = db.prepare('SELECT id, name, color FROM crm_tags ORDER BY name COLLATE NOCASE');
const stmtCrmTagByName = db.prepare('SELECT id, name, color FROM crm_tags WHERE name = ?');
const stmtCrmTagInsert = db.prepare('INSERT INTO crm_tags (name, color) VALUES (?,?)');
const stmtCrmTagById = db.prepare('SELECT id, name, color FROM crm_tags WHERE id = ?');
const stmtCrmTagDelete = db.prepare('DELETE FROM crm_tags WHERE id = ?');
const stmtCrmTagLinks = db.prepare('DELETE FROM crm_user_tags WHERE tag_id = ?');
const stmtCrmUserTags = db.prepare(`SELECT t.id, t.name, t.color
  FROM crm_user_tags ut JOIN crm_tags t ON t.id = ut.tag_id
  WHERE ut.user_id = ? ORDER BY t.name COLLATE NOCASE`);
const stmtCrmUserTagClear = db.prepare('DELETE FROM crm_user_tags WHERE user_id = ?');
const stmtCrmUserTagAdd = db.prepare('INSERT OR IGNORE INTO crm_user_tags (user_id, tag_id) VALUES (?,?)');

const stmtCrmNotes = db.prepare(`SELECT n.id, n.user_id, n.admin_id, n.body, n.created_at,
       u.full_name AS admin_name
  FROM crm_notes n LEFT JOIN users u ON u.id = n.admin_id
  WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 200`);
const stmtCrmNoteInsert = db.prepare('INSERT INTO crm_notes (user_id, admin_id, body) VALUES (?,?,?)');
const stmtCrmNoteById = db.prepare('SELECT * FROM crm_notes WHERE id = ?');
const stmtCrmNoteDelete = db.prepare('DELETE FROM crm_notes WHERE id = ?');

const stmtCrmTasks = db.prepare(`SELECT * FROM crm_tasks WHERE user_id = ?
  ORDER BY done ASC, COALESCE(due_at,'9999-12-31') ASC, id DESC LIMIT 200`);
const stmtCrmTaskInsert = db.prepare('INSERT INTO crm_tasks (user_id, admin_id, title, due_at) VALUES (?,?,?,?)');
const stmtCrmTaskById = db.prepare('SELECT * FROM crm_tasks WHERE id = ?');
const stmtCrmTaskDelete = db.prepare('DELETE FROM crm_tasks WHERE id = ?');
const stmtCrmTaskDone = db.prepare("UPDATE crm_tasks SET done=1, done_at=datetime('now') WHERE id=?");
const stmtCrmTaskUndone = db.prepare('UPDATE crm_tasks SET done=0, done_at=NULL WHERE id=?');

function serializeCrmNote(n) {
  return { id: n.id, userId: n.user_id, adminId: n.admin_id, body: n.body,
    adminName: n.admin_name || 'مدیر', createdAt: n.created_at };
}
function serializeCrmTask(t) {
  return { id: t.id, userId: t.user_id, title: t.title, dueAt: t.due_at,
    done: Boolean(t.done), doneAt: t.done_at, createdAt: t.created_at };
}

// ---- برچسب‌ها ----
function crmListTags() { return stmtCrmTags.all(); }
function crmCreateTag(name, color) {
  const n = String(name || '').trim().slice(0, 30);
  if (!n) throw crmErr('نام برچسب خالی است');
  const col = /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? String(color) : '#2BD9BC';
  stmtCrmTagInsert.run(n, col);
  return stmtCrmTagByName.get(n);
}
function crmDeleteTag(id) {
  const t = stmtCrmTagById.get(Number(id));
  if (!t) return false;
  stmtCrmTagLinks.run(Number(id));
  stmtCrmTagDelete.run(Number(id));
  return true;
}
function crmSetUserTags(userId, tagIds) {
  if (!stmtUserById.get(Number(userId))) return false;
  const ids = [...new Set((Array.isArray(tagIds) ? tagIds : []).map(Number)
    .filter(n => Number.isInteger(n) && n > 0))];
  const set = transaction(() => {
    stmtCrmUserTagClear.run(Number(userId));
    for (const t of ids) stmtCrmUserTagAdd.run(Number(userId), t);
  });
  set();
  return true;
}

// ---- یادداشت‌ها ----
function crmAddNote(userId, adminId, body) {
  const b = String(body || '').trim().slice(0, 2000);
  if (!b) throw crmErr('متن یادداشت خالی است');
  if (!stmtUserById.get(Number(userId))) throw crmErr('مشتری پیدا نشد', 404);
  const info = stmtCrmNoteInsert.run(Number(userId), adminId || null, b);
  const row = stmtCrmNoteById.get(info.lastInsertRowid);
  const admin = adminId ? stmtUserById.get(Number(adminId)) : null;
  row.admin_name = admin ? (admin.full_name || admin.phone) : 'مدیر';
  return serializeCrmNote(row);
}
function crmDeleteNote(id) { return stmtCrmNoteDelete.run(Number(id)).changes > 0; }

// ---- پیگیری‌ها ----
function crmAddTask(userId, adminId, title, dueAt) {
  const t = String(title || '').trim().slice(0, 200);
  if (!t) throw crmErr('عنوان پیگیری خالی است');
  if (!stmtUserById.get(Number(userId))) throw crmErr('مشتری پیدا نشد', 404);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(dueAt || '')) ? String(dueAt) : null;
  const info = stmtCrmTaskInsert.run(Number(userId), adminId || null, t, due);
  return serializeCrmTask(stmtCrmTaskById.get(info.lastInsertRowid));
}
function crmToggleTask(id, done) {
  const stmt = done ? stmtCrmTaskDone : stmtCrmTaskUndone;
  if (stmt.run(Number(id)).changes === 0) return null;
  return serializeCrmTask(stmtCrmTaskById.get(Number(id)));
}
function crmDeleteTask(id) { return stmtCrmTaskDelete.run(Number(id)).changes > 0; }

// ---- خلاصه‌ی داشبورد CRM ----
const stmtCrmSummary = db.prepare(`SELECT
  (SELECT COUNT(*) FROM users) AS customers,
  (SELECT COUNT(DISTINCT user_id) FROM crm_user_tags) AS tagged,
  (SELECT COUNT(*) FROM crm_tasks WHERE done=0) AS open_tasks,
  (SELECT COUNT(*) FROM crm_tasks WHERE done=0 AND due_at IS NOT NULL AND date(due_at) <= date('now','localtime')) AS due_tasks,
  (SELECT COUNT(*) FROM crm_notes) AS notes`);
function crmGetSummary() {
  const r = stmtCrmSummary.get();
  return { totalCustomers: r.customers, tagged: r.tagged, openTasks: r.open_tasks, dueTasks: r.due_tasks, totalNotes: r.notes };
}

// ---- جستجوی مشتری‌ها با برچسب/فیلتر/مرتب‌سازی/صفحه‌بندی ----
const CRM_SORT_SQL = {
  spent: 'paid_total DESC',
  orders: 'paid_orders DESC',
  new: 'u.created_at DESC',
  name: 'u.full_name COLLATE NOCASE ASC',
  activity: 'last_order_at DESC'
};
function crmSearchCustomers(opts = {}) {
  const where = [];
  const args = [];
  const q = String(opts.q || '').trim().slice(0, 60);
  const tag = String(opts.tag || '').trim().slice(0, 30);
  const filter = String(opts.filter || 'all');

  if (q) {
    where.push('(u.full_name LIKE ? OR u.phone LIKE ?)');
    args.push(`%${q}%`, `%${q}%`);
  }
  if (tag) {
    where.push(`EXISTS (SELECT 1 FROM crm_user_tags ut JOIN crm_tags t ON t.id = ut.tag_id
      WHERE ut.user_id = u.id AND t.name = ?)`);
    args.push(tag);
  }
  if (filter === 'buyers') {
    where.push(`EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.status IN ${CRM_PAID})`);
  } else if (filter === 'idle') {
    where.push(`NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.status IN ${CRM_PAID})`);
  } else if (filter === 'followups') {
    where.push(`EXISTS (SELECT 1 FROM crm_tasks ct WHERE ct.user_id = u.id AND ct.done = 0)`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = CRM_SORT_SQL[opts.sort] || CRM_SORT_SQL.spent;
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  const sql = `SELECT u.id, u.phone, u.full_name, u.is_admin, u.is_staff, u.created_at,
      COUNT(CASE WHEN o.status IN ${CRM_PAID} THEN 1 END) AS paid_orders,
      COALESCE(SUM(CASE WHEN o.status IN ${CRM_PAID} THEN o.total END),0) AS paid_total,
      MAX(CASE WHEN o.status IN ${CRM_PAID} THEN o.created_at END) AS last_order_at,
      (SELECT GROUP_CONCAT(t.name, '|') FROM crm_user_tags ut JOIN crm_tags t ON t.id = ut.tag_id
        WHERE ut.user_id = u.id) AS tag_names
    FROM users u LEFT JOIN orders o ON o.user_id = u.id
    ${whereSql}
    GROUP BY u.id
    ORDER BY ${orderSql}, u.id DESC
    LIMIT ? OFFSET ?`;
  const rows = prep(sql).all(...args, limit, offset);
  const total = prep(`SELECT COUNT(*) AS n FROM users u ${whereSql}`).get(...args).n;

  const customers = rows.map(r => ({
    id: r.id, phone: r.phone, fullName: r.full_name || '',
    isAdmin: Boolean(r.is_admin), isStaff: Boolean(r.is_staff), createdAt: r.created_at,
    paidOrders: r.paid_orders, totalSpent: r.paid_total, lastOrderAt: r.last_order_at,
    tags: (r.tag_names || '').split('|').filter(Boolean)
  }));
  return { customers, total, limit, offset };
}

// پرونده‌ی کامل مشتری در CRM: همان نمای مشتری + برچسب/یادداشت/پیگیری
function crmGetCustomer(id) {
  const base = getUserDetail(Number(id));
  if (!base) return null;
  return {
    ...base,
    tags: stmtCrmUserTags.all(Number(id)),
    notes: stmtCrmNotes.all(Number(id)).map(serializeCrmNote),
    tasks: stmtCrmTasks.all(Number(id)).map(serializeCrmTask)
  };
}

// همه‌ی سفارش‌ها (جدیدترین اول) + شماره‌ی مشتری برای تماس/هماهنگی ارسال
const stmtAllOrders = db.prepare(`
  SELECT o.*, u.phone AS user_phone, u.full_name AS user_name
  FROM orders o JOIN users u ON u.id = o.user_id
  ORDER BY o.created_at DESC, o.id DESC LIMIT 500`);
function getAllOrders() {
  return stmtAllOrders.all().map(o => ({ ...serializeOrder(o), userPhone: o.user_phone, userName: o.user_name || '' }));
}

// نسخه‌ی فیلتردار برای پنل: وضعیت + بازه‌ی زمانی + جستجو + صفحه‌بندی.
// جستجو روی شماره‌ی سفارش، نام و شماره‌ی مشتری، شهر، کد رهگیری و نام کالاها کار می‌کند.
function queryOrders({ status = 'all', q = '', from = null, to = null, limit = 40, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (status && status !== 'all') {
    if (status === 'active') where.push("o.status IN ('paid','shipped')");
    else { where.push('o.status = ?'); args.push(status); }
  }
  if (from) { where.push("date(o.created_at,'localtime') >= date(?)"); args.push(from); }
  if (to) { where.push("date(o.created_at,'localtime') <= date(?)"); args.push(to); }

  const term = String(q || '').trim();
  if (term) {
    const like = `%${term}%`;
    where.push(`(
      CAST(o.id AS TEXT) = ? OR u.phone LIKE ? OR u.full_name LIKE ?
      OR o.address LIKE ? OR o.items LIKE ? OR o.tracking_code LIKE ? OR o.ref_id LIKE ?
    )`);
    args.push(term, like, like, like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = prep(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN o.status IN ${PAID_SET} THEN o.total END),0) AS sum
    FROM orders o JOIN users u ON u.id = o.user_id ${whereSql}`).get(...args);

  const rows = prep(`SELECT o.*, u.phone AS user_phone, u.full_name AS user_name
    FROM orders o JOIN users u ON u.id = o.user_id ${whereSql}
    ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`)
    .all(...args, Math.min(Number(limit) || 40, 200), Math.max(Number(offset) || 0, 0));

  return {
    orders: rows.map(o => ({ ...serializeOrder(o), userPhone: o.user_phone, userName: o.user_name || '' })),
    total: totalRow.n,
    sum: totalRow.sum
  };
}

// شمارش سفارش‌ها به تفکیک وضعیت (برای عددِ کنار هر فیلتر)
const stmtStatusCounts = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
function getOrderStatusCounts() {
  const out = { all: 0 };
  for (const r of stmtStatusCounts.all()) { out[r.status] = r.n; out.all += r.n; }
  return out;
}

// یک سفارش با اطلاعات مشتری (برای صفحه‌ی جزئیات/فاکتور)
const stmtOrderFull = db.prepare(`SELECT o.*, u.phone AS user_phone, u.full_name AS user_name
  FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`);
function getOrderForAdmin(id) {
  const o = stmtOrderFull.get(Number(id));
  if (!o) return null;
  return { ...serializeOrder(o), userPhone: o.user_phone, userName: o.user_name || '' };
}

// وضعیت‌های پس از پرداخت: paid → shipped → delivered (فقط مسیر منطقی مجاز است)
// «canceled» از هر وضعیت پس از پرداخت ممکن است (مرجوعی/لغو دستی) و موجودی را برمی‌گرداند.
// مسیر مرجوعی: delivered → return_requested (مشتری) → returned (تأیید ادمین + برگشت موجودی)
//                                              یا → delivered (رد درخواست توسط ادمین)
const ADMIN_STATUS_FLOW = {
  paid: ['shipped', 'canceled'],
  shipped: ['delivered', 'paid', 'canceled'],
  delivered: ['shipped'],
  return_requested: ['delivered'],   // رد درخواست؛ تأییدش فقط از adminAcceptReturnTx می‌گذرد
  canceled: [],
  returned: []
};
const stmtSetOrderStatus = db.prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?');
const stmtSetDeliveredAt = db.prepare(`UPDATE orders SET delivered_at = datetime('now') WHERE id = ?`);
function adminSetOrderStatus(orderId, from, to) {
  if (!ADMIN_STATUS_FLOW[from]?.includes(to)) return false;
  const changed = stmtSetOrderStatus.run(to, orderId, from).changes > 0;
  // تاریخ تحویل، مبنای مهلت ۷ روزه‌ی مرجوعی است
  if (changed && to === 'delivered' && from !== 'return_requested') stmtSetDeliveredAt.run(orderId);
  return changed;
}

// لغو/مرجوع سفارش — موجودی اقلام به انبار برمی‌گردد (در یک تراکنش)
const stmtCancelOrder = db.prepare(`UPDATE orders SET status='canceled', cancel_reason=?
  WHERE id = ? AND status IN ('paid','shipped','delivered','return_requested')`);
const adminCancelOrderTx = transaction((orderId, reason) => {
  const changed = stmtCancelOrder.run(String(reason || '').slice(0, 200), orderId).changes > 0;
  if (changed) {
    const o = stmtOrderById.get(orderId);
    releaseStock(JSON.parse(o.items));   // کالاها دوباره قابل فروش می‌شوند
  }
  return changed;
});

// تأیید مرجوعی توسط ادمین — کالا برگشته، پس موجودی هم برمی‌گردد
const stmtAcceptReturn = db.prepare(`UPDATE orders SET status='returned' WHERE id = ? AND status = 'return_requested'`);
const adminAcceptReturnTx = transaction((orderId) => {
  const changed = stmtAcceptReturn.run(orderId).changes > 0;
  if (changed) releaseStock(JSON.parse(stmtOrderById.get(orderId).items));
  return changed;
});

// لغو توسط خود مشتری — فقط تا قبل از ارسال (paid)؛ موجودی همان لحظه آزاد می‌شود
const stmtUserCancel = db.prepare(`UPDATE orders SET status='canceled', cancel_reason=?
  WHERE id = ? AND user_id = ? AND status = 'paid'`);
const userCancelOrderTx = transaction((orderId, userId) => {
  const changed = stmtUserCancel.run('لغو توسط مشتری', orderId, userId).changes > 0;
  if (changed) releaseStock(JSON.parse(stmtOrderById.get(orderId).items));
  return changed;
});

// درخواست مرجوعی توسط مشتری — موجودی فعلاً دست نمی‌خورد تا ادمین کالا را ببیند و تأیید کند
const stmtUserReturn = db.prepare(`UPDATE orders SET status='return_requested', return_reason=?
  WHERE id = ? AND user_id = ? AND status = 'delivered'`);
function userRequestReturn(orderId, userId, reason) {
  return stmtUserReturn.run(String(reason || '').slice(0, 300), orderId, userId).changes > 0;
}

// یادداشت داخلی و کد رهگیری پستی
const stmtOrderNote = db.prepare('UPDATE orders SET admin_note = ? WHERE id = ?');
const stmtOrderTracking = db.prepare('UPDATE orders SET tracking_code = ? WHERE id = ?');
function setOrderNote(id, note) { return stmtOrderNote.run(String(note || '').slice(0, 500), id).changes > 0; }
function setOrderTracking(id, code) { return stmtOrderTracking.run(String(code || '').slice(0, 60), id).changes > 0; }

// آمار داشبورد: فروش امروز/کل، سفارش‌های در انتظار ارسال، کم‌موجودی‌ها
const PAID_SET = "('paid','shipped','delivered','return_requested')";
// نکته‌ی مهم: created_at با datetime('now') یعنی به وقت گرینویچ ذخیره می‌شود،
// ولی «امروز» برای فروشنده یعنی امروزِ تهران. اگر یک طرفِ مقایسه localtime
// باشد و طرف دیگر نه، سفارش‌های بین ۰۰:۰۰ تا ۰۳:۳۰ بامداد از «فروش امروز»
// می‌افتند بیرون در حالی که نمودار فروش (که localtime دارد) نشانشان می‌دهد —
// یعنی عدد کارت و ستون نمودار با هم نمی‌خواندند. هر دو طرف باید localtime باشد.
// ---------- مرزهای روز، به وقتِ محلی، ولی در قالبِ UTC ----------
// created_at با datetime('now') ذخیره می‌شود، یعنی UTC. «امروز» اما برای فروشنده
// یعنی امروزِ تهران. این تابع نیمه‌شبِ *محلی* را می‌سازد و همان لحظه را به رشته‌ی
// UTC برمی‌گرداند — دقیقاً همان قالبی که در ستون است.
//
// چرا این کار جای date(created_at,'localtime') را گرفت — مهم‌ترین نکته‌ی این فایل:
// وقتی ستون داخل تابع پیچیده شود، SQLite دیگر نمی‌تواند از ایندکس استفاده کند و
// مجبور است تابع را برای *تک‌تک* سطرها صدا بزند. با EXPLAIN QUERY PLAN اندازه
// گرفته شد:
//     date(created_at,'localtime')=date('now','localtime')
//       → SEARCH orders USING COVERING INDEX idx_orders_status (status=?)   ۳٫۸۳ms
//     created_at >= ? AND created_at < ?
//       → SEARCH ... (status=? AND created_at>? AND created_at<?)           ۰٫۰۱ms
// یعنی ۳۸۰ برابر. و چون node:sqlite همگام است، این میلی‌ثانیه‌ها فقط داشبورد را
// کند نمی‌کنند — کل سرور را برای همان مدت قفل می‌کنند و مشتری‌ای که همان لحظه
// سبد خریدش را باز کرده، پشت آن صف می‌ایستد.
function localDayStartUtc(offsetDays = 0) {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offsetDays, 0, 0, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const stmtStats = db.prepare(`SELECT
  (SELECT COALESCE(SUM(total),0) FROM orders WHERE status IN ${PAID_SET} AND created_at >= $dayStart AND created_at < $dayEnd) AS today_sales,
  (SELECT COUNT(*)               FROM orders WHERE status IN ${PAID_SET} AND created_at >= $dayStart AND created_at < $dayEnd) AS today_orders,
  (SELECT COALESCE(SUM(total),0) FROM orders WHERE status IN ${PAID_SET} AND created_at >= $weekStart) AS week_sales,
  (SELECT COALESCE(SUM(total),0) FROM orders WHERE status IN ${PAID_SET} AND created_at >= $monthStart) AS month_sales,
  (SELECT COALESCE(SUM(total),0) FROM orders WHERE status IN ${PAID_SET}) AS total_sales,
  (SELECT COUNT(*)               FROM orders WHERE status IN ${PAID_SET}) AS total_orders,
  (SELECT COUNT(*)               FROM orders WHERE status = 'paid') AS awaiting_shipment,
  (SELECT COUNT(*)               FROM orders WHERE status = 'shipped') AS in_transit,
  (SELECT COUNT(*)               FROM orders WHERE status = 'pending_payment') AS pending_payment,
  (SELECT COUNT(*)               FROM orders WHERE status = 'failed') AS failed_orders,
  (SELECT COUNT(*)               FROM orders WHERE status = 'canceled') AS canceled_orders,
  (SELECT COUNT(*)               FROM orders WHERE status = 'return_requested') AS return_requests,
  (SELECT COUNT(*)               FROM reviews WHERE status = 'pending') AS pending_reviews,
  (SELECT COALESCE(SUM(n),0)     FROM visits WHERE day = $today) AS today_visits,
  (SELECT COUNT(*)               FROM users) AS total_users,
  (SELECT COUNT(*)               FROM users WHERE created_at >= $weekStart) AS new_users_week,
  (SELECT COUNT(*)               FROM products) AS total_products,
  (SELECT COUNT(*)               FROM products WHERE published = 0) AS draft_products,
  (SELECT COUNT(*)               FROM products WHERE stock <= 5 AND stock > 0) AS low_stock,
  (SELECT COUNT(*)               FROM products WHERE stock = 0) AS out_of_stock,
  (SELECT COALESCE(SUM(price*stock),0) FROM products) AS inventory_value,
  (SELECT COUNT(*)               FROM wishlist) AS wish_count`);

function getAdminStats() {
  // شمارنده‌های بازدیدِ در حافظه را اول بنویس، وگرنه پنل تا ۳۰ ثانیه عددِ
  // قدیمی نشان می‌دهد و مالک فکر می‌کند آمار خراب است. این مسیر فقط در
  // پنل صدا زده می‌شود، پس هزینه‌ی یک تراکنشِ اضافه اینجا اهمیتی ندارد.
  flushVisits();
  // مرزها در هر فراخوانی دوباره حساب می‌شوند، وگرنه سروری که چند روز بالا مانده
  // تا ابد «امروز»ِ روزِ راه‌اندازی را گزارش می‌کند.
  const n = new Date();
  return stmtStats.get({
    dayStart: localDayStartUtc(0),
    dayEnd: localDayStartUtc(1),
    weekStart: localDayStartUtc(-6),
    monthStart: localDayStartUtc(-29),
    // ستون visits.day خودش تاریخِ محلی است، پس اینجا رشته‌ی محلی می‌خواهد نه UTC
    today: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  });
}

// ---------- آمار پیشرفته‌ی داشبورد ----------

// فروش روزانه‌ی N روز اخیر — روزهای بدون فروش هم با صفر پر می‌شوند تا نمودار شکاف نداشته باشد
const stmtSalesByDay = db.prepare(`
  SELECT date(created_at,'localtime') AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS sales
  FROM orders WHERE status IN ${PAID_SET} AND created_at >= ?
  GROUP BY day ORDER BY day`);
// همان درسِ بالا: در WHERE ستون باید لخت باشد تا ایندکس کار کند. در GROUP BY
// اما date() اشکالی ندارد، چون آنجا فقط روی سطرهای *فیلترشده* اجرا می‌شود.
function getSalesSeries(days = 14) {
  const rows = stmtSalesByDay.all(localDayStartUtc(-(days - 1)));
  const byDay = new Map(rows.map(r => [r.day, r]));
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hit = byDay.get(key);
    out.push({ day: key, orders: hit?.orders || 0, sales: hit?.sales || 0 });
  }
  return out;
}

/* ---------- گزارشِ ماه‌به‌ماهِ شمسی ----------
   نمودارِ بالا بازه‌ی «N روزِ اخیر» است و برای «مرداد چطور بود؟» جواب نمی‌دهد.
   این تابع ماه‌های شمسی را جدا می‌کند.

   چرا CASE و نه strftime: SQLite ماهِ شمسی نمی‌شناسد. مرزها را در جاوااسکریپت
   حساب می‌کنیم (lib/jalali.js) و به‌صورت رشته‌ی تاریخِ میلادی به SQL می‌دهیم.
   مقایسه‌ی رشته‌ایِ YYYY-MM-DD با ترتیبِ زمانی یکی است، پس درست کار می‌کند.

   ترتیبِ پارامترها: در SQLite شماره‌ی `?`ها به ترتیبِ ظاهر شدن در **متنِ** کوئری
   داده می‌شود. برای همین فیلترِ بازه داخلِ CTE (که بالاتر از CASE نوشته شده)
   پارامترِ اول است و بعد مرزهای ماه‌ها. اگر روزی این کوئری جابه‌جا شد، ترتیبِ
   آرایه‌ی پارامترها هم باید عوض شود. */
function getMonthlySales(months = 12) {
  const n = Math.min(Math.max(Number(months) || 12, 2), 36);
  const bounds = jalali.available() ? jalali.monthStarts(n) : jalali.gregorianMonthStarts(n);
  const oldestIso = bounds[bounds.length - 1].startIso;

  const cases = bounds.map((b, i) => `WHEN d >= '${b.startIso}' THEN ${i}`).join(' ');
  // مرزها مستقیم داخل SQL می‌روند نه به‌صورت پارامتر — چون خودمان ساخته‌ایمشان
  // (خروجیِ isoLocal فقط رقم و خط تیره است) و ورودیِ کاربر در آن‌ها نقشی ندارد.
  const rows = prep(`
    WITH src AS (
      SELECT date(created_at,'localtime') AS d, total, user_id
      FROM orders
      WHERE status IN ${PAID_SET} AND date(created_at,'localtime') >= ?
    )
    SELECT CASE ${cases} END AS bucket,
           COUNT(*)                  AS orders,
           COALESCE(SUM(total),0)    AS sales,
           COUNT(DISTINCT user_id)   AS customers
    FROM src GROUP BY bucket HAVING bucket IS NOT NULL`).all(oldestIso);

  const byBucket = new Map(rows.map(r => [Number(r.bucket), r]));

  // خروجی از قدیم به جدید (چپ‌به‌راستِ زمان)، ماه‌های بی‌فروش هم با صفر می‌آیند
  // تا جدول شکاف نداشته باشد و رشد قابلِ محاسبه بماند.
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const b = bounds[i];
    const hit = byBucket.get(i);
    const sales = hit?.sales || 0;
    const orders = hit?.orders || 0;
    const prev = out[out.length - 1];
    out.push({
      jy: b.jy, jm: b.jm, name: b.name,
      label: `${b.name} ${b.jy}`,
      start: b.startIso,
      orders, sales,
      customers: hit?.customers || 0,
      avg: orders ? Math.round(sales / orders) : 0,
      // رشد نسبت به ماهِ قبل. اگر ماهِ قبل صفر بوده null می‌دهیم نه ۱۰۰٪ یا
      // بی‌نهایت: «از صفر به ۵ میلیون» درصدِ معنادار ندارد و نشان دادنِ عددِ
      // ساختگی گزارش را بی‌اعتبار می‌کند.
      growth: prev && prev.sales > 0 ? Math.round(((sales - prev.sales) / prev.sales) * 1000) / 10 : null
    });
  }

  const totals = out.reduce((a, m) => {
    a.orders += m.orders; a.sales += m.sales; return a;
  }, { orders: 0, sales: 0 });
  totals.avg = totals.orders ? Math.round(totals.sales / totals.orders) : 0;
  // بهترین ماه فقط وقتی معنی دارد که فروشی وجود داشته باشد.
  const best = out.reduce((a, m) => (m.sales > (a?.sales || 0) ? m : a), null);

  return {
    months: n,
    calendar: jalali.available() ? 'jalali' : 'gregorian',
    rows: out,
    totals,
    best: best && best.sales > 0 ? { label: best.label, sales: best.sales } : null
  };
}

// پرفروش‌ترین محصولات — اقلام داخل JSON سفارش‌ها را باز می‌کند (json_each در SQLite موجود است).
// نام مستعار pid است نه id، چون خود جدول orders هم ستون id دارد و SQLite در GROUP BY گیر می‌دهد.
//
// پنجره‌ی زمانی عمدی: بدون آن، این کوئری JSONِ *هر* سفارشِ تاریخِ فروشگاه را باز
// می‌کند و هزینه‌اش با عمرِ مغازه بالا می‌رود، نه با چیزی که کاربر می‌بیند. روی
// ۳۰۳۳۳ سفارش ۵٫۲۶ میلی‌ثانیه اندازه گرفته شد. «پرفروش‌ها» هم ذاتاً یعنی
// «اخیراً پرفروش» — پرفروشِ دو سال پیش تصمیمِ امروزِ فروشنده را عوض نمی‌کند.
const TOP_PRODUCTS_WINDOW_DAYS = 90;
const stmtTopProducts = db.prepare(`
  SELECT json_extract(it.value,'$.productId') AS pid,
         json_extract(it.value,'$.title')     AS title,
         SUM(json_extract(it.value,'$.qty'))  AS qty,
         SUM(json_extract(it.value,'$.qty') * json_extract(it.value,'$.price')) AS revenue
  FROM orders o, json_each(o.items) it
  WHERE o.status IN ${PAID_SET} AND o.created_at >= $since
  GROUP BY pid ORDER BY qty DESC LIMIT $lim`);
function getTopProducts(limit = 8, days = TOP_PRODUCTS_WINDOW_DAYS) {
  try {
    return stmtTopProducts.all({ since: localDayStartUtc(-(days - 1)), lim: limit }).map(r => ({
      id: r.pid, title: r.title, qty: r.qty, revenue: r.revenue
    }));
  } catch (e) { return []; }
}

// سهم فروش هر دسته‌بندی (برای نمودار حلقه‌ای)
function getCategoryShare() {
  const rows = getTopProducts(1000);
  const priceById = new Map(stmtAllProducts.all().map(p => [p.id, p]));
  const acc = new Map();
  for (const r of rows) {
    const cat = priceById.get(r.id)?.category || 'سایر';
    acc.set(cat, (acc.get(cat) || 0) + r.revenue);
  }
  return [...acc.entries()].map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

// بهترین مشتری‌ها بر اساس مبلغ خرید
const stmtTopCustomers = db.prepare(`
  SELECT u.id, u.phone, u.full_name, COUNT(o.id) AS orders, SUM(o.total) AS spent
  FROM orders o JOIN users u ON u.id = o.user_id
  WHERE o.status IN ${PAID_SET}
  GROUP BY u.id ORDER BY spent DESC LIMIT ?`);
function getTopCustomers(limit = 5) {
  return stmtTopCustomers.all(limit).map(r => ({
    id: r.id, phone: r.phone, fullName: r.full_name || '', orders: r.orders, spent: r.spent
  }));
}

// کالاهایی که باید سفارش داد (ناموجود اول، بعد کم‌موجود)
const stmtLowStock = db.prepare(`SELECT id, title, category, stock, price, image, icon
  FROM products WHERE stock <= ? ORDER BY stock ASC, id ASC LIMIT 100`);
function getLowStock(threshold = 5) { return stmtLowStock.all(threshold); }

// محصولاتی که در لیست علاقه‌مندی هستند ولی موجودی ندارند = تقاضای از‌دست‌رفته
const stmtWishedOutOfStock = db.prepare(`
  SELECT p.id, p.title, p.stock, COUNT(w.user_id) AS wishers
  FROM wishlist w JOIN products p ON p.id = w.product_id
  WHERE p.stock = 0 GROUP BY p.id ORDER BY wishers DESC LIMIT 20`);
function getWishedOutOfStock() { return stmtWishedOutOfStock.all(); }

// جمع‌بندی همه‌ی داده‌های داشبورد در یک رفت‌وبرگشت
function getAdminOverview() {
  const stats = getAdminStats();
  const paidOrders = stats.total_orders || 0;
  return {
    stats: {
      ...stats,
      avg_order: paidOrders ? Math.round(stats.total_sales / paidOrders) : 0
    },
    series: getSalesSeries(14),
    topProducts: getTopProducts(8),
    categories: getCategoryShare().slice(0, 6),
    topCustomers: getTopCustomers(5),
    lowStock: getLowStock(5).slice(0, 8),
    wishedOutOfStock: getWishedOutOfStock().slice(0, 6),
    recentActivity: getAdminLog(8)
  };
}

// ---------- دفتر رویدادها ----------
const stmtInsertLog = db.prepare('INSERT INTO admin_log (user_id, action, target, detail) VALUES (?,?,?,?)');
const stmtReadLog = db.prepare(`
  SELECT l.*, u.phone, u.full_name FROM admin_log l LEFT JOIN users u ON u.id = l.user_id
  ORDER BY l.id DESC LIMIT ?`);
const stmtTrimLog = db.prepare('DELETE FROM admin_log WHERE id < (SELECT MAX(id)-2000 FROM admin_log)');
function logAdminAction(userId, action, target = '', detail = '') {
  try {
    stmtInsertLog.run(userId || null, String(action).slice(0, 40), String(target).slice(0, 80), String(detail).slice(0, 300));
    if (Math.random() < 0.02) stmtTrimLog.run(); // گاه‌به‌گاه هرس می‌شود تا جدول بی‌نهایت رشد نکند
  } catch (e) { /* لاگ نباید هیچ‌وقت جلوی کار اصلی را بگیرد */ }
}
function getAdminLog(limit = 50) {
  return stmtReadLog.all(limit).map(r => ({
    id: r.id, action: r.action, target: r.target, detail: r.detail,
    at: r.created_at, by: r.full_name || r.phone || 'سیستم'
  }));
}

// ---------- تنظیمات فروشگاه ----------
const stmtAllSettings = db.prepare('SELECT key, value FROM settings');
const stmtSetSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?,?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`);

// مقادیر پیش‌فرض — اگر چیزی در جدول نبود اینها برمی‌گردد
const SETTING_DEFAULTS = {
  shop_name: 'پلاسکو گلی',
  shop_phone: '',
  shop_address: '',
  shipping_cost: '0',
  free_shipping_over: '0',
  low_stock_threshold: '5',
  announcement: '',
  shop_open: '1',
  promo_text: '',   // بنر تخفیف صفحه‌ی اصلی — خالی = بنر پنهان
  promo_code: ''    // کد تخفیفی که روی بنر نمایش داده می‌شود (اختیاری)
};

// تنظیمات به‌ندرت عوض می‌شوند (فقط از پنل) ولی در هر درخواست خوانده می‌شوند:
// shop_open در مسیر ثبت سفارش، getSettings در صفحه‌ی اول، reviews_rev در امضای
// کاتالوگ. پس یک کش حافظه‌ای نگه می‌داریم و هر جایی که می‌نویسد باطلش می‌کند.
// چون کل نوشتن‌ها از همین فایل می‌گذرد (setSettingsTx و bumpReviewsRev)، کش
// هیچ‌وقت کهنه نمی‌ماند — و catalog_rev هم عمداً از این کش رد نمی‌شود و مستقیم
// خوانده می‌شود، چون تریگرهای دیتابیس آن را می‌نویسند نه کد ما.
let settingsCache = null;
function readAllSettings() {
  const out = { ...SETTING_DEFAULTS };
  for (const r of stmtAllSettings.all()) out[r.key] = r.value;
  return out;
}
function getSettings() {
  return settingsCache || (settingsCache = readAllSettings());
}
function getSetting(key) {
  return getSettings()[key] ?? null;
}
function invalidateSettings() {
  settingsCache = null;
}
const setSettingsTx = transaction((obj) => {
  for (const [k, v] of Object.entries(obj)) {
    if (k in SETTING_DEFAULTS) stmtSetSetting.run(k, String(v));
  }
  invalidateSettings();
  return getSettings();
});

// ---------- نظرات و امتیاز ----------
// شمارنده‌ی نسخه‌ی نظرات در settings — هر تغییری کش کاتالوگ را باطل می‌کند
const stmtBumpReviewsRev = db.prepare(`INSERT INTO settings (key, value) VALUES ('reviews_rev','1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`);
function bumpReviewsRev() {
  stmtBumpReviewsRev.run();
  invalidateSettings(); // reviews_rev در کشِ تنظیمات هم هست و امضای کاتالوگ آن را می‌خواند
}

// «خریدار» کسی است که این محصول در یکی از سفارش‌های پرداخت‌شده‌اش بوده
const stmtUserBoughtProduct = db.prepare(`SELECT 1 FROM orders
  WHERE user_id = ? AND status IN ('paid','shipped','delivered','return_requested','returned')
  AND items LIKE ? LIMIT 1`);
function hasUserBought(userId, productId) {
  return Boolean(stmtUserBoughtProduct.get(userId, `%"productId":${Number(productId)},%`));
}

const stmtReviewUpsert = db.prepare(`INSERT INTO reviews (product_id, user_id, rating, body, is_buyer)
  VALUES (?,?,?,?,?)
  ON CONFLICT(product_id, user_id) DO UPDATE SET
    rating = excluded.rating, body = excluded.body, is_buyer = excluded.is_buyer,
    status = 'pending', updated_at = datetime('now')`);
const stmtMyReview = db.prepare('SELECT r.*, NULL AS user_name FROM reviews r WHERE r.product_id = ? AND r.user_id = ?');

function serializeReview(r, publicView = true) {
  if (!r) return null;
  const out = {
    id: r.id, productId: r.product_id, rating: r.rating, body: r.body,
    isBuyer: Boolean(r.is_buyer), status: r.status, createdAt: r.created_at,
    userName: String(r.user_name || '').trim() || 'مشتری پلاسکو گلی'
  };
  if (!publicView) { out.userPhone = r.user_phone || ''; out.productTitle = r.product_title || ''; }
  return out;
}

function upsertReview(userId, productId, rating, body) {
  stmtReviewUpsert.run(Number(productId), userId, Number(rating),
    String(body || '').trim().slice(0, 500), hasUserBought(userId, productId) ? 1 : 0);
  bumpReviewsRev(); // اگر نظر تأییدشده ویرایش شود از نمای عمومی می‌افتد → کش هم باطل
  return serializeReview(stmtMyReview.get(Number(productId), userId));
}

const stmtProductReviews = db.prepare(`SELECT r.*, u.full_name AS user_name
  FROM reviews r JOIN users u ON u.id = r.user_id
  WHERE r.product_id = ? AND r.status = 'approved'
  ORDER BY r.is_buyer DESC, r.created_at DESC, r.id DESC LIMIT 50`);
const stmtProductRating = db.prepare(`SELECT COUNT(*) AS n, ROUND(AVG(rating), 1) AS avg
  FROM reviews WHERE product_id = ? AND status = 'approved'`);
const stmtAllRatings = db.prepare(`SELECT product_id, COUNT(*) AS n, ROUND(AVG(rating), 1) AS avg
  FROM reviews WHERE status = 'approved' GROUP BY product_id`);

function getProductReviews(productId, userId = null) {
  const agg = stmtProductRating.get(Number(productId));
  return {
    count: agg.n || 0,
    avg: agg.n ? Number(agg.avg) : 0,
    items: stmtProductReviews.all(Number(productId)).map(r => serializeReview(r)),
    myReview: userId ? serializeReview(stmtMyReview.get(Number(productId), userId)) : null
  };
}
// نقشه‌ی امتیازها برای کارت‌های لیست: {productId: {count, avg}} — یک کوئری برای همه
function getRatingsMap() {
  const m = {};
  for (const r of stmtAllRatings.all()) m[r.product_id] = { count: r.n, avg: Number(r.avg) };
  return m;
}

// تازه‌ترین نظرات تأییدشده‌ی متن‌دار — بخش «حرف مشتری‌ها» صفحه‌ی اصلی از همین پر می‌شود
const stmtRecentReviews = db.prepare(`SELECT r.id, r.rating, r.body, r.is_buyer, r.created_at,
  u.full_name AS user_name, p.title AS product_title, p.id AS product_id
  FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
  WHERE r.status = 'approved' AND r.body != ''
  ORDER BY r.created_at DESC, r.id DESC LIMIT ?`);
function getRecentReviews(limit = 6) {
  return stmtRecentReviews.all(Math.min(Number(limit) || 6, 12)).map(r => ({
    id: r.id, rating: r.rating, body: r.body, isBuyer: Boolean(r.is_buyer),
    userName: String(r.user_name || '').trim() || 'مشتری پلاسکو گلی',
    productTitle: r.product_title, productId: r.product_id
  }));
}

// پنل مدیریت: صف تأیید نظرات
const stmtReviewsAdmin = db.prepare(`SELECT r.*, u.full_name AS user_name, u.phone AS user_phone, p.title AS product_title
  FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
  WHERE (? = 'all' OR r.status = ?) ORDER BY r.created_at DESC, r.id DESC LIMIT 200`);
const stmtReviewById = db.prepare(`SELECT r.*, u.full_name AS user_name, u.phone AS user_phone, p.title AS product_title
  FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id WHERE r.id = ?`);
const stmtReviewCounts = db.prepare('SELECT status, COUNT(*) AS n FROM reviews GROUP BY status');
const stmtReviewSetStatus = db.prepare(`UPDATE reviews SET status = ?, updated_at = datetime('now') WHERE id = ?`);

function adminListReviews(status = 'all') {
  const counts = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const r of stmtReviewCounts.all()) { counts[r.status] = r.n; counts.all += r.n; }
  return { reviews: stmtReviewsAdmin.all(status, status).map(r => serializeReview(r, false)), counts };
}
function adminSetReviewStatus(id, status) {
  const ok = stmtReviewSetStatus.run(status, Number(id)).changes > 0;
  if (!ok) return null;
  bumpReviewsRev();
  return serializeReview(stmtReviewById.get(Number(id)), false);
}

// ---------- دسته‌بندی‌ها ----------
//
// دو شمارنده برمی‌گردد و این عمدی است:
//   count      → فقط کالای منتشرشده. چیزی که *سایت* نشان می‌دهد.
//   countAll   → همه، شاملِ پیش‌نویس. چیزی که *مدیر* باید ببیند.
//
// چرا جدا شدند: این تابع هم به پنل می‌رود و هم به /api/shop/categories که
// عمومی است. با یک شمارنده‌ی مشترک، منوی هدرِ سایت می‌گفت «ظروف نگهداری ۲۱»
// در حالی که فقط ۳ تا روی سایت بود — مشتری کلیک می‌کرد و ۳ تا می‌دید.
// بدتر از عددِ غلط این بود که خودِ عدد، وجودِ ۱۸ محصولِ منتشرنشده را لو
// می‌داد؛ کاتالوگی که هنوز عکس ندارد و قیمت‌هایش نهایی نیست.
function getCategoriesFull() {
  return prep(`SELECT c.*,
      (SELECT COUNT(*) FROM products p WHERE p.category = c.name AND p.published = 1) AS n,
      (SELECT COUNT(*) FROM products p WHERE p.category = c.name) AS n_all
    FROM categories c ORDER BY c.sort, c.id`).all()
    .map(c => ({ id: c.id, name: c.name, icon: c.icon, sort: c.sort, count: c.n, countAll: c.n_all }));
}

// نسخه‌ی عمومی: دسته‌های بی‌کالا اصلاً نمی‌آیند و countAll بیرون نمی‌رود.
//
// حذفِ دسته‌ی خالی فقط زیبایی نیست: منوی سایت دو دسته‌ی آشغالِ «Test» و «تست»
// را به همه‌ی بازدیدکننده‌ها نشان می‌داد که کلیک‌کردنشان به صفحه‌ی خالی می‌رسید.
function getPublicCategories() {
  return getCategoriesFull()
    .filter(c => c.count > 0)
    .map(({ id, name, icon, sort, count }) => ({ id, name, icon, sort, count }));
}
// اگر دسته‌ای که روی محصول تایپ شده در جدول نبود، خودکار ثبت می‌شود (با آیکون پیش‌فرض)
function ensureCategory(name) {
  const n = String(name || '').trim();
  if (!n) return;
  if (!db.prepare('SELECT 1 FROM categories WHERE name = ?').get(n)) {
    const max = db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM categories').get().m;
    db.prepare('INSERT INTO categories (name, icon, sort) VALUES (?, ?, ?)').run(n, 'i-package', max + 1);
  }
}
function adminCreateCategory(name, icon) {
  const max = db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM categories').get().m;
  const info = db.prepare('INSERT INTO categories (name, icon, sort) VALUES (?,?,?)').run(name, icon, max + 1);
  return getCategoriesFull().find(c => c.id === Number(info.lastInsertRowid));
}
// تغییر نام دسته باید روی محصولاتش هم بنشیند — اتمی
const adminUpdateCategoryTx = transaction((id, name, icon) => {
  const old = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id));
  if (!old) return false;
  db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name, icon, old.id);
  if (name !== old.name) {
    db.prepare(`UPDATE products SET category = ?, updated_at = datetime('now') WHERE category = ?`).run(name, old.name);
  }
  return true;
});
function adminDeleteCategory(id) {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id));
  if (!c) return { ok: false, reason: 'notfound' };
  const n = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category = ?').get(c.name).n;
  if (n > 0) return { ok: false, reason: 'inuse', count: n };
  db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
  return { ok: true };
}
// جابه‌جایی ترتیب: sortها نرمال می‌شوند و جای دو همسایه عوض می‌شود
const adminMoveCategoryTx = transaction((id, dir) => {
  const cats = db.prepare('SELECT id FROM categories ORDER BY sort, id').all();
  const idx = cats.findIndex(c => c.id === Number(id));
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= cats.length) return false;
  const upd = db.prepare('UPDATE categories SET sort = ? WHERE id = ?');
  cats.forEach((c, i) => upd.run(i, c.id));
  upd.run(swap, cats[idx].id);
  upd.run(idx, cats[swap].id);
  return true;
});

// ---------- شمارنده‌ی بازدید صفحه‌ها (سبک و بدون ردیابی شخصی) ----------
// (جدولش کنار مهاجرت‌ها ساخته می‌شود چون stmtStats موقع لود به آن نیاز دارد)
//
// چرا بافر: قبلاً هر بازدیدِ صفحه یک INSERT..ON CONFLICT همگام بود. موتورِ ما
// همگام است، پس آن نوشتن — هرچند کوچک — درست وسطِ مسیرِ پاسخ می‌نشیند و در
// لحظه‌ی شلوغی (همان لحظه‌ای که مهم است) به هر بازدیدکننده کمی تأخیر می‌دهد.
// بدتر: هر نوشتن روی WAL قفلِ نویسنده می‌گیرد، پس بازدیدِ ساده با ثبتِ سفارش
// سرِ همان قفل رقابت می‌کند.
//
// حالا شمارش در حافظه جمع می‌شود و هر ۳۰ ثانیه یک‌جا نوشته می‌شود: صد بازدید
// در نیم‌دقیقه یعنی یک تراکنش به‌جای صد تا. بهایش این است که با کشته‌شدنِ
// ناگهانیِ پروسه (kill -9) حداکثر ۳۰ ثانیه آمار از دست می‌رود — و آمارِ
// بازدید دقیقاً همان داده‌ای است که این معامله برایش می‌ارزد (برخلافِ سفارش
// که هیچ‌وقت بافر نمی‌شود). خاموشیِ تمیز خودش flush می‌کند.
const stmtVisitBump = db.prepare(`INSERT INTO visits (day, path, n)
  VALUES (date('now','localtime'), ?, ?)
  ON CONFLICT(day, path) DO UPDATE SET n = n + excluded.n`);
const visitBuffer = new Map();     // path → تعداد
const VISIT_FLUSH_MS = 30_000;
const VISIT_PATHS_MAX = 500;       // سقف: مسیرهای ساختگی نباید حافظه را باد کنند
function bumpVisit(path) {
  const p = String(path).slice(0, 80);
  if (!visitBuffer.has(p) && visitBuffer.size >= VISIT_PATHS_MAX) return;
  visitBuffer.set(p, (visitBuffer.get(p) || 0) + 1);
}
function flushVisits() {
  if (!visitBuffer.size) return 0;
  // اول عکس‌برداری و پاک‌کردن: اگر نوشتن خطا داد، شمارنده‌ها دوباره روی هم
  // انباشته نمی‌شوند و آمارِ بعدی درست جلو می‌رود.
  const batch = [...visitBuffer];
  visitBuffer.clear();
  try {
    transaction(() => { for (const [p, n] of batch) stmtVisitBump.run(p, n); })();
  } catch (e) { /* آمار نباید چیزی را بخواباند */ }
  return batch.length;
}
// unref: این تایمر نباید جلوی خروجِ پروسه را بگیرد.
const visitTimer = setInterval(flushVisits, VISIT_FLUSH_MS);
if (visitTimer.unref) visitTimer.unref();
const stmtVisitsCleanup = db.prepare(`DELETE FROM visits WHERE day < date('now','localtime','-90 days')`);
function cleanupOldVisits() { return stmtVisitsCleanup.run().changes; }
// پربازدیدترین صفحه‌های ۷ روز اخیر برای گزارش پنل
const stmtTopPages = db.prepare(`SELECT path, SUM(n) AS n FROM visits
  WHERE day >= date('now','localtime','-6 days') GROUP BY path ORDER BY n DESC LIMIT 10`);
function getTopPages() { return stmtTopPages.all(); }

// ---------- «موجود شد خبرم کن» ----------
// مشتری روی کالای ناموجود ثبت می‌کند؛ به محض شارژ موجودی پیامک می‌رود.
db.exec(`
CREATE TABLE IF NOT EXISTS stock_alerts (
  product_id  INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  phone       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  notified_at TEXT,
  PRIMARY KEY (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_pending ON stock_alerts(product_id, notified_at);
`);

const stmtStockAlertUpsert = db.prepare(`INSERT INTO stock_alerts (product_id, user_id, phone)
  VALUES (?,?,?)
  ON CONFLICT(product_id, user_id) DO UPDATE SET notified_at = NULL, created_at = datetime('now')`);
const stmtStockAlertsPending = db.prepare(`SELECT phone FROM stock_alerts
  WHERE product_id = ? AND notified_at IS NULL`);
const stmtStockAlertsMark = db.prepare(`UPDATE stock_alerts SET notified_at = datetime('now')
  WHERE product_id = ? AND notified_at IS NULL`);

function addStockAlert(productId, userId, phone) {
  stmtStockAlertUpsert.run(Number(productId), Number(userId), String(phone));
}
function getPendingStockAlerts(productId) {
  return stmtStockAlertsPending.all(Number(productId)).map(r => r.phone);
}
function markStockAlertsNotified(productId) {
  return stmtStockAlertsMark.run(Number(productId)).changes;
}

// ---------- شمارنده‌ی روزانه‌ی پیامک (سد هزینه‌ی حمله‌ی پیامکی) ----------
// JSON کوچک در settings: {"d":"YYYY-MM-DD","n":تعداد} — روز عوض شود از نو شروع می‌شود
const stmtSmsBump = db.prepare(`INSERT INTO settings (key, value)
  VALUES ('sms_counter', json_object('d', date('now','localtime'), 'n', 1))
  ON CONFLICT(key) DO UPDATE SET value = CASE
    WHEN json_extract(value,'$.d') = date('now','localtime')
      THEN json_object('d', json_extract(value,'$.d'), 'n', json_extract(value,'$.n') + 1)
    ELSE json_object('d', date('now','localtime'), 'n', 1) END`);
const stmtSmsCount = db.prepare(`SELECT COALESCE(json_extract(value,'$.n'), 0) AS n
  FROM settings WHERE key = 'sms_counter' AND json_extract(value,'$.d') = date('now','localtime')`);
// خواندن شمارنده بدون افزایش — سقف روزانه قبل از ارسال چک می‌شود تا
// پیامک‌های ناموفق (خرابی موقت سرویس) از ظرفیت امروز کم نکنند.
function getSmsCount() {
  return stmtSmsCount.get()?.n || 0;
}
function bumpSmsCounter() {
  stmtSmsBump.run();
  return stmtSmsCount.get()?.n || 0;
}

// شماره‌ی کاربر برای پیامک وضعیت سفارش
function getUserPhone(userId) {
  return stmtUserById.get(Number(userId))?.phone || null;
}

// ---------- کدهای تخفیف ----------
const stmtCouponByCode = db.prepare('SELECT * FROM coupons WHERE code = ?');
// مصرف فقط از سفارش‌های «بعد از ساخت همین کوپن» شمرده می‌شود؛ اگر کدی حذف و
// دوباره با همان نام ساخته شود، شمارش از صفر شروع می‌شود نه از سفارش‌های قدیمی.
const stmtCouponUses = db.prepare(`SELECT COUNT(*) AS n FROM orders
  WHERE coupon_code = ? COLLATE NOCASE AND status NOT IN ('failed','canceled') AND created_at >= ?`);
// برای «سقف هر مشتری» سفارش‌های پرداخت‌نشده شمرده نمی‌شوند. چرا: مشتری روی
// «پرداخت» می‌زند، به درگاه می‌رود و پنجره را می‌بندد؛ یک سفارش pending با همان
// کد می‌ماند. اگر آن را «استفاده‌شده» حساب کنیم، همان مشتری تا نیم‌ساعت بعد
// پیغام «شما قبلاً از این کد استفاده کرده‌اید» می‌گیرد در حالی که یک ریال هم
// نداده — یعنی خریدِ آماده را از دست می‌دهیم. سوءاستفاده هم عملاً بسته است،
// چون سفارش pending موجودی را رزرو می‌کند و بعد از ۳۰ دقیقه خودش failed می‌شود.
const stmtCouponUserUses = db.prepare(`SELECT COUNT(*) AS n FROM orders
  WHERE coupon_code = ? COLLATE NOCASE AND user_id = ?
    AND status NOT IN ('failed','canceled','pending_payment') AND created_at >= ?`);

// اعتبارسنجی کد برای یک سبد مشخص — یا {ok:true, code, discount} یا {ok:false, error}
function quoteCoupon(codeRaw, itemsTotal, userId = null) {
  const code = String(codeRaw || '').trim();
  if (!code) return { ok: false, error: 'کد تخفیف را وارد کنید' };
  const c = stmtCouponByCode.get(code);
  if (!c || !c.active) return { ok: false, error: 'این کد تخفیف معتبر نیست' };
  const today = prep(`SELECT date('now','localtime') AS d`).get().d;
  if (c.expires_at && c.expires_at < today) return { ok: false, error: 'مهلت استفاده از این کد تمام شده' };
  if (c.usage_limit > 0 && stmtCouponUses.get(c.code, c.created_at).n >= c.usage_limit) {
    return { ok: false, error: 'ظرفیت استفاده از این کد تکمیل شده' };
  }
  if (userId && c.per_user_limit > 0 && stmtCouponUserUses.get(c.code, userId, c.created_at).n >= c.per_user_limit) {
    return { ok: false, error: 'شما قبلاً از این کد استفاده کرده‌اید' };
  }
  if (itemsTotal < c.min_total) {
    return { ok: false, error: `این کد برای خرید بالای ${Number(c.min_total).toLocaleString('fa-IR')} تومان است` };
  }
  let discount = c.type === 'fixed' ? c.value : Math.floor((itemsTotal * c.value) / 100);
  if (c.type === 'percent' && c.max_discount > 0) discount = Math.min(discount, c.max_discount);
  discount = Math.max(0, Math.min(discount, itemsTotal - 1000)); // مبلغ پرداخت صفر نشود
  if (discount <= 0) return { ok: false, error: 'این کد روی این سبد اثری ندارد' };
  return { ok: true, code: c.code, discount };
}

function serializeCoupon(c, uses = 0) {
  return {
    id: c.id, code: c.code, type: c.type, value: c.value,
    minTotal: c.min_total, maxDiscount: c.max_discount,
    expiresAt: c.expires_at || null, usageLimit: c.usage_limit,
    perUserLimit: c.per_user_limit, active: Boolean(c.active),
    createdAt: c.created_at, uses
  };
}
function adminListCoupons() {
  return prep('SELECT * FROM coupons ORDER BY active DESC, id DESC').all()
    .map(c => serializeCoupon(c, stmtCouponUses.get(c.code, c.created_at).n));
}
const stmtCouponInsert = db.prepare(`INSERT INTO coupons
  (code, type, value, min_total, max_discount, expires_at, usage_limit, per_user_limit, active)
  VALUES (@code, @type, @value, @min_total, @max_discount, @expires_at, @usage_limit, @per_user_limit, @active)`);
function adminCreateCoupon(c) {
  const info = stmtCouponInsert.run(c);
  const row = prep('SELECT * FROM coupons WHERE id = ?').get(info.lastInsertRowid);
  return serializeCoupon(row, 0);
}
const stmtCouponUpdate = db.prepare(`UPDATE coupons SET
  type=@type, value=@value, min_total=@min_total, max_discount=@max_discount,
  expires_at=@expires_at, usage_limit=@usage_limit, per_user_limit=@per_user_limit, active=@active
  WHERE id=@id`);
function adminUpdateCoupon(c) {
  if (stmtCouponUpdate.run(c).changes === 0) return null;
  const row = prep('SELECT * FROM coupons WHERE id = ?').get(c.id);
  return serializeCoupon(row, stmtCouponUses.get(row.code, row.created_at).n);
}
function adminDeleteCoupon(id) {
  return prep('DELETE FROM coupons WHERE id = ?').run(Number(id)).changes > 0;
}
function getCouponById(id) {
  const row = prep('SELECT * FROM coupons WHERE id = ?').get(Number(id));
  return row ? serializeCoupon(row, stmtCouponUses.get(row.code, row.created_at).n) : null;
}

// محاسبه‌ی هزینه‌ی ارسال از تنظیمات پنل — یک منبع حقیقت برای سبد و سفارش
// shipping_cost=0 یعنی ارسال رایگان؛ free_shipping_over>0 یعنی بالای آن مبلغ رایگان می‌شود
function getShippingQuote(itemsTotal) {
  const s = getSettings();
  const cost = Math.max(0, parseInt(s.shipping_cost, 10) || 0);
  const freeOver = Math.max(0, parseInt(s.free_shipping_over, 10) || 0);
  const free = cost === 0 || (freeOver > 0 && itemsTotal >= freeOver);
  return {
    shippingCost: cost,
    freeShippingOver: freeOver,
    shippingFee: free ? 0 : cost,
    // چقدر مانده تا ارسال رایگان؟ (برای نوار تشویقی سبد؛ 0 یعنی نوار لازم نیست)
    freeShippingGap: (cost > 0 && freeOver > 0 && itemsTotal > 0 && itemsTotal < freeOver) ? freeOver - itemsTotal : 0
  };
}


// ویرایش محصول توسط ادمین (فقط فیلدهای مجاز؛ تغییر stock همزمان با خرید مشتری امن است
// چون رزرو موجودی اتمی است و این‌جا مقدار مطلق ست می‌شود)
const stmtAdminUpdateProduct = db.prepare(`UPDATE products SET
  title=@title, title_norm=@title_norm, title_fold=@title_fold, category=@category, description=@description,
  price=@price, old_price=@old_price, stock=@stock, badge=@badge, icon=@icon, image=@image,
  images=@images, specs=@specs, updated_at=datetime('now')
  WHERE id=@id`);
function adminUpdateProduct(p) {
  return stmtAdminUpdateProduct.run({
    ...p, icon: p.icon || 'i-package', old_price: Number(p.old_price) || 0,
    title_norm: normFaText(p.title), title_fold: foldFaText(p.title),
    images: JSON.stringify(p.images || []), specs: JSON.stringify(p.specs || [])
  }).changes > 0;
}

const stmtNextProductId = db.prepare('SELECT COALESCE(MAX(id),0)+1 AS next FROM products');
const stmtAdminInsertProduct = db.prepare(`INSERT INTO products
  (id, category, icon, image, images, specs, title, title_norm, title_fold, description, price, old_price, badge, stock, published, import_batch)
  VALUES (@id, @category, @icon, @image, @images, @specs, @title, @title_norm, @title_fold, @description, @price, @old_price, @badge, @stock, @published, @import_batch)`);
function adminCreateProduct(p) {
  const id = stmtNextProductId.get().next;
  stmtAdminInsertProduct.run({
    ...p, id, icon: p.icon || 'i-package', old_price: Number(p.old_price) || 0,
    title_norm: normFaText(p.title), title_fold: foldFaText(p.title),
    images: JSON.stringify(p.images || []), specs: JSON.stringify(p.specs || []),
    // پیش‌فرضِ ۱ عمدی است: محصولی که مدیر با دست در پنل می‌سازد، مثل همیشه فوراً
    // روی سایت می‌آید. فقط جایی که آگاهانه `published:0` بفرستد پیش‌نویس می‌شود.
    published: p.published === 0 || p.published === false ? 0 : 1,
    import_batch: String(p.import_batch || '')
  });
  return getProduct(id);
}

// ---------- انتشار / پنهان‌کردن ----------
// عمداً یک عملیاتِ *جداگانه* است و در stmtAdminUpdateProduct دست نمی‌برد.
//
// چرا این تفکیک مهم است: فرمِ ویرایشِ محصول و «ذخیره‌ی سریعِ جدول» هر دو به همان
// UPDATE می‌رسند، ولی ذخیره‌ی سریع فقط قیمت و موجودی را می‌فرستد. اگر published
// هم در آن کوئری بود، هر ذخیره‌ی سریعی که مقدارش را همراه نداشت، محصول را بی‌صدا
// از سایت برمی‌داشت — خرابیِ ساکتی که ممکن بود هفته‌ها کسی نفهمد و فقط فروش
// بیفتد. حالا پنهان‌کردن فقط با درخواستِ صریحِ همین مسیر ممکن است.
const stmtSetPublished = db.prepare("UPDATE products SET published = ?, updated_at=datetime('now') WHERE id = ?");
function setProductPublished(id, on) {
  return stmtSetPublished.run(on ? 1 : 0, Number(id)).changes > 0;
}

// شمارشِ پیش‌نویس‌ها و دسته‌های واردات — برای اینکه پنل بتواند بگوید
// «۸۸ پیش‌نویس داری» و مدیر یادش نرود منتشرشان کند.
function getDraftSummary() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM products WHERE published = 0').get().n;
  const batches = db.prepare(`SELECT import_batch AS batch, COUNT(*) AS n FROM products
    WHERE import_batch <> '' GROUP BY import_batch ORDER BY batch DESC`).all();
  return { drafts: total, batches };
}

// ---------- برگشت‌پذیریِ واردات ----------
// هر واردات با import_batch مهر می‌خورد تا با *یک* دستور کامل برگردد.
// بدون این، پس‌گرفتنِ یک واردات یعنی تشخیصِ دستیِ ۸۸ ردیف از بینِ
// محصولاتِ واقعی — کاری که قطعاً یک جا اشتباه می‌شود و محصولِ فروخته‌شده
// را پاک می‌کند.
//
// دو نگهبان اینجا هست و هیچ‌کدام تزئینی نیست:
//   ۱) اگر حتی یکی از ردیف‌های دسته در سفارشی ثبت شده باشد، *کلِ* حذف
//      رد می‌شود. چون snapshotِ سفارش فقط productId دارد؛ با حذفِ محصول،
//      صفحه‌ی «سفارش‌های من» به محصولِ ناموجود لینک می‌دهد.
//   ۲) حذف در تراکنش است: یا همه‌ی ردیف‌ها می‌روند یا هیچ‌کدام. نصفه‌کاره
//      ماندنش بدترین حالت است — نه واردات داری نه رول‌بک.
const stmtBatchIds = db.prepare('SELECT id FROM products WHERE import_batch = ?');
function batchHasOrders(batch) {
  let n = 0;
  for (const { id } of stmtBatchIds.all(String(batch))) {
    if (stmtProductEverOrdered.get(id, id).n > 0) n++;
  }
  return n;
}
const deleteBatch = transaction((batch) => {
  const ids = stmtBatchIds.all(String(batch)).map(r => r.id);
  for (const id of ids) {
    stmtProductInWish.run(id);
    db.prepare('DELETE FROM reviews WHERE product_id = ?').run(id);
    stmtDeleteProduct.run(id);
  }
  return ids.length;
});

// حذف محصول — اگر در سفارشی ثبت شده باشد حذف نمی‌کنیم (تاریخچه‌ی مشتری‌ها حفظ شود)؛
// به‌جایش «ناموجود» می‌شود. عملاً products در orders به‌صورت JSON snapshot است،
// پس حذف واقعی فقط برای محصولی که هرگز فروخته نشده منطقی است.
const stmtProductInWish = db.prepare('DELETE FROM wishlist WHERE product_id = ?');
const stmtDeleteProduct = db.prepare('DELETE FROM products WHERE id = ?');
const stmtProductEverOrdered = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE items LIKE '%"productId":' || ? || ',%' OR items LIKE '%"productId":' || ? || '}%'`);
const adminDeleteProductTx = transaction((id) => {
  const ordered = stmtProductEverOrdered.get(id, id).n > 0;
  if (ordered) {
    db.prepare("UPDATE products SET stock = 0, updated_at=datetime('now') WHERE id = ?").run(id);
    return { deleted: false, zeroed: true };
  }
  stmtProductInWish.run(id);
  db.prepare('DELETE FROM reviews WHERE product_id = ?').run(id); // نظرات محصول حذف‌شده هم می‌روند
  stmtDeleteProduct.run(id);
  return { deleted: true, zeroed: false };
});

// ---------- عملیات گروهی روی محصولات ----------
// همه در یک تراکنش: یا همه اعمال می‌شود یا هیچ‌کدام.
const stmtBulkStock = db.prepare("UPDATE products SET stock = ?, updated_at=datetime('now') WHERE id = ?");
const stmtBulkStockAdd = db.prepare("UPDATE products SET stock = MAX(0, stock + ?), updated_at=datetime('now') WHERE id = ?");
const stmtBulkPricePct = db.prepare(`UPDATE products SET
  price = MAX(0, CAST(ROUND(price * (1 + ?/100.0)/1000) AS INTEGER)*1000), updated_at=datetime('now') WHERE id = ?`);
const stmtBulkCategory = db.prepare("UPDATE products SET category = ?, updated_at=datetime('now') WHERE id = ?");
const stmtBulkBadge = db.prepare("UPDATE products SET badge = ?, updated_at=datetime('now') WHERE id = ?");

// «تخفیف گروهی»: قیمت فعلی به‌عنوان قیمت قبلی ذخیره می‌شود و قیمت جدید از روی آن
// حساب می‌شود. old_price فقط وقتی جایگزین می‌شود که خودش صفر باشد — وگرنه با دو
// بار اجرا، قیمتِ «قبلی» همان قیمتِ تخفیف‌خورده‌ی مرحله‌ی قبل می‌شد و درصد دروغ
// درمی‌آمد. COALESCE(NULLIF(...)) همین کار را در یک عبارت انجام می‌دهد.
const stmtBulkDiscount = db.prepare(`UPDATE products SET
  old_price = COALESCE(NULLIF(old_price, 0), price),
  price = MAX(1000, CAST(ROUND(price * (1 - ?/100.0)/1000) AS INTEGER)*1000),
  updated_at=datetime('now') WHERE id = ?`);
// پایان تخفیف: قیمت به همان قیمت قبلی برمی‌گردد و خط‌خورده پاک می‌شود
const stmtBulkDiscountEnd = db.prepare(`UPDATE products SET
  price = CASE WHEN old_price > price THEN old_price ELSE price END,
  old_price = 0, updated_at=datetime('now') WHERE id = ?`);

const adminBulkProductsTx = transaction(({ ids, op, value }) => {
  let n = 0;
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isInteger(id) || !stmtProductById.get(id)) continue;
    switch (op) {
      case 'set_stock':    n += stmtBulkStock.run(Math.max(0, Math.round(Number(value) || 0)), id).changes; break;
      case 'add_stock':    n += stmtBulkStockAdd.run(Math.round(Number(value) || 0), id).changes; break;
      case 'price_pct':    n += stmtBulkPricePct.run(Number(value) || 0, id).changes; break;
      case 'discount':     n += stmtBulkDiscount.run(Number(value) || 0, id).changes; break;
      case 'discount_end': n += stmtBulkDiscountEnd.run(id).changes; break;
      case 'set_category': n += stmtBulkCategory.run(String(value || '').trim().slice(0, 60), id).changes; break;
      case 'set_badge':    n += stmtBulkBadge.run(String(value || '').trim().slice(0, 30), id).changes; break;
      case 'clear_badge':  n += stmtBulkBadge.run('', id).changes; break;
      // انتشار گروهی — بدون این، منتشرکردنِ ۸۸ پیش‌نویس یعنی ۸۸ بار باز و بسته
      // کردن فرم. کاری که دستی طاقت‌فرسا باشد، عملاً انجام نمی‌شود.
      case 'publish':      n += stmtSetPublished.run(1, id).changes; break;
      case 'unpublish':    n += stmtSetPublished.run(0, id).changes; break;
      default: throw new Error('عملیات گروهی ناشناخته');
    }
  }
  return n;
});

// چند بار هر محصول فروخته شده — برای ستون «فروش» در جدول محصولات.
//
// اینجا عمداً پنجره‌ی ۹۰ روزه‌ی getTopProducts اعمال *نمی‌شود*. آن پنجره برای
// کارت «پرفروش‌های داشبورد» است که معنایش «اخیراً» است. ستون «فروش» در نمای
// انبار اما یعنی «از اول تا حالا چند تا رفته» و کوتاه‌کردنش یعنی گزارشِ غلط به
// فروشنده. پس بازه‌ی خیلی بلند می‌دهیم تا رفتار قبلی مو‌به‌مو حفظ شود.
const ALL_TIME_DAYS = 365 * 50;
function getProductSalesMap() {
  const map = new Map();
  for (const r of getTopProducts(5000, ALL_TIME_DAYS)) map.set(r.id, { qty: r.qty, revenue: r.revenue });
  return map;
}

// محصولات + آمار فروش هرکدام (نمای انبار در پنل).
//
// دو حالت، و شکلِ خروجیِ حالتِ اول عمداً *دقیقاً* مثل قبل است:
//   getProductsWithSales()            → آرایه، همان رفتار قدیمی (پنل فعلی)
//   getProductsWithSales({limit,page}) → { rows, total, page, pages }
// چرا این‌طور: عوض‌کردن شکلِ خروجی یعنی شکستنِ پنل ادمین و تست‌ها برای مقیاسی که
// این مغازه امسال به آن نمی‌رسد. ظرفیتش باشد، اجبارش نه.
function getProductsWithSales(opts = null) {
  const sales = getProductSalesMap();
  const wishes = new Map(
    db.prepare('SELECT product_id, COUNT(*) AS n FROM wishlist GROUP BY product_id').all()
      .map(r => [r.product_id, r.n])
  );
  const waiting = new Map(
    db.prepare('SELECT product_id, COUNT(*) AS n FROM stock_alerts WHERE notified_at IS NULL GROUP BY product_id').all()
      .map(r => [r.product_id, r.n])
  );
  const decorate = (p) => ({
    ...p,
    soldQty: sales.get(p.id)?.qty || 0,
    revenue: sales.get(p.id)?.revenue || 0,
    wishers: wishes.get(p.id) || 0,
    waiting: waiting.get(p.id) || 0
  });

  if (!opts || !opts.limit) return stmtAllProducts.all().map(decorate);

  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 500);
  const total = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(opts.page, 10) || 1, 1), pages);
  const rows = db.prepare('SELECT * FROM products ORDER BY id LIMIT ? OFFSET ?')
    .all(limit, (page - 1) * limit).map(decorate);
  return { rows, total, page, pages, limit };
}

// ---------- علاقه‌مندی‌ها ----------
// published = 1 عمداً فقط در *نمایش* است، نه در stmtWishIds و نه DELETE:
// اگر مدیر محصولی را موقتاً از سایت بردارد، ردیفِ علاقه‌مندی کاربر پاک نمی‌شود
// و با انتشار مجدد خودش برمی‌گردد. فقط تا آن موقع در لیست دیده نمی‌شود.
const stmtWishByUser = db.prepare(`
  SELECT p.* FROM wishlist w JOIN products p ON p.id = w.product_id
  WHERE w.user_id = ? AND p.published = 1 ORDER BY w.created_at DESC`);
const stmtWishIds = db.prepare('SELECT product_id FROM wishlist WHERE user_id = ?');
const stmtWishAdd = db.prepare('INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)');
const stmtWishDel = db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?');

function getWishlist(userId) { return stmtWishByUser.all(userId); }
function getWishlistIds(userId) { return stmtWishIds.all(userId).map(r => r.product_id); }
function addToWishlist(userId, productId) { return stmtWishAdd.run(userId, productId).changes > 0; }
function removeFromWishlist(userId, productId) { return stmtWishDel.run(userId, productId).changes > 0; }

// ---------- آدرس‌ها ----------
const stmtAddrByUser = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY id DESC');
const stmtAddrOne = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?');
const stmtInsertAddr = db.prepare(`INSERT INTO addresses
  (user_id, full_name, phone, province, city, address_line, postal_code) VALUES (?,?,?,?,?,?,?)`);
const stmtAddrById = db.prepare('SELECT * FROM addresses WHERE id = ?');

function serializeAddress(a) {
  if (!a) return null;
  return {
    id: a.id, userId: a.user_id, fullName: a.full_name, phone: a.phone,
    province: a.province, city: a.city, addressLine: a.address_line, postalCode: a.postal_code
  };
}

const stmtDeleteAddr = db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?');

function getAddresses(userId) { return stmtAddrByUser.all(userId).map(serializeAddress); }
function getAddress(id, userId) { return serializeAddress(stmtAddrOne.get(Number(id), userId)); }
function createAddress(userId, a) {
  const info = stmtInsertAddr.run(userId, a.fullName, a.phone, a.province || '', a.city, a.addressLine, a.postalCode || '');
  return serializeAddress(stmtAddrById.get(info.lastInsertRowid));
}
function deleteAddress(id, userId) { return stmtDeleteAddr.run(Number(id), userId).changes > 0; }
const stmtUpdateAddr = db.prepare(`UPDATE addresses SET
  full_name = ?, phone = ?, province = ?, city = ?, address_line = ?, postal_code = ?
  WHERE id = ? AND user_id = ?`);
function updateAddress(id, userId, a) {
  const ok = stmtUpdateAddr.run(a.fullName, a.phone, a.province || '', a.city,
    a.addressLine, a.postalCode || '', Number(id), userId).changes > 0;
  return ok ? getAddress(id, userId) : null;
}

// ---------- سفارش‌ها ----------
const ORDER_TTL_MS = 30 * 60 * 1000; // مهلت پرداخت؛ بعدش موجودی آزاد می‌شود

const stmtInsertOrder = db.prepare(`INSERT INTO orders
  (user_id, items, address, total, shipping_fee, coupon_code, discount, status, expires_at, idempotency_key)
  VALUES (?,?,?,?,?,?,?, 'pending_payment', ?, ?)`);
const stmtOrderById = db.prepare('SELECT * FROM orders WHERE id = ?');
const stmtOrdersByUser = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100');
const stmtSetAuthority = db.prepare('UPDATE orders SET authority = ? WHERE id = ?');
const stmtSetPaymentUrl = db.prepare('UPDATE orders SET payment_url = ? WHERE id = ?');
function setPaymentDetails(authority, paymentUrl, orderId) {
  const id = Number(orderId);
  stmtSetAuthority.run(String(authority || ''), id);
  stmtSetPaymentUrl.run(String(paymentUrl || ''), id);
  return true;
}
const stmtMarkPaid = db.prepare(`UPDATE orders SET status='paid', ref_id=?, paid_at=datetime('now'), expires_at=NULL
  WHERE id = ? AND status = 'pending_payment'`);
const stmtMarkFailed = db.prepare(`UPDATE orders SET status='failed', expires_at=NULL
  WHERE id = ? AND status = 'pending_payment'`);

function serializeOrder(o) {
  if (!o) return null;
  return {
    id: o.id, userId: o.user_id,
    items: JSON.parse(o.items), address: JSON.parse(o.address),
    total: o.total, shippingFee: o.shipping_fee || 0,
    couponCode: o.coupon_code || '', discount: o.discount || 0,
    status: o.status, authority: o.authority, refId: o.ref_id, paymentUrl: o.payment_url || '',
    createdAt: o.created_at, paidAt: o.paid_at, deliveredAt: o.delivered_at || null,
    adminNote: o.admin_note || '', trackingCode: o.tracking_code || '',
    cancelReason: o.cancel_reason || '', returnReason: o.return_reason || ''
  };
}

// ساخت سفارش + رزرو موجودی در «یک» تراکنش — total = کالاها − تخفیف + ارسال
const createOrderTx = transaction((userId, items, addressSnapshot, total, shippingFee = 0, couponCode = '', discount = 0, idempotencyKey = null) => {
  reserveStock(items);
  const info = stmtInsertOrder.run(userId, JSON.stringify(items), JSON.stringify(addressSnapshot),
    total, shippingFee, couponCode, discount, Date.now() + ORDER_TTL_MS, idempotencyKey);
  return info.lastInsertRowid;
});

// سفارش دستی (تلفنی/حضوری) که ادمین ثبت می‌کند — همان لحظه «پرداخت‌شده» است
// تا موجودی و آمار فروش با واقعیت مغازه یکی بماند.
const stmtInsertManualOrder = db.prepare(`INSERT INTO orders
  (user_id, items, address, total, shipping_fee, coupon_code, discount, status, ref_id, paid_at, admin_note)
  VALUES (?,?,?,?,?, '', 0, 'paid', 'MANUAL', datetime('now'), ?)`);
const createManualOrderTx = transaction((userId, items, addressSnapshot, total, shippingFee, note) => {
  reserveStock(items);
  const info = stmtInsertManualOrder.run(userId, JSON.stringify(items), JSON.stringify(addressSnapshot),
    total, shippingFee, String(note || ''));
  return info.lastInsertRowid;
});

const stmtOrderByUserIdempotency = db.prepare('SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ?');
function getOrderByIdempotency(userId, key) {
  return serializeOrder(stmtOrderByUserIdempotency.get(Number(userId), String(key || '')));
}
function getOrder(id) { return serializeOrder(stmtOrderById.get(Number(id))); }
function getUserOrders(userId) { return stmtOrdersByUser.all(userId).map(serializeOrder); }

// رهگیری بدون ورود: شماره‌ی سفارش + شماره‌ی موبایلِ صاحبش.
// چرا اصلاً لازم است: مشتری بعد از خرید پیامک می‌گیرد و روزها بعد می‌خواهد
// بداند بسته کجاست. تا امروز مجبور بود دوباره OTP بگیرد — یعنی یک پیامکِ
// پولی و سه مرحله کار، فقط برای دیدن یک کلمه. خیلی‌ها هم به‌جایش زنگ می‌زنند.
//
// امنیت: JOIN روی user_id انجام می‌شود، پس حدس‌زدن شماره‌ی سفارش به‌تنهایی کافی
// نیست؛ باید شماره‌ی موبایلِ همان مشتری را هم داشته باشی. خودِ روت هم سقف نرخِ
// سخت‌گیر دارد و خروجی عمداً ناقص است (تابع زیر).
const stmtOrderByIdAndPhone = db.prepare(`SELECT o.* FROM orders o
  JOIN users u ON u.id = o.user_id
  WHERE o.id = ? AND u.phone = ?`);
function getOrderForGuest(id, phone) {
  const row = stmtOrderByIdAndPhone.get(Number(id), String(phone || ''));
  if (!row) return null;
  const o = serializeOrder(row);
  // نمای کم‌داده: اسم و نشانیِ کامل و کد پیگیری بانک بیرون نمی‌آید. کسی که فقط
  // شماره‌ی موبایل را می‌داند (مثلاً از روی یک آگهیِ دیوار) نباید بتواند نشانی
  // خانه‌ی طرف را دربیاورد. چیزی که مشتری واقعاً می‌خواهد این‌هاست:
  return {
    id: o.id,
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    deliveredAt: o.deliveredAt,
    trackingCode: o.trackingCode,
    total: o.total,
    shippingFee: o.shippingFee,
    discount: o.discount,
    itemCount: o.items.reduce((n, i) => n + (parseInt(i.qty, 10) || 0), 0),
    items: o.items.map(i => ({ title: i.title, qty: i.qty })),
    // فقط شهر و استان — نه خیابان و پلاک و کد پستی
    city: (o.address && o.address.city) || '',
    province: (o.address && o.address.province) || ''
  };
}

// پرداخت موفق — فقط اگر هنوز pending باشد (idempotent)
function markOrderPaid(id, refId) {
  return stmtMarkPaid.run(refId, id).changes > 0;
}

// شکست/انصراف — موجودی به انبار برمی‌گردد (فقط بار اول)
const markOrderFailedTx = transaction((id) => {
  const changed = stmtMarkFailed.run(id).changes > 0;
  if (changed) {
    const o = stmtOrderById.get(id);
    releaseStock(JSON.parse(o.items));
  }
  return changed;
});

// سفارش‌های پرداخت‌نشده‌ی منقضی → آزادسازی موجودی
//
// **مهم:** اینجا فقط سفارش‌هایی باطل می‌شوند که «هرگز به درگاه نرسیده‌اند»
// (authority ندارند — یعنی بین ساختِ سفارش و پاسخِ درگاه چیزی شکسته است).
// سفارشی که authority دارد یعنی مشتری *به صفحه‌ی بانک رفته* و ممکن است پول
// داده باشد و فقط مرورگرش برنگشته باشد. باطل‌کردنِ چنین سفارشی یعنی «پول را
// گرفتیم و سفارش را هم دور انداختیم». تکلیفِ آن دسته را lib/reconcile.js
// با پرسیدن از خودِ درگاه روشن می‌کند.
const stmtStaleNoAuthority = db.prepare(`SELECT id FROM orders
  WHERE status='pending_payment' AND expires_at IS NOT NULL AND expires_at < ?
    AND (authority IS NULL OR authority = '')`);
function expireStaleOrders() {
  const stale = stmtStaleNoAuthority.all(Date.now());
  for (const row of stale) { try { markOrderFailedTx(row.id); } catch (e) { /* در اجرای بعدی دوباره تلاش می‌شود */ } }
  return stale.length;
}

// سفارش‌های منقضی‌ای که authority دارند — ورودیِ کارِ تطبیق با درگاه.
// expires_at را هم برمی‌گردانیم چون مهلتِ «تسلیم شدن» از روی آن حساب می‌شود.
const stmtStaleWithAuthority = db.prepare(`SELECT id, authority, total, expires_at, reconcile_tries
  FROM orders
  WHERE status='pending_payment' AND expires_at IS NOT NULL AND expires_at < ?
    AND authority IS NOT NULL AND authority <> ''
  ORDER BY id LIMIT ?`);
function getStaleOrdersToReconcile(limit = 50) {
  return stmtStaleWithAuthority.all(Date.now(), Math.max(1, Number(limit) || 50));
}

const stmtBumpReconcile = db.prepare('UPDATE orders SET reconcile_tries = reconcile_tries + 1 WHERE id = ?');
function bumpReconcileTries(id) { return stmtBumpReconcile.run(Number(id)).changes > 0; }

// ---------- OTP (ماندگار — با ری‌استارت سرور دور زده نمی‌شود) ----------
const stmtOtpGet = db.prepare('SELECT * FROM otp_codes WHERE phone = ?');
const stmtOtpUpsert = db.prepare(`
  INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, last_sent_at, sent_day, sent_today)
  VALUES (@phone, @code_hash, @expires_at, 0, @now, @day, 1)
  ON CONFLICT(phone) DO UPDATE SET
    code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, last_sent_at=excluded.last_sent_at,
    sent_today = CASE WHEN otp_codes.sent_day = excluded.sent_day THEN otp_codes.sent_today + 1 ELSE 1 END,
    sent_day = excluded.sent_day
`);
const stmtOtpBumpAttempts = db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?');
const stmtOtpDelete = db.prepare('DELETE FROM otp_codes WHERE phone = ?');
const stmtOtpCleanup = db.prepare('DELETE FROM otp_codes WHERE expires_at < ?');

const stmtIpBump = db.prepare(`
  INSERT INTO otp_ip_log (ip, day, count) VALUES (?, ?, 1)
  ON CONFLICT(ip, day) DO UPDATE SET count = count + 1
`);
const stmtIpGet = db.prepare('SELECT count FROM otp_ip_log WHERE ip = ? AND day = ?');
const stmtIpCleanup = db.prepare('DELETE FROM otp_ip_log WHERE day < ?');

// ---------- نگهداری دوره‌ای ----------
const stmtSessionCleanup = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
function cleanupExpired() {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  stmtSessionCleanup.run(now);
  stmtOtpCleanup.run(now - 3600000);
  stmtIpCleanup.run(yesterday < today ? yesterday : today);
}

// ---------- بکاپ روزانه (VACUUM INTO — نسخه‌ی فشرده و سالم از کل دیتابیس) ----------
// آیا دیتابیس سالم است؟ quick_check گرفته می‌شود نه integrity_check کامل:
// همان خرابی‌های واقعیِ صفحه/ایندکس را می‌گیرد ولی چند برابر سریع‌تر است، پس
// می‌شود هر روز قبل از بکاپ اجرایش کرد.
function quickCheck() {
  try {
    const rows = db.prepare('PRAGMA quick_check(1)').all();
    const msg = rows.map(r => Object.values(r)[0]).join('; ');
    return { ok: msg === 'ok', message: msg };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function backupNow(log = console) {
  const stamp = new Date().toISOString().slice(0, 10);
  const dest = path.join(BACKUP_DIR, `polasco-${stamp}.db`);
  if (fs.existsSync(dest)) return dest;

  // خطرِ واقعیِ چرخش بکاپ: اگر دیتابیس خراب شده باشد، بکاپِ امروز هم خراب است
  // و چرخش، سالم‌ترین نسخه‌ی موجود (قدیمی‌ترین فایل) را پاک می‌کند. چهارده روز
  // خرابیِ بی‌سروصدا = هیچ نسخه‌ی سالمی باقی نمی‌ماند. این پوشه روی درایو
  // مانت‌شده است و همین دیتابیس یک بار واقعاً خراب شده، پس فرضِ محال نیست.
  const health = quickCheck();
  const rotate = health.ok;
  if (!rotate) {
    (log.error || console.error).call(log,
      `DB integrity check FAILED (${health.message}) — backup rotation disabled to protect older good copies`);
  }

  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  // فقط ۱۴ بکاپ آخر نگه داشته می‌شود — و فقط وقتی دیتابیس سالم است
  if (rotate) {
    // فقط بکاپ‌های *روزانه* می‌چرخند. عکس‌های دستی (`pre-restore-*`،
    // `pre-recovery-*`) عمداً بیرون از شمارش‌اند: الفبایی بعد از polasco- قرار
    // می‌گیرند، پس با شمارشِ قبلی هرگز خودشان پاک نمی‌شدند ولی جای بکاپ‌های
    // روزانه را می‌گرفتند — یعنی هر عکسِ دستی یک روز از تاریخچه را می‌خورد.
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^polasco-.*\.db$/.test(f)).sort();
    while (files.length > 14) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  }
  (log.info || console.log).call(log, `Database backup saved: ${path.basename(dest)}`);

  // نسخه‌ی دوم بیرون از این دیسک — اگر BACKUP_DIR2 در .env تنظیم شده باشد
  // (مثلاً BACKUP_DIR2=D:\backup-polasco یا یک پوشه‌ی ابری همگام‌شونده)
  const dir2 = process.env.BACKUP_DIR2;
  if (dir2) {
    try {
      fs.mkdirSync(dir2, { recursive: true });
      fs.copyFileSync(dest, path.join(dir2, path.basename(dest)));
      if (rotate) {
        const f2 = fs.readdirSync(dir2).filter(f => /^polasco-.*\.db$/.test(f)).sort();
        while (f2.length > 14) fs.unlinkSync(path.join(dir2, f2.shift()));
      }
      (log.info || console.log).call(log, `Backup copied to secondary dir: ${dir2}`);
    } catch (e) {
      (log.warn || console.warn).call(log, `Secondary backup failed (${dir2}): ${e.message}`);
    }
  }

  // نگهداری ایندکس‌ها/آمار کوئری — ارزان و بی‌خطر، هفته‌ای چند بار کافی است
  try { db.exec('PRAGMA optimize'); } catch (e) { /* اختیاری */ }
  return dest;
}

// ---------- سلامت دیتابیس (برای /api/health و مانیتورینگ) ----------
// یک بررسی ارزان: یک کوئری واقعی می‌زند، اندازه‌ی فایل و WAL را می‌خواند و
// می‌گوید آخرین بکاپ چند ساعت پیش بوده. اگر uptime robot این را ببیند،
// خرابیِ خاموش (مثل پر شدن دیسک) قبل از شکایت مشتری معلوم می‌شود.
function getDbHealth() {
  const t0 = process.hrtime.bigint();
  const probe = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  const queryMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const sizeOf = (f) => { try { return fs.statSync(f).size; } catch (e) { return 0; } };
  let lastBackup = null;
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    if (files.length) {
      const st = fs.statSync(path.join(BACKUP_DIR, files[files.length - 1]));
      lastBackup = { file: files[files.length - 1], ageHours: Math.round((Date.now() - st.mtimeMs) / 36e5) };
    }
  } catch (e) { /* بکاپ هنوز ساخته نشده */ }

  // WAL که بی‌رویه بزرگ می‌شود یعنی checkpoint اتفاق نمی‌افتد (روی پوشه‌های
  // همگام‌شونده پیش می‌آید). قبل از اینکه به مشکل تبدیل شود باید دیده شود.
  const walKb = Math.round(sizeOf(`${DB_FILE}-wal`) / 1024);

  return {
    ok: probe.n >= 0,
    products: probe.n,
    queryMs: Math.round(queryMs * 100) / 100,
    sizeKb: Math.round(sizeOf(DB_FILE) / 1024),
    walKb,
    walWarn: walKb > 20480,           // بیش از ۲۰ مگابایت WAL = checkpoint گیر کرده
    lastBackup,
    backupStale: !lastBackup || lastBackup.ageHours > 48
  };
}

// بررسی سلامت ساختاری — گران‌تر از getDbHealth، پس فقط با درخواست ادمین
// اجرا می‌شود (نه در هر پینگ مانیتورینگ).
function checkIntegrity() { return quickCheck(); }

// ---------- بستن تمیز دیتابیس ----------
// در خاموشیِ آرام صدا زده می‌شود: صفحه‌های WAL در فایل اصلی ادغام می‌شوند
// تا دیتابیس در حالت کاملاً سالم روی دیسک بماند.
//
// چرا PASSIVE و نه TRUNCATE:
//   TRUNCATE می‌خواهد فایل WAL را هم به صفر برساند. روی دیسک محلی مشکلی
//   ندارد، ولی روی درایو شبکه یا پوشه‌ی همگام‌شده (OneDrive و مانند آن)
//   عملیاتِ کوتاه‌کردن فایل رد می‌شود و دیتابیس در وضعیت گیر می‌افتد.
//   PASSIVE همان ادغام را انجام می‌دهد، هرگز قفل نمی‌کند و هیچ‌وقت
//   فایل را کوتاه نمی‌کند — یعنی همان سود، بدون آن خطر.
//
// اگر checkpoint هم نشد اصلاً مهم نیست: WAL ماندگار است و در اجرای بعدی
// خودکار بازپخش می‌شود، پس در هیچ حالتی داده‌ای از دست نمی‌رود.
let closed = false;
function closeDb(log = console) {
  if (closed) return;
  closed = true;
  // آخرین شمارنده‌های بازدید که هنوز در حافظه‌اند، قبل از بستن نوشته شوند
  try { flushVisits(); } catch (e) { /* آمار ارزشِ خراب‌کردنِ خاموشی را ندارد */ }
  try {
    db.exec('PRAGMA busy_timeout = 400;'); // خاموشی را معطل خواننده‌ها نکن
    db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  } catch (e) { /* WAL دست‌نخورده می‌ماند و در اجرای بعدی بازپخش می‌شود */ }
  try { db.close(); } catch (e) { /* ignore */ }
  (log.info || console.log).call(log, 'Database closed cleanly');
}

module.exports = {
  db, DATA_DIR, initDb, closeDb, getDbHealth, checkIntegrity,
  flushVisits,
  getProducts, getProduct, upsertProductsTx,
  // نسخه‌های عمومی — پیش‌نویس‌ها را نشان نمی‌دهند (ستون published)
  getPublicProducts, getPublicProduct, setProductPublished, getDraftSummary, batchHasOrders, deleteBatch,
  queryProducts, getCatalogSignature, getCatalogFacets, getCategories,
  reserveStock, releaseStock,
  findOrCreateUser, stmtUserById, updateUserName,
  setUserPassword, getUserByPhone,
  ensureAdmin, setStaff, getAllOrders, adminSetOrderStatus, getAdminStats,
  getAllUsers, getUserDetail,
  adminUpdateProduct, adminCreateProduct, adminDeleteProductTx,
  // --- افزوده‌های پنل مدیریت ---
  getAdminOverview, getSalesSeries, getMonthlySales, getTopProducts, getTopCustomers,
  getCategoryShare, getLowStock, getWishedOutOfStock,
  queryOrders, getOrderStatusCounts, getOrderForAdmin,
  adminCancelOrderTx, adminAcceptReturnTx, userCancelOrderTx, userRequestReturn,
  setOrderNote, setOrderTracking,
  adminBulkProductsTx, getProductsWithSales,
  logAdminAction, getAdminLog,
  getSettings, getSetting, setSettingsTx, getShippingQuote,
  quoteCoupon, adminListCoupons, adminCreateCoupon, adminUpdateCoupon, adminDeleteCoupon, getCouponById,
  bumpSmsCounter, getSmsCount, getUserPhone, createManualOrderTx,
  addStockAlert, getPendingStockAlerts, markStockAlertsNotified,
  bumpVisit, cleanupOldVisits, getTopPages,
  getCategoriesFull, getPublicCategories, ensureCategory, adminCreateCategory, adminUpdateCategoryTx, adminDeleteCategory, adminMoveCategoryTx,
  upsertReview, getProductReviews, getRatingsMap, getRecentReviews, adminListReviews, adminSetReviewStatus, hasUserBought,
  getWishlist, getWishlistIds, addToWishlist, removeFromWishlist,
  getAddresses, getAddress, createAddress, updateAddress, deleteAddress,
  createOrderTx, getOrder, getOrderByIdempotency, getUserOrders, getOrderForGuest, markOrderPaid, markOrderFailedTx, stmtSetAuthority, setPaymentDetails,
  expireStaleOrders, getStaleOrdersToReconcile, bumpReconcileTries, cleanupExpired, backupNow,
  crmGetSummary, crmSearchCustomers, crmGetCustomer,
  crmListTags, crmCreateTag, crmDeleteTag, crmSetUserTags,
  crmAddNote, crmDeleteNote, crmAddTask, crmToggleTask, crmDeleteTask,
  otp: { get: stmtOtpGet, upsert: stmtOtpUpsert, bumpAttempts: stmtOtpBumpAttempts, del: stmtOtpDelete, ipBump: stmtIpBump, ipGet: stmtIpGet }
};
