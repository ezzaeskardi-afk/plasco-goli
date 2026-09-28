// ============================================================
// فرمِ کاملِ محصول — منطق، بدونِ رندر
// ============================================================
// چرا این آزمون لازم است: این فایل آینه‌ی `cleanProductInput` سمتِ سرور است
// (routes/admin.js:918). اگر روزی یکی از پیام‌ها فقط در یک طرف عوض شود، مدیر
// یا خطایی می‌بیند که سرور هرگز نمی‌داد، یا خطای سرور را بی‌توضیح می‌گیرد.
// پس هر پیامِ خطا **دو جا** سنجیده می‌شود: اینجا تولید می‌شود، و وجودِ عینِ
// همان رشته در سورسِ سرور هم بررسی می‌شود. یک تغییرِ یک‌طرفه یعنی آزمونِ قرمز.
//
// و یک نکته‌ی مهم درباره‌ی عددها: `Number("۱۲۳")` در جاوااسکریپت `NaN` است.
// مدیر با صفحه‌کلیدِ فارسی «۱۲۳» می‌زند و انتظار ندارد فرم بگوید «قیمت معتبر
// نیست». پس مسیرِ ارقامِ فارسی هم آزمون دارد.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EMPTY_PRODUCT_FORM,
  MAX_GALLERY,
  MAX_IMG_BYTES,
  cleanSpecs,
  formFromProduct,
  imageRejectReason,
  toNum,
  toProductPayload,
  validateProductForm,
  type ProductFormState,
} from "@/lib/productForm";
import type { AdminProduct } from "@/lib/adminTypes";

// مسیرها از روی خودِ فایل حساب می‌شوند، نه از روی cwd — آزمون باید از هر جایی
// که اجرا شود یک نتیجه بدهد (همان قاعده‌ی آزمونِ مجاور).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROUTES = path.resolve(HERE, "..", "..", "..", "backend", "routes", "admin.js");

const SERVER_SRC = fs.readFileSync(SERVER_ROUTES, "utf8");

function form(over: Partial<ProductFormState> = {}): ProductFormState {
  return {
    ...EMPTY_PRODUCT_FORM,
    title: "سطل رنگ",
    category: "رنگ",
    price: "120000",
    stock: "4",
    ...over,
  };
}

const PRODUCT: AdminProduct = {
  id: 7,
  title: "سطل رنگ",
  category: "رنگ",
  description: "توضیح",
  price: 120_000,
  oldPrice: 150_000,
  stock: 4,
  badge: "جدید",
  icon: "i-package",
  image: "/picture/products/p-1.jpg",
  images: ["/picture/products/p-1.jpg", "/picture/products/p-2.jpg"],
  specs: [{ k: "گنجایش", v: "۳ لیتر" }],
  wholesaleMinQty: 12,
  wholesaleDiscount: 15,
  published: false,
  createdAt: "2026-08-01 10:00:00",
  updatedAt: "2026-08-20 11:30:00",
};

describe("حالتِ فرم", () => {
  it("کالای موجود درست به فرم می‌آید", () => {
    const f = formFromProduct(PRODUCT);
    expect(f.title).toBe("سطل رنگ");
    expect(f.price).toBe("120000");
    expect(f.oldPrice).toBe("150000");
    expect(f.images).toHaveLength(2);
    expect(f.specs).toEqual([{ k: "گنجایش", v: "۳ لیتر" }]);
    expect(f.wholesaleDiscount).toBe("15");
  });

  it("صفر یعنی «وارد نشده» و خالی نمایش داده می‌شود", () => {
    const f = formFromProduct({ ...PRODUCT, oldPrice: 0, wholesaleMinQty: 0, price: 0 });
    expect(f.oldPrice).toBe("");
    expect(f.wholesaleMinQty).toBe("");
    expect(f.price).toBe("");
    // و برگشتِ آن هم صفر می‌شود، نه «خالیِ نامعتبر»
    expect(toProductPayload(f).oldPrice).toBe(0);
    expect(toProductPayload(f).price).toBe(0);
  });

  it("ارقامِ فارسی و جداکننده‌ی هزارگان خوانده می‌شوند", () => {
    expect(toNum("۱۲۳")).toBe(123);
    expect(toNum("۱٬۲۳۴٬۵۶۷")).toBe(1234567);
    expect(toNum("1,200")).toBe(1200);
    expect(toNum("")).toBe(0);
    expect(toNum("abc")).toBeNaN();
  });
});

describe("اعتبارسنجی — همان پیام‌های سرور", () => {
  // هر مورد: فرمی که باید خطا بدهد + پیامِ دقیق. `SERVER_SRC` تضمین می‌کند
  // این رشته‌ها همان چیزی هستند که خودِ سرور می‌گوید.
  const cases: { label: string; patch: Partial<ProductFormState>; message: string }[] = [
    { label: "عنوانِ خالی", patch: { title: "" }, message: "عنوان لازم است (حداکثر ۱۲۰ حرف)" },
    {
      label: "عنوانِ بلندتر از ۱۲۰",
      patch: { title: "ا".repeat(121) },
      message: "عنوان لازم است (حداکثر ۱۲۰ حرف)",
    },
    { label: "دسته‌ی خالی", patch: { category: "" }, message: "دسته‌بندی لازم است" },
    { label: "قیمتِ منفی", patch: { price: "-5" }, message: "قیمت معتبر نیست" },
    { label: "قیمتِ بزرگ‌تر از سقف", patch: { price: "2000000001" }, message: "قیمت معتبر نیست" },
    { label: "موجودیِ اعشاری", patch: { stock: "1.5" }, message: "موجودی معتبر نیست" },
    { label: "موجودیِ منفی", patch: { stock: "-1" }, message: "موجودی معتبر نیست" },
    {
      label: "قیمتِ قبلیِ مبلغِ نادرست",
      patch: { oldPrice: "-100" },
      message: "قیمت قبلی معتبر نیست",
    },
    {
      label: "قیمتِ قبلیِ کمتر از قیمت",
      patch: { price: "200", oldPrice: "100" },
      message:
        "قیمت قبلی باید از قیمت فعلی بیشتر باشد (برای حذف تخفیف، آن را خالی یا صفر بگذارید)",
    },
    {
      label: "حد نصابِ عمده‌ی منفی",
      patch: { wholesaleMinQty: "-3" },
      message: "حد نصاب تعداد عمده معتبر نیست",
    },
    {
      label: "تخفیفِ عمده‌ی بیش از ۹۰",
      patch: { wholesaleDiscount: "95" },
      message: "درصد تخفیف عمده باید بین ۰ تا ۹۰ باشد",
    },
    {
      label: "مسیرِ عکسِ بیرونی",
      patch: { image: "https://evil.example/x.jpg" },
      message: "مسیر عکس معتبر نیست",
    },
    {
      label: "مسیرِ گالریِ دارای پیمایش",
      patch: { images: ["/picture/../secret.jpg"] },
      message: "مسیر یکی از عکس‌های گالری معتبر نیست",
    },
  ];

  for (const c of cases) {
    it(`${c.label} → پیامِ سرور`, () => {
      expect(validateProductForm(form(c.patch))).toContain(c.message);
      // همان رشته، عیناً، در سورسِ سرور
      expect(SERVER_SRC.includes(c.message), `در ${SERVER_ROUTES} پیدا نشد`).toBe(true);
    });
  }

  it("فرمِ سالم هیچ خطایی ندارد", () => {
    expect(validateProductForm(form())).toEqual([]);
  });

  it("تخفیفِ خالی خطا نیست (یعنی «تخفیفی نیست»)", () => {
    expect(validateProductForm(form({ oldPrice: "" }))).toEqual([]);
    expect(validateProductForm(form({ oldPrice: "0" }))).toEqual([]);
  });

  it("تخفیفِ عمده بدونِ حد نصاب هم خطا نیست", () => {
    // سرور همین را قبول می‌کند: اگر حد نصاب صفر باشد، عمده‌فروشی خاموش است و
    // درصدش بی‌اثر می‌ماند (`wholesaleInfo` در lib/db.js).
    expect(validateProductForm(form({ wholesaleDiscount: "20" }))).toEqual([]);
  });

  it("تخفیفِ عمده‌ی برابر با قیمت را سرور رد نمی‌کند ولی فرم هم سخت‌گیر نیست", () => {
    // تفاوتِ عمدی نیست، فقط یادآوریِ مرز: سقفِ تخفیف ۹۰ است نه ۱۰۰.
    expect(validateProductForm(form({ wholesaleDiscount: "90" }))).toEqual([]);
    expect(validateProductForm(form({ wholesaleDiscount: "91" }))).toHaveLength(1);
  });

  it("چند خطا با هم برگردانده می‌شوند (فرم همه را نشان می‌دهد)", () => {
    const errs = validateProductForm(form({ title: "", category: "", price: "-1" }));
    expect(errs).toHaveLength(3);
  });
});

describe("ساختِ payload", () => {
  it("عکسِ خالی null می‌شود و گالری از تکراری پاک می‌شود", () => {
    const p = toProductPayload(
      form({ image: null, images: ["/picture/a.jpg", "/picture/a.jpg", "/picture/b.jpg"] }),
    );
    expect(p.image).toBeNull();
    expect(p.images).toEqual(["/picture/a.jpg", "/picture/b.jpg"]);
  });

  it("گالری به سقفِ سرور بریده می‌شود", () => {
    const many = Array.from({ length: MAX_GALLERY + 4 }, (_, i) => `/picture/p-${i}.jpg`);
    expect(toProductPayload(form({ images: many })).images).toHaveLength(MAX_GALLERY);
  });

  it("مشخصاتِ نیمه‌خالی دور ریخته می‌شوند و بریده می‌شوند", () => {
    expect(
      cleanSpecs([
        { k: " گنجایش ", v: " ۳ لیتر " },
        { k: "بدونِ مقدار", v: "   " },
        { k: "", v: "بدونِ عنوان" },
      ]),
    ).toEqual([{ k: "گنجایش", v: "۳ لیتر" }]);

    // سقفِ ۱۲ ردیف، مثلِ سرور
    const rows = Array.from({ length: 20 }, (_, i) => ({ k: `k${i}`, v: `v${i}` }));
    expect(cleanSpecs(rows)).toHaveLength(12);
  });

  it("توضیحات و نشان و عنوان به سقفِ خودشان بریده می‌شوند", () => {
    const p = toProductPayload(
      form({ description: "د".repeat(700), badge: "ن".repeat(40) }),
    );
    expect(p.description.length).toBe(500);
    expect(p.badge.length).toBe(30);
  });

  it("آیکون همیشه خالی فرستاده می‌شود (فرم آن را ندارد)", () => {
    // سرور برای ساخت، `icon || 'i-package'` می‌گذارد؛ برای ویرایش هم مقدارِ
    // قبلی به ارث می‌رسد چون `undefined` فرستاده نمی‌شود... ولی اینجا صریح
    // خالی است — پس آزمون می‌گوید چه انتظاری داریم.
    expect(toProductPayload(form()).icon).toBe("");
  });

  it("پیام‌های آپلودِ سمتِ مرورگر هم از زبانِ سرور می‌آیند", () => {
    expect(imageRejectReason({ type: "image/gif", size: 1000 })).toBe(
      "فقط عکس JPG/PNG/WebP قابل قبول است",
    );
    expect(SERVER_SRC).toContain("فقط عکس JPG/PNG/WebP قابل قبول است");

    // فقط نوع و حجم؛ ۲ مگابایت همان سقفِ `MAX_IMG_BYTES` سرور است.
    expect(imageRejectReason({ type: "image/png", size: MAX_IMG_BYTES })).toBeNull();
    expect(imageRejectReason({ type: "image/png", size: MAX_IMG_BYTES + 1 })).toContain(
      "سقف ۲ مگابایت",
    );
    expect(imageRejectReason({ type: "image/jpeg", size: 0 })).toContain("خالی");
  });
});
