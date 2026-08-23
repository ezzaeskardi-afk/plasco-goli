import Link from "next/link";
import { getProduct, getRelatedProducts, getProducts } from "@/lib/api";
import { ProductDetail } from "@/components/ProductDetail";
import { ProductCardGrid } from "@/components/ProductCard";
import type { Metadata } from "next";

// ISR: هر ۶۰ ثانیه چک می‌کنه، اما تا وقتی تغییری نکرده از کش استفاده می‌کنه
export const revalidate = 60;

// pre-render محصولات پرفروش در build time
export async function generateStaticParams() {
  try {
    const data = await getProducts({ page: 1 });
    return (data.products || []).slice(0, 20).map((p) => ({
      id: String(p.id),
    }));
  } catch {
    return [];
  }
}

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

// ============================================================
// متادیتای داینامیک برای SEO
// ============================================================
export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) return { title: "محصول پیدا نشد" };

  const product = await getProduct(numId).catch(() => null);
  if (!product) return { title: "محصول پیدا نشد", robots: { index: false } };

  return {
    title: product.title,
    description: `خرید ${product.title} با قیمت ${product.price.toLocaleString("fa-IR")} تومان — ارسال سریع از فروشگاه پلاسکو گلی`,
    openGraph: {
      title: product.title,
      description: `خرید ${product.title} از فروشگاه پلاسکو گلی`,
      images: product.image ? [{ url: product.image, width: 600, height: 600 }] : [],
    },
    robots: { index: false }, // محصولات با noindex (طبق robots فعلی)
  };
}

// ============================================================
// SSR — داده‌های محصول
// ============================================================
export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const numId = Number(id);

  if (isNaN(numId)) {
    return (
      <div className="mx-auto max-w-[1180px] px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-ink mb-3">محصول پیدا نشد</h1>
        <Link href="/products" className="text-teal text-sm">
          بازگشت به محصولات
        </Link>
      </div>
    );
  }

  const product = await getProduct(numId).catch(() => null);

  if (!product) {
    return (
      <div className="mx-auto max-w-[1180px] px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-ink mb-3">محصول پیدا نشد</h1>
        <p className="text-sm text-ink-soft mb-4">
          این محصول حذف شده یا در دسترس نیست.
        </p>
        <Link
          href="/products"
          className="inline-block rounded-full px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: "var(--color-teal-tint)",
            color: "var(--color-teal)",
          }}
        >
          مشاهدهٔ محصولات
        </Link>
      </div>
    );
  }

  const related = await getRelatedProducts(numId).catch(() => []);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-ink-dim mb-6">
        <Link href="/" className="hover:text-teal transition-colors">
          خانه
        </Link>
        <span>/</span>
        <Link href="/products" className="hover:text-teal transition-colors">
          محصولات
        </Link>
        <span>/</span>
        <span className="text-ink-soft truncate max-w-[200px]">
          {product.title}
        </span>
      </div>

      {/* جزئیات محصول */}
      <ProductDetail product={product} />

      {/* محصولات مرتبط */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-extrabold text-ink mb-6">
            محصولات مرتبط
          </h2>
          <ProductCardGrid products={related.slice(0, 5)} />
        </section>
      )}
    </div>
  );
}