const express = require('express');
const {
  getProducts, getProduct, queryProducts, getCatalogSignature, getCatalogFacets,
  getRatingsMap, getProductReviews, upsertReview, addStockAlert, getUserPhone
} = require('../lib/db');
const { etagJson, validate, V, requireAuth, rateLimit } = require('../lib/middleware');

const router = express.Router();

const SORTS = ['newest', 'oldest', 'price-asc', 'price-desc', 'title', 'stock'];

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
    rating: (ratings && ratings[p.id]) || { count: 0, avg: 0 }
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
router.get('/',
  validate({
    q: V.str({ optional: true, max: 60 }),
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
    const sig = `${getCatalogSignature()}-${paged ? [f.q, f.category, f.sort, f.minPrice, f.maxPrice, f.inStock, f.page, f.limit].join('|') : 'all'}`;
    if (etagJson(req, res, sig, { maxAge: 30 })) return;

    const ratings = getRatingsMap();
    if (!paged) {
      return res.json({ products: getProducts().map(p => serializeProduct(p, ratings)) });
    }

    const { rows, total, page, pages, limit, fuzzy, suggestion } = queryProducts(f);
    res.json({
      products: rows.map(p => serializeProduct(p, ratings)),
      // fuzzy=true یعنی عبارت دقیق پیدا نشد و این‌ها «نزدیک‌ترین» نتایج‌اند —
      // فرانت با همین پرچم به مشتری می‌گوید «چیزی به این نام نبود، اینها را ببین»
      meta: { total, page, pages, limit, hasMore: page < pages, fuzzy: Boolean(fuzzy), suggestion: suggestion || '' }
    });
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
    .map((id) => getProduct(id))
    .filter(Boolean)
    .map((p) => serializeProduct(p, ratings));

  res.json({ products });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });

  const product = getProduct(id);
  if (!product) return res.status(404).json({ error: 'محصول پیدا نشد' });

  const ratings = getRatingsMap();
  // امضای این محصول = شناسه + زمان آخرین ویرایش + امتیاز فعلی. تغییر قیمت، موجودی
  // یا نظر تازه، فوراً کش مرورگر را باطل می‌کند.
  const r = ratings[id] || { count: 0, avg: 0 };
  if (etagJson(req, res, `p${product.id}-${String(product.updated_at).replace(/\D/g, '')}-${product.stock}-r${r.count}.${r.avg}`, { maxAge: 30 })) return;

  res.json({ product: serializeProduct(product, ratings) });
});

// ---------- نظرات یک محصول ----------
// عمومی است ولی اگر کاربر لاگین باشد، نظر خودش (حتی در انتظار تأیید) هم برمی‌گردد
router.get('/:id/reviews', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });
  if (!getProduct(id)) return res.status(404).json({ error: 'محصول پیدا نشد' });
  res.json(getProductReviews(id, req.session.userId || null));
});

// ثبت/ویرایش نظر — بعد از ویرایش دوباره به صف تأیید می‌رود
router.post('/:id/reviews', requireAuth,
  rateLimit({ windowMs: 60000, max: 5, message: 'تعداد ثبت نظر زیاد است؛ یک دقیقه صبر کنید' }),
  (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه‌ی محصول معتبر نیست' });
    if (!getProduct(id)) return res.status(404).json({ error: 'محصول پیدا نشد' });

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
    const product = getProduct(id);
    if (!product) return res.status(404).json({ error: 'محصول پیدا نشد' });
    if (product.stock > 0) return res.status(409).json({ error: 'این محصول موجود است — همین حالا می‌توانید بخرید!' });

    addStockAlert(id, req.session.userId, getUserPhone(req.session.userId));
    res.json({ ok: true, message: 'ثبت شد؛ به محض موجود شدن پیامک می‌دهیم' });
  });

module.exports = router;
