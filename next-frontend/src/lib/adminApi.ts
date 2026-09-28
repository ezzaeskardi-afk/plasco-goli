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

import { ApiError, fetcher } from "./api";
import { apiBase } from "./site";
import { hardNavigate } from "./navigation";
import type {
  AdminOverview,
  AdminOrdersResponse,
  AdminOrder,
  OrderMutationResponse,
  OrderStatus,
  InventoryResponse,
  InventoryRow,
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
  AdminSystemStatus,
  AdminDbHealthResponse,
  AdminBackupResponse,
  WholesaleRequestsResponse,
  WholesaleStatus,
  AdminReportsResponse,
  MonthlySalesResponse,
  ActivityResponse,
  AdminErrorsResponse,
  AdminProduct,
  AdminProductsResponse,
  ProductCreateInput,
  ProductDeleteResponse,
  ProductBulkResponse,
  UploadImageResponse,
} from "./adminTypes";

// ============================================================
// نشستِ بسته‌شده‌ی پنل — تنها ۴۰۱ای که پیامِ خودش را دارد
// ============================================================
// `panelIdleGuard` (routes/admin.js:108) وقتی نیم‌ساعت از آخرین درخواستِ مدیر
// گذشته باشد، نشست را نابود می‌کند و ۴۰۱ با `reason: 'idle'` می‌فرستد. این
// ۴۰۱ با «۴۰۱ِ بی‌نشست» (کسی که هرگز وارد نشده) و با ۴۰۳ («این بخش برای تو
// نیست») یکی نیست، ولی تا امروز هر سه یک‌شکل نمایش داده می‌شدند: مدیر کادرِ
// «دسترسی به پنل مدیریت ندارید» می‌دید — یعنی پیامی که می‌گوید *حق نداری*،
// در حالی که حق داشت و فقط نشستش بسته شده بود. بدتر: هیچ راهی هم نشان
// نمی‌داد، پس باید خودش آدرسِ ورود را حدس می‌زد.
//
// حالا هر درخواستِ پنل از همین دروازه رد می‌شود و این حالت به ورود برمی‌گردد،
// با آدرسِ برگشت و نشانه‌ی `idle=1` تا خودِ صفحه‌ی ورود توضیح بدهد چرا.
export const IDLE_REASON = "idle";

export function isIdleExpiry(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401 && err.reason === IDLE_REASON;
}

// یک بار در هر بارگذاریِ صفحه. پنل موقع باز شدن ده‌ها درخواستِ هم‌زمان
// می‌فرستد و همه‌شان با هم ۴۰۱ می‌گیرند؛ بدونِ این پرچم، ده‌ها `assign` پشتِ
// سرِ هم روی یک آدرس اجرا می‌شود و مرورگر وسطِ ناوبری دوباره بار می‌کند.
let idleRedirectStarted = false;

/**
 * برگشت به صفحه‌ی ورود، با آدرسِ همین صفحه برای بازگشتِ بعدی.
 *
 * اگر عمداً `window.location` (به‌جای روترِ Next) است: نشست بسته شده و هر
 * حالتِ درون‌حافظه‌ای (کشِ react-query، دیتای نمای باز) دقیقاً همان چیزی است
 * که نباید بماند. یک بارگذاریِ کامل، پنل را از صفر می‌آورد.
 */
function redirectAfterIdleEnd(): void {
  if (idleRedirectStarted) return;
  idleRedirectStarted = true;
  const here = window.location.pathname + window.location.search;
  const dest = `/login?redirect=${encodeURIComponent(here)}&idle=1`;
  hardNavigate(dest);
}

/**
 * همان `fetcher` مشترک، فقط با یک کارِ اضافه: اگر پاسخ «نشستِ پنل بسته شد»
 * باشد، کاربر به ورود برمی‌گردد و خودِ خطا هم پرتاب می‌شود تا کامپوننتی که
 * درخواست را زده، رفتارِ خطای خودش را داشته باشد.
 */
async function adminFetcher<T>(
  path: string,
  options: Parameters<typeof fetcher>[1] = {},
): Promise<T> {
  try {
    return await fetcher<T>(path, options);
  } catch (err) {
    if (isIdleExpiry(err) && typeof window !== "undefined") redirectAfterIdleEnd();
    throw err;
  }
}

// ============================================================
// داشبورد
// ============================================================

/** همه‌ی داده‌ی داشبورد در یک درخواست: آمار + نمودار ۱۴ روز + برترین‌ها + هشدارها */
export async function getAdminOverview(): Promise<AdminOverview> {
  return adminFetcher<AdminOverview>("/api/admin/overview");
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
  return adminFetcher<AdminOrdersResponse>(`/api/admin/orders?${sp.toString()}`);
}

/** جزئیات کامل یک سفارش (بازگشتِ سرور داخلِ پوشش است: routes/admin.js:420) */
export async function getAdminOrder(id: number): Promise<AdminOrder> {
  const data = await adminFetcher<{ order: AdminOrder }>(`/api/admin/orders/${id}`);
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
  return adminFetcher<OrderMutationResponse>(`/api/admin/orders/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
}

/** لغو سفارش — موجودی اقلام در یک تراکنش به انبار برمی‌گردد */
export async function cancelOrder(
  id: number,
  reason: string,
): Promise<OrderMutationResponse> {
  return adminFetcher<OrderMutationResponse>(`/api/admin/orders/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** کد رهگیری پستی. سرور الگوی `^[\w\d\-]{4,60}$` را می‌خواهد (خالی = پاک‌کردن) */
export async function setOrderTracking(
  id: number,
  trackingCode: string,
): Promise<OrderMutationResponse> {
  return adminFetcher<OrderMutationResponse>(`/api/admin/orders/${id}/tracking`, {
    method: "POST",
    body: JSON.stringify({ trackingCode }),
  });
}

/** یادداشت داخلی — فقط در پنل دیده می‌شود، به مشتری نمی‌رود */
export async function setOrderNote(
  id: number,
  note: string,
): Promise<OrderMutationResponse> {
  return adminFetcher<OrderMutationResponse>(`/api/admin/orders/${id}/note`, {
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
  return adminFetcher<InventoryResponse>(`/api/admin/inventory${qs}`);
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
  return adminFetcher<ProductMutationResponse>(`/api/admin/products/${id}`, {
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
  return adminFetcher<PublishResponse>(`/api/admin/products/${id}/published`, {
    method: "POST",
    body: JSON.stringify({ published, force }),
  });
}

// ============================================================
// کدهای تخفیف
// ============================================================

/** فهرستِ کدها — مرتب‌شده: فعال‌ها اول، بعد تازه‌ترین */
export async function getCoupons(): Promise<CouponsResponse> {
  return adminFetcher<CouponsResponse>("/api/admin/coupons");
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
  return adminFetcher<CouponMutationResponse>("/api/admin/coupons", {
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
  return adminFetcher<CouponMutationResponse>(`/api/admin/coupons/${id}`, {
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
  return adminFetcher<{ ok: boolean }>(`/api/admin/coupons/${id}`, {
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
  return adminFetcher<AdminUsersResponse>("/api/admin/users");
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
  return adminFetcher<StaffMutationResponse>(`/api/admin/users/${id}/staff`, {
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
  return adminFetcher<SettingsResponse>("/api/admin/settings");
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
  return adminFetcher<SettingsResponse & { ok: boolean }>("/api/admin/settings", {
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
  return adminFetcher<AdminReviewsResponse>(`/api/admin/reviews?status=${status}`);
}

/** تأیید/رد/برگشت به صف. تأیید، دیدگاه را روی صفحه‌ی محصول هم می‌آورد. */
export async function setReviewStatus(
  id: number,
  status: "approved" | "rejected" | "pending",
): Promise<ReviewMutationResponse> {
  return adminFetcher<ReviewMutationResponse>(`/api/admin/reviews/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

// ============================================================
// وضعیت سیستم
// ============================================================

/**
 * همه‌ی وضعیتِ سرور در یک درخواست: متریک‌ها، سلامت دیتابیس، بکاپ‌ها،
 * خطاهای هفت روزِ اخیر و رویدادهای اخیرِ پنل.
 *
 * سرور برای همین مسیر `Cache-Control: no-store` می‌گذارد؛ اینجا هم هیچ
 * کشی نمی‌خواهیم — عددِ کهنه در نمای سلامت، گمراه‌کننده است.
 */
export async function getSystemStatus(): Promise<AdminSystemStatus> {
  return adminFetcher<AdminSystemStatus>("/api/admin/system-status");
}

/**
 * سلامتِ دیتابیس، و با `deep` یک `PRAGMA quick_check` واقعی.
 *
 * چرا عمیق پیش‌فرض نیست: quick_check کلِ فایل را می‌خواند. همان مسیر روی
 * مانیتورینگ می‌تواند سرور را زمین بزند، پس فقط با کلیکِ صریحِ مدیر اجرا
 * می‌شود (routes/admin.js → /db-health با `?deep=1`).
 */
export async function getDbHealth(deep = false): Promise<AdminDbHealthResponse> {
  return adminFetcher<AdminDbHealthResponse>(`/api/admin/db-health${deep ? "?deep=1" : ""}`);
}

/**
 * بکاپِ دستی. اگر بکاپِ امروز از قبل باشد، سرور همان را برمی‌گرداند و
 * کاری نمی‌کند (lib/db.js → backupNow یک فایل در روز).
 */
export async function runBackup(): Promise<AdminBackupResponse> {
  return adminFetcher<AdminBackupResponse>("/api/admin/backup", { method: "POST" });
}

// ============================================================
// عمده‌فروشی (B2B)
// ============================================================

/**
 * صفِ درخواست‌های عمده — تازه‌ترین اول، حداکثر ۳۰۰ تا.
 *
 * ⚠️ این مسیر پارامتر ندارد: نه فیلتر وضعیت، نه صفحه‌بندی. سقفِ ۳۰۰ در خودِ
 * سرور است (`listWholesaleRequests(300)` در routes/admin.js:381) و آن‌چه از
 * ۳۰۰ قدیمی‌تر باشد **اصلاً برنمی‌گردد**. پس فیلتر و شمارشِ وضعیت‌ها اینجا
 * سمتِ مرورگر انجام می‌شود و فقط تعداد ردیفِ روی صفحه را کم می‌کند، نه بارِ
 * شبکه را — و اگر روزی ۳۰۰ ردیف برگشت، یعنی ممکن است قدیمی‌ترها گم شده باشند.
 * نمای عمده‌فروشی همین را هشدار می‌دهد.
 */
export async function getWholesaleRequests(): Promise<WholesaleRequestsResponse> {
  return adminFetcher<WholesaleRequestsResponse>("/api/admin/wholesale/requests");
}

/**
 * تغییر وضعیتِ یک درخواست.
 *
 * فقط `new` / `contacted` / `done` قبول می‌شود؛ هر رشته‌ی دیگری ۴۰۰ می‌گیرد
 * (بررسی سمتِ سرور است، نه در UI). `۴۰۴` یعنی درخواست در همین فاصله حذف شده
 * — مثلاً یک مدیرِ دیگر همان را پاک کرده — و باید بی‌خبر از صف برود.
 */
export async function setWholesaleRequestStatus(
  id: number,
  status: WholesaleStatus,
): Promise<{ ok: boolean }> {
  return adminFetcher<{ ok: boolean }>(`/api/admin/wholesale/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/** حذفِ کاملِ درخواست (اسپم/تکراری) — برگشت‌ناپذیر */
export async function deleteWholesaleRequest(id: number): Promise<{ ok: boolean }> {
  return adminFetcher<{ ok: boolean }>(`/api/admin/wholesale/requests/${id}`, {
    method: "DELETE",
  });
}

// ============================================================
// گزارش‌ها
// ============================================================

/**
 * گزارشِ بازه‌ی روزانه: نمودار فروش + برترین‌های کالا و مشتری + سهم دسته‌ها.
 *
 * بازه در سرور به **۷ تا ۳۶۵** محدود می‌شود و `series` همیشه دقیقاً همان
 * تعداد روز است (روزهای بی‌فروش صفر می‌خورند).
 */
export async function getAdminReports(days: number): Promise<AdminReportsResponse> {
  return adminFetcher<AdminReportsResponse>(`/api/admin/reports?days=${days}`);
}

/** گزارشِ ماه‌به‌ماه — ماهِ شمسی، نه میلادی. سقفِ ۲ تا ۳۶ ماه. */
export async function getMonthlySales(months: number): Promise<MonthlySalesResponse> {
  return adminFetcher<MonthlySalesResponse>(`/api/admin/reports/monthly?months=${months}`);
}

/**
 * آدرسِ خروجیِ اکسلِ گزارشِ ماهانه.
 *
 * چرا یک رشته‌ی آدرس و نه تابعِ دانلود: این لینک باید یک **ناوبریِ معمولیِ
 * مرورگر** باشد (مثل نسخه‌ی Express که `location.href` می‌گذاشت)، وگرنه فایل
 * را در حافظه می‌گیریم و باید خودمان blob و لینکِ دانلود بسازیم. چون `/api/*`
 * در next.config.ts به Express پروکسی می‌شود، آدرسِ نسبی هم‌مبدأ است و کوکیِ
 * نشست خودش می‌رود.
 */
export function monthlyCsvHref(months: number): string {
  return `/api/admin/export/monthly.csv?months=${months}`;
}

// ============================================================
// دفتر رویدادها
// ============================================================

/** تازه‌ترین رویدادهای پنل. سرور `limit` را به ۱ تا ۳۰۰ محدود می‌کند. */
export async function getActivity(limit: number): Promise<ActivityResponse> {
  return adminFetcher<ActivityResponse>(`/api/admin/activity?limit=${limit}`);
}

// ============================================================
// خطاهای سرور
// ============================================================

/**
 * خطاهای گروه‌بندی‌شده.
 *
 * بازه به ۱۴ روز محدود است (فقط ۱۴ روز لاگ نگه داشته می‌شود) و این یکی از دو
 * مسیری است که کارمند هم از آن ۴۰۳ می‌گیرد — پس نمای خطاها باید ۴۰۳ را
 * «دسترسی نداری» ترجمه کند، نه «خطای سرور».
 */
export async function getAdminErrors(days: number): Promise<AdminErrorsResponse> {
  return adminFetcher<AdminErrorsResponse>(`/api/admin/errors?days=${days}`);
}

// ============================================================
// محصولات — فهرستِ کامل و تبدیلِ شکلِ خامِ سرور
// ============================================================
// نمای انبار برای ویرایشِ روزمره (قیمت/موجودی) به `/inventory` تکیه می‌کند، ولی
// فرمِ کاملِ محصول به این‌ها نیاز دارد. تفاوتِ مهم: `/inventory` ردیف‌ها را با
// `soldQty`/`revenue` تزئین می‌کند و `/products` خام است — ولی هر دو `images` و
// `specs` را **رشته‌ی JSON** برمی‌گردانند، نه آرایه (routes/admin.js:1010 هم
// همان‌جا مجبور است `JSON.parse` بزند). این تبدیل فقط همین یک جا انجام می‌شود.

type RawProductRow = Pick<
  InventoryRow,
  | "id" | "title" | "category" | "description" | "price" | "stock" | "badge"
  | "icon" | "image" | "images" | "specs" | "old_price" | "published"
  | "wholesale_min_qty" | "wholesale_discount" | "created_at" | "updated_at"
>;

function parseJsonArr<T>(s: unknown): T[] {
  if (Array.isArray(s)) return s as T[];
  try {
    const a = JSON.parse(String(s ?? "[]"));
    return Array.isArray(a) ? (a as T[]) : [];
  } catch {
    return [];
  }
}

/** ردیفِ خامِ سرور → شکلِ نرمال‌شده‌ی فرم (`old_price` → `oldPrice`، رشته → آرایه) */
export function toAdminProduct(row: RawProductRow): AdminProduct {
  const images = parseJsonArr<string>(row.images).filter((s) => typeof s === "string" && s);
  const specs = parseJsonArr<{ k?: string; v?: string }>(row.specs)
    .map((r) => ({ k: String(r?.k ?? ""), v: String(r?.v ?? "") }))
    .filter((r) => r.k && r.v);
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
    description: String(row.description ?? ""),
    price: Number(row.price) || 0,
    oldPrice: Number(row.old_price) || 0,
    stock: Number(row.stock) || 0,
    badge: String(row.badge ?? ""),
    icon: String(row.icon ?? ""),
    image: row.image ? String(row.image) : null,
    images,
    specs,
    wholesaleMinQty: Number(row.wholesale_min_qty) || 0,
    wholesaleDiscount: Number(row.wholesale_discount) || 0,
    published: Number(row.published) === 1,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/** فهرستِ کاملِ کالاها (شاملِ پیش‌نویس‌ها) — `/products` و نه `/inventory` */
export async function getAdminProducts(): Promise<AdminProductsResponse> {
  const data = await adminFetcher<AdminProductsResponse & { products: RawProductRow[] }>(
    "/api/admin/products",
  );
  return { ...data, products: (data.products || []).map(toAdminProduct) };
}

/**
 * ساختِ کالای تازه.
 *
 * ⚠️ کالای ساخته‌شده همیشه **منتشرنشده** است و قیمتش هر چه بفرستی همان می‌ماند.
 * مسیرِ انتشار جداست (`setProductPublished`) و دو نگهبان دارد: کالای بی‌عکس
 * (۴۰۹ با `needsConfirm`) و کالای صفر تومان (۴۰۰).
 */
export async function createProduct(
  input: ProductCreateInput,
): Promise<ProductMutationResponse> {
  return adminFetcher<ProductMutationResponse>("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * حذفِ کالا.
 *
 * ⚠️ پاسخ دو حالت دارد: `deleted: true` (سطر رفت) و `deleted: false` (کالا
 * سابقه‌ی سفارش دارد و فقط ناموجود شد — `adminDeleteProductTx` در lib/db.js
 * هیچ‌وقت کالایی که در سفارشِ ثبت‌شده هست را پاک نمی‌کند، وگرنه فاکتورهای
 * قدیمی به کالای ناموجود اشاره می‌کردند). پیامِ UI باید همین تفاوت را بگوید.
 */
export async function deleteProduct(id: number): Promise<ProductDeleteResponse> {
  return adminFetcher<ProductDeleteResponse>(`/api/admin/products/${id}`, {
    method: "DELETE",
  });
}

/**
 * عملیات گروهی روی چند کالا — یک تراکنش.
 *
 * `value` برای بعضی عملیات لازم است و برای بعضی بی‌معنی (سرور خودش چک می‌کند
 * و ۴۰۰ می‌دهد). قاعده‌ی نگاشتِ عملیات → «مقدار لازم دارد یا نه» در
 * `lib/productBulk.ts` است، نه اینجا، تا فرم و آزمون هر دو یک منبع داشته باشند.
 */
export async function bulkProducts(
  ids: number[],
  op: string,
  value?: string | number,
): Promise<ProductBulkResponse> {
  return adminFetcher<ProductBulkResponse>("/api/admin/products/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, op, value }),
  });
}

// ============================================================
// آپلود عکس
// ============================================================
// این یکی عمداً از `fetcher` رد نمی‌شود و دو تفاوت دارد:
//
//   ۱. بدنه‌ی خام (خودِ فایل) و `Content-Type` واقعی‌اش — نه JSON. `fetcher`
//      هدرِ `application/json` را روی همه‌چیز می‌گذارد و اینجا ۴۱۵ می‌شد.
//   ۲. بدونِ مهلتِ ۱۵ ثانیه‌ای `fetcher`: فایل تا ۲ مگابایت است و روی اینترنتِ
//      موبایلِ مغازه به‌سختی در ۱۵ ثانیه جا می‌شود. آپلودِ نیمه‌کاره‌ی لغوشده
//      برای کاربر «هیچ اتفاقی نیفتاد» به‌نظر می‌رسد.
//
// سدِ CSRF سمتِ Express به هدر `Origin` نگاه می‌کند و مرورگر روی POST همان را
// خودش می‌فرستد (روی مبدأِ Next)، پس چیزی لازم نیست.
export async function uploadImage(file: File): Promise<UploadImageResponse> {
  const res = await fetch(`${apiBase()}/api/admin/upload-image`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    reason?: string;
  } & Partial<UploadImageResponse>;
  if (!res.ok) {
    // پیام‌های سرور اینجا واقعاً دقیق‌اند («بزرگ‌ترین ضلع باید حداکثر ۴۰۰۰
    // پیکسل باشد»، «حداقل ۸۰ پیکسل لازم است»)، پس همان متن نشان داده می‌شود.
    throw new ApiError(res.status, data.error || "آپلود عکس انجام نشد", data.reason);
  }
  if (!data.path) throw new ApiError(500, "مسیر عکس از سرور نیامد");
  return data as UploadImageResponse;
}

/**
 * نسخه‌ی کوچکِ عکس برای فهرست‌ها — همان کاری که `PG.thumb` در نسخه‌ی Express
 * می‌کرد. `?w=` را خودِ Express (lib/webp-negotiate.js) می‌فهمد و با هدرِ
 * `Accept` مرورگر نسخه‌ی WebP سبک را می‌دهد.
 *
 * چرا لازم است: فهرستِ انبار تا امروز `<img src={p.image}>` می‌گذاشت، یعنی یک
 * عکسِ ۳۰۰ کیلوبایتی برای کادرِ ۴۴ پیکسلی دانلود می‌شد. با بیست‌وچند ردیف روی
 * اینترنتِ موبایل، همان چیزی است که پنل را کند می‌کند.
 */
export function thumbUrl(image: string | null | undefined, w = 320): string {
  const p = String(image || "");
  if (!p) return "";
  return p.includes("?") ? `${p}&w=${w}` : `${p}?w=${w}`;
}

// ============================================================
// خروجی‌های CSV
// ============================================================
// همه‌شان یک الگو دارند: این‌ها **ناوبریِ معمولیِ مرورگر**اند و نه درخواستِ
// fetch، چون مرورگر باید هدرِ `Content-Disposition` را ببیند تا پنجره‌ی
// «ذخیره‌ی فایل» باز شود. (buildِ blob روی سافاریِ موبایل قابل‌اعتماد نیست.)

/**
 * خروجیِ سفارش‌ها با **همان فیلترهای روی صفحه** — عیناً همان پارامترهایی که
 * `getAdminOrders` می‌فرستد، تا فایلی که مدیر می‌گیرد با چیزی که می‌بیند یکی
 * باشد (وگرنه «چرا این سفارش در اکسل نیست؟» بی‌جواب می‌ماند).
 */
export function ordersCsvHref(
  params: { status?: string; q?: string; from?: string; to?: string } = {},
): string {
  const sp = new URLSearchParams();
  sp.set("status", params.status || "all");
  if (params.q) sp.set("q", params.q);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  return `/api/admin/export/orders.csv?${sp.toString()}`;
}

/** مشتری‌ها — `buyers=1` یعنی فقط کسانی که خرید موفق دارند (همان فیلترِ صفحه) */
export function customersCsvHref(onlyBuyers = false): string {
  return `/api/admin/export/customers.csv${onlyBuyers ? "?buyers=1" : ""}`;
}

/** انبار — ستونِ «کافی برای چند روز» همان چیزی است که این فایل را می‌ارزد */
export function inventoryCsvHref(): string {
  return "/api/admin/export/inventory.csv";
}

// دوباره صادر می‌شود تا کامپوننت‌ها یک مسیرِ import داشته باشند
export type { AdminOrder, AdminReview, InventoryRow } from "./adminTypes";
