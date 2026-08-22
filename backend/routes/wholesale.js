const express = require('express');
const { addWholesaleRequest, getPublicProduct } = require('../lib/db');
const { validate, V, rateLimit } = require('../lib/middleware');

const router = express.Router();

// درخواست خرید عمده (B2B) — عمومی است چون مشتری سازمانی/عمده‌خر معمولاً هنوز
// حساب کاربری ندارد. سقف سخت‌گیرانه‌ی ۵ درخواست در ساعت، صندوق پیام‌ها را از اسپم
// و از بات‌های فرم‌پرکن محفوظ نگه می‌دارد.
router.post('/request',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'درخواست زیاد است؛ یک ساعت دیگر دوباره تلاش کنید' }),
  validate({
    name: V.str({ min: 2, max: 80 }),
    phone: V.phone(),
    productId: V.int({ min: 1, max: 1e9, optional: true, fallback: null }),
    productTitle: V.str({ max: 120, optional: true, fallback: '' }),
    quantity: V.int({ min: 1, max: 1e6, optional: true, fallback: 1 }),
    note: V.str({ max: 500, optional: true, fallback: '' })
  }),
  (req, res) => {
    const { name, phone, productId, productTitle, quantity, note } = req.valid;

    let title = productTitle;
    if (productId) {
      const p = getPublicProduct(productId);
      if (!p) return res.status(404).json({ error: 'محصول پیدا نشد' });
      // اگر محصول مشخص باشد، عنوانِ واقعیِ دیتابیس بر متنِ تایپ‌شده اولویت دارد
      title = p.title || title;
    }

    const id = addWholesaleRequest({ name, phone, productId, productTitle: title, quantity, note });
    res.json({ ok: true, id, message: 'درخواست شما ثبت شد؛ به‌زودی با شما تماس می‌گیریم' });
  });

module.exports = router;
