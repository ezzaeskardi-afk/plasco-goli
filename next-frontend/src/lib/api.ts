// ============================================================
// کمک‌کنندهٔ API — SSR (server) و CSR (client)
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      ...init,
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
  TrackOrderResponse,
  OrdersResponse,
  Order,
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
  return fetcher<Product[]>(`/api/products/${id}/related`);
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

export async function addToCart(
  productId: number,
  qty: number = 1,
): Promise<{ added: number; skipped: number[] }> {
  return fetcher("/api/cart/add", {
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

export async function createOrder(data: {
  addressId: number;
  couponCode?: string;
  idempotencyKey: string;
}): Promise<CreateOrderResponse> {
  return fetcher<CreateOrderResponse>("/api/orders", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getOrders(): Promise<OrdersResponse> {
  return fetcher<OrdersResponse>("/api/orders/mine");
}

export async function getOrder(id: number): Promise<Order> {
  return fetcher<Order>(`/api/orders/${id}`);
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