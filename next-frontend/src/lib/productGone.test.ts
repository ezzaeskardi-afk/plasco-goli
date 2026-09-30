import { describe, expect, it } from "vitest";
import {
  createExistenceCache,
  existsFromApiStatus,
  isProductPath,
  productIdFromPath,
} from "./productGone";

// ============================================================
// «محصولِ حذف‌شده» — تصمیم‌های منطقی، جدا از middleware
// ============================================================
// چرا این فایل لازم شد: کدِ ۴۱۰ محصولِ ناموجود (که Express از اول داشت و Next
// با ۲۰۰ می‌داد) فقط در middleware قابلِ گذاشتن است، و middleware در Vitest
// ایمپورت نمی‌شود. پس هر تصمیمی که می‌شود از آن بیرون کشید — «این مسیر محصول
// است؟» و «آیا این کش معتبر است؟» — این‌جا سنجیده می‌شود تا در محیطِ لبه فقط
// چند خطِ تبدیلِ پاسخ بماند.

describe("isProductPath — مرزِ تشخیصِ صفحه‌ی محصول", () => {
  it("شناسه‌ی عددی و غیرِعددی را می‌گیرد", () => {
    for (const p of ["/product/108", "/product/0", "/product/999999"]) {
      expect(isProductPath(p)).toBe(true);
    }
    // `/product/abc` هم صفحه‌ی محصول است: Express با `Number('abc')` به NaN
    // می‌رسد و همان ۴۱۰ را می‌دهد، پس این‌جا هم باید رد شود — نه اینکه به
    // صفحه‌ی ۲۰۰ِ soft-404 بیفتد.
    expect(isProductPath("/product/abc")).toBe(true);
    expect(isProductPath("/product/۱۲۳")).toBe(true);
  });

  it("چیزهایی که صفحه‌ی محصول نیستند را نمی‌گیرد", () => {
    for (const p of [
      "/products", // فهرست
      "/products/108", // مسیر دیگری است
      "/product-gone", // صفحه‌ی خودِ۴۱۰ — وگرنه واکشیِ داخلی حلقه می‌شود
      "/product", // بدونِ شناسه
      "/product/", // اسلشِ انتهایی، شناسه ندارد
      "/product/108/photos", // عمقِ بیشتر: مچرِ ما تک‌بخشی است
      "/product.html", // نشانیِ عصرِ Express؛ نگاشتش جای دیگری است
      "/",
      "/admin/product/108",
    ]) {
      expect(isProductPath(p), p).toBe(false);
    }
  });

  it("شناسه را دست‌نخورده برمی‌گرداند (بدونِ رمزگشایی یا تبدیل)", () => {
    expect(productIdFromPath("/product/108")).toBe("108");
    expect(productIdFromPath("/product/abc")).toBe("abc");
    // فاصله‌ی کدشدهٔ URL نباید یک بار دیگر رمزگشایی شود؛ قرار است همان رشته‌ای
    // برود که در URL بود.
    expect(productIdFromPath("/product/%20")).toBe("%20");
    for (const p of ["/products", "/product-gone", "/product/108/photos"]) {
      expect(productIdFromPath(p)).toBeNull();
    }
  });
});

describe("existsFromApiStatus — کدام کد یعنی «این محصول نیست»", () => {
  it("۴۰۴ (نیست) و ۴۰۰ (شناسه‌ی نامعتبر) یعنی نیست", () => {
    // این ۴۰۰ نکته‌ی غیرِشهودی است: `/product/abc` سمتِ سرور به ۴۰۰ می‌رسد
    // («شناسهٔ محصول معتبر نیست»)، نه ۴۰۴. با گرفتنِ فقط ۴۰۴، همان مسیر به
    // ۲۰۰ِ soft-404 برمی‌گشت — دقیقاً همان واگرایی‌ای که بسته شد.
    expect(existsFromApiStatus(404)).toBe(false);
    expect(existsFromApiStatus(400)).toBe(false);
  });

  it("بقیه — از جمله ۵xx و خطای شبکه — «هست» حساب می‌شوند", () => {
    // ۰ کدِ `fetch` وقتی درخواست اصلاً نمی‌رسد؛ در آن حالت باید صفحه‌ی محصول
    // باز شود، نه اینکه کلِ فروشگاه ۴۱۰ بدهد.
    for (const s of [200, 304, 500, 502, 0]) {
      expect(existsFromApiStatus(s), String(s)).toBe(true);
    }
  });
});

describe("createExistenceCache — کشِ کوتاه‌عمر", () => {
  it("مقداری که نوشته شده را برمی‌گرداند و ناشناخته را undefined", () => {
    const c = createExistenceCache();
    expect(c.get("108")).toBeUndefined();
    c.set("108", true);
    c.set("999999", false);
    expect(c.get("108")).toBe(true);
    expect(c.get("999999")).toBe(false);
    expect(c.size()).toBe(2);
  });

  it("بعد از تمام‌شدنِ TTL منقضی می‌شود — در هر دو جهت", () => {
    const c = createExistenceCache(1000);
    // «کاربر» (id=108) و «حذف‌شده» (id=77) هر دو باید تازه بمانند: یکی نباید
    // یک محصولِ تازه‌ی افزوده‌شده را ۴۱۰ کند و دیگری نباید یک محصولِ حذف‌شده
    // را نیم‌دقیقه زنده نگه دارد.
    c.set("108", true, 0);
    c.set("77", false, 0);
    expect(c.get("108", 999)).toBe(true);
    expect(c.get("77", 999)).toBe(false);
    expect(c.get("108", 1000)).toBeUndefined();
    expect(c.get("77", 1000)).toBeUndefined();
  });

  it("بعد از رسیدن به سقف، کلِ کش پاک می‌شود (حافظه‌ی بی‌سقف نمی‌سازیم)", () => {
    // بدونِ سقف، یک اسکنرِ ساده با میلیون‌ها شناسه می‌تواند حافظه‌ی محیطِ لبه
    // را پر کند؛ کلیدِ این کش از URLِ کاربر می‌آید.
    const c = createExistenceCache(60_000, 3);
    c.set("a", true);
    c.set("b", true);
    c.set("c", true);
    c.set("d", false); // سقف پر است → پاک‌سازی، بعد نوشتن
    expect(c.size()).toBe(1);
    expect(c.get("d")).toBe(false);
    expect(c.get("a")).toBeUndefined();
  });

  it("clear همه‌چیز را پاک می‌کند", () => {
    const c = createExistenceCache();
    c.set("x", false);
    c.clear();
    expect(c.size()).toBe(0);
    expect(c.get("x")).toBeUndefined();
  });
});
