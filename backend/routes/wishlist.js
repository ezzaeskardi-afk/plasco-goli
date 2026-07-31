const express = require('express');
const { getProduct, getWishlist, getWishlistIds, addToWishlist, removeFromWishlist } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();

function serializeProduct(p) {
  return {
    id: p.id, category: p.category, icon: p.icon, image: p.image || null,
    title: p.title, description: p.description, price: p.price,
    badge: p.badge || '', stock: p.stock
  };
}

// لیست کامل علاقه‌مندی‌ها (برای صفحه‌ی حساب کاربری)
router.get('/', requireAuth, (req, res) => {
  res.json({ products: getWishlist(req.session.userId).map(serializeProduct) });
});

// فقط شناسه‌ها (سبک — برای رنگ کردن قلب‌ها روی کارت‌ها)
router.get('/ids', (req, res) => {
  if (!req.session.userId) return res.json({ ids: [] });
  res.json({ ids: getWishlistIds(req.session.userId) });
});

// افزودن/حذف با یک درخواست (toggle)
router.post('/toggle', requireAuth, (req, res) => {
  const { productId } = req.body || {};
  const product = getProduct(productId);
  if (!product) return res.status(404).json({ error: 'محصول پیدا نشد' });

  const added = addToWishlist(req.session.userId, product.id);
  if (!added) removeFromWishlist(req.session.userId, product.id);
  res.json({ ok: true, inWishlist: added, ids: getWishlistIds(req.session.userId) });
});

router.post('/remove', requireAuth, (req, res) => {
  const { productId } = req.body || {};
  removeFromWishlist(req.session.userId, Number(productId));
  res.json({ ok: true, ids: getWishlistIds(req.session.userId) });
});

module.exports = router;
