"use client";

import type { Product } from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

function toToman(price: number): string {
  return `${toFa(price)} تومان`;
}

export function ProductCard({ product }: { product: Product }) {
  const outOfStock = product.stock <= 0;
  const hasDiscount = product.discountPercent > 0 && product.oldPrice > 0;

  return (
    <a
      href={`/product/${product.id}`}
      className="group block rounded-[18px] overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{
        background: "var(--color-surface)",
        boxShadow: "var(--shadow)",
      }}
    >
      {/* تصویر */}
      <div className="relative aspect-square overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            width={400}
            height={400}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-6xl"
            style={{ background: "var(--color-surface-2)" }}
          >
            {/* آیکن ساده برای محصولات بدون عکس */}
            <svg
              width="64"
              height="64"
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

        {/* نشان تخفیف */}
        {hasDiscount && (
          <span
            className="absolute top-2 right-2 rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{
              background: "var(--color-coral)",
              color: "var(--color-ink-on-warm)",
            }}
          >
            {toFa(product.discountPercent)}٪
          </span>
        )}

        {/* نا‌موجود */}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-sm font-bold text-gold">ناموجود</span>
          </div>
        )}
      </div>

      {/* بدنهٔ کارت */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* دسته‌بندی */}
        {product.category && (
          <span className="text-[10px] font-medium text-teal">
            {product.category}
          </span>
        )}

        {/* عنوان */}
        <h3
          className="text-sm font-semibold leading-snug line-clamp-2"
          style={{ color: "var(--color-ink)" }}
        >
          {product.title}
        </h3>

        {/* امتیاز */}
        <div className="flex items-center gap-1 min-h-[1.6em]">
          {product.rating != null && product.rating.count > 0 && (
            <>
              <span className="text-xs text-gold">
                {"★".repeat(Math.round(product.rating.avg))}
                {"☆".repeat(5 - Math.round(product.rating.avg))}
              </span>
              <span className="text-[10px] text-ink-dim">
                ({toFa(product.rating.count)})
              </span>
            </>
          )}
        </div>

        {/* قیمت */}
        <div className="mt-auto flex items-baseline gap-1.5">
          {hasDiscount ? (
            <>
              <span className="text-base font-extrabold text-teal">
                {toToman(product.price)}
              </span>
              <span className="text-xs text-ink-dim line-through">
                {toToman(product.oldPrice)}
              </span>
            </>
          ) : (
            <span className="text-base font-extrabold" style={{ color: "var(--color-ink-soft)" }}>
              {toToman(product.price)}
            </span>
          )}
        </div>

        {/* دکمهٔ خرید */}
        {!outOfStock && (
          <button
            className="mt-1 w-full rounded-full py-1.5 text-xs font-bold transition-colors inline-flex items-center justify-center gap-1"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              minHeight: "34px",
            }}
            onClick={(e) => {
              e.preventDefault();
              // TODO: add to cart
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="7" cy="17" r="1.5" />
              <circle cx="15" cy="17" r="1.5" />
              <path d="M2 3h2.5L7 12h8l2-6H5" />
            </svg>
            خرید
          </button>
        )}
      </div>
    </a>
  );
}

/** ProductCard با لینک Next.js (بدون a اضافه) — برای صفحاتی که href خودشان را دارند */
export function ProductCardGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}