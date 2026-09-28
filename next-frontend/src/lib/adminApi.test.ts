// ============================================================
// لایه‌ی API پنل — سه چیزِ متفاوت که فقط اینجا سنجیده می‌شوند
// ============================================================
//   ۱. **تبدیلِ شکلِ خامِ سرور**: `old_price` → `oldPrice`، رشته‌ی JSON →
//      آرایه، `published: 0/1` → بولی. اگر این تبدیل خراب شود، فرمِ ویرایش
//      بی‌صدا مقدارِ اشتباه نشان می‌دهد (و ذخیره‌کردنش همان را برمی‌گرداند).
//   ۲. **آدرس‌های CSV**: باید همان فیلترهای روی صفحه را ببرند. `&` و `?`
//      فراموش‌شده یعنی مدیر فایلِ کلِ سفارش‌ها را می‌گیرد و فکر می‌کند فیلتر
//      کار کرده.
//   ۳. **نشستِ بسته‌شده‌ی پنل**: ۴۰۱ با `reason: 'idle'` باید به صفحه‌ی ورود
//      برگرداند (با آدرسِ برگشت)، ولی ۴۰۳ نباید — آن یکی یعنی «تو حق نداری» و
//      فرستادنش به ورود، مدیرِ کارمند را در حلقه‌ی بی‌پایان می‌اندازد.
//
// سرور اینجا **جعل** می‌شود: فقط `fetch` عوض می‌شود تا خودِ منطقِ این لایه
// سنجیده شود، نه Express.

import { beforeEach, describe, expect, it, vi } from "vitest";

// مرزِ ناوبری جعل می‌شود: `window.location.assign` در jsdom اجرا می‌شود ولی
// نمی‌شود آن را خواند/دید. توضیحش در خودِ `lib/navigation.ts` آمده.
const nav = vi.hoisted(() => ({ hardNavigate: vi.fn() }));
vi.mock("@/lib/navigation", () => ({
  hardNavigate: nav.hardNavigate,
  reloadPage: vi.fn(),
}));

/** پاسخِ جعلیِ `fetch` — بدونِ وابستگی به Responseِ محیط */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

describe("شکلِ خامِ سرور → شکلِ فرم", () => {
  it("رشته‌های JSON به آرایه تبدیل می‌شوند و نام‌ها یکدست می‌شوند", async () => {
    const { toAdminProduct } = await import("@/lib/adminApi");
    const p = toAdminProduct({
      id: 7,
      title: "سطل رنگ",
      category: "رنگ",
      description: "توضیح",
      price: 120000,
      stock: 4,
      badge: "جدید",
      icon: "i-package",
      image: "/picture/products/a.jpg",
      // ← همان چیزی که از دیتابیس می‌آید: رشته، نه آرایه
      images: '["/picture/products/a.jpg","/picture/products/b.jpg"]',
      specs: '[{"k":"گنجایش","v":"۳ لیتر"}]',
      old_price: 150000,
      published: 0,
      wholesale_min_qty: 12,
      wholesale_discount: 15,
      created_at: "2026-08-01 10:00:00",
      updated_at: "2026-08-20 11:30:00",
    });

    expect(p.oldPrice).toBe(150000);
    expect(p.wholesaleMinQty).toBe(12);
    expect(p.published).toBe(false);
    expect(p.images).toEqual([
      "/picture/products/a.jpg",
      "/picture/products/b.jpg",
    ]);
    expect(p.specs).toEqual([{ k: "گنجایش", v: "۳ لیتر" }]);
  });

  it("رشته‌ی خرابِ JSON فرم را نمی‌ترکاند", async () => {
    const { toAdminProduct } = await import("@/lib/adminApi");
    const p = toAdminProduct({
      id: 1,
      title: "x",
      category: "c",
      description: "",
      price: 0,
      stock: 0,
      badge: "",
      icon: "",
      image: null,
      images: "not-json",
      specs: "",
      old_price: 0,
      published: 1,
      wholesale_min_qty: 0,
      wholesale_discount: 0,
      created_at: "",
      updated_at: "",
    });
    expect(p.images).toEqual([]);
    expect(p.specs).toEqual([]);
    expect(p.image).toBeNull();
    expect(p.published).toBe(true);
  });

  it("نسخه‌ی کوچکِ عکس، پارامترِ w را درست می‌چسباند", async () => {
    const { thumbUrl } = await import("@/lib/adminApi");
    expect(thumbUrl("/picture/products/a.jpg")).toBe("/picture/products/a.jpg?w=320");
    expect(thumbUrl("/picture/products/a.jpg", 160)).toBe("/picture/products/a.jpg?w=160");
    // اگر مسیر خودش کوئری داشته باشد، نباید دو تا علامتِ سؤال بسازیم
    expect(thumbUrl("/picture/products/a.jpg?v=2")).toBe(
      "/picture/products/a.jpg?v=2&w=320",
    );
    expect(thumbUrl(null)).toBe("");
    expect(thumbUrl("")).toBe("");
  });
});

describe("آدرس‌های CSV", () => {
  it("سفارش‌ها همان فیلترهای صفحه را می‌برند", async () => {
    const { ordersCsvHref } = await import("@/lib/adminApi");
    expect(ordersCsvHref()).toBe("/api/admin/export/orders.csv?status=all");

    const href = ordersCsvHref({ status: "paid", q: "۰۹۱۲ ۱۲۳" });
    expect(href.startsWith("/api/admin/export/orders.csv?")).toBe(true);
    const sp = new URLSearchParams(href.split("?")[1]);
    expect(sp.get("status")).toBe("paid");
    expect(sp.get("q")).toBe("۰۹۱۲ ۱۲۳");
    expect(sp.get("from")).toBeNull();
  });

  it("بازه‌ی تاریخ فقط وقتی می‌رود که باشد", async () => {
    const { ordersCsvHref } = await import("@/lib/adminApi");
    const sp = new URLSearchParams(
      ordersCsvHref({ from: "2026-08-01", to: "2026-08-31" }).split("?")[1],
    );
    expect(sp.get("from")).toBe("2026-08-01");
    expect(sp.get("to")).toBe("2026-08-31");
  });

  it("مشتری‌ها فقط با فیلترِ خریدار پارامتر می‌گیرند", async () => {
    const { customersCsvHref } = await import("@/lib/adminApi");
    expect(customersCsvHref()).toBe("/api/admin/export/customers.csv");
    expect(customersCsvHref(false)).toBe("/api/admin/export/customers.csv");
    expect(customersCsvHref(true)).toBe("/api/admin/export/customers.csv?buyers=1");
  });

  it("انبار پارامتر ندارد", async () => {
    const { inventoryCsvHref } = await import("@/lib/adminApi");
    expect(inventoryCsvHref()).toBe("/api/admin/export/inventory.csv");
  });
});

describe("نشستِ بسته‌شده‌ی پنل", () => {
  beforeEach(() => {
    nav.hardNavigate.mockClear();
    // ماژول از نو بارگذاری می‌شود: پرچمِ «یک بار در هر بارگذاریِ صفحه» باید
    // صفر باشد، وگرنه آزمونِ دوم به‌خاطرِ آزمونِ اول سبز/قرمز می‌شود.
    vi.resetModules();
    window.history.replaceState({}, "", "/admin/stock?filter=drafts");
  });

  it("۴۰۱ با reason=idle به ورود برمی‌گردد، با آدرسِ همین صفحه", async () => {
    const { getAdminProducts, isIdleExpiry, IDLE_REASON } = await import("@/lib/adminApi");
    const { ApiError } = await import("@/lib/api");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, {
          error: "به‌خاطر نیم‌ساعت بی‌کاری، از پنل خارج شدید. دوباره وارد شوید.",
          reason: "idle",
        }),
      ),
    );

    await expect(getAdminProducts()).rejects.toBeInstanceOf(ApiError);
    expect(nav.hardNavigate).toHaveBeenCalledTimes(1);
    expect(nav.hardNavigate).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent("/admin/stock?filter=drafts")}&idle=1`,
    );

    // و خودِ تشخیص هم قابلِ‌استفاده است (کامپوننت‌ها می‌توانند پیامِ درست بدهند)
    expect(IDLE_REASON).toBe("idle");
    expect(isIdleExpiry(new ApiError(401, "x", "idle"))).toBe(true);
    expect(isIdleExpiry(new ApiError(401, "x"))).toBe(false);
    expect(isIdleExpiry(new ApiError(403, "x", "idle"))).toBe(false);
  });

  it("دو درخواستِ هم‌زمان فقط یک ناوبری می‌سازند", async () => {
    const { getAdminProducts } = await import("@/lib/adminApi");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { error: "بسته شد", reason: "idle" })),
    );

    // پنل موقع باز شدن ده‌ها درخواستِ موازی می‌فرستد؛ بدونِ پرچم، ده‌ها
    // `assign` روی یک آدرس اجرا می‌شد.
    await Promise.all([
      getAdminProducts().catch(() => null),
      getAdminProducts().catch(() => null),
    ]);
    expect(nav.hardNavigate).toHaveBeenCalledTimes(1);
  });

  it("۴۰۳ به ورود فرستاده نمی‌شود (یعنی «تو حق نداری»، نه «نشستت بسته شد»)", async () => {
    const { getAdminProducts } = await import("@/lib/adminApi");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(403, { error: "دسترسی به پنل مدیریت ندارید" }),
      ),
    );

    await expect(getAdminProducts()).rejects.toMatchObject({ status: 403 });
    expect(nav.hardNavigate).not.toHaveBeenCalled();
  });

  it("۴۰۱ِ بی‌نشست هم ناوبری نمی‌سازد (وگرنه کارمند در حلقه می‌افتد)", async () => {
    const { getAdminProducts } = await import("@/lib/adminApi");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { error: "اول وارد شوید" })),
    );

    await expect(getAdminProducts()).rejects.toMatchObject({ status: 401 });
    expect(nav.hardNavigate).not.toHaveBeenCalled();
  });

  it("پاسخِ فهرست، کالاها را نرمال‌شده برمی‌گرداند و بقیه‌ی بدنه را نگه می‌دارد", async () => {
    const { getAdminProducts } = await import("@/lib/adminApi");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          products: [
            {
              id: 3,
              title: "کالا",
              category: "دسته",
              description: "",
              price: 1000,
              stock: 2,
              badge: "",
              icon: "i-package",
              image: null,
              images: "[]",
              specs: "[]",
              old_price: 0,
              published: 1,
              wholesale_min_qty: 0,
              wholesale_discount: 0,
              created_at: "",
              updated_at: "",
            },
          ],
          drafts: { total: 8, byCategory: [{ category: "رنگ", n: 8 }] },
        }),
      ),
    );

    const res = await getAdminProducts();
    expect(res.products).toHaveLength(1);
    expect(res.products[0].published).toBe(true);
    // شاخه‌ی پیش‌نویس‌ها نباید در تبدیل گم شود
    expect(res.drafts?.total).toBe(8);
    expect(nav.hardNavigate).not.toHaveBeenCalled();
  });
});
