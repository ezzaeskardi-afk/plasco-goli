// ============================================================
// کلاینتِ API پنل مدیریت — routes/admin.js
// ============================================================
// همه از همان `fetcher` مشترک استفاده می‌کنند (lib/api.ts): در مرورگر مسیرِ
// نسبی می‌رود و `rewrites` در next.config.ts آن را به Express می‌دهد، پس
// درخواست هم‌مبدأ می‌شود و کوکیِ نشست (`polasco.sid`) همراه می‌رود. اگر اینجا
// آدرسِ مطلقِ :3000 نوشته می‌شد، هر درخواست cross-origin می‌شد و Express آن را
// با ۴۰۳ رد می‌کرد.
//
// مجوز: هیچ‌کدام از این توابع «ادمین بودن» را چک نمی‌کنند و نباید بکنند.
// سدِ واقعی سمتِ Express است (`requireAdmin` روی مسیر /api/admin). کاری که
// اینجا می‌شود، ترجمه‌ی ۴۰۳ به یک پیامِ قابل‌فهم است — در خودِ کامپوننت‌ها.

import { fetcher } from "./api";
import type {
  AdminOverview,
  AdminOrdersResponse,
  AdminOrder,
  OrderMutationResponse,
  OrderStatus,
  InventoryResponse,
  ProductUpdateInput,
  ProductMutationResponse,
  PublishResponse,
  AdminReviewsResponse,
  ReviewMutationResponse,
  CouponsResponse,
  CouponInput,
  CouponMutationResponse,
  AdminUsersResponse,
  StaffMutationResponse,
  SettingsResponse,
  AdminSettingsInput,
} from "./adminTypes";

// ============================================================
// داشبورد
// ============================================================

/** همه‌ی داده‌ی داشبورد در یک درخواست: آمار + نمودار ۱۴ روز + برترین‌ها + هشدارها */
export async function getAdminOverview(): Promise<AdminOverview> {
  return fetcher<AdminOverview>("/api/admin/overview");
}

// ============================================================
// سفارش‌ها
// ============================================================

export interface AdminOrderQuery {
  /** 'all' | 'active' | یک وضعیتِ مشخص */
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/**
 * فهرست سفارش‌ها با فیلتر و صفحه‌بندی.
 *
 * ⚠️ تله‌ای که در routes/admin.js:404 هست و باید دورش زد: اگر **هیچ**
 * پارامتری نفرستی، سرور شاخه‌ی قدیمی را می‌گیرد و
 * `{ orders: getAllOrders(), counts }` برمی‌گرداند — بدونِ `total` و `sum` و
 * با شکلِ ردیفِ متفاوت. پس اینجا همیشه حداقل `status` و `limit` فرستاده
 * می‌شود تا پاسخ همیشه `{orders,total,sum,counts}` باشد.
 */
export async function getAdminOrders(
  params: AdminOrderQuery = {},
): Promise<AdminOrdersResponse> {
  const sp = new URLSearchParams();
  sp.set("status", params.status || "all");
  sp.set("limit", String(params.limit ?? 40));
  if (params.q) sp.set("q", params.q);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.offset) sp.set("offset", String(params.offset));
  return fetcher<AdminOrdersResponse>(`/api/admin/orders?${sp.toString()}`);
}

/** جزئیات کامل یک سفارش (بازگشتِ سرور داخلِ پوشش است: routes/admin.js:420) */
export async function getAdminOrder(id: number): Promise<AdminOrder> {
  const data = await fetcher<{ order: AdminOrder }>(`/api/admin/orders/${id}`);
  return data.order;
}

/**
 * تغییر وضعیت. سرور `from` را هم می‌خواهد و اگر سفارش در این فاصله عوض شده
 * باشد ۴۰۹ می‌دهد (`UPDATE ... WHERE id = ? AND status = ?`). یعنی `from` یک
 * قفلِ خوش‌بینانه است، نه یک تزئین — پس همیشه باید از خودِ سفارش خوانده شود.
 */
export async function setOrderStatus(
  id: number,
  from: OrderStatus,
  to: OrderStatus,
): Promise<OrderMutationResponse> {
  return fetcher<OrderMutationResponse>(`/api/admin/orders/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
}

/** لغو سفارش — موجودی اقلام در یک تراکنش به انبار برمی‌گردد */
export async function cancelOrder(
  id: number,
  reason: string,
): Promise<OrderMutationResponse> {
  return fetcher<OrderMutationResponse>(`/api/admin/orders/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** کد رهگیری پستی. سرور الگوی `^[\w\d\-]{4,60}$` را می‌خواهد (خالی = پاک‌کردن) */
export async function setOrderTracking(
  id: number,
  trackingCode: string,
): Promise<OrderMutationResponse> {
  return fetcher<OrderMutationResponse>(`/api/admin/orders/${id}/tracking`, {
    method: "POST",
    body: JSON.stringify({ trackingCode }),
  });
}

/** یادداشت داخلی — فقط در پنل دیده می‌شود، به مشتری نمی‌رود */
export async function setOrderNote(
  id: number,
  note: string,
): Promise<OrderMutationResponse> {
  return fetcher<OrderMutationResponse>(`/api/admin/orders/${id}/note`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

// ============================================================
// انبار و کالا
// ============================================================

/** نمای انبار: همه‌ی محصولات + آمار فروش + کم‌موجودها + تقاضای از‌دست‌رفته */
export async function getInventory(threshold?: number): Promise<InventoryResponse> {
  const qs = threshold != null ? `?threshold=${threshold}` : "";
  return fetcher<InventoryResponse>(`/api/admin/inventory${qs}`);
}

/**
 * ویرایش محصول. سرور با مقدارِ قبلی ادغام می‌کند، پس فرستادنِ فقط
 * `{price, stock}` امن است («ذخیره‌ی سریع» در جدولِ پنل عیناً همین کار را
 * می‌کند). تنها استثنا `oldPrice` است: اگر خودت نفرستی، مقدارِ قبلی به ارث
 * می‌رسد و فقط وقتی با قیمتِ جدید بی‌معنا شده باشد بی‌صدا صفر می‌شود.
 */
export async function updateProduct(
  id: number,
  data: ProductUpdateInput,
): Promise<ProductMutationResponse> {
  return fetcher<ProductMutationResponse>(`/api/admin/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * انتشار/برداشتن محصول — مسیرِ جدا از ویرایش، تا «ذخیره‌ی سریع» نتواند
 * ناخواسته کالایی را از سایت بردارد.
 *
 * دو سدِ سمتِ سرور که باید در UI هم نشان داده شوند:
 *  • کالای بی‌عکس → ۴۰۹ با `needsConfirm: true` مگر `force: true` بفرستی
 *  • کالای صفر تومان → ۴۰۰، و `force` هم ندارد (کالای رایگان واقعاً فروخته می‌شود)
 */
export async function setProductPublished(
  id: number,
  published: boolean,
  force = false,
): Promise<PublishResponse> {
  return fetcher<PublishResponse>(`/api/admin/products/${id}/published`, {
    method: "POST",
    body: JSON.stringify({ published, force }),
  });
}

// ============================================================
// کدهای تخفیف
// ============================================================

/** فهرستِ کدها — مرتب‌شده: فعال‌ها اول، بعد تازه‌ترین */
export async function getCoupons(): Promise<CouponsResponse> {
  return fetcher<CouponsResponse>("/api/admin/coupons");
}

/**
 * ساختِ کدِ تازه.
 *
 * دو خطای مهم که کامپوننت باید نشان بدهد:
 *  • ۴۰۹ = همین کد قبلاً ساخته شده (ستونِ `code` در دیتابیس UNIQUE است)
 *  • ۴۰۰ = قواعدِ اعتبارسنجی (کد ۳ تا ۳۰ کاراکتر `[A-Za-z0-9_-]`، درصد ۱–۹۰،
 *    مبلغِ ثابت حداقل ۱۰۰۰ تومان، تاریخ به شکل YYYY-MM-DD)
 */
export async function createCoupon(
  data: CouponInput,
): Promise<CouponMutationResponse> {
  return fetcher<CouponMutationResponse>("/api/admin/coupons", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * ویرایشِ کد. سرور فیلدهای نیامده را از مقدارِ فعلی پر می‌کند، پس فرستادنِ فقط
 * `{active: false}` امن است (همان کاری که سوئیچِ خاموش/روشن می‌کند).
 *
 * ⚠️ `code` عمداً در ورودی نیست: سرور آن را در PUT نمی‌خواند، پس هر مقدارِ
 * `code` در بدنه بی‌صدا دور ریخته می‌شود.
 */
export async function updateCoupon(
  id: number,
  data: Partial<CouponInput>,
): Promise<CouponMutationResponse> {
  return fetcher<CouponMutationResponse>(`/api/admin/coupons/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * حذفِ کاملِ کد — برگشت‌ناپذیر.
 *
 * عمداً سفارش‌های قبلی دست نمی‌خورند: `coupon_code` روی خودِ سفارش به‌صورت
 * رشته ذخیره شده، پس آمارِ فروشِ گذشته به هم نمی‌ریزد. ولی تخفیفِ کد از این
 * لحظه در دسترس نیست.
 */
export async function deleteCoupon(id: number): Promise<{ ok: boolean }> {
  return fetcher<{ ok: boolean }>(`/api/admin/coupons/${id}`, {
    method: "DELETE",
  });
}

// ============================================================
// مشتری‌ها
// ============================================================

/**
 * کلِ فهرستِ کاربرانِ ثبت‌نامی در یک درخواست.
 *
 * این مسیر پارامترِ جستجو و صفحه‌بندی ندارد (توضیح در `AdminUsersResponse`).
 * چرا با این حال اینجا هیچ کلاینت‌سایدِ جستجویی نوشته نشده: جای درستش نمای
 * مشتری‌هاست، چون همان‌جا معلوم می‌شود چه فیلتری روی چه ستونی معنا دارد.
 * اگر روزی `/admin/users` خودش `q/limit/offset` گرفت، فقط این تابع عوض
 * می‌شود و نمای مشتری‌ها دست نمی‌خورد.
 */
export async function getAdminUsers(): Promise<AdminUsersResponse> {
  return fetcher<AdminUsersResponse>("/api/admin/users");
}

/**
 * دادن یا گرفتن نقشِ کارمند.
 *
 * `staff: true` می‌دهد و `false` می‌گیرد. سرور فقط `true` و `1` را «روشن»
 * می‌شمارد (`req.body?.staff === true || === 1`)، یعنی رشته‌ی `"true"` را
 * قبول نمی‌کند و بی‌صدا خاموش می‌کند — پس اینجا بولین فرستاده می‌شود.
 *
 * ۴۰۳ = کاربرِ واردشده ادمین نیست (حتی اگر کارمند باشد).
 */
export async function setUserStaff(
  id: number,
  staff: boolean,
): Promise<StaffMutationResponse> {
  return fetcher<StaffMutationResponse>(`/api/admin/users/${id}/staff`, {
    method: "POST",
    body: JSON.stringify({ staff }),
  });
}

// ============================================================
// تنظیمات فروشگاه
// ============================================================

/**
 * تنظیماتِ جاری.
 *
 * ⚠️ همان چیزی که در `AdminSettings` توضیح داده شده: بخشی از مقادیر عددی‌اند
 * ولی همه **رشته** برمی‌گردند. `""` و `"0"` معناهای متفاوتی دارند و هر دو
 * معتبرند (`announcement: ""` = بدون نوار؛ `shipping_cost: "0"` = ارسال
 * رایگان) — پس هیچ‌کدام را نباید «خالی/نال» فرض کرد.
 */
export async function getAdminSettings(): Promise<SettingsResponse> {
  return fetcher<SettingsResponse>("/api/admin/settings");
}

/**
 * ذخیره‌ی تنظیمات — فقط کلیدهای فرستاده‌شده عوض می‌شوند.
 *
 * دو خطای معنادار:
 *  • ۴۰۰ «نام فروشگاه خالی است» — `shop_name` نمی‌تواند خالی شود
 *  • ۴۰۰ «مقدار «...» معتبر نیست» — یکی از سه عددی منفی/غیرعددی/بیش از حد است
 *    (`shipping_cost`، `free_shipping_over`، `low_stock_threshold`)
 *
 * پاسخ، تنظیماتِ **پس از ذخیره** را برمی‌گرداند و نه چیزی که فرستادیم: سرور
 * رشته‌های بلند را می‌بُرد (نام ۶۰، آدرس ۲۰۰، اطلاعیه ۳۰۰، متنِ بنر ۱۲۰، کد ۳۰).
 * پس فرم باید از پاسخ پر شود، نه از stateِ خودش، وگرنه کاربر متنی می‌بیند که
 * هرگز ذخیره نشده.
 */
export async function updateAdminSettings(
  data: AdminSettingsInput,
): Promise<SettingsResponse & { ok: boolean }> {
  return fetcher<SettingsResponse & { ok: boolean }>("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ============================================================
// نظرات
// ============================================================

/** صفِ نظرات. `getAdminReviews('all')` هم شمارنده‌های هر وضعیت را می‌دهد. */
export async function getAdminReviews(
  status: "all" | "pending" | "approved" | "rejected" = "all",
): Promise<AdminReviewsResponse> {
  return fetcher<AdminReviewsResponse>(`/api/admin/reviews?status=${status}`);
}

/** تأیید/رد/برگشت به صف. تأیید، دیدگاه را روی صفحه‌ی محصول هم می‌آورد. */
export async function setReviewStatus(
  id: number,
  status: "approved" | "rejected" | "pending",
): Promise<ReviewMutationResponse> {
  return fetcher<ReviewMutationResponse>(`/api/admin/reviews/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

// دوباره صادر می‌شود تا کامپوننت‌ها یک مسیرِ import داشته باشند
export type { AdminOrder, AdminReview, InventoryRow } from "./adminTypes";
