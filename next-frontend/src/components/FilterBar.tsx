"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FacetCategory } from "@/lib/types";

// ارقام فارسی/عربی → لاتین — مشتری با کیبورد فارسی هم بتواند قیمت بنویسد
// (همان normalizeDigits که Express در main.js:466 داشت)
function toEnDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

interface FilterBarProps {
  currentSort?: string;
  currentCategory?: string;
  currentInStockOnly?: boolean;
  currentMinPrice?: number;
  currentMaxPrice?: number;
  categories: FacetCategory[];
  /** ارزان‌ترین و گران‌ترین کالای کاتالوگ — از facets؛ برای hint */
  minPrice?: number;
  maxPrice?: number;
}

export function FilterBar({
  currentSort,
  currentCategory,
  currentInStockOnly,
  currentMinPrice,
  currentMaxPrice,
  categories,
  minPrice,
  maxPrice,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ورودی‌های قیمت رشته‌اند تا کاربر وسطِ تایپ با Number قاطی نشود
  const [minInput, setMinInput] = useState(
    currentMinPrice != null ? String(currentMinPrice) : "",
  );
  const [maxInput, setMaxInput] = useState(
    currentMaxPrice != null ? String(currentMaxPrice) : "",
  );
  const [priceError, setPriceError] = useState("");

  // URL عوض شود (مثلاً با چیپ‌ها یا دکمه‌ی پاک‌کردن) ورودی‌ها همگام بمانند
  useEffect(() => {
    setMinInput(currentMinPrice != null ? String(currentMinPrice) : "");
    setMaxInput(currentMaxPrice != null ? String(currentMaxPrice) : "");
  }, [currentMinPrice, currentMaxPrice]);

  const pushParams = (mutate: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(searchParams.toString());
    mutate(sp);
    sp.delete("page");
    router.push(`/products?${sp.toString()}`);
  };

  const updateParam = (key: string, value: string) => {
    pushParams((sp) => {
      if (value) sp.set(key, value);
      else sp.delete(key);
    });
  };

  const toggleInStock = () => {
    pushParams((sp) => {
      if (currentInStockOnly) sp.delete("inStockOnly");
      else sp.set("inStockOnly", "1");
    });
  };

  // اعمالِ بازه‌ی قیمت — بازه‌ی برعکس خودبه‌خود جابه‌جا می‌شود (main.js:486)
  function applyPrice(e?: React.FormEvent) {
    e?.preventDefault();
    setPriceError("");
    let min = parseInt(toEnDigits(minInput).replace(/\D/g, ""), 10);
    let max = parseInt(toEnDigits(maxInput).replace(/\D/g, ""), 10);
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;
    if (!min && !max) {
      // هر دو خالی = پاک‌کردنِ بازه
      pushParams((sp) => {
        sp.delete("minPrice");
        sp.delete("maxPrice");
      });
      return;
    }
    if (min && max && min > max) [min, max] = [max, min];
    if (min && max && min === max) {
      setPriceError("کمترین و بیشترین قیمت نباید یکی باشند");
      return;
    }
    pushParams((sp) => {
      if (min) sp.set("minPrice", String(min));
      else sp.delete("minPrice");
      if (max) sp.set("maxPrice", String(max));
      else sp.delete("maxPrice");
    });
  }

  const inputStyle = {
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    border: "1px solid var(--color-line)",
  } as const;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          name="sort"
          value={currentSort || "newest"}
          onChange={(e) => updateParam("sort", e.target.value)}
          className="rounded-full px-3 py-1.5 text-xs font-medium outline-none appearance-none cursor-pointer"
          style={inputStyle}
        >
          <option value="newest">جدیدترین</option>
          <option value="price-asc">ارزان‌ترین</option>
          <option value="price-desc">گران‌ترین</option>
          <option value="title">الفبایی</option>
          <option value="stock">موجودی</option>
        </select>

        <button
          onClick={toggleInStock}
          className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: currentInStockOnly
              ? "var(--color-teal-tint)"
              : "var(--color-surface)",
            color: currentInStockOnly
              ? "var(--color-teal)"
              : "var(--color-ink-soft)",
            border: "1px solid var(--color-line)",
          }}
        >
          فقط موجود
        </button>

        {categories.slice(0, 6).map((cat) => {
          const isActive = currentCategory === cat.category;
          return (
            <button
              key={cat.category}
              onClick={() =>
                updateParam("category", isActive ? "" : cat.category)
              }
              className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: isActive
                  ? "var(--color-teal-tint)"
                  : "var(--color-surface)",
                color: isActive
                  ? "var(--color-teal)"
                  : "var(--color-ink-soft)",
                border: "1px solid var(--color-line)",
              }}
            >
              {cat.category}
            </button>
          );
        })}
      </div>

      {/* بازه‌ی قیمت — همتای فیلترِ قیمتِ products.html (products.js:180) */}
      <form onSubmit={applyPrice} className="flex flex-wrap gap-2 items-center">
        <span className="text-[11px] text-ink-dim">قیمت (تومان):</span>
        <input
          type="text"
          inputMode="numeric"
          value={minInput}
          onChange={(e) => setMinInput(e.target.value)}
          placeholder={minPrice ? `از ${new Intl.NumberFormat("fa-IR").format(minPrice)}` : "از"}
          aria-label="کمترین قیمت"
          className="rounded-full px-3 py-1.5 text-xs outline-none w-32"
          style={inputStyle}
        />
        <span className="text-ink-dim text-xs">تا</span>
        <input
          type="text"
          inputMode="numeric"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
          placeholder={maxPrice ? `تا ${new Intl.NumberFormat("fa-IR").format(maxPrice)}` : "تا"}
          aria-label="بیشترین قیمت"
          className="rounded-full px-3 py-1.5 text-xs outline-none w-32"
          style={inputStyle}
        />
        <button
          type="submit"
          className="rounded-full px-3 py-1.5 text-xs font-bold"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          اعمال
        </button>
        {(currentMinPrice != null || currentMaxPrice != null) && (
          <button
            type="button"
            onClick={() =>
              pushParams((sp) => {
                sp.delete("minPrice");
                sp.delete("maxPrice");
              })
            }
            className="text-[11px] text-ink-dim underline"
          >
            حذف بازه
          </button>
        )}
        {priceError && (
          <span className="text-[11px]" style={{ color: "var(--color-coral)" }}>
            {priceError}
          </span>
        )}
      </form>
    </div>
  );
}
