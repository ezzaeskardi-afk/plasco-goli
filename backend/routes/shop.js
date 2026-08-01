// روت‌های عمومی «فروشگاه» — چیزهایی که همه‌ی صفحه‌ها بدون ورود لازم دارند:
// اطلاعیه‌ی بالای سایت، وضعیت باز/بسته بودن، بنر تخفیف، دسته‌بندی‌ها و نظرات تازه.
const express = require('express');
const { getSettings, getPublicCategories, getRecentReviews } = require('../lib/db');
const { etagJson } = require('../lib/middleware');

const router = express.Router();

// GET /api/shop/categories — منوها و کارت‌های دسته‌بندی سایت از همین ساخته می‌شوند
router.get('/categories', (req, res) => {
  // getPublicCategories و نه getCategoriesFull: نسخه‌ی کامل، کالای منتشرنشده
  // را هم می‌شمارد و دسته‌ی خالی را هم برمی‌گرداند — هیچ‌کدام نباید از این
  // مسیرِ عمومی بیرون برود.
  const categories = getPublicCategories();
  const sig = 'c' + JSON.stringify(categories.map(c => [c.name, c.icon, c.sort, c.count]));
  if (etagJson(req, res, sig, { maxAge: 120 })) return;
  res.json({ categories });
});

// GET /api/shop/info — تنظیمات «امن برای نمایش عمومی» (نه همه‌ی تنظیمات پنل)
router.get('/info', (req, res) => {
  const s = getSettings();
  // آستانه‌ی «کم‌موجود» و «ارسال رایگان» هم در امضا هست، وگرنه مدیر عددش را عوض
  // می‌کند ولی مرورگر مشتری تا یک دقیقه پاسخ کش‌شده‌ی قبلی را نشان می‌دهد.
  const sig = ['i', s.announcement, s.shop_open, s.promo_text, s.promo_code, s.shop_phone,
    s.low_stock_threshold, s.free_shipping_over, s.shipping_cost].join('|');
  if (etagJson(req, res, sig, { maxAge: 60 })) return;
  res.json({
    shopName: s.shop_name,
    shopPhone: s.shop_phone,
    announcement: String(s.announcement || '').trim(),
    shopOpen: s.shop_open !== '0',
    promoText: String(s.promo_text || '').trim(),
    promoCode: String(s.promo_code || '').trim(),
    // این سه عدد فقط برای «نمایش» است؛ محاسبه‌ی واقعیِ کرایه و تخفیف همیشه
    // سمت سرور انجام می‌شود و به این مقادیر اعتماد نمی‌کند.
    lowStockThreshold: Math.max(0, Number(s.low_stock_threshold) || 0),
    freeShippingOver: Math.max(0, Number(s.free_shipping_over) || 0),
    shippingCost: Math.max(0, Number(s.shipping_cost) || 0)
  });
});

// GET /api/shop/recent-reviews — نظرات واقعی برای بخش «حرف مشتری‌ها»ی صفحه‌ی اصلی
router.get('/recent-reviews', (req, res) => {
  const reviews = getRecentReviews(6);
  if (etagJson(req, res, 'rr' + reviews.map(r => r.id).join('.'), { maxAge: 300 })) return;
  res.json({ reviews });
});

module.exports = router;
