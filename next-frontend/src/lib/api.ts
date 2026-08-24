// ============================================================
// کمک‌کنندهٔ API — SSR (server) و CSR (client)
// ============================================================

import { apiBase } from "./site";

interface FetchOptions extends RequestInit {
  timeout?: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetcher<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { timeout = 15000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${apiBase()}${path}`;
    const res = await fetch(url, {
      ...init,
      // نشستِ Express روی کوکیِ polasco.sid است. بدونِ این، سبد و ورود و
      // سفارش‌ها هر بار کاربرِ ناشناس می‌بینند.
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, err.error || "خطای سرور");
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// صادر کردن fetch خام برای کلاینت که نیاز به cookie دارد
export { fetcher };

// ============================================================
// تایپ‌ها
// ============================================================
import type {
  Product,
  ProductListResponse,
  ProductDetailResponse,
  RelatedProductsResponse,
  ProductReviewsResponse,
  ReviewSubmitResponse,
  FacetResponse,
  ShopInfo,
  ShopCategory,
  CategoriesResponse,
  CartResponse,
  ChallengeResponse,
  OtpRequestResponse,
  OtpVerifyResponse,
  PasswordLoginResponse,
  AuthMeResponse,
  HasPasswordResponse,
  Address,
  CreateOrderResponse,
  OrderDetailResponse,
  ReorderResponse,
  TrackOrderResponse,
  OrdersResponse,
  Order,
  CrmSummary,
  CrmTag,
  CrmCustomerList,
  CrmCustomerDetail,
  CrmAdvancedSummary,
  CrmSegmentStat,
  CrmRevenueMonth,
  CrmTopCustomer,
  WholesaleRequestInput,
  WholesaleRequestResponse,
} from "./types";

// ============================================================
// محصولات
// ============================================================

export async function getProducts(params?: {
  page?: number;
  sort?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  search?: string;
}): Promise<ProductListResponse> {
  const sp = new URLSearchParams();
  if (params?.page && params.page > 1) sp.set("page", String(params.page));
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.category) sp.set("category", params.category);
  if (params?.minPrice != null) sp.set("minPrice", String(params.minPrice));
  if (params?.maxPrice != null) sp.set("maxPrice", String(params.maxPrice));
  if (params?.inStockOnly) sp.set("inStockOnly", "1");
  if (params?.search) sp.set("q", params.search);

  const qs = sp.toString();
  return fetcher<ProductListResponse>(`/api/products${qs ? `?${qs}` : ""}`);
}

export async function getProduct(id: number): Promise<Product> {
  const data = await fetcher<ProductDetailResponse>(`/api/products/${id}`);
  return data.product;
}

export async function getRelatedProducts(id: number): Promise<Product[]> {
  // بک‌اند آرایه را داخلِ `{ products: [...] }` می‌فرستد (routes/products.js:205).
  // نوعِ قبلی `Product[]` بود، پس `related.length` روی آبجکت undefined می‌شد و
  // بخشِ «محصولات مرتبط» در هیچ صفحه‌ی محصولی نشان داده نمی‌شد — بی‌هیچ خطایی،
  // که همین پیدا کردنش را سخت کرده بود.
  const data = await fetcher<RelatedProductsResponse>(
    `/api/products/${id}/related`,
  );
  return data.products ?? [];
}

// ---------- دیدگاه محصول ----------

/**
 * عمومی است، ولی اگر کاربر وارد شده باشد دیدگاهِ خودش را هم برمی‌گرداند —
 * حتی وقتی هنوز تأیید نشده (routes/products.js:210). پس برای فرم باید از
 * سمتِ کلاینت صدا زده شود، وگرنه `myReview` همیشه null می‌آید.
 */
export async function getProductReviews(
  id: number,
): Promise<ProductReviewsResponse> {
  return fetcher<ProductReviewsResponse>(`/api/products/${id}/reviews`);
}

/** ثبت یا ویرایش دیدگاه. بعد از ویرایش دوباره به صفِ تأیید می‌رود. */
export async function submitProductReview(
  id: number,
  data: { rating: number; body: string },
): Promise<ReviewSubmitResponse> {
  return fetcher<ReviewSubmitResponse>(`/api/products/${id}/reviews`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getFacets(): Promise<FacetResponse> {
  return fetcher<FacetResponse>("/api/products/facets");
}

// ============================================================
// فروشگاه
// ============================================================

export async function getShopInfo(): Promise<ShopInfo> {
  return fetcher<ShopInfo>("/api/shop/info");
}

export async function getCategories(): Promise<ShopCategory[]> {
  const data = await fetcher<CategoriesResponse>("/api/shop/categories");
  return data.categories;
}

// ============================================================
// سبد خرید (همه client-side چون cookie نشست لازم داره)
// ============================================================

export async function getCart(): Promise<CartResponse> {
  return fetcher<CartResponse>("/api/cart");
}

// نوعِ خروجی قبلاً `{added, skipped}` نوشته شده بود که **غلط** بود؛ آن شکل
// خروجیِ «افزودنِ گروهی» (سفارشِ مجدد) است. مسیرِ افزودنِ یک محصول در
// backend/routes/cart.js:148 با `res.json(buildCartResponse(req))` جواب می‌دهد،
// یعنی کلِ سبد. همان اشتباهی که در CreateOrderResponse هم بود: نوعِ اعلام‌شده
// چیزی را وعده می‌داد که سرور نمی‌فرستد.
//
// نتیجه‌ی عملیِ درست بودنش: پاسخ را مستقیم می‌شود در کشِ ["cart"] نشاند
// (`setQueryData`) و نشانگرِ سبد در هدر بدون یک درخواستِ اضافه به‌روز می‌شود.
export async function addToCart(
  productId: number,
  qty: number = 1,
): Promise<CartResponse> {
  return fetcher<CartResponse>("/api/cart/add", {
    method: "POST",
    body: JSON.stringify({ productId, qty }),
  });
}

export async function updateCartItem(
  productId: number,
  qty: number,
): Promise<CartResponse> {
  return fetcher("/api/cart/update", {
    method: "POST",
    body: JSON.stringify({ productId, qty }),
  });
}

export async function removeFromCart(
  productId: number,
): Promise<{ ok: boolean }> {
  return fetcher("/api/cart/remove", {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
}

export async function applyCoupon(code: string): Promise<CartResponse> {
  return fetcher("/api/cart/coupon", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function removeCoupon(): Promise<CartResponse> {
  return fetcher("/api/cart/coupon/remove", { method: "POST" });
}

// ============================================================
// احراز هویت
// ============================================================

export async function getChallenge(): Promise<ChallengeResponse> {
  return fetcher<ChallengeResponse>("/api/auth/otp/challenge");
}

export async function requestOtp(
  phone: string,
  challenge: string,
): Promise<OtpRequestResponse> {
  return fetcher<OtpRequestResponse>("/api/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone, challenge }),
  });
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<OtpVerifyResponse> {
  return fetcher<OtpVerifyResponse>("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export async function passwordLogin(
  phone: string,
  password: string,
): Promise<PasswordLoginResponse> {
  return fetcher<PasswordLoginResponse>("/api/auth/password/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
}

export async function saveProfile(
  fullName: string,
): Promise<{ ok: boolean }> {
  return fetcher("/api/auth/profile", {
    method: "POST",
    body: JSON.stringify({ fullName }),
  });
}

export async function getMe(): Promise<AuthMeResponse> {
  return fetcher<AuthMeResponse>("/api/auth/me");
}

export async function hasPassword(
  phone: string,
): Promise<HasPasswordResponse> {
  return fetcher<HasPasswordResponse>("/api/auth/has-password", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function logout(): Promise<{ ok: boolean }> {
  return fetcher("/api/auth/logout", { method: "POST" });
}

// ============================================================
// آدرس‌ها
// ============================================================

export async function getAddresses(): Promise<Address[]> {
  return fetcher<Address[]>("/api/addresses");
}

export async function createAddress(
  data: Omit<Address, "id" | "userId">,
): Promise<Address> {
  return fetcher<Address>("/api/addresses", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteAddress(
  id: number,
): Promise<{ ok: boolean }> {
  return fetcher(`/api/addresses/${id}`, { method: "DELETE" });
}

// ============================================================
// سفارش‌ها
// ============================================================

// کلیدِ یکتای سفارش **باید در هدر** برود، نه در بدنه.
// backend/routes/orders.js:41 آن را با req.get('Idempotency-Key') می‌خواند و
// خط ۴۲ هر چیزی خارج از /^[A-Za-z0-9._:-]{16,128}$/ را رد می‌کند. قبلاً اینجا
// داخلِ JSON فرستاده می‌شد، پس هدر خالی بود و **هر** تلاشِ ثبتِ سفارش با
// ۴۰۰ «کلید یکتای سفارش معتبر نیست» برمی‌گشت — یعنی در نسخه‌ی Next هیچ‌کس
// نمی‌توانست خرید کند.
export async function createOrder(data: {
  addressId: number;
  couponCode?: string;
  idempotencyKey: string;
}): Promise<CreateOrderResponse> {
  const { idempotencyKey, ...body } = data;
  return fetcher<CreateOrderResponse>("/api/orders", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

/**
 * کلیدی می‌سازد که سدِ سمتِ سرور قبولش کند: فقط `[A-Za-z0-9._:-]` و بین ۱۶ تا
 * ۱۲۸ نویسه. همان کاری که frontend/js/checkout.js:212 می‌کرد.
 */
export function newIdempotencyKey(): string {
  const raw =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return raw.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 128).padEnd(16, "0");
}

export async function getOrders(): Promise<OrdersResponse> {
  return fetcher<OrdersResponse>("/api/orders/mine");
}

// بک‌اند سفارش را داخل `{ order }` می‌پیچد (routes/orders.js:314). تایپِ قبلی
// `Promise<Order>` بود، یعنی هر جا استفاده می‌شد فیلدها undefined درمی‌آمدند.
export async function getOrder(id: number): Promise<OrderDetailResponse> {
  return fetcher<OrderDetailResponse>(`/api/orders/${id}`);
}

// سبد را با اقلامِ همان سفارش **جایگزین** می‌کند (ادغام نمی‌کند). کالاهای
// حذف‌شده/ناموجود در `skipped` برمی‌گردند و باید به مشتری نشان داده شوند،
// وگرنه سبدی کمتر از انتظارش می‌بیند و فکر می‌کند سایت خراب است.
export async function reorderOrder(id: number): Promise<ReorderResponse> {
  return fetcher<ReorderResponse>(`/api/orders/${id}/reorder`, {
    method: "POST",
  });
}

export async function trackOrder(
  orderId: number,
  phone: string,
): Promise<TrackOrderResponse> {
  return fetcher<TrackOrderResponse>("/api/orders/track", {
    method: "POST",
    body: JSON.stringify({ orderId, phone }),
  });
}

export async function cancelOrder(
  id: number,
  reason: string,
): Promise<{ ok: boolean }> {
  return fetcher(`/api/orders/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ============================================================
// خرید عمده (B2B)
// ============================================================

// سقفِ سمتِ سرور ۵ درخواست در ساعت است؛ در آن حالت پیامِ ۴۲۹ همان متنِ
// فارسیِ خودِ Express است و مستقیم به کاربر نشان داده می‌شود.
export async function requestWholesale(
  data: WholesaleRequestInput,
): Promise<WholesaleRequestResponse> {
  return fetcher<WholesaleRequestResponse>("/api/wholesale/request", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ============================================================
// CRM (admin)
// ============================================================

export async function crmGetSummary(): Promise<{
  summary: CrmSummary;
  tags: CrmTag[];
}> {
  return fetcher("/api/admin/crm/summary");
}

export async function crmGetCustomers(params?: {
  q?: string;
  tag?: string;
  filter?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<CrmCustomerList> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.tag) sp.set("tag", params.tag);
  if (params?.filter) sp.set("filter", params.filter);
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return fetcher(`/api/admin/crm/customers${qs ? `?${qs}` : ""}`);
}

export async function crmGetCustomer(
  id: number,
): Promise<{ customer: CrmCustomerDetail }> {
  return fetcher(`/api/admin/crm/customers/${id}`);
}

export async function crmAddNote(
  customerId: number,
  body: string,
): Promise<{ note: { id: number; body: string; byName: string; createdAt: string } }> {
  return fetcher(`/api/admin/crm/customers/${customerId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function crmDeleteNote(
  id: number,
): Promise<{ ok: boolean }> {
  return fetcher(`/api/admin/crm/notes/${id}`, { method: "DELETE" });
}

export async function crmAddTask(
  customerId: number,
  title: string,
  dueAt?: string,
): Promise<{ task: { id: number; title: string; done: boolean; dueAt: string | null } }> {
  return fetcher(`/api/admin/crm/customers/${customerId}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title, dueAt: dueAt || null }),
  });
}

export async function crmToggleTask(
  id: number,
  done: boolean,
): Promise<{ task: { id: number; done: boolean } }> {
  return fetcher(`/api/admin/crm/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ done }),
  });
}

export async function crmDeleteTask(
  id: number,
): Promise<{ ok: boolean }> {
  return fetcher(`/api/admin/crm/tasks/${id}`, { method: "DELETE" });
}

export async function crmCreateTag(
  name: string,
  color?: string,
): Promise<{ tag: CrmTag }> {
  return fetcher("/api/admin/crm/tags", {
    method: "POST",
    body: JSON.stringify({ name, color: color || "#25D6B0" }),
  });
}

export async function crmDeleteTag(
  id: number,
): Promise<{ ok: boolean }> {
  return fetcher(`/api/admin/crm/tags/${id}`, { method: "DELETE" });
}

export async function crmSetUserTags(
  customerId: number,
  tagIds: number[],
): Promise<{ ok: boolean }> {
  return fetcher(`/api/admin/crm/customers/${customerId}/tags`, {
    method: "PUT",
    body: JSON.stringify({ tagIds }),
  });
}

export async function crmGetAdvanced(): Promise<{
  summary: CrmAdvancedSummary;
}> {
  return fetcher("/api/admin/crm/advanced");
}

export async function crmGetSegments(): Promise<{
  segments: CrmSegmentStat[];
}> {
  return fetcher("/api/admin/crm/segments");
}

export async function crmGetRevenue(): Promise<{ months: CrmRevenueMonth[] }> {
  return fetcher("/api/admin/crm/revenue");
}

export async function crmGetTopCustomers(
  limit?: number,
): Promise<{ customers: CrmTopCustomer[] }> {
  return fetcher(
    `/api/admin/crm/top${limit ? `?limit=${limit}` : ""}`,
  );
}

export async function crmRecalcCustomer(
  id: number,
): Promise<{ score: unknown }> {
  return fetcher(`/api/admin/crm/customers/${id}/recalc`, {
    method: "POST",
  });
}

export async function crmRecalcAll(): Promise<{
  ok: boolean;
  segments: Record<string, number>;
}> {
  return fetcher("/api/admin/crm/recalc-all", { method: "POST" });
}