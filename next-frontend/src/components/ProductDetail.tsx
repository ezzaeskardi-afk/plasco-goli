"use client";

import type { Product } from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

function toToman(price: number): string {
  return `${toFa(price)} تومان`;
}

export function ProductDetail({ product }: { product: Product }) {
  const outOfStock = product.stock <= 0;
  const hasDiscount = product.discountPercent > 0 && product.oldPrice > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* گالری تصویر */}
      <div
        className="rounded-[26px] overflow-hidden aspect-square"
        style={{ background: "var(--color-surface)" }}
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover"
            width={600}
            height={600}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-8xl"
            style={{ background: "var(--color-surface-2)" }}
          >
            <svg
              width="96"
              height="96"
              viewBox="0 0 64 64"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
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
        {/* دسته‌بندی */}
        {product.category && (
          <span className="text-xs font-medium text-teal">
            {product.category}
          </span>
        )}

        {/* عنوان */}
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink leading-tight">
          {product.title}
        </h1>

        {/* امتیاز */}
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

        {/* قیمت */}
        <div
          className="rounded-[18px] p-4"
          style={{ background: "var(--color-surface)" }}
        >
          {hasDiscount ? (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-teal">
                {toToman(product.price)}
              </span>
              <span className="text-sm text-ink-dim line-through">
                {toToman(product.oldPrice)}
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{
                  background: "var(--color-coral-tint)",
                  color: "var(--color-coral)",
                }}
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

        {/* موجودی */}
        <div className="flex items-center gap-2 text-sm">
          {outOfStock ? (
            <span className="text-coral font-medium">ناموجود</span>
          ) : product.stock <= 5 ? (
            <span className="text-gold font-medium">
              فقط {toFa(product.stock)} عدد در انبار
            </span>
          ) : (
            <span className="text-teal font-medium">موجود در انبار</span>
          )}
        </div>

        {/* دکمهٔ افزودن به سبد */}
        {!outOfStock && (
          <button
            className="mt-2 rounded-full py-3 px-8 text-base font-bold transition-all self-start inline-flex items-center gap-2"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              boxShadow: "var(--shadow-glow-teal)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="7" cy="17" r="1.5" />
              <circle cx="15" cy="17" r="1.5" />
              <path d="M2 3h2.5L7 12h8l2-6H5" />
            </svg>
            افزودن به سبد خرید
          </button>
        )}
      </div>
    </div>
  );
}