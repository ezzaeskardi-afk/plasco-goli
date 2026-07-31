const express = require('express');
const { getAddresses, createAddress, updateAddress, deleteAddress } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { normalizeDigits, normalizePhone } = require('../lib/phone');

const router = express.Router();

// جلوی ورودی‌های غیرعادی/خیلی بلند گرفته می‌شود
const clean = (s, max) => String(s ?? '').trim().slice(0, max);

// ورودی‌های آدرس را «درست می‌کنیم» نه اینکه رد کنیم:
//  • شماره تماس با ارقام فارسی/عربی یا با فاصله و خط تیره نوشته می‌شود
//    (۰۹۱۱-۳۵۶ ۷۴۰۹) — همه به یک شکل لاتین ذخیره می‌شوند، وگرنه بعداً
//    جستجو و تماس با مشتری سخت می‌شود.
//  • کد پستی هم همین‌طور؛ فقط رقم نگه می‌داریم.
// شماره‌ی ثابت هم سالم می‌ماند چون normalizePhone تنها الگوهای موبایل را
// بازنویسی می‌کند و بقیه را دست‌نخورده برمی‌گرداند.
function readBody(body) {
  const fields = {
    fullName: clean(body?.fullName, 80),
    phone: normalizePhone(body?.phone),
    province: clean(body?.province, 40),
    city: clean(body?.city, 40),
    addressLine: clean(body?.addressLine, 300),
    postalCode: normalizeDigits(body?.postalCode).slice(0, 10)
  };
  if (!fields.fullName || !fields.phone || !fields.city || !fields.addressLine) {
    return { error: 'نام، شماره تماس، شهر و آدرس الزامی است' };
  }
  // کوتاه‌تر از ۸ رقم قطعاً شماره‌ی واقعی نیست (کوتاه‌ترین شماره‌ی ثابت ایران ۸ رقم است)
  if (fields.phone.length < 8) {
    return { error: 'شماره تماس کامل نیست؛ شماره موبایل یا تلفن ثابت با کد شهر وارد کنید' };
  }
  return { fields };
}

router.get('/', requireAuth, (req, res) => {
  res.json({ addresses: getAddresses(req.session.userId) });
});

router.post('/', requireAuth, (req, res) => {
  const { fields, error } = readBody(req.body);
  if (error) return res.status(400).json({ error });
  res.json({ address: createAddress(req.session.userId, fields) });
});

// ویرایش آدرس — فقط آدرس خودِ کاربر؛ سفارش‌های قبلی دست نمی‌خورند (آدرس در سفارش کپی شده)
router.put('/:id', requireAuth, (req, res) => {
  // اول مالکیت، بعد اعتبارسنجی بدنه: اگر آدرس مال این کاربر نیست، محتوای
  // درخواست بی‌اهمیت است و خطای «شماره ناقص» فقط گمراه‌کننده می‌شود.
  const own = getAddresses(req.session.userId).some(a => String(a.id) === String(req.params.id));
  if (!own) return res.status(404).json({ error: 'آدرس پیدا نشد' });

  const { fields, error } = readBody(req.body);
  if (error) return res.status(400).json({ error });
  const address = updateAddress(req.params.id, req.session.userId, fields);
  if (!address) return res.status(404).json({ error: 'آدرس پیدا نشد' });
  res.json({ address });
});

// حذف آدرس — فقط آدرس خودِ کاربر (سفارش‌های قبلی دست نمی‌خورند چون آدرس در سفارش کپی می‌شود)
router.delete('/:id', requireAuth, (req, res) => {
  const ok = deleteAddress(req.params.id, req.session.userId);
  if (!ok) return res.status(404).json({ error: 'آدرس پیدا نشد' });
  res.json({ ok: true });
});

module.exports = router;
