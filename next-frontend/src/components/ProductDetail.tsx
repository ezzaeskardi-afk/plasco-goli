"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { useAddToCart } from "@/lib/useAddToCart";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(price: number): string {
  return `${toFa(price)} تومان`;
}

// سقفِ هر قلم در سبد؛ عیناً MAX_QTY_PER_ITEM در backend/routes/cart.js.
// اگر اینجا بیشتر بگذاریم، کاربر عددی را انتخاب می‌کند که سرور رد می‌کند.
const MAX_QTY_PER_ITEM = 99;

export function ProductDetail({ product }: { product: Product }) {
  const outOfStock = product.stock <= 0;
  const hasDiscount = product.discountPercent > 0 && product.oldPrice > 0;

  // سقفِ انتخاب = کمترِ موجودیِ انبار و سقفِ هر قلم. نسخه‌ی Express این را
  // `stock > 0 ? stock : 99` می‌گرفت که برای موجودیِ بالای ۹۹ عددی می‌داد که
  // سرور با ۴۰۹ رد می‌کرد.
  const maxQty = Math.max(1, Math.min(product.stock, MAX_QTY_PER_ITEM));
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addMutation = useAddToCart();

  useEffect(() => {
    return () => {
      if (addTimer.current) clearTimeout(addTimer.current);
    };
  }, []);

  function handleAdd() {
    addMutation.mutate(
      { productId: product.id, qty },
      {
        onSuccess: () => {
          // حالتِ «اضافه شد» ۱٫۲ ثانیه می‌ماند و بعد به حالتِ اول برمی‌گردد —
          // همان زمان‌بندیِ frontend/js/product.js تا دو فرانت‌اند یک حس بدهند.
          setJustAdded(true);
          if (addTimer.current) clearTimeout(addTimer.current);
          addTimer.current = setTimeout(() => setJustAdded(false), 1200);
        },
      },
    );
  }

  const busy = addMutation.isPending;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* گالری تصویر */}
      <div
        className="relative rounded-[26px] overflow-hidden aspect-square"
        style={{ background: "var(--color-surface)" }}
      >
        {product.image ? (
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-8xl"
            style={{ background: "var(--color-surface-2)" }}
          >
            <svg
              width="96" height="96" viewBox="0 0 64 64"
              fill="none" stroke="currentColor" strokeWidth="1"
              style={{ color: "var(--color-teal-dark)" }}
            >
              <rect x="8" y="12" width="48" height="40" rx="6" />
              <path d="M8 28h48" />
              <circle cx="22" cy="44" r="4" />
              <circle cx="42" cy="44" r="4" />
            </svg>
          </div>
        )}
      </div>

      {/* اطلاعات محصول */}
      <div className="flex flex-col gap-4">
        {product.category && (
          <span className="text-xs font-medium text-teal">{product.category}</span>
        )}

        <h1 className="text-2xl md:text-3xl font-extrabold text-ink leading-tight">
          {product.title}
        </h1>

        {product.rating != null && product.rating.count > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-base text-gold">
              {"★".repeat(Math.round(product.rating.avg))}
              {"☆".repeat(5 - Math.round(product.rating.avg))}
            </span>
            <span className="text-sm text-ink-soft">
              {product.rating.avg.toFixed(1)} ({toFa(product.rating.count)} نظر)
            </span>
          </div>
        )}

        <div className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
          {hasDiscount ? (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-teal">{toToman(product.price)}</span>
              <span className="text-sm text-ink-dim line-through">{toToman(product.oldPrice)}</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
              >
                {toFa(product.discountPercent)}٪ تخفیف
              </span>
            </div>
          ) : (
            <span className="text-3xl font-extrabold" style={{ color: "var(--color-ink-soft)" }}>
              {toToman(product.price)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          {outOfStock ? (
            <span className="text-coral font-medium">ناموجود</span>
          ) : product.stock <= 5 ? (
            <span className="text-gold font-medium">فقط {toFa(product.stock)} عدد در انبار</span>
          ) : (
            <span className="text-teal font-medium">موجود در انبار</span>
          )}
        </div>

        {!outOfStock && (
          <>
            {/* انتخابِ تعداد */}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-ink-soft">تعداد:</span>
              <div
                className="inline-flex items-center rounded-full overflow-hidden"
                style={{ border: "1px solid var(--color-line-control)" }}
              >
                <button
                  type="button"
                  aria-label="کاهش تعداد"
                  disabled={qty <= 1}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "var(--color-ink)" }}
                >
                  −
                </button>
                {/* عدد با aria-live خوانده می‌شود، وگرنه کاربرِ صفحه‌خوان بعد از
                    زدنِ + هیچ بازخوردی نمی‌گیرد. */}
                <span
                  aria-live="polite"
                  className="w-10 text-center text-sm font-bold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {toFa(qty)}
                </span>
                <button
                  type="button"
                  aria-label="افزایش تعداد"
                  disabled={qty >= maxQty}
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  className="w-9 h-9 text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "var(--color-ink)" }}
                >
                  +
                </button>
              </div>
              {qty >= maxQty && (
                <span className="text-xs text-ink-dim">
                  حداکثر {toFa(maxQty)} عدد
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              aria-busy={busy}
              className="mt-2 rounded-full py-3 px-8 text-base font-bold transition-all self-start inline-flex items-center gap-2 disabled:cursor-wait"
              style={{
                background: justAdded
                  ? "var(--color-teal-dark)"
                  : "var(--color-teal)",
                color: "#04211B",
                boxShadow: "var(--shadow-glow-teal)",
                opacity: busy ? 0.75 : 1,
              }}
            >
              {justAdded ? (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="7" cy="17" r="1.5" />
                  <circle cx="15" cy="17" r="1.5" />
                  <path d="M2 3h2.5L7 12h8l2-6H5" />
                </svg>
              )}
              {justAdded
                ? "اضافه شد"
                : busy
                  ? "در حال افزودن…"
                  : "افزودن به سبد خرید"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}