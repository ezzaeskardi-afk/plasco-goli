// کش درون‌حافظه با TTL — کاهش بار SQLite در ترافیک بالا
//
// مشکل: تا امروز هر درخواست GET /api/products کوئری واقعی به SQLite می‌زد.
// با ۵۰۰۰ خوانندهٔ همزمان، ۵۰۰۰ کوئری تقریباً هم‌زمان وارد event-loop
// می‌شوند و SQLite (با وجود WAL) باید همه را پشت سر هم اجرا کند.
//
// راه‌حل: کش درون‌حافظه با TTL کوتاه (۲-۱۰ ثانیه). در آن پنجره، هزاران
// درخواست بدون زدن به دیتابیس پاسخ می‌گیرند. بعد از TTL، کش تازه می‌شود
// و تغییرات admin فوراً دیده می‌شود.
//
// چرا و نه ETag: ETag مرورگر را ۳۰۴ می‌دهد ولی سرور باید هر بار کوئری
// بزند تا امضا را حساب کند. کش سمت سرور این کوئری را هم حذف می‌کند.

'use strict';

class TtlCache {
  /**
   * @param {object} opts
   * @param {number} opts.maxEntries — حداکثر کلیدها (پیش‌فرض ۵۱۲)
   * @param {number} opts.defaultTtl — TTL پیش‌فرض به میلی‌ثانیه (پیش‌فرض ۳۰۰۰ = ۳ ثانیه)
   */
  constructor({ maxEntries = 512, defaultTtl = 3000 } = {}) {
    this._map = new Map();   // key -> { value, expiresAt }
    this._maxEntries = maxEntries;
    this._defaultTtl = defaultTtl;
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) { this._misses++; return undefined; }
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      this._misses++;
      return undefined;
    }
    this._hits++;
    return entry.value;
  }

  set(key, value, ttlMs) {
    // اگر کش پر بود، قدیمی‌ترین‌ها را پاک کن
    if (this._map.size >= this._maxEntries && !this._map.has(key)) {
      const drop = Math.max(1, Math.ceil(this._maxEntries / 10));
      for (const k of this._map.keys()) { this._map.delete(k); if (--drop <= 0) break; }
    }
    this._map.set(key, { value, expiresAt: Date.now() + (ttlMs || this._defaultTtl) });
  }

  /** حذف همهٔ کلیدهایی که با prefix شروع می‌شوند — برای باطل‌کردن کش بعد از تغییر */
  invalidatePrefix(prefix) {
    for (const k of this._map.keys()) {
      if (k.startsWith(prefix)) this._map.delete(k);
    }
  }

  /** حذف یک کلید خاص */
  del(key) { this._map.delete(key); }

  /** آمار */
  stats() {
    return { keys: this._map.size, hits: this._hits, misses: this._misses };
  }

  /** پاک‌سازی کلیدهای منقضی‌شده (اختیاری — معمولاً lazy انجام می‌شود) */
  sweep() {
    const now = Date.now();
    for (const [k, v] of this._map) {
      if (now > v.expiresAt) this._map.delete(k);
    }
  }
}

// ---------- نمونه‌های اختصاصی ----------

/** کش لیست محصولات عمومی — TTL کوتاه (۲ ثانیه) چون ادمین ممکن است قیمت عوض کند */
const productsCache = new TtlCache({ maxEntries: 64, defaultTtl: 2000 });

/** کش جزئیات یک محصول — TTL متوسط (۵ ثانیه) */
const productDetailCache = new TtlCache({ maxEntries: 256, defaultTtl: 5000 });

/** کش دسته‌بندی‌ها — TTL بلندتر (۱۰ ثانیه) چون کمتر تغییر می‌کند */
const categoriesCache = new TtlCache({ maxEntries: 16, defaultTtl: 10000 });

/** کش محصولات مرتبط — TTL متوسط (۵ ثانیه) */
const relatedCache = new TtlCache({ maxEntries: 128, defaultTtl: 5000 });

/** کش facets — TTL متوسط (۳ ثانیه) */
const facetsCache = new TtlCache({ maxEntries: 32, defaultTtl: 3000 });

/** کش تنظیمات فروشگاه — TTL بلند (۳۰ ثانیه) */
const settingsCache = new TtlCache({ maxEntries: 8, defaultTtl: 30000 });

/** باطل‌کردن کش محصولات بعد از ویرایش/حذف در پنل ادمین */
function invalidateProducts() {
  productsCache.invalidatePrefix('');
  productDetailCache.invalidatePrefix('');
  relatedCache.invalidatePrefix('');
  facetsCache.invalidatePrefix('');
}

/** باطل‌کردن کش دسته‌بندی‌ها */
function invalidateCategories() {
  categoriesCache.invalidatePrefix('');
}

/** باطل‌کردن همهٔ کش‌ها */
function invalidateAll() {
  productsCache.invalidatePrefix('');
  productDetailCache.invalidatePrefix('');
  categoriesCache.invalidatePrefix('');
  relatedCache.invalidatePrefix('');
  facetsCache.invalidatePrefix('');
  settingsCache.invalidatePrefix('');
}

module.exports = {
  TtlCache,
  productsCache,
  productDetailCache,
  categoriesCache,
  relatedCache,
  facetsCache,
  settingsCache,
  invalidateProducts,
  invalidateCategories,
  invalidateAll
};
