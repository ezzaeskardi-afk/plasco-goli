/* ============================================================
   نشانی‌های عصرِ Express → مسیرهای تمیزِ Next
   ---------- این فایل چرا هست ----------
   تا امروز Express خودِ صفحه‌ها را با پسوندِ `.html` سرو می‌کرد. با
   بازنشستگیِ فروشگاه، آن صفحه‌ها دیگر سرو نمی‌شوند ولی **نام‌هایشان نمی‌تواند
   بمیرد**: در بوکمارکِ مشتری، در نتیجه‌ی گوگل، و در لینک‌هایی که در واتساپ
   دست‌به‌دست شده‌اند. بدترینش برگشتِ درگاهِ پرداخت به `/order-success.html`
   است: مشتری پول داده و باید صفحه‌ی زنده ببیند، نه ۴۰۴.

   پس هر نامِ قدیمی یک مقصدِ تمیز دارد و اینجا همان جدول است.

   ---------- چرا این جدول «کپی» است و بی‌خطر نیست ----------
   منبعِ حقیقتِ این نگاشت در `next-frontend/src/lib/legacyUrls.ts` است (چون
   Next باید بدونِ Express هم این کار را بکند). این فایل برای زمانی است که
   کسی *خودِ Express را مستقیم* صدا بزند (توسعه‌ی محلی، کرالر، ابزارِ قدیمی).
   دو نگهبان نمی‌گذارند این دو از هم واگرا شوند:

     • `next-frontend/scripts/legacy-links-live.mjs` مقصدِ Express را با مقصدِ
       Next (همان تابعِ منبعِ حقیقت)       یکی‌یکی مقایسه می‌کند — شاملِ
       حالت‌های پارامتری (`?id=12`، `?next=`، کوئریِ فیلتر).
     • ریدایرکت‌های اینجا با ۳۰۱ (دائمی) می‌روند، چون این نام‌ها هرگز
       برنمی‌گردند؛ Next عمداً ۳۰۷ می‌دهد (رفت‌وبرگشتِ آسان‌تر در دوره‌ی گذار).
       واگراییِ *کدِ وضعیت* اعلام‌شده است؛ واگراییِ *مقصد* تخلف است.

   ---------- چرا مقصد نسبی است، نه مطلق روی SITE_URL ----------
   مسیرِ تمیز روی همان دامنه سرو می‌شود (nginx صفحه‌ها را به Next می‌دهد)، پس
   `Location: /cart` همان چیزی است که Next هم می‌فرستد و دو دنیا واقعاً هم‌گرا
   می‌شوند. مطلق‌بودن یک خطرِ واقعی هم دارد: اگر `SITE_URL` غلط تنظیم شده
   باشد — یا به خودِ همین مبدأ اشاره کند، مثلِ اجرای sandbox — کاربر به
   دامنه‌ای می‌رود که آن مسیر را ندارد؛ یعنی همان لینکِ شکسته‌ای که این جدول
   می‌خواهد از آن جلوگیری کند. (ریدایرکتِ `/admin` در `server.js` مطلق است،
   چون آن یکی *باید* به اپِ Next روی دامنهٔ دیگر برود و مسیرِ معادلی روی این
   مبدأ ندارد.) حلقه‌ی بی‌پایان هم ممکن نیست: مسیرِ مقصد همیشه با مسیرِ مبدأ
   فرق دارد.
   ============================================================ */
'use strict';

/** نامِ فایلِ Express → مسیرِ معادلش در Next. */
const PAGE_ALIASES = {
  'index.html': '/',
  'products.html': '/products',
  'cart.html': '/cart',
  'checkout.html': '/checkout',
  'login.html': '/login',
  'account.html': '/account',
  'order-success.html': '/order-success',
  'terms.html': '/terms',
  'wholesale.html': '/wholesale'
};

/**
 * مقصدِ یک نشانیِ قدیمی، یا `null` اگر قدیمی نباشد.
 *
 * سه قاعده، عیناً همان سه قاعده‌ی `legacyRedirect` در Next:
 *   • `/product.html?id=12` → `/product/12` (شناسه از کوئری به مسیر می‌رود؛
 *     بی‌شناسه یا نامعتبر → فهرستِ محصولات)
 *   • `/login.html?next=X` → `/login?redirect=X` (نامِ پارامترِ «برگرد به این
 *     صفحه» در دو فرانت‌اند فرق دارد؛ ترجمه‌نشدنش یعنی پرت‌شدنِ کاربر)
 *   • کوئریِ بقیه دست‌نخورده منتقل می‌شود (`cat`/`min`/`max`/`inStock` در
 *     `lib/productQuery.ts` هم خوانده می‌شوند)
 *
 * @param {string} pathname مسیرِ درخواست (بدونِ کوئری)
 * @param {string} search   کوئری با `?` یا رشته‌ی خالی
 * @returns {string|null}
 */
function legacyRedirect(pathname, search) {
  const q = String(search || '').replace(/^\?/, '');
  if (pathname === '/product.html') {
    const id = Number(new URLSearchParams(q).get('id'));
    return Number.isInteger(id) && id > 0 ? `/product/${id}` : '/products';
  }

  const dest = PAGE_ALIASES[pathname.replace(/^\//, '')];
  if (!dest) return null;

  const sp = new URLSearchParams(q);
  if (dest === '/login' && sp.has('next')) {
    const next = sp.get('next');
    sp.delete('next');
    if (next) sp.set('redirect', next);
  }
  const qs = sp.toString();
  return qs ? `${dest}?${qs}` : dest;
}

/** آیا این شکلِ نشانی، شکلِ عصرِ Express است؟ (`/x.html`، تک‌بخشی) */
function isLegacyPath(pathname) {
  return /^\/[^/]+\.html$/.test(pathname);
}

module.exports = { PAGE_ALIASES, legacyRedirect, isLegacyPath };
