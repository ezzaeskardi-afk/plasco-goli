// ============================================================
// نشانی‌های عصرِ Express → مسیرهای Next
// ============================================================
// چرا لازم است: نسخهٔ Express هر صفحه را با پسوندِ `.html` سرو می‌کرد
// (`/products.html`، `/cart.html`، `/product.html?id=12`). روی مبدأِ Next همه‌ی
// این‌ها ۴۰۴ می‌شدند — یعنی هر بوکمارک، هر نتیجه‌ی گوگل، و هر لینکی که در
// واتساپ دست‌به‌دست شده. بدترینشان برگشتِ درگاهِ پرداخت به
// `/order-success.html` است: مشتری پول داده و صفحه‌ی مرده می‌بیند.
//
// این ماژول عمداً هیچ وابستگی‌ای به `next/server` ندارد تا در Vitest قابلِ
// سنجش باشد؛ `middleware.ts` فقط نتیجه را ریدایرکت می‌کند.

/** نامِ فایلِ Express → مسیرِ معادلش در Next. */
export const LEGACY_PAGE_ALIASES: Record<string, string> = {
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

// عمداً بیرونِ نگاشت — با دلیل، و به‌صورتِ *داده* و نه کامنت. چرا داده:
// `internalLinks.test.ts` این فهرست را می‌خواند و کنارِ `LEGACY_PAGE_ALIASES`
// می‌گذارد، پس اگر روزی نامی به فهرستِ «دنیای Express» اضافه شود، کسی مجبور
// می‌شود تصمیم بگیرد — یا ریدایرکت، یا دلیلِ نبودنش. یک کامنت این را
// تضمین نمی‌کند.
//
// `offline.html` امروز صفحه‌ی Express نیست، ولی اینجا هست چون نزدیک‌ترین
// اشتباهِ ممکن است: یک `*.html` واقعی در `public/` که **نباید** ریدایرکت شود.
export const LEGACY_NO_ALIAS: Record<string, string> = {
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
 * تک‌بخشی و نه هر چیزی که به `.html` ختم می‌شود: مچرِ middleware فقط `/:page.html`
 * است و `/offline.html` هم همان‌جا در `public/` هست — این تابع نباید دامنه‌ی
 * تصمیمش را پهن‌تر از واقعیت بکند.
 */
export function isLegacyHtmlPath(pathname: string): boolean {
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
 */
export function legacyRedirect(pathname: string, search: string): string | null {
  if (pathname === "/product.html") {
    const id = Number(new URLSearchParams(search).get("id"));
    return Number.isInteger(id) && id > 0 ? `/product/${id}` : "/products";
  }

  const dest = LEGACY_PAGE_ALIASES[pathname.replace(/^\//, "")];
  if (!dest) return null;

  const sp = new URLSearchParams(search);
  if (dest === "/login" && sp.has("next")) {
    const next = sp.get("next");
    sp.delete("next");
    if (next) sp.set("redirect", next);
  }
  const qs = sp.toString();
  return qs ? `${dest}?${qs}` : dest;
}
