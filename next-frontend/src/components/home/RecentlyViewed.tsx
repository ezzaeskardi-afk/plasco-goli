"use client";

import { useEffect, useState } from "react";
import { getProductsByIds } from "@/lib/api";
import { getRecentIds } from "@/lib/recent";
import { ProductCardGrid } from "@/components/ProductCard";
import type { Product } from "@/lib/types";

// ============================================================
// «اخیراً دیده‌شده» — همتای بخشِ recently-viewed در main.js:691
// ============================================================
// شناسه‌ها در localStorage ذخیره می‌شوند (lib/recent.ts) و محصولات همین‌جا،
// موقعِ نمایش، تازه گرفته می‌شوند — قیمت/موجودیِ کهنه هرگز نشان داده نمی‌شود.
// تا داده نیامده بخش مخفی است تا صفحه نپرد.

export function RecentlyViewed({ exceptId }: { exceptId?: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const ids = getRecentIds(exceptId).slice(0, 6);
    if (!ids.length) {
      setChecked(true);
      return;
    }
    let alive = true;
    getProductsByIds(ids)
      .then((res) => {
        if (!alive) return;
        setProducts(res.products || []);
        setChecked(true);
      })
      .catch(() => {
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [exceptId]);

  if (!checked || products.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-16">
      <h2 className="text-xl md:text-2xl font-extrabold text-ink mb-6">
        <span className="text-teal">↺</span> اخیراً دیده‌اید
      </h2>
      <ProductCardGrid products={products} />
    </section>
  );
}
