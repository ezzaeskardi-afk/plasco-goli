// ============================================================
// کمک‌کنندهٔ API — هم برای SSR (server components) و هم CSR
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface FetchOptions extends RequestInit {
  timeout?: number;
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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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
  AuthMeResponse,
  CartResponse,
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
  return fetcher<ProductListResponse>(
    `/api/products${qs ? `?${qs}` : ""}`,
  );
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
// کاربر
// ============================================================

export async function getMe(): Promise<AuthMeResponse> {
  return fetcher<AuthMeResponse>("/api/auth/me");
}

export async function getCart(): Promise<CartResponse> {
  return fetcher<CartResponse>("/api/cart");
}