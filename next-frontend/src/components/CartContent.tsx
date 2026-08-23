"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getCart,
  updateCartItem,
  removeFromCart,
  applyCoupon,
  removeCoupon,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { CartResponse } from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(n: number): string {
  return `${toFa(n)} تومان`;
}

export function CartContent() {
  const router = useRouter();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const c = await getCart();
      setCart(c);
      setError("");
    } catch {
      setError("خطا در بارگذاری سبد");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpdateQty = async (productId: number, qty: number) => {
    if (qty < 1) return;
    try {
      const c = await updateCartItem(productId, qty);
      setCart(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  const handleRemove = async (productId: number) => {
    try {
      await removeFromCart(productId);
      const c = await getCart();
      setCart(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponMsg("");
    try {
      const c = await applyCoupon(couponCode.trim());
      setCart(c);
      setCouponMsg("کد تخفیف اعمال شد");
    } catch (err) {
      setCouponMsg(err instanceof ApiError ? err.message : "خطا");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = async () => {
    try {
      const c = await removeCoupon();
      setCart(c);
      setCouponCode("");
      setCouponMsg("");
    } catch (err) {
      setCouponMsg(err instanceof ApiError ? err.message : "خطا");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-soft text-sm mb-4">سبد خریدتون خالیه</p>
        <Link
          href="/products"
          className="inline-block rounded-full px-6 py-2.5 text-sm font-bold transition-colors"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          مشاهدهٔ محصولات
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* ستون اقلام */}
      <div className="lg:col-span-2 space-y-3">
        {cart.items.map((item) => (
          <div
            key={item.productId}
            className="flex gap-3 rounded-[18px] p-3"
            style={{ background: "var(--color-surface)" }}
          >
            {/* تصویر */}
            <div
              className="w-20 h-20 rounded-xl shrink-0 overflow-hidden"
              style={{ background: "var(--color-surface-2)" }}
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: "var(--color-teal-dark)" }}>
                  <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="4" width="16" height="12" rx="3" />
                  </svg>
                </div>
              )}
            </div>

            {/* اطلاعات */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/product/${item.productId}`}
                className="text-sm font-semibold leading-snug line-clamp-1 hover:text-teal transition-colors"
                style={{ color: "var(--color-ink)" }}
              >
                {item.title}
              </Link>

              {item.notice && (
                <p className="text-[11px] mt-0.5" style={{ color: "var(--color-coral)" }}>
                  {item.notice}
                </p>
              )}

              <div className="flex items-center justify-between mt-2">
                {/* کنترل تعداد */}
                <div
                  className="flex items-center rounded-full overflow-hidden"
                  style={{
                    border: "1px solid var(--color-line)",
                    background: "var(--color-surface-2)",
                  }}
                >
                  <button
                    onClick={() => handleUpdateQty(item.productId, item.qty + 1)}
                    disabled={item.qty >= item.maxQty}
                    className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors hover:bg-teal-tint disabled:opacity-30"
                    style={{ color: "var(--color-teal)" }}
                  >
                    +
                  </button>
                  <span className="w-8 text-center text-xs font-bold" style={{ color: "var(--color-ink)" }}>
                    {toFa(item.qty)}
                  </span>
                  <button
                    onClick={() => item.qty > 1 ? handleUpdateQty(item.productId, item.qty - 1) : handleRemove(item.productId)}
                    className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors hover:bg-coral-tint"
                    style={{ color: "var(--color-coral)" }}
                  >
                    {item.qty > 1 ? "−" : (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 5l10 10M15 5l-10 10" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* قیمت */}
                <div className="text-right">
                  {item.discountPercent > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-extrabold" style={{ color: "var(--color-teal)" }}>
                        {toToman(item.price)}
                      </span>
                      <span className="text-[11px] line-through" style={{ color: "var(--color-ink-dim)" }}>
                        {toToman(item.oldPrice)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold" style={{ color: "var(--color-ink-soft)" }}>
                      {toToman(item.price)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ستون جمع */}
      <div className="lg:col-span-1">
        <div
          className="rounded-[18px] p-4 sticky top-[130px]"
          style={{ background: "var(--color-surface)" }}
        >
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--color-ink)" }}>
            خلاصهٔ سفارش
          </h3>

          {/* کوپن */}
          {cart.coupon ? (
            <div className="flex items-center justify-between mb-3 text-xs">
              <span style={{ color: "var(--color-teal)" }}>
                کد تخفیف: {cart.coupon}
              </span>
              <button
                onClick={handleRemoveCoupon}
                className="underline"
                style={{ color: "var(--color-ink-dim)" }}
              >
                حذف
              </button>
            </div>
          ) : (
            <div className="flex gap-1 mb-3">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="کد تخفیف"
                className="flex-1 rounded-full px-3 py-1.5 text-xs outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line-control)",
                }}
              />
              <button
                onClick={handleApplyCoupon}
                disabled={couponLoading || !couponCode.trim()}
                className="rounded-full px-3 py-1.5 text-xs font-bold"
                style={{
                  background: "var(--color-teal-tint)",
                  color: "var(--color-teal)",
                }}
              >
                {couponLoading ? "..." : "اعمال"}
              </button>
            </div>
          )}
          {couponMsg && (
            <p
              className="text-[11px] mb-2"
              style={{
                color: couponMsg.includes("اعمال") ? "var(--color-teal)" : "var(--color-coral)",
              }}
            >
              {couponMsg}
            </p>
          )}

          {/* ردیف‌های مالی */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between" style={{ color: "var(--color-ink-soft)" }}>
              <span>جمع اقلام</span>
              <span>{toToman(cart.total)}</span>
            </div>
            {cart.discount > 0 && (
              <div className="flex justify-between" style={{ color: "var(--color-teal)" }}>
                <span>تخفیف</span>
                <span>-{toToman(cart.discount)}</span>
              </div>
            )}
            <div className="flex justify-between" style={{ color: "var(--color-ink-soft)" }}>
              <span>هزینه ارسال</span>
              <span>
                {cart.shippingFee === 0 ? (
                  <span style={{ color: "var(--color-teal)" }}>رایگان</span>
                ) : (
                  toToman(cart.shippingFee)
                )}
              </span>
            </div>
            {cart.freeShippingGap > 0 && (
              <div className="text-center py-1.5 rounded-full text-[11px]" style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}>
                {toToman(cart.freeShippingGap)} تا ارسال رایگان
              </div>
            )}
            <div
              className="flex justify-between text-sm font-extrabold pt-2"
              style={{
                borderTop: "1px solid var(--color-line)",
                color: "var(--color-ink)",
              }}
            >
              <span>قابل پرداخت</span>
              <span>{toToman(cart.payable)}</span>
            </div>
          </div>

          {error && (
            <p className="text-xs mt-2" style={{ color: "var(--color-coral)" }}>
              {error}
            </p>
          )}

          <Link
            href="/checkout"
            className="block w-full text-center rounded-full py-3 mt-4 text-sm font-bold transition-colors"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              boxShadow: "var(--shadow-glow-teal)",
            }}
          >
            تکمیل خرید
          </Link>
        </div>
      </div>
    </div>
  );
}