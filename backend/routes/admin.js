// روت‌های پنل مدیریت — فقط برای کاربر ادمین (شماره‌ی ثبت‌شده در ADMIN_PHONE)
//
// امنیت:
//   - همه‌ی مسیرها پشت requireAdmin (سشن + پرچم دیتابیس، نه فقط سشن)
//   - تغییر وضعیت سفارش فقط در مسیر منطقی (paid→shipped→delivered، لغو از هرجا)
//   - ورودی‌های محصول اعتبارسنجی و محدود می‌شوند
//   - آپلود عکس: فقط JPG/PNG/WebP، حداکثر ۲ مگابایت، نام فایل امن تصادفی
//   - هر تغییر مهم در admin_log ثبت می‌شود (چه کسی، چه کاری، کِی)

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  stmtUserById, getAllOrders, adminSetOrderStatus, getAdminStats, getAllUsers,
  getProducts, getProduct, adminUpdateProduct, adminCreateProduct, adminDeleteProductTx, ensureAdmin, setStaff,
  setProductPublished, getDraftSummary,
  getAdminOverview, getSalesSeries, getMonthlySales, getTopProducts, getTopCustomers, getCategoryShare,
  getLowStock, getWishedOutOfStock, queryOrders, getOrderStatusCounts, getOrderForAdmin,
  adminCancelOrderTx, adminAcceptReturnTx, setOrderNote, setOrderTracking, adminBulkProductsTx,
  adminListReviews, adminSetReviewStatus,
  adminListCoupons, adminCreateCoupon, adminUpdateCoupon, adminDeleteCoupon, getCouponById,
  getCategoriesFull, ensureCategory, adminCreateCategory, adminUpdateCategoryTx, adminDeleteCategory, adminMoveCategoryTx,
  getProductsWithSales, getUserDetail, logAdminAction, getAdminLog,
  getSettings, setSettingsTx, backupNow, getDbHealth, checkIntegrity,
  findOrCreateUser, updateUserName, createManualOrderTx,
  getPendingStockAlerts, markStockAlertsNotified,
  crmGetSummary, crmSearchCustomers, crmGetCustomer,
  crmListTags, crmCreateTag, crmDeleteTag, crmSetUserTags,
  crmAddNote, crmDeleteNote, crmAddTask, crmToggleTask, crmDeleteTask,
  listWholesaleRequests, countNewWholesaleRequests, setWholesaleRequestStatus, deleteWholesaleRequest
} = require('../lib/db');
const { rateLimit, asyncHandler } = require('../lib/middleware');
const { isAdminPhone, normalizePhone, isValidIranPhone } = require('../lib/phone');
const { notifyCustomerOrderStatus, notifyStockAvailable } = require('../lib/sms');
const { imageSizeFromBuffer } = require('../lib/imagesize');
const { stripImageMetadata } = require('../lib/image-clean');
const { queueVariants } = require('../lib/image-encode');
const { errorDigest } = require('../lib/error-digest');
const { snapshot: metricsSnapshot } = require('../lib/metrics');

const log = require('../lib/logger');

// اگر کالایی که مشتری منتظرش بود دوباره موجود شد → پیامک «موجود شد» + علامت‌گذاری
function fireRestockAlerts(productId) {
  const p = getProduct(Number(productId));
  if (!p || p.stock <= 0) return;
  const waiting = getPendingStockAlerts(p.id);
  if (!waiting.length) return;
  markStockAlertsNotified(p.id);
  notifyStockAvailable(p, waiting).catch(e => log.error('Restock SMS failed', e));
  log.info(`Restock alerts fired for product #${p.id} (${waiting.length} customer(s))`);
}

const router = express.Router();

// مسیر از lib/paths.js می‌آید تا با مسیری که server.js سرو می‌کند یکی بماند.
// اگر این دو از هم جدا بیفتند، عکسِ تازه‌آپلودشده بی‌سروصدا ۴۰۴ می‌شود.
const { PRODUCTS_PICTURE_DIR } = require('../lib/paths');

// ---------- احراز ادمین (سشن + تایید دوباره از دیتابیس + چک پویای .env) ----------
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'ابتدا وارد شوید' });
  let user = stmtUserById.get(req.session.userId);
  if (user && !user.is_admin && isAdminPhone(user.phone)) {
    user = ensureAdmin(user.id); // شماره بعداً به .env اضافه شده — همین حالا ادمین شود
  }
  if (!user || !user.is_admin) {
    log.warn('Unauthorized admin-panel access attempt', { ip: req.ip, userId: req.session.userId });
    return res.status(403).json({ error: 'دسترسی مجاز نیست' });
  }
  req.adminUser = user;
  next();
}

// کارمند: فقط بخش سفارش‌ها — نه محصولات، نه مشتریان، نه تنظیمات
function requireStaff(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'ابتدا وارد شوید' });
  const user = stmtUserById.get(req.session.userId);
  if (!user || (!user.is_admin && !user.is_staff)) {
    log.warn('Unauthorized panel access attempt', { ip: req.ip, userId: req.session.userId });
    return res.status(403).json({ error: 'دسترسی مجاز نیست' });
  }
  req.adminUser = user;
  next();
}

// ---------- انقضای نشستِ بی‌کار (فقط پنل) ----------
// سناریوی واقعی: پنل روی کامپیوترِ پشتِ پیشخوانِ مغازه باز می‌ماند و صاحب
// مغازه می‌رود ناهار. هر کسی که پشت آن میز بنشیند، مدیرِ فروشگاه است — می‌تواند
// قیمت عوض کند، سفارش لغو کند، شماره‌ی همه‌ی مشتری‌ها را ببیند.
//
// چرا فقط پنل و نه کلِ سایت: بیرون‌انداختنِ مشتری از حسابش یعنی سبدِ نیمه‌کاره
// و خریدِ ازدست‌رفته. نشستِ مشتری باید بلند باشد؛ نشستِ مدیر نباید.
//
// ۳۰ دقیقه از روی همان کار انتخاب شده: بین دو کارِ پنل معمولاً چند دقیقه فاصله
// است، پس مدیرِ مشغول هیچ‌وقت بیرون نمی‌افتد؛ ولی ناهار و تعطیلیِ ظهر بیشتر از
// نیم‌ساعت طول می‌کشد.
const PANEL_IDLE_MS = Number(process.env.PANEL_IDLE_MS) || 30 * 60 * 1000;

function panelIdleGuard(req, res, next) {
  if (!req.session.userId) return next(); // بی‌نشست را خودِ requireAdmin رد می‌کند
  const now = Date.now();
  const last = Number(req.session.panelSeen) || 0;
  if (last && now - last > PANEL_IDLE_MS) {
    log.info('Panel session expired for inactivity', { userId: req.session.userId, ip: req.ip });
    return req.session.destroy(() => {
      // کد اختصاصی تا صفحه‌ی پنل بتواند پیامِ درست را نشان دهد؛ با ۴۰۱ خالی
      // کاربر فکر می‌کند سایت خراب شده است.
      res.status(401).json({
        error: 'به‌خاطر نیم‌ساعت بی‌کاری، از پنل خارج شدید. دوباره وارد شوید.',
        reason: 'idle'
      });
    });
  }
  // مهرِ زمان را هر درخواست نمی‌نویسیم. نوشتن روی session یعنی یک ذخیره‌سازی،
  // و پنل موقع باز شدن ده‌ها درخواست هم‌زمان می‌فرستد. یک‌بار در دقیقه برای
  // سنجشِ نیم‌ساعت بی‌کاری بیش از حد کافی است.
  if (now - last > 60e3) req.session.panelSeen = now;
  next();
}

// مسیرهای سفارش برای کارمند هم باز است؛ بقیه فقط ادمین
router.use(panelIdleGuard);
router.use((req, res, next) => {
  const isOrderPath = /^\/orders(\/|$)/.test(req.path);
  return isOrderPath ? requireStaff(req, res, next) : requireAdmin(req, res, next);
});
// سقف بالاتر از قبل چون پنل جدید چند بخش هم‌زمان دارد
router.use(rateLimit({ windowMs: 60 * 1000, max: 1000, message: 'درخواست‌های زیاد؛ کمی صبر کنید' }));

// ثبت رویداد با کاربر جاری
function note(req, action, target = '', detail = '') {
  logAdminAction(req.session.userId, action, target, detail);
}

// ---------- داشبورد ----------
router.get('/stats', (req, res) => {
  res.json({ stats: getAdminStats() });
});

// همه‌ی داده‌های داشبورد در یک درخواست: آمار + نمودار + برترین‌ها + هشدارها
router.get('/overview', (req, res) => {
  const ov = getAdminOverview();
  // تعداد درخواست‌های عمده‌ی دیده‌نشده برای بجِ سایدبار
  ov.newWholesaleRequests = countNewWholesaleRequests();
  // کارایی سرور (درخواست/تأخیر) برای کارت داشبورد
  ov.metrics = metricsSnapshot();
  res.json(ov);
});

// کارایی سرور — متریک درخواست/تأخیر (فقط ادمین؛ مسیر /orders نیست پس requireAdmin اعمال شده)
router.get('/metrics', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(metricsSnapshot());
});

// نمودار فروش با بازه‌ی دلخواه (۷ تا ۹۰ روز)
router.get('/sales-series', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 90);
  res.json({ days, series: getSalesSeries(days) });
});

// گزارش‌های تحلیلی
router.get('/reports', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
  res.json({
    days,
    series: getSalesSeries(days),
    topProducts: getTopProducts(20),
    categories: getCategoryShare(),
    topCustomers: getTopCustomers(20),
    stats: getAdminStats()
  });
});

/* گزارشِ ماه‌به‌ماه — ماهِ **شمسی**، نه میلادی.
   بازه‌ی روزانه‌ی بالا به «مرداد چطور بود؟» جواب نمی‌دهد؛ «۳۰ روز اخیر» تکه‌ای
   از دو ماه است. سقف ۳۶ ماه در خودِ getMonthlySales هم اعمال می‌شود، این‌جا
   فقط ورودیِ بی‌معنی را زودتر می‌گیریم. */
router.get('/reports/monthly', (req, res) => {
  res.json(getMonthlySales(Math.min(Math.max(Number(req.query.months) || 12, 2), 36)));
});

// دفتر رویدادها
router.get('/activity', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 300);
  res.json({ activity: getAdminLog(limit) });
});

/* خطاهای سرور — گروه‌بندی‌شده، نه لاگِ خام.
   عمداً کش نمی‌شود: کسی که این صفحه را باز می‌کند دنبالِ همین لحظه است.
   فقط ادمین (نه کارمند) — stack trace ساختارِ داخلیِ سرور را نشان می‌دهد.

   نگهبانِ router بالا خودش این مسیر را به requireAdmin می‌دهد (چون /orders
   نیست)، پس این شرط دومی و تکراری است. با این حال می‌ماند: اگر روزی کسی
   الگوی مسیرهای کارمند را باز کند، این صفحه نباید بی‌صدا برای کارمند باز شود.
   بار اول به‌غلط `req.user` نوشته بودم — چیزی که وجود ندارد — و نتیجه‌اش این
   بود که مسیر برای *ادمین هم* ۴۰۳ می‌داد. متغیرِ درست `req.adminUser` است. */
router.get('/errors', (req, res) => {
  if (!req.adminUser?.is_admin) return res.status(403).json({ error: 'دسترسی ندارید' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json(errorDigest({
      logDir: log.LOG_DIR,
      rootDir: path.join(__dirname, '..', '..'),
      days: req.query.days
    }));
  } catch (e) {
    // ابزارِ دیدنِ خطا نباید خودش منبعِ خطا شود؛ پنل باید باز شود حتی اگر
    // پوشه‌ی لاگ گم شده باشد یا اجازه‌ی خواندن نداشته باشیم.
    log.warn('error digest failed', { message: e.message });
    res.json({ days: 0, since: null, totals: { errors: 0, groups: 0, http5xx: 0, today: 0 }, daily: [], groups: [], unavailable: e.message });
  }
});

// ---------- مشتری‌ها ----------
// لیست همه‌ی کاربران ثبت‌نامی + آمار خریدشان. هر شماره فقط یک حساب دارد
// (phone در دیتابیس UNIQUE است؛ ثبت‌نام دوباره با همان شماره = همان حساب قبلی).
router.get('/users', (req, res) => {
  res.json({ users: getAllUsers() });
});

// نمای کامل یک مشتری: آدرس‌ها، همه‌ی سفارش‌ها، علاقه‌مندی‌ها و خلاصه‌ی خرید
router.get('/users/:id', (req, res) => {
  const detail = getUserDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'مشتری پیدا نشد' });
  res.json({ user: detail });
});

// تنظیم نقش کارمند — فقط ادمین می‌تواند این کار را بکند
router.post('/users/:id/staff', (req, res) => {
  if (!req.adminUser.is_admin) return res.status(403).json({ error: 'فقط ادمین می‌تواند نقش کارمند را تغییر دهد' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'شناسه معتبر نیست' });
  const on = req.body?.staff === true || req.body?.staff === 1;
  const user = setStaff(id, on);
  if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });
  note(req, on ? 'staff_grant' : 'staff_revoke', `#${id}`);
  res.json({ ok: true, isStaff: Boolean(user.is_staff) });
});

// ---------- CRM ----------
// مدیریت ارتباط با مشتری: برچسب/سگمنت، یادداشت پرونده و پیگیری/یادآور.
// خطاهای اعتبارسنجی crmErr (status) را با همان کد برمی‌گردانیم؛ بقیه به هندلر سراسری می‌رود.
function crmWrap(handler) {
  return (req, res) => {
    try { handler(req, res); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  };
}

// خلاصه + برچسب‌ها در یک درخواست (برای باز شدن اولیه‌ی بخش CRM)
router.get('/crm/summary', (req, res) => {
  res.json({ summary: crmGetSummary(), tags: crmListTags() });
});

// جستجوی مشتری‌ها با برچسب/فیلتر/مرتب‌سازی/صفحه‌بندی
router.get('/crm/customers', crmWrap((req, res) => {
  res.json(crmSearchCustomers({
    q: req.query.q, tag: req.query.tag, filter: req.query.filter,
    sort: req.query.sort, limit: req.query.limit, offset: req.query.offset
  }));
}));

// پرونده‌ی کامل مشتری (مشخصات + سفارش‌ها + برچسب/یادداشت/پیگیری)
router.get('/crm/customers/:id', (req, res) => {
  const customer = crmGetCustomer(req.params.id);
  if (!customer) return res.status(404).json({ error: 'مشتری پیدا نشد' });
  res.json({ customer });
});

// یادداشت
router.post('/crm/customers/:id/notes', crmWrap((req, res) => {
  const n = crmAddNote(req.params.id, req.session.userId, req.body?.body);
  note(req, 'crm_note_add', `#${req.params.id}`);
  res.status(201).json({ note: n });
}));
router.delete('/crm/notes/:id', (req, res) => {
  if (!crmDeleteNote(req.params.id)) return res.status(404).json({ error: 'یادداشت پیدا نشد' });
  note(req, 'crm_note_delete', `#${req.params.id}`);
  res.json({ ok: true });
});

// پیگیری/یادآور
router.post('/crm/customers/:id/tasks', crmWrap((req, res) => {
  const t = crmAddTask(req.params.id, req.session.userId, req.body?.title, req.body?.dueAt);
  note(req, 'crm_task_add', `#${req.params.id}`);
  res.status(201).json({ task: t });
}));
router.patch('/crm/tasks/:id', (req, res) => {
  const t = crmToggleTask(req.params.id, !!req.body?.done);
  if (!t) return res.status(404).json({ error: 'پیگیری پیدا نشد' });
  note(req, 'crm_task_toggle', `#${req.params.id}`);
  res.json({ task: t });
});
router.delete('/crm/tasks/:id', (req, res) => {
  if (!crmDeleteTask(req.params.id)) return res.status(404).json({ error: 'پیگیری پیدا نشد' });
  note(req, 'crm_task_delete', `#${req.params.id}`);
  res.json({ ok: true });
});

// برچسب‌ها
router.get('/crm/tags', (req, res) => res.json({ tags: crmListTags() }));
router.post('/crm/tags', crmWrap((req, res) => {
  const t = crmCreateTag(req.body?.name, req.body?.color);
  note(req, 'crm_tag_add', t.name);
  res.status(201).json({ tag: t });
}));
router.delete('/crm/tags/:id', (req, res) => {
  if (!crmDeleteTag(req.params.id)) return res.status(404).json({ error: 'برچسب پیدا نشد' });
  note(req, 'crm_tag_delete', `#${req.params.id}`);
  res.json({ ok: true });
});

// برچسب‌های یک مشتری
router.put('/crm/customers/:id/tags', (req, res) => {
  if (!crmSetUserTags(req.params.id, req.body?.tagIds)) return res.status(404).json({ error: 'مشتری پیدا نشد' });
  note(req, 'crm_tags_set', `#${req.params.id}`);
  res.json({ ok: true });
});

// ---------- درخواست‌های خرید عمده (B2B) ----------
router.get('/wholesale/requests', (req, res) => {
  res.json({ requests: listWholesaleRequests(300) });
});

router.patch('/wholesale/requests/:id', (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  if (!['new', 'contacted', 'done'].includes(status)) {
    return res.status(400).json({ error: 'وضعیت معتبر نیست' });
  }
  if (!setWholesaleRequestStatus(id, status)) return res.status(404).json({ error: 'درخواست پیدا نشد' });
  note(req, 'wholesale_status', `#${id}`, status);
  res.json({ ok: true });
});

// حذف درخواست (اسپم/تکراری) — برگشت‌ناپذیر است
router.delete('/wholesale/requests/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!deleteWholesaleRequest(id)) return res.status(404).json({ error: 'درخواست پیدا نشد' });
  note(req, 'wholesale_delete', `#${id}`);
  res.json({ ok: true });
});

// ---------- سفارش‌ها ----------
router.get('/orders', (req, res) => {
  // حالت قدیمی (بدون پارامتر) برای سازگاری: همان لیست کامل
  if (!Object.keys(req.query).length) {
    return res.json({ orders: getAllOrders(), counts: getOrderStatusCounts() });
  }
  const result = queryOrders({
    status: String(req.query.status || 'all'),
    q: String(req.query.q || '').slice(0, 60),
    from: req.query.from ? String(req.query.from).slice(0, 10) : null,
    to: req.query.to ? String(req.query.to).slice(0, 10) : null,
    limit: Number(req.query.limit) || 40,
    offset: Number(req.query.offset) || 0
  });
  res.json({ ...result, counts: getOrderStatusCounts() });
});

router.get('/orders/:id', (req, res) => {
  const order = getOrderForAdmin(req.params.id);
  if (!order) return res.status(404).json({ error: 'سفارش پیدا نشد' });
  res.json({ order });
});

const VALID_STATUS = ['paid', 'shipped', 'delivered', 'canceled', 'return_requested', 'returned'];
router.post('/orders/:id/status', (req, res) => {
  const orderId = Number(req.params.id);
  const { from, to } = req.body || {};
  if (!VALID_STATUS.includes(from) || !VALID_STATUS.includes(to)) {
    return res.status(400).json({ error: 'وضعیت نامعتبر است' });
  }
  // تأیید مرجوعی مسیر مخصوص خودش را دارد: موجودی هم باید برگردد (تراکنش اتمی)
  if (to === 'returned') {
    if (from !== 'return_requested') return res.status(400).json({ error: 'فقط سفارشِ در انتظار مرجوعی قابل تأیید است' });
    if (!adminAcceptReturnTx(orderId)) {
      return res.status(409).json({ error: 'تغییر وضعیت ممکن نیست (سفارش عوض شده؟ صفحه را رفرش کنید)' });
    }
    log.info(`Order ${orderId}: return accepted (by admin)`);
    note(req, 'order_status', `#${orderId}`, 'مرجوعی تأیید شد');
    const accepted = getOrderForAdmin(orderId);
    notifyCustomerOrderStatus(accepted, accepted.userPhone).catch(e => log.error('Customer SMS failed', e));
    return res.json({ ok: true, order: accepted });
  }
  const ok = adminSetOrderStatus(orderId, from, to);
  if (!ok) return res.status(409).json({ error: 'تغییر وضعیت ممکن نیست (سفارش عوض شده؟ صفحه را رفرش کنید)' });
  log.info(`Order ${orderId}: ${from} -> ${to} (by admin)`);
  note(req, 'order_status', `#${orderId}`, `${from} → ${to}`);
  const updated = getOrderForAdmin(orderId);
  // پیامک به مشتری فقط برای قدم‌های معنادار (نه برگشت‌های اصلاحی مثل delivered→shipped)
  if ((to === 'shipped' && from === 'paid') || (to === 'delivered' && from === 'shipped')) {
    notifyCustomerOrderStatus(updated, updated.userPhone).catch(e => log.error('Customer SMS failed', e));
  }
  res.json({ ok: true, order: updated });
});

// لغو/مرجوع کردن سفارش — کالاها به انبار برمی‌گردند
router.post('/orders/:id/cancel', (req, res) => {
  const orderId = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  const order = getOrderForAdmin(orderId);
  if (!order) return res.status(404).json({ error: 'سفارش پیدا نشد' });
  if (!['paid', 'shipped', 'delivered', 'return_requested'].includes(order.status)) {
    return res.status(409).json({ error: 'فقط سفارش پرداخت‌شده قابل لغو است' });
  }
  const ok = adminCancelOrderTx(orderId, reason);
  if (!ok) return res.status(409).json({ error: 'لغو ممکن نشد؛ صفحه را رفرش کنید' });
  log.info(`Order ${orderId} canceled by admin (${reason || 'no reason'})`);
  note(req, 'order_cancel', `#${orderId}`, reason || 'بدون توضیح');
  const canceled = getOrderForAdmin(orderId);
  notifyCustomerOrderStatus(canceled, canceled.userPhone).catch(e => log.error('Customer SMS failed', e));
  res.json({ ok: true, order: canceled });
});

// ---------- دسته‌بندی‌ها ----------
function cleanCatInput(body) {
  const name = String(body.name || '').trim().slice(0, 40);
  const icon = String(body.icon || 'i-package').trim();
  const errors = [];
  if (name.length < 2) errors.push('نام دسته حداقل ۲ حرف است');
  if (!/^i-[a-z-]{2,20}$/.test(icon)) errors.push('آیکون معتبر نیست');
  return { errors, name, icon };
}

router.get('/categories', (req, res) => {
  res.json({ categories: getCategoriesFull() });
});

router.post('/categories', (req, res) => {
  const { errors, name, icon } = cleanCatInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('؛ ') });
  try {
    const category = adminCreateCategory(name, icon);
    note(req, 'category_create', name);
    res.json({ ok: true, category });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'دسته‌ای با این نام از قبل هست' });
    throw e;
  }
});

router.put('/categories/:id', (req, res) => {
  const { errors, name, icon } = cleanCatInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('؛ ') });
  try {
    if (!adminUpdateCategoryTx(req.params.id, name, icon)) {
      return res.status(404).json({ error: 'دسته پیدا نشد' });
    }
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'دسته‌ای با این نام از قبل هست' });
    throw e;
  }
  note(req, 'category_update', name);
  res.json({ ok: true, categories: getCategoriesFull() });
});

router.post('/categories/:id/move', (req, res) => {
  const dir = req.body?.dir === 'up' ? 'up' : 'down';
  if (!adminMoveCategoryTx(req.params.id, dir)) return res.status(400).json({ error: 'جابه‌جایی ممکن نیست' });
  note(req, 'category_move', `#${req.params.id}`, dir === 'up' ? 'بالاتر' : 'پایین‌تر');
  res.json({ ok: true, categories: getCategoriesFull() });
});

router.delete('/categories/:id', (req, res) => {
  const r = adminDeleteCategory(req.params.id);
  if (!r.ok) {
    if (r.reason === 'inuse') {
      return res.status(409).json({ error: `این دسته ${r.count} محصول دارد؛ اول محصولاتش را به دسته‌ی دیگری منتقل کنید` });
    }
    return res.status(404).json({ error: 'دسته پیدا نشد' });
  }
  note(req, 'category_delete', `#${req.params.id}`);
  res.json({ ok: true });
});

// ---------- کدهای تخفیف ----------
function cleanCouponInput(body, forCreate = true) {
  const errors = [];
  const out = {};

  const code = String(body.code || '').trim();
  if (forCreate) {
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(code)) errors.push('کد فقط حرف انگلیسی، رقم و خط تیره (۳ تا ۳۰ کاراکتر)');
    out.code = code.toUpperCase();
  }

  out.type = body.type === 'fixed' ? 'fixed' : 'percent';
  const value = Number(body.value);
  if (out.type === 'percent') {
    if (!Number.isInteger(value) || value < 1 || value > 90) errors.push('درصد تخفیف باید بین ۱ تا ۹۰ باشد');
  } else if (!Number.isInteger(value) || value < 1000 || value > 2_000_000_000) {
    errors.push('مبلغ تخفیف ثابت باید حداقل ۱۰۰۰ تومان باشد');
  }
  out.value = value;

  const nonneg = (k, max, label) => {
    const v = body[k] === undefined || body[k] === '' ? 0 : Number(body[k]);
    if (!Number.isInteger(v) || v < 0 || v > max) errors.push(`مقدار «${label}» معتبر نیست`);
    return v;
  };
  out.min_total = nonneg('minTotal', 2_000_000_000, 'حداقل خرید');
  out.max_discount = nonneg('maxDiscount', 2_000_000_000, 'سقف تخفیف');
  out.usage_limit = nonneg('usageLimit', 1_000_000, 'سقف کل استفاده');
  out.per_user_limit = nonneg('perUserLimit', 1000, 'سقف هر مشتری');

  const exp = String(body.expiresAt || '').trim();
  if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) errors.push('تاریخ انقضا باید به شکل YYYY-MM-DD باشد');
  out.expires_at = exp || null;

  out.active = body.active === false || body.active === 0 || body.active === '0' ? 0 : 1;
  return { errors, coupon: out };
}

router.get('/coupons', (req, res) => {
  res.json({ coupons: adminListCoupons() });
});

router.post('/coupons', (req, res) => {
  const { errors, coupon } = cleanCouponInput(req.body || {}, true);
  if (errors.length) return res.status(400).json({ error: errors.join('؛ ') });
  try {
    const created = adminCreateCoupon(coupon);
    log.info(`Coupon ${created.code} created (admin)`);
    note(req, 'coupon_create', created.code,
      coupon.type === 'percent' ? `${coupon.value}%` : `${coupon.value} Toman`);
    res.json({ ok: true, coupon: created });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'این کد قبلاً ساخته شده' });
    throw e;
  }
});

router.put('/coupons/:id', (req, res) => {
  const existing = getCouponById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'کد تخفیف پیدا نشد' });
  // فیلدهای نیامده از مقدار فعلی پر می‌شوند تا بشود فقط active را عوض کرد
  const merged = {
    type: req.body?.type ?? existing.type,
    value: req.body?.value ?? existing.value,
    minTotal: req.body?.minTotal ?? existing.minTotal,
    maxDiscount: req.body?.maxDiscount ?? existing.maxDiscount,
    usageLimit: req.body?.usageLimit ?? existing.usageLimit,
    perUserLimit: req.body?.perUserLimit ?? existing.perUserLimit,
    expiresAt: req.body?.expiresAt === undefined ? (existing.expiresAt || '') : req.body.expiresAt,
    active: req.body?.active === undefined ? existing.active : req.body.active
  };
  const { errors, coupon } = cleanCouponInput(merged, false);
  if (errors.length) return res.status(400).json({ error: errors.join('؛ ') });
  const updated = adminUpdateCoupon({ ...coupon, id: Number(req.params.id) });
  note(req, 'coupon_update', existing.code, coupon.active ? 'فعال' : 'غیرفعال');
  res.json({ ok: true, coupon: updated });
});

router.delete('/coupons/:id', (req, res) => {
  const existing = getCouponById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'کد تخفیف پیدا نشد' });
  adminDeleteCoupon(req.params.id);
  log.info(`Coupon ${existing.code} deleted (admin)`);
  note(req, 'coupon_delete', existing.code);
  res.json({ ok: true });
});

// ---------- نظرات محصولات (صف تأیید) ----------
router.get('/reviews', (req, res) => {
  const status = ['all', 'pending', 'approved', 'rejected'].includes(String(req.query.status))
    ? String(req.query.status) : 'all';
  res.json(adminListReviews(status));
});

router.post('/reviews/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'وضعیت نامعتبر است' });
  }
  const review = adminSetReviewStatus(req.params.id, status);
  if (!review) return res.status(404).json({ error: 'نظر پیدا نشد' });
  log.info(`Review #${req.params.id} -> ${status} (by admin)`);
  note(req, 'review_status', `#${req.params.id}`, status === 'approved' ? 'تأیید شد' : (status === 'rejected' ? 'رد شد' : 'به صف برگشت'));
  res.json({ ok: true, review });
});

// ---------- سفارش دستی (تلفنی/حضوری) ----------
// مشتری زنگ می‌زند، ادمین همین‌جا ثبت می‌کند تا موجودی و آمار فروش درست بماند.
router.post('/orders/manual', (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!isValidIranPhone(phone)) return res.status(400).json({ error: 'شماره موبایل مشتری معتبر نیست (مثل ۰۹۱۲۳۴۵۶۷۸۹)' });

  const picked = [];
  for (const r of (Array.isArray(req.body?.items) ? req.body.items : [])) {
    const p = getProduct(Number(r?.productId));
    if (!p) continue;
    const qty = Math.max(1, Math.min(99, parseInt(r?.qty, 10) || 1));
    picked.push({ productId: p.id, title: p.title, price: p.price, qty });
  }
  if (!picked.length) return res.status(400).json({ error: 'حداقل یک کالا انتخاب کنید' });

  const itemsTotal = picked.reduce((s, i) => s + i.price * i.qty, 0);
  const shippingFee = Math.max(0, parseInt(req.body?.shippingFee, 10) || 0);
  const fullName = String(req.body?.fullName || '').trim().slice(0, 60);
  const noteText = String(req.body?.note || '').trim().slice(0, 500);

  const user = findOrCreateUser(phone);
  if (fullName && !user.full_name) updateUserName(user.id, fullName);

  const address = {
    fullName: fullName || user.full_name || 'مشتری حضوری',
    phone, province: '', city: '—',
    addressLine: 'سفارش حضوری/تلفنی — ثبت توسط فروشگاه', postalCode: ''
  };

  let orderId;
  try {
    orderId = createManualOrderTx(user.id, picked, address, itemsTotal + shippingFee, shippingFee, noteText);
  } catch (err) {
    if (err.code === 'STOCK_SHORTAGE') {
      const lines = err.shortages.map(s => `«${s.title}» (موجودی: ${s.available})`).join('، ');
      return res.status(409).json({ error: `موجودی کافی نیست: ${lines}` });
    }
    throw err;
  }

  log.info(`Manual order ${orderId} created by admin (${itemsTotal + shippingFee} Toman, customer ${phone})`);
  note(req, 'order_manual', `#${orderId}`, `${picked.length} قلم`);
  res.json({ ok: true, order: getOrderForAdmin(orderId) });
});

// یادداشت داخلی (فقط ادمین می‌بیند)
router.post('/orders/:id/note', (req, res) => {
  const orderId = Number(req.params.id);
  if (!getOrderForAdmin(orderId)) return res.status(404).json({ error: 'سفارش پیدا نشد' });
  setOrderNote(orderId, req.body?.note);
  note(req, 'order_note', `#${orderId}`);
  res.json({ ok: true, order: getOrderForAdmin(orderId) });
});

// کد رهگیری پستی
router.post('/orders/:id/tracking', (req, res) => {
  const orderId = Number(req.params.id);
  if (!getOrderForAdmin(orderId)) return res.status(404).json({ error: 'سفارش پیدا نشد' });
  const code = String(req.body?.trackingCode || '').trim().slice(0, 60);
  if (code && !/^[\w\d\-]{4,60}$/.test(code)) {
    return res.status(400).json({ error: 'کد رهگیری فقط حرف و رقم و خط تیره (حداقل ۴ کاراکتر)' });
  }
  setOrderTracking(orderId, code);
  note(req, 'order_tracking', `#${orderId}`, code);
  res.json({ ok: true, order: getOrderForAdmin(orderId) });
});

// ---------- خروجی CSV ----------
// این سه تابع مشترک‌اند تا هر سه خروجی یک رفتار داشته باشند. دلیلِ وجودشان:
//
// cell() — ضدتزریقِ فرمول. اگر مشتری اسمش را «=cmd|...» بگذارد و مدیر فایل را
//   در اکسل باز کند، اکسل آن سلول را فرمول می‌بیند. یک آپستروف جلویش، خنثی‌اش
//   می‌کند. این حمله واقعی است و اسمش CSV Injection است.
// csvBody() — سرصفحه + سطرها با CRLF (چیزی که اکسلِ ویندوز می‌فهمد).
// sendCsv() — BOM ابتدای فایل، وگرنه اکسلِ فارسی متن را «Ø§Ø³Ù…» نشان می‌دهد.
//   هدر no-store هم هست چون خروجی داده‌ی شخصی مشتری‌هاست و نباید در کش پروکسی
//   یا مرورگرِ یک کامپیوترِ مشترک بماند.
const cell = (v) => {
  let s = String(v ?? '').replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s}"`;
};
const csvBody = (head, rows) =>
  [head.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n');
function sendCsv(res, name, body) {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send('﻿' + body);
}
// تاریخ‌های دیتابیس UTC ذخیره می‌شوند؛ بدون افزودن Z مرورگر آن‌ها را محلی
// فرض می‌کند و ساعت سفارش سه‌ونیم ساعت جابه‌جا می‌شود.
const faDate = (v) => v ? new Date(String(v).replace(' ', 'T') + 'Z').toLocaleString('fa-IR') : '';

// ---------- خروجی CSV سفارش‌ها (باز شدن در اکسل) ----------
router.get('/export/orders.csv', (req, res) => {
  const { orders } = queryOrders({
    status: String(req.query.status || 'all'),
    q: String(req.query.q || '').slice(0, 60),
    from: req.query.from ? String(req.query.from).slice(0, 10) : null,
    to: req.query.to ? String(req.query.to).slice(0, 10) : null,
    limit: 5000, offset: 0
  });

  const STATUS_FA = {
    paid: 'در انتظار ارسال', shipped: 'ارسال شده', delivered: 'تحویل شده',
    pending_payment: 'در انتظار پرداخت', failed: 'ناموفق', canceled: 'لغو شده',
    return_requested: 'در انتظار بررسی مرجوعی', returned: 'مرجوع شده'
  };

  const head = ['شماره سفارش', 'تاریخ', 'وضعیت', 'نام مشتری', 'موبایل', 'استان', 'شهر',
    'آدرس', 'کدپستی', 'اقلام', 'مبلغ (تومان)', 'کد رهگیری', 'شماره تراکنش', 'یادداشت'];
  const rows = orders.map(o => {
    const a = o.address || {};
    return [
      o.id, faDate(o.createdAt), STATUS_FA[o.status] || o.status,
      o.userName, o.userPhone,
      a.province || '', a.city || '', a.addressLine || '', a.postalCode || '',
      o.items.map(i => `${i.title} ×${i.qty}`).join(' | '),
      o.total, o.trackingCode, o.refId || '', o.adminNote
    ];
  });

  note(req, 'export_csv', `${orders.length} سفارش`);
  sendCsv(res, 'orders', csvBody(head, rows));
});

// ---------- خروجی CSV مشتری‌ها ----------
// به چه درد می‌خورد: مدیر می‌خواهد به مشتری‌هایی که سه ماه است خرید نکرده‌اند
// پیامک بدهد، یا ببیند ده مشتریِ پرخریدش کیستند. تا امروز باید دانه‌دانه از
// صفحه‌ی «مشتریان» می‌خواند. با اکسل، مرتب‌سازی و فیلتر کارِ چند ثانیه است.
//
// دو ستون محاسبه‌شده اضافه کرده‌ام که در پنل نیست ولی همان چیزی است که مدیر
// می‌خواهد بداند: «میانگین هر خرید» و «چند روز از آخرین خریدش گذشته».
router.get('/export/customers.csv', (req, res) => {
  // فقط مشتری‌های واقعی. کارمند و مدیر در این فهرست کاری ندارند و بودنشان
  // آمار «میانگین خرید» را هم به‌هم می‌ریزد.
  const onlyBuyers = String(req.query.buyers || '') === '1';
  let users = getAllUsers().filter(u => !u.isAdmin && !u.isStaff);
  if (onlyBuyers) users = users.filter(u => (u.paidOrders || 0) > 0);

  const daysAgo = (v) => {
    if (!v) return '';
    const d = Math.floor((Date.now() - new Date(String(v).replace(' ', 'T') + 'Z')) / 86400000);
    return d >= 0 ? d : 0;
  };

  const head = ['شناسه', 'نام', 'موبایل', 'تاریخ عضویت', 'تعداد خرید موفق',
    'مجموع خرید (تومان)', 'میانگین هر خرید (تومان)', 'آخرین خرید', 'روز از آخرین خرید', 'رمز دارد'];
  const rows = users.map(u => {
    const n = Number(u.paidOrders) || 0;
    const spent = Number(u.totalSpent) || 0;
    return [
      u.id, u.fullName, u.phone, faDate(u.createdAt),
      n, spent, n > 0 ? Math.round(spent / n) : 0,
      faDate(u.lastOrderAt), daysAgo(u.lastOrderAt),
      u.hasPassword ? 'بله' : 'خیر'
    ];
  });

  note(req, 'export_csv', `${users.length} مشتری`);
  sendCsv(res, 'customers', csvBody(head, rows));
});

// ---------- خروجی CSV گزارشِ ماهانه ----------
// همان جدولِ پنل، برای وقتی که مدیر می‌خواهد کنارِ دفترِ حسابش بگذارد یا به
// حسابدار بدهد. ستونِ رشد عمداً وقتی ماهِ قبل صفر بوده خالی می‌ماند نه صفر:
// «رشد ۰٪» و «ماهِ قبل فروشی نبود» دو چیزِ متفاوت‌اند و در اکسل قابلِ تفکیک
// نمی‌شدند.
router.get('/export/monthly.csv', (req, res) => {
  const rep = getMonthlySales(Number(req.query.months) || 12);
  const head = ['ماه', 'از تاریخ (میلادی)', 'فروش (تومان)', 'تعداد سفارش',
    'مشتری یکتا', 'میانگین سبد (تومان)', 'رشد نسبت به ماه قبل (٪)'];
  const rows = rep.rows.map(m => [
    m.label, m.start, m.sales, m.orders, m.customers, m.avg,
    m.growth === null ? '' : m.growth
  ]);
  rows.push(['جمع کل', '', rep.totals.sales, rep.totals.orders, '', rep.totals.avg, '']);
  note(req, 'export_csv', `گزارش ${rep.months} ماهه`);
  sendCsv(res, 'monthly-sales', csvBody(head, rows));
});

// ---------- خروجی CSV انبار ----------
// ستون «کافی برای چند روز» مهم‌ترین ستون این فایل است: موجودی خام نمی‌گوید
// چه چیزی دارد تمام می‌شود. کالایی با ۵ عدد موجودی که ماهی یکی می‌فروشد
// مشکلی ندارد؛ کالایی با ۲۰ عدد که روزی سه‌تا می‌رود، هفته‌ی دیگر تمام است.
// سرعت فروش را از کل فروشِ ثبت‌شده تقسیم بر عمر محصول حساب می‌کنیم.
router.get('/export/inventory.csv', (req, res) => {
  const products = getProductsWithSales();
  const head = ['شناسه', 'نام کالا', 'دسته', 'قیمت (تومان)', 'قیمت قبلی', 'درصد تخفیف',
    'موجودی', 'وضعیت', 'تعداد فروش', 'درآمد (تومان)', 'علاقه‌مندی', 'منتظر موجودی',
    'کافی برای (روز)', 'آخرین بروزرسانی'];

  const rows = products.map(p => {
    const stock = Number(p.stock) || 0;
    const sold = Number(p.soldQty) || 0;
    const ageDays = Math.max(1,
      Math.floor((Date.now() - new Date(String(p.created_at || '').replace(' ', 'T') + 'Z')) / 86400000) || 1);
    const perDay = sold / ageDays;
    // وقتی هنوز چیزی نفروخته، عددِ «چند روز» معنا ندارد و نوشتنِ بی‌نهایت
    // فقط ستون را شلوغ می‌کند.
    const daysLeft = perDay > 0 ? Math.round(stock / perDay) : '';
    const state = stock <= 0 ? 'ناموجود' : (stock <= 3 ? 'رو به اتمام' : 'موجود');
    const old = Number(p.old_price) || 0;
    const price = Number(p.price) || 0;
    const off = old > price ? Math.round((1 - price / old) * 100) : '';
    return [
      p.id, p.title, p.category || '', price, old || '', off === '' ? '' : off + '٪',
      stock, state, sold, Number(p.revenue) || 0,
      Number(p.wishers) || 0, Number(p.waiting) || 0,
      daysLeft, faDate(p.updated_at)
    ];
  });

  note(req, 'export_csv', `${products.length} کالا`);
  sendCsv(res, 'inventory', csvBody(head, rows));
});

// ---------- محصولات / انبار ----------
router.get('/products', (req, res) => {
  // پنل *همه‌چیز* را می‌بیند، از جمله پیش‌نویس‌ها. خلاصه‌ی پیش‌نویس‌ها همراهش
  // می‌رود تا پنل بتواند نوار «۸۸ پیش‌نویس منتشرنشده داری» را نشان بدهد —
  // وگرنه محصولی که وارد شده ولی منتشر نشده، سال‌ها همان‌جا می‌ماند و کسی
  // نمی‌فهمد چرا در سایت نیست.
  res.json({ products: getProducts(), ...getDraftSummary() });
});

// ---------- انتشار / برداشتن یک محصول ----------
// مسیرِ جدا از PUT /products/:id — دلیلش در lib/db.js کنار setProductPublished
// نوشته شده: تا «ذخیره‌ی سریع» نتواند ناخواسته محصولی را از سایت بردارد.
router.post('/products/:id/published', (req, res) => {
  const id = Number(req.params.id);
  const existing = getProduct(id);
  if (!existing) return res.status(404).json({ error: 'محصول پیدا نشد' });

  const on = req.body?.published === true || req.body?.published === 1 || req.body?.published === '1';

  // نگهبانِ اشتباهِ رایج: محصولی که عکس ندارد، در فهرست با جانشینِ آیکونی نمایش
  // داده می‌شود — که برای یکی دو قلم قابل قبول است ولی مدیر باید آگاهانه انتخابش
  // کند، نه اینکه بعداً در سایت ببیند. با force=true رد می‌شود.
  if (on && !existing.image && req.body?.force !== true) {
    return res.status(409).json({
      error: 'این محصول عکس ندارد؛ اگر مطمئنی، دوباره با تأیید بفرست',
      needsConfirm: true, reason: 'no_image'
    });
  }

  // قیمتِ صفر با «عکس ندارد» فرق دارد و عمداً force ندارد: کالای بی‌عکس بد
  // فروش می‌رود ولی کالای صفر تومان *فروخته می‌شود* — مشتری آن را در سبد
  // می‌گذارد، سفارش ثبت می‌شود و مغازه جنس را مجانی داده. این اشتباهی نیست
  // که با یک confirm بشود پذیرفتش، پس راهِ عبور ندارد. کالاهایی که با
  // واردکردنِ عکس ساخته می‌شوند قیمتشان صفر است تا مالک خودش پرش کند؛ این
  // نگهبان همان چیزی است که آن حالت را بی‌خطر می‌کند.
  if (on && !(Number(existing.price) > 0)) {
    return res.status(400).json({
      error: 'قیمتِ این محصول هنوز صفر است. اول قیمت را وارد کن، بعد منتشر کن.'
    });
  }

  setProductPublished(id, on);
  note(req, on ? 'product_publish' : 'product_unpublish', `#${id}`, existing.title);
  res.json({ ok: true, published: on ? 1 : 0, product: getProduct(id) });
});

// نمای انبار: محصولات + تعداد فروش + درآمد + تعداد علاقه‌مندی
router.get('/inventory', (req, res) => {
  res.json({
    products: getProductsWithSales(),
    lowStock: getLowStock(Number(req.query.threshold) || 5),
    wishedOutOfStock: getWishedOutOfStock()
  });
});

// اعتبارسنجی مشترک فیلدهای محصول
function cleanProductInput(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  const title = String(body.title ?? '').trim();
  if (!partial || body.title !== undefined) {
    if (!title || title.length > 120) errors.push('عنوان لازم است (حداکثر ۱۲۰ حرف)');
    out.title = title;
  }
  const category = String(body.category ?? '').trim();
  if (!partial || body.category !== undefined) {
    if (!category || category.length > 60) errors.push('دسته‌بندی لازم است');
    out.category = category;
  }
  const description = String(body.description ?? '').trim().slice(0, 500);
  out.description = description;

  const price = Number(body.price);
  if (!partial || body.price !== undefined) {
    if (!Number.isFinite(price) || price < 0 || price > 2_000_000_000) errors.push('قیمت معتبر نیست');
    out.price = Math.round(price);
  }
  const stock = Number(body.stock);
  if (!partial || body.stock !== undefined) {
    if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) errors.push('موجودی معتبر نیست');
    out.stock = stock;
  }

  // «قیمت قبلی» = قیمت خط‌خورده. ۰ (یا خالی) یعنی تخفیفی نیست.
  // شرط old_price > price را همین‌جا سخت‌گیرانه چک می‌کنیم و خطای گویا می‌دهیم؛
  // اگر بی‌صدا صفرش کنیم، مدیر فکر می‌کند تخفیف ثبت شده ولی روی سایت خبری نیست.
  if (!partial || body.oldPrice !== undefined || body.old_price !== undefined) {
    const raw = body.oldPrice ?? body.old_price ?? 0;
    const oldPrice = raw === '' || raw == null ? 0 : Number(raw);
    if (!Number.isFinite(oldPrice) || oldPrice < 0 || oldPrice > 2_000_000_000) {
      errors.push('قیمت قبلی معتبر نیست');
    } else if (oldPrice > 0 && Number.isFinite(price) && Math.round(oldPrice) <= Math.round(price)) {
      errors.push('قیمت قبلی باید از قیمت فعلی بیشتر باشد (برای حذف تخفیف، آن را خالی یا صفر بگذارید)');
    }
    out.old_price = Number.isFinite(oldPrice) && oldPrice > 0 ? Math.round(oldPrice) : 0;
  }

  // قیمت‌گذاری عمده (B2B): حد نصاب تعداد + درصد تخفیف عمده. صفر/خالی = خاموش.
  const wholesaleMinQty = Number(body.wholesaleMinQty ?? body.wholesale_min_qty ?? 0);
  const wholesaleDiscount = Number(body.wholesaleDiscount ?? body.wholesale_discount ?? 0);
  if (!Number.isFinite(wholesaleMinQty) || wholesaleMinQty < 0 || wholesaleMinQty > 1_000_000) {
    errors.push('حد نصاب تعداد عمده معتبر نیست');
  }
  if (!Number.isFinite(wholesaleDiscount) || wholesaleDiscount < 0 || wholesaleDiscount > 90) {
    errors.push('درصد تخفیف عمده باید بین ۰ تا ۹۰ باشد');
  }
  out.wholesale_min_qty = Number.isFinite(wholesaleMinQty) && wholesaleMinQty > 0 ? Math.round(wholesaleMinQty) : 0;
  out.wholesale_discount = Number.isFinite(wholesaleDiscount) && wholesaleDiscount > 0 ? Math.round(wholesaleDiscount) : 0;
  out.badge = String(body.badge ?? '').trim().slice(0, 30);

  // آیکون فقط از مجموعه‌ی اسپرایت خودمان (جلوی تزریق شناسه‌ی دلخواه را می‌گیرد).
  // همیشه ست می‌شود چون کوئری UPDATE این پارامتر را لازم دارد.
  const icon = String(body.icon ?? '').trim();
  if (icon && !/^i-[a-z-]{2,20}$/.test(icon)) errors.push('آیکون معتبر نیست');
  out.icon = icon || 'i-package';

  // عکس فقط از مسیر داخلی /picture مجاز است (نه URL خارجی، نه پیمایش مسیر)
  const validImagePath = (s) => !s.includes('..') && /^\/picture\/[\w\-. %()؀-ۿ\/]+$/.test(s);
  let image = body.image == null ? null : String(body.image).trim();
  if (image === '') image = null;
  if (image && !validImagePath(image)) {
    errors.push('مسیر عکس معتبر نیست');
  }
  out.image = image;

  // گالری: حداکثر ۸ عکس اضافه، همه از /picture (عکس کاور جدا نگه داشته می‌شود)
  if (body.images !== undefined) {
    const arr = Array.isArray(body.images) ? body.images : [];
    const clean = [...new Set(arr.map(s => String(s || '').trim()).filter(Boolean))].slice(0, 8);
    if (clean.some(s => !validImagePath(s))) errors.push('مسیر یکی از عکس‌های گالری معتبر نیست');
    out.images = clean;
  }

  // مشخصات: حداکثر ۱۲ ردیفِ «عنوان/مقدار» — مثلاً گنجایش: ۳ لیتر
  if (body.specs !== undefined) {
    const arr = Array.isArray(body.specs) ? body.specs : [];
    out.specs = arr
      .map(r => ({ k: String(r?.k || '').trim().slice(0, 40), v: String(r?.v || '').trim().slice(0, 120) }))
      .filter(r => r.k && r.v)
      .slice(0, 12);
  }

  return { errors, product: out };
}

router.post('/products', (req, res) => {
  const { errors, product } = cleanProductInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('؛ ') });
  ensureCategory(product.category);
  const created = adminCreateProduct(product);
  log.info(`New product #${created.id} "${created.title}" created (admin)`);
  note(req, 'product_create', `#${created.id}`, created.title);
  res.json({ ok: true, product: created });
});

router.put('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getProduct(id);
  if (!existing) return res.status(404).json({ error: 'محصول پیدا نشد' });

  const parseArr = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

  // «قیمت قبلی» دو مسیر دارد و رفتارشان عمداً یکی نیست:
  //  • مدیر خودش فیلد را فرستاده  → سخت‌گیرانه اعتبارسنجی می‌شود و اگر از قیمت
  //    فعلی کمتر باشد خطا می‌گیرد (چون آگاهانه عددی وارد کرده).
  //  • فرستاده نشده (مثلاً ذخیره‌ی سریعِ جدول که فقط قیمت و موجودی را می‌فرستد)
  //    → مقدار قدیم به ارث می‌رسد، ولی اگر با قیمت جدید بی‌معنا شده باشد بی‌صدا
  //    صفر می‌شود. خطا دادن روی فیلدی که در آن فرم دیده نمی‌شود گیج‌کننده است.
  const oldPriceSent = req.body?.oldPrice !== undefined || req.body?.old_price !== undefined;
  const nextPrice = Number(req.body?.price ?? existing.price);
  let inheritedOldPrice = Number(existing.old_price) || 0;
  if (!oldPriceSent && inheritedOldPrice > 0 && Number.isFinite(nextPrice) && inheritedOldPrice <= nextPrice) {
    inheritedOldPrice = 0;
  }

  const merged = {
    title: req.body?.title ?? existing.title,
    category: req.body?.category ?? existing.category,
    description: req.body?.description ?? existing.description,
    price: req.body?.price ?? existing.price,
    oldPrice: oldPriceSent ? (req.body.oldPrice ?? req.body.old_price) : inheritedOldPrice,
    stock: req.body?.stock ?? existing.stock,
    badge: req.body?.badge ?? existing.badge,
    icon: req.body?.icon ?? existing.icon,
    image: req.body?.image === undefined ? existing.image : req.body.image,
    images: req.body?.images === undefined ? parseArr(existing.images) : req.body.images,
    specs: req.body?.specs === undefined ? parseArr(existing.specs) : req.body.specs,
    wholesale_min_qty: req.body?.wholesaleMinQty ?? req.body?.wholesale_min_qty ?? existing.wholesale_min_qty ?? 0,
    wholesale_discount: req.body?.wholesaleDiscount ?? req.body?.wholesale_discount ?? existing.wholesale_discount ?? 0
  };
  const { errors, product } = cleanProductInput(merged);
  if (errors.length) return res.status(400).json({ error: errors.join('؛ ') });

  ensureCategory(product.category);
  adminUpdateProduct({ ...product, id });
  if (existing.stock <= 0 && product.stock > 0) fireRestockAlerts(id); // ناموجود → موجود

  // فقط تغییرهای معنادار را در دفتر رویداد بنویس
  const diff = [];
  if (product.price !== existing.price) diff.push(`قیمت ${existing.price}→${product.price}`);
  if (product.old_price !== (existing.old_price || 0)) {
    diff.push(product.old_price ? `تخفیف از ${product.old_price}` : 'حذف تخفیف');
  }
  if (product.stock !== existing.stock) diff.push(`موجودی ${existing.stock}→${product.stock}`);
  if (product.title !== existing.title) diff.push('عنوان');
  note(req, 'product_update', `#${id}`, diff.join('، ') || product.title);

  res.json({ ok: true, product: getProduct(id) });
});

router.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getProduct(id);
  if (!existing) return res.status(404).json({ error: 'محصول پیدا نشد' });
  const result = adminDeleteProductTx(id);
  log.info(`Product #${id} ${result.deleted ? 'deleted' : 'set to out-of-stock (has order history)'} (admin)`);
  note(req, result.deleted ? 'product_delete' : 'product_zeroed', `#${id}`, existing.title);
  res.json({ ok: true, ...result });
});

// ---------- ویرایش گروهی محصولات ----------
const BULK_OPS = ['set_stock', 'add_stock', 'price_pct', 'set_category', 'set_badge', 'clear_badge', 'discount', 'discount_end', 'publish', 'unpublish'];
const BULK_LABEL = {
  set_stock: 'موجودی ثابت', add_stock: 'افزودن به موجودی', price_pct: 'تغییر درصدی قیمت',
  set_category: 'تغییر دسته', set_badge: 'گذاشتن نشان', clear_badge: 'برداشتن نشان',
  discount: 'اجرای تخفیف', discount_end: 'پایان تخفیف',
  publish: 'انتشار در سایت', unpublish: 'برداشتن از سایت'
};
router.post('/products/bulk', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
  const op = String(req.body?.op || '');
  const value = req.body?.value;

  if (!ids.length) return res.status(400).json({ error: 'هیچ محصولی انتخاب نشده' });
  if (!BULK_OPS.includes(op)) return res.status(400).json({ error: 'عملیات نامعتبر است' });
  if (op === 'price_pct') {
    const pct = Number(value);
    if (!Number.isFinite(pct) || pct < -90 || pct > 900) {
      return res.status(400).json({ error: 'درصد باید بین ۹۰- و ۹۰۰ باشد' });
    }
  }
  if (op === 'set_category' && !String(value || '').trim()) {
    return res.status(400).json({ error: 'نام دسته را وارد کنید' });
  }
  // درصد تخفیف: ۱ تا ۹۰. صفر بی‌معنی است و بالای ۹۰ عملاً «مجانی» می‌شود که
  // تقریباً همیشه یعنی مدیر اشتباه تایپ کرده — بهتر است جلویش گرفته شود.
  if (op === 'discount') {
    const pct = Number(value);
    if (!Number.isInteger(pct) || pct < 1 || pct > 90) {
      return res.status(400).json({ error: 'درصد تخفیف باید عددی درست بین ۱ تا ۹۰ باشد' });
    }
  }

  // انتشارِ گروهیِ محصولِ بی‌عکس: همان نگهبانِ مسیرِ تکی، اینجا هم لازم است.
  // بدون این، «انتخابِ همه ← انتشار» در یک کلیک ده‌ها صفحه‌ی خالی روی سایت
  // می‌آورد و گوگل همه را ایندکس می‌کند — پاک‌کردنشان از نتایج ماه‌ها طول
  // می‌کشد. سمتِ سرور است نه فقط فرانت، چون فرانت قابلِ دورزدن است.
  if (op === 'publish') {
    // قیمتِ صفر، مثل مسیرِ تکی، راهِ عبور ندارد: کالای صفر تومان فروخته
    // می‌شود و پولش برنمی‌گردد. اول از force چک می‌شود چون حتی با تأییدِ
    // مدیر هم مجاز نیست.
    const noPrice = ids.filter(id => { const p = getProduct(Number(id)); return p && !(Number(p.price) > 0); });
    if (noPrice.length) {
      return res.status(400).json({
        error: `${noPrice.length} تا از این کالاها قیمت ندارند. اول قیمتشان را وارد کن، بعد منتشر کن.`
      });
    }
    if (value !== 'force') {
      const noImage = ids.filter(id => { const p = getProduct(Number(id)); return p && !p.image; });
      if (noImage.length) {
        return res.status(409).json({
          error: `${noImage.length} تا از این کالاها عکس ندارند؛ اگر مطمئنی، دوباره با تأیید بفرست`,
          needsConfirm: true, reason: 'no_image', count: noImage.length
        });
      }
    }
  }

  // بدون try/catch: تنها خطای «انتظارشده»ی این تابع «عملیات ناشناخته» است که همین
  // بالا با BULK_OPS گرفته شده. پس هر خطای دیگری واقعاً خطای سرور است و باید ۵۰۰
  // با کد پیگیری بدهد، نه ۴۰۰ با متنِ خامِ انگلیسیِ SQLite. پیامِ قبلی («عملیات
  // گروهی انجام نشد») هم به مدیر نمی‌گفت چه شد و کدِ پیگیری‌ای برای دنبال‌کردن
  // نمی‌داد. تراکنش است، پس در خطا هیچ محصولی نیمه‌کاره تغییر نمی‌کند.
  const changed = adminBulkProductsTx({ ids, op, value });

  // شارژ گروهی موجودی → منتظرهای «موجود شد» هم خبردار شوند
  if (op === 'set_stock' || op === 'add_stock') ids.forEach(fireRestockAlerts);

  log.info(`Bulk product op "${op}" applied to ${changed} product(s) (admin)`);
  note(req, 'product_bulk', `${changed} کالا`, `${BULK_LABEL[op]}${value !== undefined && op !== 'clear_badge' ? `: ${value}` : ''}`);
  res.json({ ok: true, changed, products: getProductsWithSales() });
});

// ---------- تنظیمات فروشگاه ----------
router.get('/settings', (req, res) => {
  res.json({ settings: getSettings() });
});

router.post('/settings', (req, res) => {
  const body = req.body || {};
  const errors = [];
  const num = (k) => {
    if (body[k] === undefined) return;
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < 0 || v > 2_000_000_000) errors.push(`مقدار «${k}» معتبر نیست`);
  };
  num('shipping_cost'); num('free_shipping_over'); num('low_stock_threshold');
  if (body.shop_name !== undefined && !String(body.shop_name).trim()) errors.push('نام فروشگاه خالی است');
  if (errors.length) return res.status(400).json({ error: errors.join('؛ ') });

  // رشته‌ها با سقف طول منطقی ذخیره می‌شوند (کلیدهای مجاز را setSettingsTx خودش فیلتر می‌کند)
  const clamp = (k, max) => { if (body[k] !== undefined) body[k] = String(body[k]).trim().slice(0, max); };
  clamp('shop_name', 60); clamp('shop_phone', 20); clamp('shop_address', 200);
  clamp('announcement', 300); clamp('promo_text', 120); clamp('promo_code', 30);

  const settings = setSettingsTx(body);
  note(req, 'settings_update', Object.keys(body).join(','));
  res.json({ ok: true, settings });
});

// ---------- بکاپ دستی دیتابیس ----------
router.post('/backup', asyncHandler(async (req, res) => {
  const file = await backupNow(log);
  note(req, 'backup', path.basename(file));
  res.json({ ok: true, file: path.basename(file) });
}));

// سلامت دیتابیس: اندازه، آخرین بکاپ و بررسی ساختاری.
// چرا اینجا و نه در /healthz عمومی: quick_check کل فایل را می‌خواند؛ اگر روی
// مسیر بازِ مانیتورینگ باشد، هر پینگ می‌تواند سرور را زمین بزند. بررسی ساختاری
// فقط با درخواست صریح (?deep=1) اجرا می‌شود.
router.get('/db-health', (req, res) => {
  const health = getDbHealth();
  const deep = req.query.deep === '1' ? checkIntegrity() : null;
  res.json({ health, integrity: deep });
});

// ---------- آپلود عکس محصول ----------
// بدنه‌ی خام با سقف ۲ مگابایت؛ فقط فرمت‌های تصویری شناخته‌شده
const IMG_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};
const MAX_IMG_BYTES = 2 * 1024 * 1024;
// سقفِ ابعاد، جدا از سقفِ حجم. یک JPEG بسیارفشرده‌ی ۶۰۰۰×۶۰۰۰ می‌تواند زیر
// دو مگابایت باشد ولی موقعِ نمایش روی موبایل حدودِ ۱۴۴ مگابایت حافظه‌ی
// رمزگشایی می‌خواهد و مرورگرِ گوشیِ ضعیف را می‌خواباند. کارت محصول هم بیش از
// چند صد پیکسل نشان نمی‌دهد، پس چیزی از دست نمی‌رود.
const MAX_IMG_EDGE = 4000;
const MIN_IMG_EDGE = 80;

// سقف جدا برای آپلود. سقف عمومی پنل ۳۰۰ درخواست در دقیقه است؛ با فایل ۲ مگابایتی
// یعنی ۶۰۰ مگابایت در دقیقه روی دیسک. اگر سشن مدیر یک بار دزدیده شود، پرکردن
// دیسک ساده‌ترین کاری است که می‌شود کرد و سایت با دیسکِ پر بالا نمی‌آید.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 40,
  message: 'آپلود پشت‌سرهم زیاد شد؛ یک دقیقه صبر کنید'
});

router.post('/upload-image',
  uploadLimiter,
  express.raw({ type: Object.keys(IMG_TYPES), limit: MAX_IMG_BYTES }),
  (req, res) => {
    if (!IMG_TYPES[req.headers['content-type']]) {
      return res.status(415).json({ error: 'فقط عکس JPG/PNG/WebP قابل قبول است' });
    }
    if (!req.body?.length) return res.status(400).json({ error: 'فایلی دریافت نشد' });

    // پسوند از «امضای واقعی فایل» گرفته می‌شود، نه از Content-Type ادعایی.
    // اگر به حرف مرورگر اعتماد کنیم، فایلی که خودش را image/png معرفی کرده ولی
    // محتوایش چیز دیگری است با پسوند .png ذخیره می‌شود و بعداً مرورگرِ بازدیدکننده
    // با محتوای ناسازگار روبه‌رو می‌شود.
    const head = req.body.subarray(0, 12);
    const ext =
      (head[0] === 0xFF && head[1] === 0xD8) ? '.jpg' :
      (head[0] === 0x89 && head.toString('ascii', 1, 4) === 'PNG') ? '.png' :
      (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') ? '.webp' : '';
    if (!ext) return res.status(415).json({ error: 'محتوای فایل، عکس معتبر نیست' });

    // ابعاد را از خودِ بایت‌ها می‌خوانیم، نه از حرفِ فرستنده. فایلی که ابعادش
    // خوانده نمی‌شود یعنی سرش خراب است؛ همان بهتر که وارد نشود.
    const dim = imageSizeFromBuffer(req.body);
    if (!dim) return res.status(415).json({ error: 'ابعاد این عکس خوانده نشد؛ فایل سالم نیست' });
    const edge = Math.max(dim.width, dim.height);
    if (edge > MAX_IMG_EDGE) {
      return res.status(413).json({
        error: `عکس ${dim.width}×${dim.height} است و برای وب خیلی بزرگ؛ بزرگ‌ترین ضلع باید حداکثر ${MAX_IMG_EDGE} پیکسل باشد. یک بار کوچکش کنید و دوباره بفرستید.`
      });
    }
    if (Math.min(dim.width, dim.height) < MIN_IMG_EDGE) {
      return res.status(400).json({
        error: `عکس ${dim.width}×${dim.height} است و روی کارت محصول تار دیده می‌شود؛ حداقل ${MIN_IMG_EDGE} پیکسل لازم است.`
      });
    }

    // فرادادهٔ پنهان را قبل از رسیدن به دیسک پاک کن.
    //
    // چرا لازم است: عکسی که با گوشی از کالا گرفته می‌شود، مختصات GPS محلِ
    // عکس‌برداری را داخل خودش دارد. یعنی از دلِ عکسِ یک سطلِ پلاستیکی
    // می‌شود آدرسِ مغازه را درآورد. این هیچ‌وقت عمداً منتشر نشده.
    //
    // چرا اینجا و نه موقعِ نمایش: فایلِ روی دیسک از چند راه سرو می‌شود
    // (استاتیک، نسخه‌ی WebP، پشتیبان). تنها جایی که همه از آن رد می‌شوند
    // همین‌جاست. پاک‌کردن در لحظه‌ی نمایش یعنی نسخه‌ی خامِ فایل همچنان
    // روی سرور مانده است.
    const cleaned = stripImageMetadata(req.body, ext);

    fs.mkdirSync(PRODUCTS_PICTURE_DIR, { recursive: true });
    const name = `p-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(PRODUCTS_PICTURE_DIR, name), cleaned.buf);

    // نسخه‌ی سبکِ WebP و سایزهای کوچک را بساز — ولی **در پس‌زمینه**.
    //
    // چرا پس‌زمینه: تبدیلِ عکس چند صد میلی‌ثانیه تا چند ثانیه طول می‌کشد و
    // موتورِ ما همگام است؛ اگر همین‌جا منتظر بمانیم، کلِ سایت برای همه‌ی
    // بازدیدکننده‌ها همان‌قدر قفل می‌شود. (همان درسِ فشرده‌سازی در نسخه‌ی ۱۱.)
    //
    // چرا اینجا و نه فقط در ابزار: قبلاً ساختِ نسخه‌ی سبک فقط با اجرای دستیِ
    // tools/optimize-images.js انجام می‌شد، یعنی به «یادش ماند یا نه» بند بود.
    // عکسی که نسخه‌ی سبک ندارد، کامل و سنگین سرو می‌شود.
    //
    // اگر انکودری روی سیستم نباشد، این تابع false می‌دهد و هیچ‌چیز نمی‌شکند:
    // عکسِ اصلی سرِ جایش است و lib/webp-negotiate.js خودش به آن برمی‌گردد.
    queueVariants(path.join(PRODUCTS_PICTURE_DIR, name), log);

    // نوشتن روی دیسک باید ردپا داشته باشد؛ اگر روزی فایل ناخواسته‌ای پیدا شد
    // باید بشود فهمید چه کسی و کِی آن را گذاشته.
    note(req, 'image_upload', name,
      `${Math.round(cleaned.buf.length / 1024)}KB — ${dim.width}×${dim.height}` +
      (cleaned.removed ? ` — ${cleaned.removed} بایت فراداده پاک شد` : ''));
    // ابعاد برگردانده می‌شود تا فرانت بتواند width/height بنویسد و صفحه بعدِ
    // لودِ عکس نپرد (همان چیزی که گوگل با نامِ CLS اندازه می‌گیرد).
    res.json({
      ok: true, path: `/picture/products/${name}`,
      width: dim.width, height: dim.height
    });
  });

module.exports = router;
