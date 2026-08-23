"use server";

import { revalidatePath } from "next/cache";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function serverFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "خطای سرور");
  }

  return res.json();
}

// این helper برای اینکه بتونیم cookie session رو از کلاینت بگیریم
// در Server Action، cookieها خودکار میان
function getCookieHeader(): string {
  // Server Actions توکن session رو از cookie می‌گیرن
  // اینجا باید از cookies() از next/headers استفاده کنیم
  return "";
}

// ============================================================
// سبد خرید — Server Actions
// ============================================================

export async function addToCartAction(
  productId: number,
  qty: number = 1,
): Promise<{ added: number; skipped: number[]; error?: string }> {
  try {
    const result = await serverFetch<{ added: number; skipped: number[] }>(
      "/api/cart/add",
      { method: "POST", body: JSON.stringify({ productId, qty }) },
    );
    revalidatePath("/cart");
    revalidatePath("/checkout");
    return result;
  } catch (err) {
    return { added: 0, skipped: [productId], error: (err as Error).message };
  }
}

export async function updateCartAction(
  productId: number,
  qty: number,
): Promise<{ error?: string }> {
  try {
    await serverFetch("/api/cart/update", {
      method: "POST",
      body: JSON.stringify({ productId, qty }),
    });
    revalidatePath("/cart");
    revalidatePath("/checkout");
    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function removeFromCartAction(
  productId: number,
): Promise<{ error?: string }> {
  try {
    await serverFetch("/api/cart/remove", {
      method: "POST",
      body: JSON.stringify({ productId }),
    });
    revalidatePath("/cart");
    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function applyCouponAction(
  code: string,
): Promise<{ error?: string }> {
  try {
    await serverFetch("/api/cart/coupon", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    revalidatePath("/cart");
    revalidatePath("/checkout");
    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ============================================================
// Checkout
// ============================================================

export async function createOrderAction(data: {
  addressId: number;
  couponCode?: string;
  idempotencyKey: string;
}): Promise<{ paymentUrl?: string; orderId?: number; error?: string }> {
  try {
    const result = await serverFetch<{
      ok: boolean;
      order?: { id: number };
      paymentUrl?: string;
      error?: string;
      retriable?: boolean;
    }>("/api/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!result.ok && result.error) {
      return { error: result.error };
    }

    revalidatePath("/cart");
    revalidatePath("/account");
    return {
      paymentUrl: result.paymentUrl,
      orderId: result.order?.id,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ============================================================
// بازحساب محصولات بعد از خرید
// ============================================================

export async function revalidateProducts() {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/product");
}