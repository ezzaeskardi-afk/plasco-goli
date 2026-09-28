// ============================================================
// عملیاتِ گروهیِ کالا — آینه‌ی `BULK_OPS` در routes/admin.js:1090
// ============================================================
// سرور این‌ها را می‌شناسد و هر چیزِ دیگری را با ۴۰۰ «عملیات نامعتبر است» رد
// می‌کند. فهرست اینجاست تا نوارِ عملیاتِ گروهی از همین ساخته شود و آزمون هم
// بتواند بگوید «هر عملیاتی که UI نشان می‌دهد، در سرور وجود دارد».
//
// `value` می‌گوید این عملیات به مقدار نیاز دارد یا نه:
//   • `"number"` / `"text"` → بدونِ آن، سرور ۴۰۰ می‌دهد یا کارِ بی‌معنا می‌کند
//   • `"none"` → فرستادنش بی‌اثر است (و برای `clear_badge` عمداً فرستاده نمی‌شود)
//
// دو قاعده‌ی سرور که اینجا هم هست، چون پیامشان باید پیش از رفت‌وبرگشتِ شبکه
// دیده شود: درصدِ تغییر قیمت بین ۹۰- و ۹۰۰، و درصدِ تخفیف عددیِ درست بین ۱ و ۹۰.
// («صفر درصد تخفیف» بی‌معنی است و بالای ۹۰ عملاً مجانی — سرور هر دو را رد
// می‌کند.)

export type BulkValueKind = "none" | "number" | "text";

export interface BulkOp {
  op: string;
  label: string;
  value: BulkValueKind;
  /** راهنمای کوتاهِ فیلدِ مقدار — همان چیزی که مدیر باید بداند */
  hint?: string;
}

export const BULK_OPS: BulkOp[] = [
  { op: "set_stock", label: "موجودی ثابت", value: "number", hint: "تعداد" },
  { op: "add_stock", label: "افزودن به موجودی", value: "number", hint: "چند تا اضافه شود" },
  { op: "price_pct", label: "تغییر درصدی قیمت", value: "number", hint: "مثلاً ‎-10 یا 15" },
  { op: "set_category", label: "تغییر دسته", value: "text", hint: "نام دسته" },
  { op: "set_badge", label: "گذاشتن نشان", value: "text", hint: "مثلاً جدید" },
  { op: "clear_badge", label: "برداشتن نشان", value: "none" },
  { op: "discount", label: "اجرای تخفیف", value: "number", hint: "درصد، بین ۱ تا ۹۰" },
  { op: "discount_end", label: "پایان تخفیف", value: "none" },
  { op: "publish", label: "انتشار در سایت", value: "none" },
  { op: "unpublish", label: "برداشتن از سایت", value: "none" },
];

export function bulkOp(op: string): BulkOp | undefined {
  return BULK_OPS.find((o) => o.op === op);
}

/**
 * خطای مقدارِ عملیات — یا `null`.
 *
 * `raw` همان چیزی است که مدیر تایپ کرده (ممکن است ارقامِ فارسی باشد).
 */
export function bulkValueError(op: string, raw: string, num: number): string | null {
  const spec = bulkOp(op);
  if (!spec) return "عملیات نامعتبر است";
  if (spec.value === "none") return null;

  if (spec.value === "text") {
    if (!raw.trim()) return "مقدار لازم است";
    return null;
  }

  if (!Number.isFinite(num)) return "عدد معتبر نیست";
  if (op === "price_pct") {
    if (num !== Math.round(num)) return "درصد باید عددِ درست باشد";
    if (num < -90 || num > 900) return "درصد باید بین ۹۰- و ۹۰۰ باشد";
    return null;
  }
  if (op === "discount") {
    if (num !== Math.round(num)) return "درصد باید عددِ درست باشد";
    if (num < 1 || num > 90) return "درصد تخفیف باید عددی درست بین ۱ تا ۹۰ باشد";
    return null;
  }
  // موجودی: منفی بی‌معنی است (سرور هم موجودیِ منفی را رد می‌کند)
  if (num < 0 || num > 1_000_000) return "عدد باید بین ۰ و ۱۰۰۰۰۰۰ باشد";
  return null;
}

/**
 * مقداری که باید به سرور برود — `undefined` یعنی «این عملیات مقدار ندارد».
 *
 * چرا برای `publish` مقدار `"force"` نمی‌فرستیم: سرور با ۴۰۹ و
 * `needsConfirm: true` می‌گوید «این کالاها عکس ندارند». تأییدِ مدیر یک دورِ
 * دوم است؛ آن یکی در خودِ کامپوننت انجام می‌شود، نه اینجا.
 */
export function bulkPayloadValue(
  op: string,
  raw: string,
  num: number,
): string | number | undefined {
  const spec = bulkOp(op);
  if (!spec || spec.value === "none") return undefined;
  return spec.value === "text" ? raw.trim() : num;
}
