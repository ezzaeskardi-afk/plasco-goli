const express = require('express');
const {
  getPublicProduct, createOrderTx, getOrder, getOrderByIdempotency, getUserOrders,
  markOrderPaid, markOrderFailedTx, getAddress,
  getShippingQuote, userCancelOrderTx, userRequestReturn, getSetting, quoteCoupon, getUserPhone, setPaymentDetails,
  getOrderForGuest
} = require('../lib/db');
const { requireAuth, asyncHandler, rateLimit } = require('../lib/middleware');
const { normalizeDigits, normalizePhone, isValidIranPhone } = require('../lib/phone');
const { requestPayment, verifyPayment } = require('../lib/payment');
const { notifyAdminNewOrder, notifyCustomerOrderStatus } = require('../lib/sms');
const log = require('../lib/logger');

const router = express.Router();

// اقلام سفارش از روی «دیتابیس» ساخته می‌شوند نه ورودی کاربر — قیمت قابل دستکاری نیست
function buildOrderItemsFromCart(cart) {
  const items = (cart || [])
    .map(entry => {
      const product = getPublicProduct(entry.productId);
      if (!product) return null;
      const qty = Math.max(1, parseInt(entry.qty, 10) || 1);
      return { productId: product.id, title: product.title, price: product.price, qty };
    })
    .filter(Boolean);
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return { items, total };
}

// ساخت سفارش از سبد فعلی + شروع پرداخت
// سقفِ ثبت سفارش با `user` کلید می‌خورد نه `ip` (این روت بعد از requireAuth است).
// با کلیدِ IP، ده‌ها مشتریِ واقعی پشت یک IP مشترک (CGNAT) سهمیه‌ی هم را می‌خوردند.
router.post('/', requireAuth, rateLimit({ windowMs: 60000, max: 10, keyBy: 'user', message: 'تعداد تلاش برای ثبت سفارش زیاد است؛ یک دقیقه صبر کنید' }), asyncHandler(async (req, res) => {
  // تعطیلی موقت فروشگاه از پنل — مرور و سبد آزاد است، فقط ثبت سفارش بسته می‌شود
  if (getSetting('shop_open') === '0') {
    return res.status(503).json({ error: 'فروشگاه موقتاً تعطیل است و فعلاً سفارش نمی‌پذیرد؛ به‌زودی برمی‌گردیم' });
  }

  const { addressId } = req.body || {};
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'کلید یکتای سفارش معتبر نیست؛ صفحه را دوباره باز کنید' });
  }
  const previous = getOrderByIdempotency(req.session.userId, idempotencyKey);
  if (previous) {
    // درخواست تکراری همان سفارش قبلی را برمی‌گرداند؛ موجودی و درگاه دوباره لمس نمی‌شوند.
    return res.json({ orderId: previous.id, paymentUrl: previous.paymentUrl || null, testMode: String(previous.authority || '').startsWith('TEST-'), repeated: true, status: previous.status });
  }
  const cart = req.session.cart || [];
  if (!cart.length) return res.status(400).json({ error: 'سبد خرید خالی است' });

  const address = getAddress(addressId, req.session.userId);
  if (!address) return res.status(400).json({ error: 'آدرس معتبر انتخاب نشده' });

  const { items, total } = buildOrderItemsFromCart(cart);
  if (!items.length || total <= 0) return res.status(400).json({ error: 'سبد خرید نامعتبر است' });

  // کد تخفیف — اعتبارسنجی نهایی همین لحظه (نه چیزی که سبد قبلاً دیده بود)
  let discount = 0;
  let couponCode = '';
  if (req.session.coupon) {
    const q = quoteCoupon(req.session.coupon, total, req.session.userId);
    if (!q.ok) {
      req.session.coupon = null;
      return res.status(409).json({ error: `کد تخفیف: ${q.error} — کد برداشته شد، دوباره پرداخت را بزنید` });
    }
    discount = q.discount;
    couponCode = q.code;
  }

  // هزینه‌ی ارسال روی مبلغ بعد از تخفیف — مبلغ پرداخت = کالاها − تخفیف + ارسال
  const discounted = total - discount;
  const { shippingFee } = getShippingQuote(discounted);
  const grandTotal = discounted + shippingFee;

  // رزرو موجودی + ثبت سفارش، اتمی. اگر موجودی کم باشد همین‌جا برمی‌گردد.
  let orderId;
  try {
    orderId = createOrderTx(req.session.userId, items, address, grandTotal, shippingFee, couponCode, discount, idempotencyKey);
  } catch (err) {
    if (err.code === 'STOCK_SHORTAGE') {
      const lines = err.shortages.map(s => `«${s.title}» (موجودی: ${s.available})`).join('، ');
      return res.status(409).json({ error: `موجودی کافی نیست: ${lines}. لطفاً تعداد را در سبد اصلاح کنید.`, shortages: err.shortages });
    }
    throw err;
  }

  const callbackUrl = `${req.protocol}://${req.get('host')}/api/orders/payment-callback?orderId=${orderId}`;
  const payment = await requestPayment({
    orderId,
    amountToman: grandTotal,
    description: `سفارش شماره ${orderId} - پلاسکو گلی`,
    callbackUrl
  });

  if (!payment.ok) {
    // پرداخت شروع نشد → سفارش شکست می‌خورد و موجودی همان لحظه آزاد می‌شود
    markOrderFailedTx(orderId);
    log.error('Payment initiation failed', new Error(JSON.stringify(payment.error)));
    return res.status(502).json({ error: 'اتصال به درگاه پرداخت برقرار نشد؛ سفارش ثبت نشد. دوباره تلاش کنید.' });
  }

  setPaymentDetails(payment.authority, payment.paymentUrl, orderId);

  // بعد از شروع پرداخت، سبد و کد تخفیف نشسته روی سشن خالی می‌شوند.
  req.session.cart = [];
  req.session.coupon = null;

  log.info(`Order ${orderId} created (${grandTotal} Toman, shipping ${shippingFee})`);
  res.json({ orderId, paymentUrl: payment.paymentUrl, testMode: payment.testMode });
}));

// آدرسی که درگاه پرداخت (یا حالت آزمایشی) کاربر رو بهش برمی‌گردونه
// سقف درخواست: مسیر خودش idempotent و Authority-محور است، ولی این سد جلوی
// کوبیدن بی‌هدف روی endpoint (و کوئری‌های بیهوده روی دیتابیس) را می‌گیرد.
// کاربر واقعی در هر خرید یک بار اینجا می‌آید، پس ۳۰ در دقیقه بسیار سخاوتمندانه است.
router.get('/payment-callback',
  rateLimit({ windowMs: 60000, max: 30, message: 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید' }),
  asyncHandler(async (req, res) => {
  const orderId = Number(req.query.orderId);
  const { Authority, Status } = req.query;

  const order = getOrder(orderId);
  if (!order) return res.redirect('/order-success.html?error=notfound');

  // idempotent: اگر نتیجه‌ی این سفارش قبلاً مشخص شده، فقط نمایش می‌دهیم
  // (رفرش صفحه‌ی برگشت، پرداخت دوباره یا آزادسازی دوباره‌ی موجودی ایجاد نمی‌کند)
  if (order.status !== 'pending_payment') {
    return res.redirect(`/order-success.html?orderId=${order.id}`);
  }

  // Authority باید همانی باشد که موقع شروع پرداخت برای همین سفارش ثبت شد
  if (!Authority || Authority !== order.authority) {
    log.warn(`Payment callback with invalid authority for order ${order.id}`, { ip: req.ip });
    return res.redirect(`/order-success.html?orderId=${order.id}`);
  }

  if (Status !== 'OK') {
    markOrderFailedTx(order.id);
    return res.redirect(`/order-success.html?orderId=${order.id}`);
  }

  const verification = await verifyPayment({ authority: Authority, amountToman: order.total });
  if (verification.ok) {
    markOrderPaid(order.id, verification.refId);
    log.info(`Order ${order.id} paid (refId: ${verification.refId})`);
    // خبردادن به مدیر و مشتری — async و بدون await تا برگشت مشتری از درگاه کند نشود
    notifyAdminNewOrder(order).catch(e => log.error('Admin order notification failed', e));
    notifyCustomerOrderStatus(getOrder(order.id), getUserPhone(order.userId))
      .catch(e => log.error('Customer paid-SMS failed', e));
  } else if (verification.retriable) {
    // نرسیدن به درگاه ≠ پرداخت‌نشدن. مشتری همین الان از صفحه‌ی بانک برگشته، پس
    // احتمالِ اینکه واقعاً پول داده باشد بالاست. سفارش را **باطل نمی‌کنیم**؛
    // در حالت pending_payment می‌ماند و کارِ دوره‌ای (lib/reconcile.js) چند دقیقه
    // بعد از خودِ درگاه می‌پرسد و تکلیفش را روشن می‌کند.
    log.warn(`Payment verification unreachable for order ${order.id}; left pending for reconciliation`, { reason: verification.error });
  } else {
    markOrderFailedTx(order.id);
    log.warn(`Payment verification failed for order ${order.id}`);
  }

  res.redirect(`/order-success.html?orderId=${order.id}`);
}));

router.get('/mine', requireAuth, (req, res) => {
  res.json({ orders: getUserOrders(req.session.userId) });
});

// رهگیریِ بدون ورود — شماره‌ی سفارش + شماره‌ی موبایل.
// چرا: تنها راه دیدن وضعیت سفارش تا امروز «ورود با پیامک» بود. برای مشتری‌ای که
// فقط می‌خواهد بداند بسته‌اش کجاست این یعنی یک OTP و چند مرحله کار — و برای ما
// یعنی یک پیامکِ پولی به‌ازای هر کنجکاوی. نتیجه‌اش این بود که ملت زنگ می‌زدند.
//
// چهار لایه‌ی محافظت، چون این روت عمداً بدون ورود کار می‌کند:
//   ۱) دانستنِ هر دو چیز لازم است (شماره‌ی سفارش پشت‌سرهم است، موبایل نه).
//   ۲) سقف نرخِ سخت‌گیر با skipSuccess — پس فقط *حدس‌های غلط* سهمیه می‌سوزانند.
//      بدون skipSuccess، CGNAT اپراتورها یعنی چند مشتریِ درست از یک IP هم
//      همدیگر را قفل می‌کردند (همان درسِ صفحه‌ی ورود).
//   ۳) خروجی کم‌داده است: نه نشانی، نه نام، نه کد پیگیریِ بانک (getOrderForGuest).
//   ۴) پیامِ شکست همیشه یکی است — «پیدا نشد» فرقی بین «سفارش نیست» و «موبایل
//      اشتباه است» نمی‌گذارد، وگرنه می‌شد فهمید کدام شماره‌ سفارش وجود دارد.
router.post('/track',
  rateLimit({
    windowMs: 10 * 60 * 1000, max: 12, skipSuccess: true,
    message: 'تعداد تلاش‌های ناموفق زیاد بود؛ ده دقیقه صبر کنید و دوباره امتحان کنید'
  }),
  (req, res) => {
    const { orderId, phone } = req.body || {};

    const id = parseInt(normalizeDigits(String(orderId ?? '')).replace(/\D/g, ''), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'شماره‌ی سفارش را وارد کنید (فقط عدد)' });
    }
    const ph = normalizePhone(phone);
    if (!isValidIranPhone(ph)) {
      return res.status(400).json({ error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹' });
    }

    const order = getOrderForGuest(id, ph);
    if (!order) {
      return res.status(404).json({
        error: 'سفارشی با این شماره‌ی سفارش و موبایل پیدا نشد. شماره‌ها را یک بار دیگر ببینید.'
      });
    }
    res.json({ order });
  });

// چیدنِ دوباره‌ی سبد از روی یک سفارش قدیمی.
// چرا لازم شد: سبد در خط ۹۳ **قبل از** رفتن به درگاه خالی می‌شود. تا پیش از این،
// اگر پرداخت ناموفق می‌شد صفحه‌ی نتیجه می‌گفت «می‌توانید دوباره تلاش کنید» ولی هیچ
// راهی برای تلاش دوباره نبود — مشتری باید کل سبد را از صفر می‌چید. یعنی درست در
// لحظه‌ای که یک قدم تا خرید بود، بیشترین کار را رویش می‌گذاشتیم.
// برای سفارش‌های تحویل‌شده هم همین روت «خرید دوباره» می‌شود.
const MAX_QTY_PER_ITEM = 99;   // همان سقف routes/cart.js
const MAX_DISTINCT_ITEMS = 50;

router.post('/:id/reorder', requireAuth,
  rateLimit({ windowMs: 60000, max: 20, keyBy: 'user', message: 'تعداد درخواست زیاد است؛ یک دقیقه صبر کنید' }),
  (req, res) => {
    const order = getOrder(req.params.id);
    // پیام یکسان برای «نبود» و «مالِ کسِ دیگر» تا شماره‌ی سفارش‌ها قابل حدس‌زدن نشود
    if (!order || order.userId !== req.session.userId) {
      return res.status(404).json({ error: 'سفارش پیدا نشد' });
    }

    const cart = [];
    const skipped = [];
    for (const item of (order.items || []).slice(0, MAX_DISTINCT_ITEMS)) {
      // قیمت و موجودی از دیتابیسِ امروز خوانده می‌شود، نه از عکسِ داخل سفارش:
      // ممکن است کالا حذف شده، ناموجود شده یا قیمتش عوض شده باشد.
      const product = getPublicProduct(item.productId);
      if (!product) { skipped.push({ title: item.title, reason: 'حذف شده' }); continue; }
      if (product.stock <= 0) { skipped.push({ title: product.title, reason: 'ناموجود' }); continue; }
      const qty = Math.min(
        Math.max(1, parseInt(item.qty, 10) || 1),
        product.stock,
        MAX_QTY_PER_ITEM
      );
      if (qty < (parseInt(item.qty, 10) || 1)) {
        skipped.push({ title: product.title, reason: `فقط ${qty} عدد موجود است` });
      }
      cart.push({ productId: product.id, qty });
    }

    if (!cart.length) {
      return res.status(409).json({
        error: 'هیچ‌کدام از کالاهای این سفارش الان موجود نیست',
        skipped
      });
    }

    // جایگزینی کامل، نه ادغام: مشتری انتظار دارد سبد دقیقاً همان سفارش شود.
    req.session.cart = cart;
    res.json({ added: cart.length, skipped });
  });

// لغو سفارش توسط مشتری — فقط تا وقتی هنوز ارسال نشده (paid)
router.post('/:id/cancel', requireAuth,
  rateLimit({ windowMs: 60000, max: 30, keyBy: 'user', message: 'تعداد درخواست زیاد است؛ یک دقیقه صبر کنید' }),
  (req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.session.userId) {
      return res.status(404).json({ error: 'سفارش پیدا نشد' });
    }
    if (order.status !== 'paid') {
      const msg = ['shipped', 'delivered'].includes(order.status)
        ? 'این سفارش ارسال شده و دیگر قابل لغو نیست؛ بعد از تحویل می‌توانید درخواست مرجوعی بدهید'
        : 'این سفارش قابل لغو نیست';
      return res.status(409).json({ error: msg });
    }
    if (!userCancelOrderTx(order.id, req.session.userId)) {
      return res.status(409).json({ error: 'لغو ممکن نشد؛ صفحه را رفرش کنید' });
    }
    log.info(`Order ${order.id} canceled by customer (user ${req.session.userId})`);
    res.json({ ok: true, order: getOrder(order.id) });
  });

// درخواست مرجوعی — تا ۷ روز بعد از تحویل
const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
router.post('/:id/return', requireAuth,
  rateLimit({ windowMs: 60000, max: 10, keyBy: 'user', message: 'تعداد درخواست زیاد است؛ یک دقیقه صبر کنید' }),
  (req, res) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (reason.length < 5) {
      return res.status(400).json({ error: 'لطفاً دلیل مرجوعی را بنویسید (حداقل ۵ حرف) تا سریع‌تر رسیدگی شود' });
    }
    const order = getOrder(req.params.id);
    if (!order || order.userId !== req.session.userId) {
      return res.status(404).json({ error: 'سفارش پیدا نشد' });
    }
    if (order.status !== 'delivered') {
      return res.status(409).json({ error: 'فقط سفارش تحویل‌شده قابل مرجوعی است' });
    }
    // datetime('now') در SQLite به وقت UTC است؛ برای مقایسه همان‌طور می‌خوانیم
    if (order.deliveredAt) {
      const deliveredMs = new Date(order.deliveredAt.replace(' ', 'T') + 'Z').getTime();
      if (Number.isFinite(deliveredMs) && Date.now() - deliveredMs > RETURN_WINDOW_MS) {
        return res.status(409).json({ error: 'مهلت ۷ روزه‌ی مرجوعی این سفارش به پایان رسیده است' });
      }
    }
    if (!userRequestReturn(order.id, req.session.userId, reason)) {
      return res.status(409).json({ error: 'ثبت درخواست ممکن نشد؛ صفحه را رفرش کنید' });
    }
    log.info(`Order ${order.id}: return requested by customer (user ${req.session.userId})`);
    res.json({ ok: true, order: getOrder(order.id) });
  });

router.get('/:id', requireAuth, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order || order.userId !== req.session.userId) {
    return res.status(404).json({ error: 'سفارش پیدا نشد' });
  }
  res.json({ order });
});

module.exports = router;
