const express = require('express');
const {
  getPublicProducts, getPublicProduct, queryProducts, getCatalogSignature, getCatalogFacets,
  getRatingsMap, getProductReviews, upsertReview, addStockAlert, getUserPhone, wholesaleInfo, getRelatedProducts
} = require('../lib/db');
// makeRateLimit با نامِ rateLimit — سقف‌ها در حالت cluster مشترک می‌مانند.
const { etagJson, validate, V, requireAuth, makeRateLimit: rateLimit } = require('../lib/middleware');

const router = express.Router();

const SORTS = ['newest', 'oldest', 'price-asc', 'price-desc', 'title', 'stock'];

// ---------- کشِ پاسخِ فهرست (در حافظه) ----------
// پاسخ فهرست برای همه‌ی بازدیدکننده‌ها *یکسان* است و فقط وقتی عوض می‌شود که
// کاتالوگ عوض شود — و دقیقاً همین را getCatalogSignature() می‌داند (تعداد، آخرین
// ویرایش، مجموع موجودی، نسخه‌ی نظرات).
//
// پس به‌جای اینکه برای هر بازدید دوباره کوئری بزنیم و JSON بسازیم، نتیجه را نگه
// می‌داریم و به محض تغییر امضا، *کلِ* کش را دور می‌ریزیم. باطل‌سازیِ کلی عمدی
// است: تلاش برای اینکه بفهمیم کدام کلید تحت تأثیر است، جایی است که این‌طور
// کش‌ها معمولاً داده‌ی کهنه نشان می‌دهند.
//
// ETag هم از قبل هست، ولی آن فقط به مرورگرِ *برگشته* کمک می‌کند؛ این به همه.
const listCache = new Map();
const LIST_CACHE_MAX = 150; // ترکیب‌های رایج فیلتر؛ فراتر از آن قدیمی‌ترین می‌رود
let listCacheSig = '';

function cachedList(sig, key, build) {
  if (sig !== listCacheSig) { listCache.clear(); listCacheSig = sig; }
  let hit = listCache.get(key);
  if (hit === undefined) {
    hit = build();
    if (listCache.size >= LIST_CACHE_MAX) listCache.delete(listCache.keys().next().value);
    listCache.set(key, hit);
  }
  return hit;
}

// سطلِ جداگانه‌ی جست‌وجو.
// محدودکننده‌ی عمومیِ ۳۰۰/دقیقه روی کل /api از قبل هست و منطقی است، ولی جست‌وجو
// تنها مسیرِ عمومی است که می‌تواند به «نتیجه‌ی نزدیک» بیفتد و آنجا تا ۳۰۰۰ سطر
// را در جاوااسکریپت با فاصله‌ی ویرایشی مقایسه کند. روی موتورِ همگام، این گران‌ترین
// کاری است که یک غریبه می‌تواند بدون حساب کاربری از سرور بخواهد. دفاعِ لایه‌ای.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'جست‌وجوی زیاد در زمان کوتاه؛ چند لحظه صبر کنید'
});
const searchGate = (req, res, next) => (req.query.q ? searchLimiter(req, res, next) : next());

const parseJsonArr = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

function serializeProduct(p, ratings = null) {
  // «قیمت قبلی» فقط وقتی به فرانت می‌رود که واقعاً از قیمت فعلی بیشتر باشد.
  // فیلتر همین‌جا انجام می‌شود تا فرانت هیچ‌وقت مجبور نشود یک تخفیف منفی یا
  // صفر را نمایش دهد و بعد خودش قضاوت کند.
  const oldPrice = Number(p.old_price) > Number(p.price) ? Number(p.old_price) : 0;
  return {
    id: p.id, category: p.category, icon: p.icon, image: p.image || null,
    title: p.title, description: p.description, price: p.price,
    oldPrice,
    // درصد تخفیف را سرور حساب می‌کند تا در همه‌ی صفحه‌ها یک عدد یکسان دیده شود
    discountPercent: oldPrice ? Math.round(((oldPrice - p.price) / oldPrice) * 100) : 0,
    badge: p.badge || '', stock: p.stock,
    // گالری چندعکسه و جدول مشخصات (نسخه‌ی ۷)
    images: parseJsonArr(p.images), specs: parseJsonArr(p.specs),
    // امتیاز نظرات تأییدشده — کارت‌ها و صفحه‌ی محصول ستاره نشان می‌دهند
    rating: (ratings && ratings[p.id]) || { count: 0, avg: 0 },
    // قیمت‌گذاری عمده (B2B) — null یعنی این کالا عمده‌فروشی ندارد
    wholesale: wholesaleInfo(p)
  };
}

// ---------- GET /api/products ----------
// دو حالت دارد و هر دو با یک روت پشتیبانی می‌شوند:
//
//  ۱) بدون پارامتر  → همان رفتار قدیمی: کل کاتالوگ در { products: [...] }
//     (فرانت فعلی و اسکریپت تست روی همین حساب باز کرده‌اند و نباید بشکنند)
//
//  ۲) با پارامتر (page/limit/q/category/…) → فیلتر و صفحه‌بندی در دیتابیس
//     انجام می‌شود و meta برمی‌گردد. با چند هزار محصول، فقط همان ۱۲ کالایی
//     که کاربر می‌بیند از دیتابیس بیرون می‌آید نه کل جدول.
//
// در هر دو حالت ETag گذاشته می‌شود: بازدید دوم به‌جای دانلود دوباره،
// پاسخ ۳۰۴ خالی می‌گیرد.
//
// صفحه‌ی خارج از محدوده: queryProducts آن را به آخرین صفحه می‌چسباند و همین‌طور
// هم باید بماند — تستِ «Out-of-range page is clamped» نگهبانِ همین تصمیم است و
// دلیلش این است که مشتری هرگز صفحه‌ی خالی نبیند. یک بار اینجا ۴۰۴ گذاشتم و همان
// تست جلویش را گرفت؛ درست هم بود.
//   ▸ خطرِ «اسکنِ عمیق» وجود ندارد: چون page به pages چسبانده می‌شود، OFFSET
//     هیچ‌وقت از تعدادِ کل بیشتر نمی‌شود.
//   ▸ نگرانیِ سئو (چند آدرس، یک محتوا) سرِ جایش هست ولی جوابش اینجا نیست:
//     meta.page همیشه صفحه‌ی *واقعی* را برمی‌گرداند و فرانت با همان، هم آدرس
//     مرورگر را اصلاح می‌کند هم <link rel="canonical"> را.
router.get('/',
  searchGate,
  validate({
    // q تنها فیلدی است که برشِ خاموش برایش *درست* است: کسی که عنوانِ بلندِ یک
    // کالا را در جست‌وجو می‌چسباند نباید خطا بگیرد، باید نتیجه ببیند. بقیه‌ی
    // فیلدها با طولِ بیش از حد خطا می‌دهند (V.str پیش‌فرض).
    q: V.str({ optional: true, max: 60, truncate: true }),
    category: V.str({ optional: true, max: 40 }),
    sort: V.enum(SORTS, { fallback: 'newest' }),
    minPrice: V.int({ min: 0, max: 10_000_000_000, optional: true }),
    maxPrice: V.int({ min: 0, max: 10_000_000_000, optional: true }),
    inStock: V.bool(),
    page: V.int({ min: 1, max: 10_000, optional: true }),
    limit: V.int({ min: 1, max: 60, optional: true })
  }, 'query'),
  (req, res) => {
    const f = req.valid;
    const paged = Object.keys(req.query).length > 0;

    // امضای کش: با هر تغییر کاتالوگ و نیز با هر ترکیب فیلتر متفاوت، عوض می‌شود
    const catSig = getCatalogSignature();
    const filterKey = paged
      ? [f.q, f.category, f.sort, f.minPrice, f.maxPrice, f.inStock, f.page, f.limit].join('|')
      : 'all';
    if (etagJson(req, res, `${catSig}-${filterKey}`, { maxAge: 30 })) return;

    const body = cachedList(catSig, filterKey, () => {
      const ratings = getRatingsMap();
      if (!paged) {
        return { products: getPublicProducts().map(p => serializeProduct(p, ratings)) };
      }
      const { rows, total, page, pages, limit, fuzzy, suggestion } = queryProducts(f);
      return {
        products: rows.map(p => serializeProduct(p, ratings)),
        // fuzzy=true یعنی عبارت دقیق پیدا نشد و این‌ها «نزدیک‌ترین» نتایج‌اند —
        // فرانت با همین پرچم به مشتری می‌گوید «چیزی به این نام نبود، اینها را ببین»
        meta: { total, page, pages, limit, hasMore: page < pages, fuzzy: Boolean(fuzzy), suggestion: suggestion || '' }
      };
    });

    res.json(body);
  });

// ---------- GET /api/products/facets ----------
// دسته‌بندی‌ها و بازه‌ی قیمت، برای ساختن فیلترها بدون دانلود کل کاتالوگ.
// باید قبل از /:id باشد وگرنه «facets» به‌عنوان شناسه خوانده می‌شود.
router.get('/facets', (req, res) => {
  if (etagJson(req, res, `f-${getCatalogSignature()}`, { maxAge: 120 })) return;
  res.json(getCatalogFacets());
});

// ---------- GET /api/products/by-ids?ids=3,7,12 ----------
// برای «بازدیدهای اخیر»: مرورگر فقط *شناسه*ها را نگه می‌دارد و اطلاعات تازه را
// از اینجا می‌گیرد.
//
// چرا عنوان و قیمت در مرورگر ذخیره نمی‌شود: مشتری‌ای که دیروز کالایی را دیده،
// امروز باید قیمت و موجودیِ امروز را ببیند. کش‌کردن قیمت در مرورگر یعنی نمایش
// عدد کهنه — و بعد شکایت «توی سایت این قیمت بود».
//
// این هم باید *قبل* از /:id باشد وگرنه «by-ids» به‌عنوان شناسه خوانده می‌شود.
router.get('/by-ids', (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n < 1e9);

  // یکتاسازی + سقف: بدون سقف، کسی می‌توانست با ids=1,2,...,5000 کل کاتالوگ را
  // در یک درخواست بکشد بیرون و از صفحه‌بندی فرار کند.
  const uniq = [...new Set(ids)].slice(0, 12);
  if (!uniq.length) return res.json({ products: [] });

  if (etagJson(req, res, `byids-${getCatalogSignature()}-${uniq.join('.')}`, { maxAge: 30 })) return;

  const ratings = getRatingsMap();
  // ترتیب خروجی همان ترتیب ورودی است (تازه‌ترین بازدید اول). محصول حذف‌شده
  // بی‌صدا کنار می‌رود — نه خطا، چون فهرست «اخیراً دیده‌شده» چیز حیاتی نیست.
  const products = uniq
    .map((id) => getPublicProduct(id))
    .filter(Boolean)
    .map((p) => serializeProduct(p, ratings));

  res.json({ products });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });

  const product = getPublicProduct(id);
  if (!product) return res.status(404).json({ error: 'محصول پیدا نشد' });

  const ratings = getRatingsMap();
  // امضای این محصول = شناسه + زمان آخرین ویرایش + امتیاز فعلی. تغییر قیمت، موجودی
  // یا نظر تازه، فوراً کش مرورگر را باطل می‌کند.
  const r = ratings[id] || { count: 0, avg: 0 };
  if (etagJson(req, res, `p${product.id}-${String(product.updated_at).replace(/\D/g, '')}-${product.stock}-r${r.count}.${r.avg}`, { maxAge: 30 })) return;

  res.json({ product: serializeProduct(product, ratings) });
});

// ---------- محصولات مرتبط (همچنین بخرید) ----------
router.get('/:id/related', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });
  const related = getRelatedProducts(id, 6);
  const ratings = getRatingsMap();
  // امضا = شناسه‌ها + موجودی‌ها تا با هر تغییرِ این قفسه کش مرورگر باطل شود
  const sig = `rel${id}-${related.map(p => `${p.id}.${p.stock}`).join(',')}`;
  if (etagJson(req, res, sig, { maxAge: 60 })) return;
  res.json({ products: related.map(p => serializeProduct(p, ratings)) });
});

// ---------- نظرات یک محصول ----------
// عمومی است ولی اگر کاربر لاگین باشد، نظر خودش (حتی در انتظار تأیید) هم برمی‌گردد
router.get('/:id/reviews', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });
  if (!getPublicProduct(id)) return res.status(404).json({ error: 'محصول پیدا نشد' });
  res.json(getProductReviews(id, req.session.userId || null));
});

// ثبت/ویرایش نظر — بعد از ویرایش دوباره به صف تأیید می‌رود
router.post('/:id/reviews', requireAuth,
  rateLimit({ windowMs: 60000, max: 10, message: 'تعداد درخواست زیاد است؛ یک دقیقه صبر کنید' }),
  (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });
    if (!getPublicProduct(id)) return res.status(404).json({ error: 'محصول پیدا نشد' });

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'امتیاز باید بین ۱ تا ۵ ستاره باشد' });
    }
    const body = String(req.body?.body || '').trim();
    if (body.length > 500) return res.status(400).json({ error: 'متن نظر حداکثر ۵۰۰ حرف است' });

    const review = upsertReview(req.session.userId, id, rating, body);
    res.json({ ok: true, review, message: 'نظر شما ثبت شد و بعد از تأیید نمایش داده می‌شود' });
  });

// «موجود شد خبرم کن» — فقط برای کالای ناموجود؛ به محض شارژ موجودی پیامک می‌رود
router.post('/:id/notify-me', requireAuth,
  rateLimit({ windowMs: 60000, max: 10, message: 'تعداد درخواست زیاد است؛ یک دقیقه صبر کنید' }),
  (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });
    const product = getPublicProduct(id);
    if (!product) return res.status(404).json({ error: 'محصول پیدا نشد' });
    if (product.stock > 0) return res.status(409).json({ error: 'این محصول موجود است — همین حالا می‌توانید بخرید!' });

    addStockAlert(id, req.session.userId, getUserPhone(req.session.userId));
    res.json({ ok: true, message: 'ثبت شد؛ به محض موجود شدن پیامک می‌دهیم' });
  });

module.exports = router;
