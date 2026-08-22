const express = require('express');
const { getPublicProduct, getShippingQuote, quoteCoupon, wholesaleInfo } = require('../lib/db');

const router = express.Router();

const MAX_QTY_PER_ITEM = 99;
const MAX_DISTINCT_ITEMS = 50; // سقف تعداد نوع محصول در سبد (جلوی سنگین شدن سشن)

function buildCartResponse(req) {
  const cartItems = req.session.cart || [];

  // کالایی که مدیر از فروشگاه حذف کرده باید هم از سشن پاک شود هم به کاربر گفته
  // شود؛ قبلاً بی‌صدا از لیست حذف می‌شد و مشتری فکر می‌کرد سبدش خودسر خالی شده.
  const vanished = [];
  const items = cartItems
    .map(entry => {
      const product = getPublicProduct(entry.productId);
      if (!product) { vanished.push(entry.productId); return null; }
      // «قیمت قبلی» تنها وقتی به فرانت می‌رود که واقعاً بیشتر از قیمت فعلی باشد —
      // همان قاعده‌ای که serializeProduct در routes/products.js دارد، تا سبد و
      // کارت محصول هیچ‌وقت دو عدد متفاوت نشان ندهند.
      const oldPrice = Number(product.old_price) > Number(product.price) ? Number(product.old_price) : 0;
      // عمده‌فروشی: اگر تعداد به حد نصاب رسیده باشد، قیمت واحد ارزان‌تر می‌شود.
      const wholesale = wholesaleInfo(product, entry.qty);
      const unitPrice = wholesale && wholesale.applies ? wholesale.unitPrice : product.price;
      const wholesaleSavings = wholesale && wholesale.applies ? (product.price - unitPrice) * entry.qty : 0;
      return {
        productId: product.id,
        title: product.title,
        icon: product.icon,
        image: product.image || null,
        price: product.price,
        oldPrice,
        // درصد تخفیف همیشه سمت سرور حساب می‌شود تا در سبد و کارت محصول
        // یک عدد یکسان دیده شود (PG.priceHtml همین فیلد را می‌خواند).
        discountPercent: oldPrice ? Math.round(((oldPrice - product.price) / oldPrice) * 100) : 0,
        qty: entry.qty,
        stock: product.stock,
        // سقف واقعیِ همین قلم؛ فرانت با همین عدد دکمه‌ی «+» را قفل می‌کند
        // و دیگر لازم نیست کاربر با خطا خوردن بفهمد که به سقف رسیده.
        maxQty: qtyCap(product),
        // قیمتی که واقعاً حساب می‌شود (ممکن است قیمت عمده باشد)
        unitPrice,
        wholesale,
        subtotal: unitPrice * entry.qty,
        wholesaleSavings,
        savings: oldPrice > unitPrice ? (oldPrice - unitPrice) * entry.qty : 0
      };
    })
    .filter(Boolean);
  if (vanished.length) {
    req.session.cart = cartItems.filter(e => !vanished.includes(e.productId));
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  // مجموع صرفه‌جویی از تخفیف محصولات (جدا از کد تخفیف) — نشان دادنش انگیزه‌ی
  // تکمیل خرید را بالا می‌برد و عدد را هم سرور حساب می‌کند تا قابل اعتماد باشد.
  const savings = items.reduce((sum, item) => sum + item.savings, 0);

  // کد تخفیف نشسته روی سشن — با هر تغییر سبد دوباره اعتبارسنجی می‌شود
  let coupon = null;
  let discount = 0;
  let couponNotice = null;
  if (req.session.coupon) {
    const q = quoteCoupon(req.session.coupon, total, req.session.userId || null);
    if (q.ok) {
      coupon = { code: q.code, discount: q.discount };
      discount = q.discount;
    } else {
      // سبد عوض شده و کد دیگر صدق نمی‌کند → برداشته می‌شود و به کاربر می‌گوییم چرا
      req.session.coupon = null;
      couponNotice = q.error;
    }
  }

  // هزینه‌ی ارسال روی مبلغِ «بعد از تخفیف» حساب می‌شود (منصفانه برای آستانه‌ی رایگان)
  const discounted = Math.max(0, total - discount);
  const ship = getShippingQuote(discounted);
  const body = { items, total, count, savings, coupon, discount, ...ship, payable: discounted + ship.shippingFee };
  if (couponNotice) body.couponNotice = couponNotice;
  if (vanished.length) {
    body.notice = vanished.length === 1
      ? 'یکی از کالاهای سبد دیگر در فروشگاه نیست و از سبد برداشته شد'
      : `${vanished.length} کالای سبد دیگر در فروشگاه نیستند و از سبد برداشته شدند`;
  }
  return body;
}

// یادداشت را به یادداشت‌های قبلیِ همان پاسخ اضافه می‌کند تا پیام «کالا حذف شد»
// با پیام «تعداد اصلاح شد» یکی دیگری را نخورد.
function addNotice(body, text) {
  body.notice = body.notice ? `${body.notice}؛ ${text}` : text;
  return body;
}

// سقف واقعیِ یک قلم: کمترین مقدار بین موجودی انبار و سقف منطقی هر قلم.
function qtyCap(product) {
  const byStock = typeof product.stock === 'number' ? product.stock : MAX_QTY_PER_ITEM;
  return Math.max(0, Math.min(byStock, MAX_QTY_PER_ITEM));
}

function clampQty(product, wanted) {
  return Math.max(0, Math.min(wanted, qtyCap(product)));
}

// وقتی تعداد درخواستی به سقف خورد، باید دقیقاً بگوییم کدام سقف — قبلاً همیشه
// «فقط X عدد موجود است» گفته می‌شد و اگر موجودی انبار ۵۰۰ بود ولی کاربر ۱۲۰ عدد
// می‌خواست، پیام می‌شد «فقط ۵۰۰ عدد موجود است» که هم بی‌معنی بود هم گمراه‌کننده.
function capReason(product, cap) {
  return cap === MAX_QTY_PER_ITEM && Number(product.stock) > MAX_QTY_PER_ITEM
    ? `در هر سفارش حداکثر ${MAX_QTY_PER_ITEM} عدد از یک کالا می‌شود ثبت کرد`
    : `از «${product.title}» فقط ${cap} عدد موجود است`;
}

router.get('/', (req, res) => {
  res.json(buildCartResponse(req));
});

router.post('/add', (req, res) => {
  const { productId, qty } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'شناسه‌ی محصول لازم است' });

  const product = getPublicProduct(productId);
  if (!product) return res.status(404).json({ error: 'محصول پیدا نشد' });
  if (product.stock <= 0) return res.status(409).json({ error: 'این محصول فعلاً ناموجود است' });

  const addQty = Math.max(1, parseInt(qty, 10) || 1);
  req.session.cart = req.session.cart || [];

  const existing = req.session.cart.find(i => String(i.productId) === String(productId));

  // محصول جدید فقط تا سقف تعداد نوع مجاز است (جلوی پر کردن سبد با هزاران قلم)
  if (!existing && req.session.cart.length >= MAX_DISTINCT_ITEMS) {
    return res.status(409).json({ error: 'تعداد اقلام سبد به سقف رسیده؛ برای افزودن محصول جدید، چند مورد را حذف کنید' });
  }

  const current = existing ? existing.qty : 0;
  const newQty = clampQty(product, current + addQty);

  if (newQty === current) {
    return res.status(409).json({ error: capReason(product, qtyCap(product)) });
  }

  if (existing) existing.qty = newQty;
  else req.session.cart.push({ productId: product.id, qty: newQty });

  res.json(buildCartResponse(req));
});

router.post('/update', (req, res) => {
  const { productId, qty } = req.body || {};
  req.session.cart = req.session.cart || [];
  const newQty = parseInt(qty, 10);

  if (!newQty || newQty < 1) {
    req.session.cart = req.session.cart.filter(i => String(i.productId) !== String(productId));
    return res.json(buildCartResponse(req));
  }

  const existing = req.session.cart.find(i => String(i.productId) === String(productId));
  if (existing) {
    const product = getPublicProduct(productId);
    if (!product) {
      // buildCartResponse خودش این قلم را پاک و پیامش را اضافه می‌کند
      return res.json(buildCartResponse(req));
    }
    const clamped = clampQty(product, newQty);
    if (clamped < 1) {
      // موجودی همین حالا صفر شده (مدیر فروخته یا انبار خالی شده)
      req.session.cart = req.session.cart.filter(i => String(i.productId) !== String(productId));
      return res.json(addNotice(buildCartResponse(req),
        `«${product.title}» ناموجود شد و از سبد برداشته شد`));
    }
    existing.qty = clamped;
    if (clamped < newQty) {
      return res.json(addNotice(buildCartResponse(req),
        `${capReason(product, qtyCap(product))}؛ تعداد اصلاح شد`));
    }
  }

  res.json(buildCartResponse(req));
});

router.post('/remove', (req, res) => {
  const { productId } = req.body || {};
  req.session.cart = (req.session.cart || []).filter(i => String(i.productId) !== String(productId));
  res.json(buildCartResponse(req));
});

// ---------- کد تخفیف ----------
router.post('/coupon', (req, res) => {
  const code = String(req.body?.code || '').trim();
  const current = buildCartResponse(req); // total فعلی برای اعتبارسنجی
  const q = quoteCoupon(code, current.total, req.session.userId || null);
  if (!q.ok) return res.status(400).json({ error: q.error });
  req.session.coupon = q.code;
  res.json(buildCartResponse(req));
});

router.post('/coupon/remove', (req, res) => {
  req.session.coupon = null;
  res.json(buildCartResponse(req));
});

module.exports = router;
