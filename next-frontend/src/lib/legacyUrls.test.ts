import { describe, it, expect } from "vitest";
import {
  isLegacyHtmlPath,
  legacyRedirect,
  LEGACY_NO_ALIAS,
  LEGACY_PAGE_ALIASES,
} from "./legacyUrls";

describe("legacyRedirect — نشانی‌های عصرِ Express", () => {
  it("هر صفحه‌ی `.html` را به معادلِ Next می‌برد", () => {
    for (const [file, dest] of Object.entries(LEGACY_PAGE_ALIASES)) {
      expect(legacyRedirect(`/${file}`, "")).toBe(dest);
    }
  });

  it("کوئری را دست‌نخورده منتقل می‌کند تا فیلترِ قدیمی گم نشود", () => {
    expect(legacyRedirect("/products.html", "?cat=%D8%B3%D8%B7%D9%84")).toBe(
      "/products?cat=%D8%B3%D8%B7%D9%84",
    );
    expect(legacyRedirect("/products.html", "?page=2&sort=price-asc")).toBe(
      "/products?page=2&sort=price-asc",
    );
  });

  it("`/product.html?id=N` را به مسیرِ `/product/N` می‌برد", () => {
    expect(legacyRedirect("/product.html", "?id=12")).toBe("/product/12");
  });

  it("بدونِ شناسه‌ی معتبر به فهرستِ محصولات می‌رود، نه ۴۰۴", () => {
    for (const q of ["", "?", "?id=", "?id=abc", "?id=-3", "?id=0", "?id=1.5"]) {
      expect(legacyRedirect("/product.html", q)).toBe("/products");
    }
  });

  it("`?next=` صفحه‌ی ورود را به `?redirect=` ترجمه می‌کند", () => {
    expect(legacyRedirect("/login.html", "?next=%2Faccount")).toBe(
      "/login?redirect=%2Faccount",
    );
  });

  it("`offline.html` و مسیرهای ساخته‌شده را دست نمی‌زند", () => {
    // این‌ها عمداً نگاشت نشده‌اند: `offline.html` فایلِ واقعیِ `public/` است و
    // بقیه یا مسیرِ خودِ Next‌اند یا (مثل `product-gone.html`) مقصدِ یکتا ندارند.
    for (const file of Object.keys(LEGACY_NO_ALIAS)) {
      expect(legacyRedirect(`/${file}`, "")).toBeNull();
    }
    expect(legacyRedirect("/product-gone.html", "")).toBeNull();
    expect(legacyRedirect("/404.html", "")).toBeNull();
    expect(legacyRedirect("/500.html", "")).toBeNull();
    expect(legacyRedirect("/cart", "")).toBeNull();
    expect(legacyRedirect("/", "")).toBeNull();
    expect(legacyRedirect("/product/12", "")).toBeNull();
  });

  it("هیچ نامی هم نگاشت و هم بیرونِ نگاشت نیست (تناقضِ داده)", () => {
    // دو فهرست باید یک افراز باشند: هر نام یا مقصد دارد یا دلیل. اگر روزی کسی
    // نامی را به هر دو اضافه کند، تصمیمش مبهم می‌شود و هیچ تستی نمی‌گیردش.
    for (const file of Object.keys(LEGACY_NO_ALIAS)) {
      expect(LEGACY_PAGE_ALIASES[file]).toBeUndefined();
      expect(LEGACY_NO_ALIAS[file].length).toBeGreaterThan(10);
    }
  });
});

describe("isLegacyHtmlPath — مرزِ سختِ middleware", () => {
  it("هر `*.html` تک‌بخشی را می‌گیرد", () => {
    for (const p of ["/admin.html", "/offline.html", "/nope.html", "/404.html"]) {
      expect(isLegacyHtmlPath(p)).toBe(true);
    }
  });

  it("مسیرهای عادیِ Next را نمی‌گیرد", () => {
    for (const p of ["/", "/admin", "/admin/orders", "/product/12", "/checkout", "/login"]) {
      expect(isLegacyHtmlPath(p)).toBe(false);
    }
  });

  it("`.html` در عمقِ بیشتر را نمی‌گیرد (مچر فقط تک‌بخشی است)", () => {
    // این تفاوت مهم است: `/a/b.html` هرگز به middleware نمی‌رسد، پس اگر این
    // تابع true بدهد، فهرستش با واقعیتِ مچر نمی‌خواند.
    expect(isLegacyHtmlPath("/a/b.html")).toBe(false);
  });

  it("شبهِ پسوند را نمی‌گیرد (`/html`، `/xhtml`)", () => {
    for (const p of ["/html", "/xhtml", "/a.html/"]) {
      expect(isLegacyHtmlPath(p)).toBe(false);
    }
  });
});
