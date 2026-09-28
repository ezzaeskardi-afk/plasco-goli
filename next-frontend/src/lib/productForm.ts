// ============================================================
// فرمِ کاملِ محصول — حالتِ فرم، اعتبارسنجی و ساختِ payload
// ============================================================
// چرا یک فایلِ جدا و بدونِ React: همان دلیلی که `lib/couponState.ts` دارد —
// این‌ها منطق‌اند نه ظاهر. آزمونِ واحد می‌تواند بدونِ mount کردنِ هیچ کامپوننتی
// سنجیدشان، و کامپوننت فقط نمایش می‌دهد.
//
// قاعده‌ی طلاییِ این فایل: **قواعد و پیام‌های خطا عیناً همان‌هایی هستند که
// `cleanProductInput` در routes/admin.js:918 دارد.** نه به‌خاطرِ تنبلی، بلکه
// چون اگر متفاوت باشند، مدیر پیامی می‌بیند که سرور هرگز نمی‌داد و برعکس —
// یعنی یا خطایی می‌بیند که سرور قبولش می‌کرد، یا خطای سرور بی‌توضیح می‌ماند.
// تنها تفاوتِ عمدی: اینجا همه‌ی خطاها یک‌جا جمع می‌شوند (سرور هم `errors` را
// با «؛» به‌هم می‌چسباند)، پس فرم می‌تواند کنارِ هر فیلد خطای خودش را بگذارد.

import { foldDigits } from "./faSearch";
import type { AdminProduct, ProductCreateInput } from "./adminTypes";

/** حالتِ رشته‌ایِ فرم — عددها هم رشته‌اند، چون ورودی دستِ کاربر رشته است */
export interface ProductFormState {
  title: string;
  category: string;
  description: string;
  price: string;
  oldPrice: string;
  stock: string;
  badge: string;
  image: string | null;
  images: string[];
  specs: { k: string; v: string }[];
  wholesaleMinQty: string;
  wholesaleDiscount: string;
}

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  title: "",
  category: "",
  description: "",
  price: "",
  oldPrice: "",
  stock: "",
  badge: "",
  image: null,
  images: [],
  specs: [],
  wholesaleMinQty: "",
  wholesaleDiscount: "",
};

/** کالای موجود → فرم. عکسِ کاور و گالری همان‌طور که هستند می‌آیند. */
export function formFromProduct(p: AdminProduct): ProductFormState {
  return {
    title: p.title,
    category: p.category,
    description: p.description,
    // صفر عمداً رشته‌ی خالی می‌شود: «۰ تومان» روی کالای عادی یعنی «قیمت گذاشته
    // نشده»، و مدیر باید فیلدِ خالی ببیند تا بداند چیزی وارد نشده.
    price: p.price > 0 ? String(p.price) : "",
    oldPrice: p.oldPrice > 0 ? String(p.oldPrice) : "",
    stock: String(p.stock),
    badge: p.badge,
    image: p.image,
    images: [...p.images],
    specs: p.specs.map((s) => ({ ...s })),
    wholesaleMinQty: p.wholesaleMinQty > 0 ? String(p.wholesaleMinQty) : "",
    wholesaleDiscount: p.wholesaleDiscount > 0 ? String(p.wholesaleDiscount) : "",
  };
}

/**
 * رشته → عدد، با پذیرشِ ارقامِ فارسی/عربی.
 *
 * چرا `foldDigits`: کسی که با صفحه‌کلیدِ فارسی عدد می‌زند چیزی جز «۱۲» نمی‌بیند
 * و انتظار ندارد فرم بگوید «قیمت معتبر نیست». `Number("۱۲")` در جاوااسکریپت
 * `NaN` است.
 */
export function toNum(s: string): number {
  const t = foldDigits(String(s ?? "").trim()).replace(/[,\s٬]/g, "");
  if (t === "") return 0;
  return Number(t);
}

/** یک ورودیِ فارسی‌خوانِ خالی: `""` و `0` هر دو «۰» می‌شوند */
function intOrZero(s: string): number {
  return Math.round(toNum(s));
}

// ------------------------------------------------------------
// اعتبارسنجی
// ------------------------------------------------------------

/** مسیرِ عکس: فقط داخلی و از پوشه‌ی /picture (routes/admin.js:967) */
const IMAGE_RE = /^\/picture\/[\w\-. %()\u0600-\u06FF\/]+$/;

function imageOk(s: string): boolean {
  return !s.includes("..") && IMAGE_RE.test(s);
}

/**
 * خطاهای فرم — خالی بودنِ آرایه یعنی «می‌شود فرستاد».
 *
 * توجه: `icon` اینجا نیست. آن فیلد از فرمِ Next حذف شده (توضیحش در
 * `ProductEditor.tsx`) و روی `PUT` هم فرستاده نمی‌شود؛ یعنی مقدارِ قبلی دستِ
 * نخورده می‌ماند. برای کالای تازه، سرور خودش `i-package` می‌گذارد.
 */
export function validateProductForm(f: ProductFormState): string[] {
  const errors: string[] = [];

  const title = f.title.trim();
  if (!title || title.length > 120) errors.push("عنوان لازم است (حداکثر ۱۲۰ حرف)");

  const category = f.category.trim();
  if (!category || category.length > 60) errors.push("دسته‌بندی لازم است");

  // توضیحات در سرور بریده می‌شود نه رد — پس اینجا هم خطا نمی‌دهد.
  const price = toNum(f.price);
  if (!Number.isFinite(price) || price < 0 || price > 2_000_000_000) {
    errors.push("قیمت معتبر نیست");
  }

  const stock = toNum(f.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
    errors.push("موجودی معتبر نیست");
  }

  const oldPriceRaw = foldDigits(f.oldPrice.trim());
  const oldPrice = oldPriceRaw === "" ? 0 : toNum(oldPriceRaw);
  if (!Number.isFinite(oldPrice) || oldPrice < 0 || oldPrice > 2_000_000_000) {
    errors.push("قیمت قبلی معتبر نیست");
  } else if (oldPrice > 0 && price > 0 && Math.round(oldPrice) <= Math.round(price)) {
    errors.push(
      "قیمت قبلی باید از قیمت فعلی بیشتر باشد (برای حذف تخفیف، آن را خالی یا صفر بگذارید)",
    );
  }

  const minQty = intOrZero(f.wholesaleMinQty);
  if (!Number.isFinite(minQty) || minQty < 0 || minQty > 1_000_000) {
    errors.push("حد نصاب تعداد عمده معتبر نیست");
  }
  const discount = intOrZero(f.wholesaleDiscount);
  if (!Number.isFinite(discount) || discount < 0 || discount > 90) {
    errors.push("درصد تخفیف عمده باید بین ۰ تا ۹۰ باشد");
  }

  if (f.image && !imageOk(f.image)) errors.push("مسیر عکس معتبر نیست");
  if (f.images.some((s) => !imageOk(s))) {
    errors.push("مسیر یکی از عکس‌های گالری معتبر نیست");
  }

  return errors;
}

/** مشخصات: ردیفِ نیمه‌خالی دور ریخته می‌شود (سرور هم همان کار را می‌کند) */
export function cleanSpecs(
  specs: { k: string; v: string }[],
): { k: string; v: string }[] {
  return specs
    .map((r) => ({ k: r.k.trim().slice(0, 40), v: r.v.trim().slice(0, 120) }))
    .filter((r) => r.k && r.v)
    .slice(0, 12);
}

/**
 * فرم → payload.
 *
 * فرض: `validateProductForm` قبلش صدا زده شده. با این حال عددها دوباره پاک
 * می‌شوند تا فرستادنِ یک payloadِ نیمه‌معتبر ممکن نباشد.
 */
export function toProductPayload(f: ProductFormState): ProductCreateInput {
  return {
    title: f.title.trim().slice(0, 120),
    category: f.category.trim().slice(0, 60),
    description: f.description.trim().slice(0, 500),
    price: Math.round(toNum(f.price)),
    oldPrice: Math.round(toNum(f.oldPrice)),
    stock: Math.round(toNum(f.stock)),
    badge: f.badge.trim().slice(0, 30),
    // عمداً ثابت: فیلدش از فرم برداشته شده، ولی سرور برای `POST` مقدار لازم دارد.
    icon: "",
    image: f.image || null,
    images: [...new Set(f.images.filter(Boolean))].slice(0, MAX_GALLERY),
    specs: cleanSpecs(f.specs),
    wholesaleMinQty: intOrZero(f.wholesaleMinQty),
    wholesaleDiscount: intOrZero(f.wholesaleDiscount),
  };
}

// ------------------------------------------------------------
// قواعدِ آپلود — آینه‌ی routes/admin.js:1240
// ------------------------------------------------------------
// سقفِ گالری در سرور با `.slice(0, 8)` اعمال می‌شود، پس اینجا هم باید همان
// عدد باشد وگرنه مدیر ۱۰ عکس انتخاب می‌کند، ۸ تای اول ذخیره می‌شود و UI
// چیزِ دیگری نشان می‌دهد.
export const MAX_GALLERY = 8;
export const MAX_IMG_BYTES = 2 * 1024 * 1024;
export const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * چرا فایل رد شد — یا `null` اگر مشکلی نیست.
 *
 * فقط چیزی که **بدونِ خواندنِ فایل** قابلِ‌فهم است سنجیده می‌شود: نوع و حجم.
 * ابعاد (۴۰۰۰ / ۸۰ پیکسل) عمداً اینجا نیست، چون سنجیدنش یعنی رمزگشاییِ عکس در
 * مرورگر؛ سرور همان را از خودِ بایت‌ها می‌خواند و پیامش هم دقیق است (ابعادِ
 * واقعیِ فایل را می‌گوید). دو جا سنجیدن، دو پیامِ متفاوت می‌ساخت.
 */
export function imageRejectReason(file: { type: string; size: number }): string | null {
  if (!IMG_TYPES.includes(file.type)) {
    return "فقط عکس JPG/PNG/WebP قابل قبول است";
  }
  if (file.size > MAX_IMG_BYTES) {
    return `حجم عکس ${Math.round(file.size / 1024)} کیلوبایت است؛ سقف ۲ مگابایت است.`;
  }
  if (!file.size) return "فایل خالی است.";
  return null;
}
