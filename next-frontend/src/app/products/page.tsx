import { Suspense } from "react";
import { getProducts, getFacets } from "@/lib/api";
import { ProductCardGrid } from "@/components/ProductCard";
import { FilterBar } from "@/components/FilterBar";
import type { Product } from "@/lib/types";

// ============================================================
// تایپ‌های page params
// ============================================================
interface ProductsPageProps {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    inStockOnly?: string;
    q?: string;
  }>;
}

// ============================================================
// SSR — داده‌ها از Express API
// ============================================================
async function getProductsData(searchParams: ProductsPageProps["searchParams"]) {
  const params = await searchParams;

  const [productsRes, facets] = await Promise.all([
    getProducts({
      page: params.page ? Number(params.page) : 1,
      sort: params.sort,
      category: params.category,
      minPrice: params.minPrice ? Number(params.minPrice) : undefined,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
      inStockOnly: params.inStockOnly === "1",
      search: params.q,
    }).catch(() => null),
    getFacets().catch(() => null),
  ]);

  return { productsRes, facets };
}

// ============================================================
// تابع کمکی: اعداد فارسی
// ============================================================
function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

// ============================================================
// کامپوننت‌های صفحه
// ============================================================

function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form method="get" action="/products" className="relative">
      <input
        type="text"
        name="q"
        defaultValue={defaultValue || ""}
        placeholder="جستجوی محصول..."
        className="w-full rounded-full py-3 pr-12 pl-4 text-sm outline-none transition-all"
        style={{
          background: "var(--color-surface-2)",
          color: "var(--color-ink)",
          border: "1.5px solid var(--color-line-control)",
        }}
      />
      <button
        type="submit"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-teal transition-colors"
        aria-label="جستجو"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" />
          <path d="M14 14l4 4" />
        </svg>
      </button>
    </form>
  );
}

function FilterBarFallback() {
  return (
    <div
      className="rounded-full px-4 py-1.5 text-xs text-ink-dim"
      style={{ background: "var(--color-surface)" }}
    >
      بارگذاری فیلترها...
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const buildUrl = (p: number) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("page", String(p));
    return `/products?${sp.toString()}`;
  };

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-8">
      {page > 1 && (
        <a
          href={buildUrl(page - 1)}
          className="rounded-full w-9 h-9 flex items-center justify-center text-sm font-medium transition-colors"
          style={{
            background: "var(--color-surface)",
            color: "var(--color-ink-soft)",
          }}
        >
          ←
        </a>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`dots-${i}`}
            className="w-9 h-9 flex items-center justify-center text-sm text-ink-dim"
          >
            ...
          </span>
        ) : (
          <a
            key={p}
            href={buildUrl(p)}
            className="rounded-full w-9 h-9 flex items-center justify-center text-sm font-medium transition-colors"
            style={{
              background:
                p === page
                  ? "var(--color-teal)"
                  : "var(--color-surface)",
              color: p === page ? "#04211B" : "var(--color-ink-soft)",
            }}
          >
            {toFa(p)}
          </a>
        ),
      )}
      {page < totalPages && (
        <a
          href={buildUrl(page + 1)}
          className="rounded-full w-9 h-9 flex items-center justify-center text-sm font-medium transition-colors"
          style={{
            background: "var(--color-surface)",
            color: "var(--color-ink-soft)",
          }}
        >
          →
        </a>
      )}
    </div>
  );
}

// ============================================================
// صفحهٔ محصولات
// ============================================================
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { productsRes, facets } = await getProductsData(searchParams);
  const params = await searchParams;

  const products: Product[] = productsRes?.products || [];
  const meta = productsRes?.meta;
  const page = meta?.page || 1;
  const totalPages = meta?.pages || 1;
  const total = meta?.total || 0;
  const categories = facets?.categories || [];

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-ink-dim mb-6">
        <a href="/" className="hover:text-teal transition-colors">
          خانه
        </a>
        <span>/</span>
        <span className="text-ink-soft">محصولات</span>
      </div>

      {/* عنوان + جستجو */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">محصولات</h1>
          {total > 0 && (
            <p className="text-xs text-ink-dim mt-1">
              {toFa(total)} محصول پیدا شد
            </p>
          )}
        </div>
        <div className="w-full md:w-72">
          <SearchBar defaultValue={params.q} />
        </div>
      </div>

      {/* فیلترها — کلاینت کامپوننت با Suspense */}
      <div className="mb-6">
        <Suspense fallback={<FilterBarFallback />}>
          <FilterBar
            currentSort={params.sort}
            currentCategory={params.category}
            currentInStockOnly={params.inStockOnly === "1"}
            categories={categories}
            minPrice={facets?.minPrice}
            maxPrice={facets?.maxPrice}
          />
        </Suspense>
      </div>

      {/* گرید محصولات */}
      {products.length > 0 ? (
        <ProductCardGrid products={products} />
      ) : (
        <div className="text-center py-16">
          <p className="text-ink-soft text-sm mb-3">
            محصولی با این مشخصات پیدا نشد.
          </p>
          <a
            href="/products"
            className="inline-block rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: "var(--color-teal-tint)",
              color: "var(--color-teal)",
            }}
          >
            پاک کردن فیلترها
          </a>
        </div>
      )}

      {/* صفحه‌بندی */}
      <Pagination
        page={page}
        totalPages={totalPages}
        searchParams={params as Record<string, string>}
      />
    </div>
  );
}