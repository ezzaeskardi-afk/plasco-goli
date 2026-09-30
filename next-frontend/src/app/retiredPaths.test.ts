import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEGACY_NO_ALIAS, LEGACY_PAGE_ALIASES } from "@/lib/legacyUrls";

// ============================================================
// دو واگراییِ بسته‌شده — تا دوباره باز نشوند
// ============================================================
// این فایل همان کاری را می‌کند که `seoParity.test.ts` و `internalLinks.test.ts`
// می‌کنند: سورس را می‌خواند، چون در CI هیچ سروری بالا نیست. دو تصمیمی که
// این‌جا قفل می‌شوند، هر دو یک ویژگیِ مشترک دارند: **خطا نمی‌دهند** اگر کسی
// ترتیب یا نگاشت را عوض کند، فقط رفتار بی‌صدا برمی‌گردد.
//
//   ۱. `/admin.html` → ۴۰۴ (نه ریدایرکت به صفحه‌ی ورود).
//      پنلِ Express بازنشسته شده و `frontend/admin.html` حذف است. ولی
//      `pathname.startsWith('/admin')` روی رشته‌ی `/admin.html` هم درست است،
//      پس اگر نگهبانِ `*.html` پایین‌تر از نگهبانِ ورود بیفتد، کاربر به
//      `/login?redirect=/admin.html` می‌رود و وجودِ یک صفحه‌ی پنل را باور
//      می‌کند — چیزی که هرگز نبوده.
//
//   ۲. محصولِ ناموجود → کدِ ۴۱۰ (نه ۲۰۰ِ soft-404).
//      Express از اول ۴۱۰ می‌داد؛ در Next نه `page.tsx` و نه `not-found.tsx`
//      نمی‌تواند کدِ دلخواه بگذارد، پس کد در middleware گذاشته می‌شود و هر
//      جابه‌جایی‌اش بی‌صدا به ۲۰۰ برمی‌گردد.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", ".."); // next-frontend/

function source(rel: string): string {
  return fs.readFileSync(path.join(NEXT_DIR, rel), "utf8");
}

describe("/admin.html — پنلِ بازنشسته باید ۴۰۴ بماند", () => {
  it("نگاشت نمی‌شود، ولی دلیلش به‌صورت داده ثبت شده", () => {
    // «نگاشت نشدن» تنها نیست: `LEGACY_NO_ALIAS` افرازِ کاملِ نام‌ها را نگه
    // می‌دارد، پس هر نام یا مقصد دارد یا دلیل — و این‌جا دلیلش باید بماند.
    expect(LEGACY_PAGE_ALIASES["admin.html"]).toBeUndefined();
    expect(LEGACY_NO_ALIAS["admin.html"]).toBeTruthy();
    expect(LEGACY_NO_ALIAS["admin.html"].length).toBeGreaterThan(10);
  });

  it("نگهبانِ `*.html` در middleware بالا‌تر از نگهبانِ ورود است", () => {
    // این ترتیبِ خطی، تمام ماجراست: اول `*.html`‌ها رد می‌شوند، بعد نگهبانِ
    // `startsWith('/admin')` اجرا می‌شود. عوض‌شدنش هیچ خطایی نمی‌دهد.
    const src = source("src/middleware.ts");
    const htmlGuard = src.indexOf("isLegacyHtmlPath(pathname)");
    const authGuard = src.indexOf("PROTECTED_ROUTES.some(");
    expect(htmlGuard, "نگهبانِ `*.html` در middleware نیست").toBeGreaterThan(-1);
    expect(authGuard, "نگهبانِ ورود در middleware نیست").toBeGreaterThan(-1);
    expect(htmlGuard, "نگهبانِ `*.html` باید پیش از نگهبانِ ورود باشد").toBeLessThan(
      authGuard,
    );
  });
});

describe("محصولِ ناموجود — کدِ ۴۱۰ در middleware", () => {
  it("middleware مسیرِ محصول را می‌گیرد و ۴۱۰ می‌دهد", () => {
    const src = source("src/middleware.ts");
    expect(src).toContain("productIdFromPath(pathname)");
    expect(src).toContain("status: 410");
    // تشخیص باید پیش از بازگشتِ زودهنگامِ «این مسیر محافظت‌شده نیست» انجام
    // شود، وگرنه هیچ‌وقت اجرا نمی‌شود.
    const check = src.indexOf("productIdFromPath(pathname)");
    const earlyPass = src.indexOf("if (!needsAuth && !guestOnly) return pass();");
    expect(check).toBeGreaterThan(-1);
    expect(earlyPass).toBeGreaterThan(-1);
    expect(check).toBeLessThan(earlyPass);
  });

  it("مچرِ middleware صفحه‌های محصول را پوشش می‌دهد ولی `/product-gone` را نه", () => {
    // اگر `/product-gone` هم زیرِ `/product/:path*` بیفتد، واکشیِ داخلیِ
    // middleware دوباره به خودش می‌رسد و زنجیره می‌شود.
    const src = source("src/middleware.ts");
    // کامنت‌ها خنثی می‌شوند: خودِ همین توضیح‌ها ناچاراً `/product-gone` را
    // می‌نویسند و وجودِ نام در کامنت، الگو را نمی‌سازد.
    const configSrc = src
      .slice(src.indexOf("export const config"))
      .replace(/\/\/[^\n]*/g, "");
    expect(configSrc).toContain('"/product/:path*"');
    expect(configSrc).not.toContain("/product-gone");
  });

  it("صفحه‌ی ۴۱۰ یک `noindex, follow` می‌دهد و از کامپوننتِ مشترک می‌آید", () => {
    // Express در product-gone.html فقط همین یک تگ را داشت، در حالی که مسیرِ
    // `/product/[id]` نسخه‌ی Next دو تگ می‌داد (یکی خودکارِ ۴۰۴، یکی از صفحه).
    const page = source("src/app/product-gone/page.tsx");
    expect(page).toContain("index: false");
    expect(page).toContain("follow: true");
    expect(page).toContain("ProductGone");
    // و مرزِ notFound هم همان کامپوننت را رندر کند؛ دو نسخه‌ی واگرا نداشته
    // باشیم (متنِ صفحه یکی است، فقط راهِ رسیدنش دو تا).
    expect(source("src/app/product/[id]/not-found.tsx")).toContain("ProductGone");
  });
});
