"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { apiBase } from "./site";

// هشدار: این اکشن‌ها فعلاً از هیچ کامپوننتی صدا زده نمی‌شوند. کامپوننت‌های سبد و
// پرداخت مسیرِ کلاینتیِ `lib/api.ts` را می‌روند. اینجا نگه داشته شده‌اند تا اگر
// سبد به Server Action منتقل شد، آماده باشد.

async function serverFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // نشستِ Express روی کوکیِ polasco.sid است و fetchِ سمتِ سرور هیچ کوکی‌ای را
  // خودکار حمل نمی‌کند. بدونِ این خط، هر اکشن یک نشستِ ناشناسِ تازه می‌ساخت و
  // «افزودن به سبد» به سبدی می‌رفت که کاربر هرگز نمی‌بیندش.
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "خطای سرور");
  }

  return res.json();
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