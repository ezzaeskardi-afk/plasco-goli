/* ============================================================
   legacyUrls.js — نشانی‌های عصرِ Express → مسیرهای Next
   ---------- این فایل چرا «تنها منبعِ حقیقت» است ----------
   تا امروز این نگاشت در **دو** فایل زندگی می‌کرد: همین‌جا به‌صورتِ
   `legacyUrls.js` برای Next، و یک کپیِ دستی در
   `backend/lib/legacy-redirects.js` برای Express. واگرایی‌شان فقط با یک
   سنجشِ *زنده* گرفته می‌شد (`scripts/legacy-links-live.mjs`، دو سرورِ بالا)؛
   یعنی روی ماشینی که آن دو سرور روشن نیستند، دو فهرست می‌توانستند بی‌صدا از
   هم دور شوند. بدترین سناریو همین است: `/order-success.html` روی Next درست
   برود و روی Express به ۴۰۴ — مشتری پول داده و صفحه‌ی مرده می‌بیند.

   امروز جدول **و** منطق یک‌جا و در یک فایلِ مشترک‌اند:
     • Next  → `middleware.ts` این را import می‌کند.
     • Express→ `backend/lib/legacy-redirects.js` فقط همین فایل را
       `require` می‌کند (پوستهٔ نازک، بدونِ هیچ جدولِ دوم).
   پس واگرایی *ممکن نیست*، نه اینکه «گرفته می‌شود».

   ---------- چرا JavaScript و نه TypeScript ----------
   Express روی Node اجرا می‌شود و نمی‌تواند `.ts` را لود کند (stripping تایپ
   از Node 22.18 به بعد پیش‌فرض است، ولی `engines` این پروژه `>=22.5`
   می‌گوید). TypeScript هم `.js` را با `allowJs` می‌خواند و از همین
   JSDocها نوع می‌سازد — یک فایل، هر دو دنیا.

   ---------- چرا جدولِ زیر داده است، نه کامنت ----------
   `internalLinks.test.ts` فهرستِ «دنیای Express» را می‌خواند و کنارِ نگاشت
   می‌گذارد، پس اگر روزی نامی اضافه شود کسی مجبور می‌شود تصمیم بگیرد: یا
   ریدایرکت، یا دلیلِ مکتوبِ نبودنش. کامنت این را تضمین نمی‌کند.
   ============================================================ */
'use strict';

/** نامِ فایلِ Express → مسیرِ معادلش در Next. @type {Record<string, string>} */
const LEGACY_PAGE_ALIASES = {
  "index.html": "/",
  "products.html": "/products",
  "cart.html": "/cart",
  "checkout.html": "/checkout",
  "login.html": "/login",
  "account.html": "/account",
  "order-success.html": "/order-success",
  "terms.html": "/terms",
  "wholesale.html": "/wholesale",
};

// عمداً بیرونِ نگاشت — با دلیل. `offline.html` امروز صفحه‌ی Express نیست،
// ولی اینجا هست چون نزدیک‌ترین اشتباهِ ممکن است: یک `*.html` واقعی در
// `public/` که **نباید** ریدایرکت شود.
/** @type {Record<string, string>} */
const LEGACY_NO_ALIAS = {
  "offline.html":
    "فایلِ واقعی در public است و سرویس‌ورکر همین را می‌خواهد؛ ریدایرکتش یعنی کشِ صفحه‌ی اشتباه",
  "404.html": "Next این را با not-found.tsx می‌سازد، نه با فایلِ ثابت",
  "500.html": "Next این را با error.tsx می‌سازد، نه با فایلِ ثابت",
  "product-gone.html":
    "Express آن را با ۴۱۰ می‌داد؛ در Next صفحه‌ی محصول همین نقش را دارد و مقصدِ یکتایی برای این نام نیست",
  "admin.html":
    "پنلِ Express عمداً ۴۰۴ می‌شود (نگهبانِ panel-retired)؛ پس اینجا هم باید ۴۰۴ بماند — نه ریدایرکت به صفحه‌ی ورود، که وجودِ یک صفحه را تلقین می‌کند",
  "manifest.json":
    "نامِ واقعی manifest.webmanifest است و هیچ‌چیز به این نام لینک نمی‌دهد",
};

/**
 * آیا این یک `*.html` تک‌بخشی است (شکلِ نشانی‌های عصرِ Express)؟
 *
 * `middleware.ts` از این برای یک مرزِ سخت استفاده می‌کند: **هیچ** نشانیِ `*.html`
 * نباید وارد منطقِ ورود شود. دلیلش `/admin.html` است — `pathname.startsWith('/admin')`
 * درست است، پس پیش‌تر این نشانی به `/login?redirect=/admin.html` می‌رفت و وجودِ یک
 * صفحه‌ی پنل را تلقین می‌کرد، در حالی که نسخه‌ی Express همان‌جا ۴۰۴ می‌داد. اگر
 * نگاشتش نکرده‌ایم، جوابِ درست «این نشانی وجود ندارد» است، نه «اول وارد شو».
 *
 * تک‌بخشی و نه هر چیزی که به `.html` ختم می‌شود: مچرِ میان‌افزار فقط `/:page.html`
 * است و `/offline.html` هم همان‌جا در `public/` هست — این تابع نباید دامنه‌ی
 * تصمیمش را پهن‌تر از واقعیت بکند.
 *
 * @param {string} pathname مسیرِ درخواست (بدونِ کوئری)
 * @returns {boolean}
 */
function isLegacyHtmlPath(pathname) {
  return /^\/[^/]+\.html$/.test(pathname);
}

/**
 * مقصدِ ریدایرکت برای یک نشانیِ قدیمی، یا `null` اگر نشانیِ قدیمی نباشد.
 *
 * - `/product.html?id=12` → `/product/12` (شناسه از کوئری به مسیر می‌رود، چون
 *   Next از مسیرِ `/product/[id]` استفاده می‌کند). بدونِ شناسهٔ معتبر → فهرست.
 * - بقیه: کوئری دست‌نخورده منتقل می‌شود، چون کلیدهای عصرِ Express
 *   (`cat`/`min`/`max`/`inStock`) در `lib/productQuery.ts` هم خوانده می‌شوند —
 *   پس `/products.html?cat=سطل` روی Next هم همان فیلتر را می‌دهد.
 * - تنها استثنا: `/login.html?next=X` → `/login?redirect=X`. نامِ پارامترِ
 *   «برگرد به این صفحه» در دو فرانت‌اند فرق می‌کند و اگر ترجمه نشود، مشتری
 *   بعد از ورود به صفحه‌ی اصلی پرت می‌شود.
 *
 * ترتیبِ پارامترها تصادفی نیست: `next` اول از جای خودش حذف می‌شود و
 * `redirect` بعد اضافه می‌شود، تا در دو دنیا یک رشته‌ی یکسان بیرون بیاید
 * (Express هم از همین تابع استفاده می‌کند، پس امروز این «یکسان‌بودن»
 * قراردادِ یک پیاده‌سازی است، نه قراردادِ دو تا).
 *
 * @param {string} pathname مسیرِ درخواست (بدونِ کوئری)
 * @param {string} search   کوئری با `?` یا رشته‌ی خالی
 * @returns {string|null}
 */
function legacyRedirect(pathname, search) {
  const q = String(search || "").replace(/^\?/, "");
  if (pathname === "/product.html") {
    const id = Number(new URLSearchParams(q).get("id"));
    return Number.isInteger(id) && id > 0 ? `/product/${id}` : "/products";
  }

  const dest = LEGACY_PAGE_ALIASES[pathname.replace(/^\//, "")];
  if (!dest) return null;

  const sp = new URLSearchParams(q);
  if (dest === "/login" && sp.has("next")) {
    const next = sp.get("next");
    sp.delete("next");
    if (next) sp.set("redirect", next);
  }
  const qs = sp.toString();
  return qs ? `${dest}?${qs}` : dest;
}

module.exports = {
  LEGACY_PAGE_ALIASES,
  LEGACY_NO_ALIAS,
  isLegacyHtmlPath,
  legacyRedirect,
};
