"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FacetCategory } from "@/lib/types";

interface FilterBarProps {
  currentSort?: string;
  currentCategory?: string;
  currentInStockOnly?: boolean;
  categories: FacetCategory[];
  minPrice?: number;
  maxPrice?: number;
}

export function FilterBar({
  currentSort,
  currentCategory,
  currentInStockOnly,
  categories,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = (key: string, value: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) {
      sp.set(key, value);
    } else {
      sp.delete(key);
    }
    sp.delete("page");
    router.push(`/products?${sp.toString()}`);
  };

  const toggleInStock = () => {
    const sp = new URLSearchParams(searchParams.toString());
    if (currentInStockOnly) {
      sp.delete("inStockOnly");
    } else {
      sp.set("inStockOnly", "1");
    }
    sp.delete("page");
    router.push(`/products?${sp.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <select
        name="sort"
        value={currentSort || "newest"}
        onChange={(e) => updateParam("sort", e.target.value)}
        className="rounded-full px-3 py-1.5 text-xs font-medium outline-none appearance-none cursor-pointer"
        style={{
          background: "var(--color-surface)",
          color: "var(--color-ink-soft)",
          border: "1px solid var(--color-line)",
        }}
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
  );
}