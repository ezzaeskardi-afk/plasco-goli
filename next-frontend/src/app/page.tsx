import Link from "next/link";
import { getProducts, getCategories, getShopInfo } from "@/lib/api";
import { ProductCardGrid } from "@/components/ProductCard";
import type { Product, ShopCategory } from "@/lib/types";

// ============================================================
// SSR — داده‌ها موقع رندر سرور گرفته می‌شوند
// ============================================================
async function getHomepageData() {
  const [productsRes, categories, shopInfo] = await Promise.all([
    getProducts({ sort: "newest", page: 1 }).catch(() => null),
    getCategories().catch(() => []),
    getShopInfo().catch(() => null),
  ]);

  return {
    products: productsRes?.products?.slice(0, 10) || [],
    categories,
    shopInfo,
  };
}

// ============================================================
// کامپوننت‌های صفحه
// ============================================================

function HeroSection({ banner }: { banner?: string | null }) {
  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      {/* پس‌زمینهٔ هیرو */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(800px 500px at 50% 0%, rgba(37,214,176,0.1), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6 text-center">
        <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">
          <span className="text-teal">پلاسکو گلی</span>
          <br />
          <span className="text-ink">فروشگاه محصولات پلاستیکی</span>
        </h1>
        <p className="text-sm md:text-base text-ink-soft max-w-lg mx-auto mb-6 leading-relaxed">
          محصولات پلاستیکی با کیفیت — از جنس مرغوب، با ضمانت اصل بودن کالا و ارسال
          سریع به سراسر کشور
        </p>

        {/* نوار بنر تبلیغاتی (اگر فعال باشه) */}
        {banner && (
          <div
            className="inline-block rounded-full px-5 py-2 text-sm font-semibold mb-4"
            style={{
              background: "var(--color-gold-tint)",
              color: "var(--color-gold)",
            }}
          >
            {banner}
          </div>
        )}

        {/* دکمه‌های CTA */}
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-bold transition-all"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              boxShadow: "var(--shadow-glow-teal)",
            }}
          >
            مشاهدهٔ محصولات
            <span className="text-lg">←</span>
          </Link>
          <Link
            href="/wholesale"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-bold transition-all"
            style={{
              background: "transparent",
              color: "var(--color-gold)",
              border: "1.5px solid var(--color-gold)",
            }}
          >
            خرید عمده
          </Link>
        </div>
      </div>
    </section>
  );
}

function CategoryBar({ categories }: { categories: ShopCategory[] }) {
  if (!categories.length) return null;

  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-8">
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Link
          href="/products"
          className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
          style={{
            background: "var(--color-teal-tint)",
            color: "var(--color-teal)",
          }}
        >
          همه
        </Link>
        {categories.slice(0, 8).map((cat) => (
          <Link
            key={cat.id}
            href={`/products?category=${encodeURIComponent(cat.name)}`}
            className="shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors"
            style={{
              background: "var(--color-surface)",
              color: "var(--color-ink-soft)",
              border: "1px solid var(--color-line)",
            }}
          >
            {cat.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function BestSellersSection({ products }: { products: Product[] }) {
  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-16">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-extrabold text-ink">
          <span className="text-gold">★</span> پرفروش‌ترین‌ها
        </h2>
        <Link
          href="/products"
          className="text-sm font-medium text-teal hover:text-teal-dark transition-colors"
        >
          همهٔ محصولات ←
        </Link>
      </div>
      <ProductCardGrid products={products} />
    </section>
  );
}

function TrustBadges() {
  const badges = [
    { icon: "✓", text: "ضمانت جنس اصل" },
    { icon: "🚚", text: "ارسال به سراسر کشور" },
    { icon: "🔒", text: "پرداخت امن زرین‌پال" },
  ];

  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-16">
      <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 py-6 rounded-[26px]"
        style={{ background: "var(--color-surface)" }}>
        {badges.map((b) => (
          <div key={b.text} className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <span className="text-teal text-lg">{b.icon}</span>
            {b.text}
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// صفحه اصلی
// ============================================================
export default async function HomePage() {
  const { products, categories, shopInfo } = await getHomepageData();

  return (
    <>
      <HeroSection banner={shopInfo?.announcement || null} />
      <CategoryBar categories={categories} />
      <BestSellersSection products={products} />
      <TrustBadges />
    </>
  );
}