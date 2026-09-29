import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getRelatedProducts, getProducts } from "@/lib/api";
import { ProductDetail } from "@/components/ProductDetail";
import { ProductReviews } from "@/components/ProductReviews";
import { ProductCardGrid } from "@/components/ProductCard";
import { RecentlyViewed } from "@/components/home/RecentlyViewed";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";
import type { Metadata } from "next";

// ISR: هر ۶۰ ثانیه چک می‌کنه، اما تا وقتی تغییری نکرده از کش استفاده می‌کنه
export const revalidate = 60;

// pre-render همه‌ی محصولات در زمانِ build
export async function generateStaticParams() {
  const ids: { id: string }[] = [];
  try {
    // قبلاً حلقه روی «۴ صفحه» ثابت بود و کامنتش «۱۰۰ محصول» می‌گفت — با
    // limit=۱۲ یعنی سقفِ واقعی ۴۸ بود. الان تعدادِ صفحه‌ها را از خودِ API
    // می‌پرسد؛ سقفِ ۵۰ صفحه فقط ترمزِ ایمنی در برابرِ باگِ صفحه‌بندی است.
    for (let page = 1; page <= 50; page++) {
      const data = await getProducts({ page });
      if (!data?.products?.length) break;
      for (const p of data.products) {
        ids.push({ id: String(p.id) });
      }
      if (!data.meta?.hasMore) break;
    }
  } catch {
    // اگر API بالا نبود، لیست خالی برمی‌گردد: هیچ صفحه‌ی محصولی prerender
    // نمی‌شود و همه on-demand ساخته می‌شوند. بیلد عمداً نمی‌شکند، ولی یعنی
    // build با بک‌اندِ خاموش خروجیِ بی‌محصول می‌دهد.
  }
  return ids;
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

  // آدرسِ خالی‌از‌عدد (`/product/abc`) هم باید noindex باشد. قبلاً این شاخه
  // `robots` نداشت و ارثاً **index, follow** می‌گرفت؛ یعنی یک آدرسِ بی‌محتوا
  // (soft-404) به گوگل می‌گفت «من را ایندکس کن» — دقیقاً همان چیزی که وجودِ
  // نسخه‌ی Express با کدِ ۴۱۰ برایش ساخته شده بود.
  if (isNaN(numId)) {
    return { title: "این محصول دیگر موجود نیست", robots: { index: false, follow: true } };
  }

  const product = await getProduct(numId).catch(() => null);
  // عنوانِ محصولِ حذف‌شده از `product-gone.html` می‌آید — همان صفحه‌ای که
  // بدنه‌اش در `product/[id]/not-found.tsx` بازسازی شده است. قبلاً عنوان
  // «محصول پیدا نشد» بود (عنوانِ مسیرِ کلاینتیِ `/product.html?id=`) که با
  // بدنه‌ی نمایش‌داده‌شده نمی‌خوابید.
  if (!product) {
    return { title: "این محصول دیگر موجود نیست", robots: { index: false, follow: true } };
  }

  return {
    // قالبی که Express در `product.js:373` سرِ فرآیندِ کلاینتی می‌گذاشت:
    //
    //     `${p.title} | خرید با قیمت ${money(p.price)} تومان`
    //
    // قیمت داخلِ عنوان دو فایده دارد: در نتایجِ جست‌وجو مشتری همان اول عدد
    // را می‌بیند (و کلیکِ بی‌هدف کمتر می‌شود)، و در تبِ مرورگر بین ده محصولِ
    // باز، همین عدد مشخص می‌کند کدام کدام است. templateِ ریشه « | پلاسکو گلی»
    // را خودش اضافه می‌کند.
    title: `${product.title} | خرید با قیمت ${product.price.toLocaleString("fa-IR")} تومان`,
    description: `خرید ${product.title} با قیمت ${product.price.toLocaleString("fa-IR")} تومان — ارسال سریع از فروشگاه پلاسکو گلی`,
    openGraph: {
      title: product.title,
      description: `خرید ${product.title} از فروشگاه پلاسکو گلی`,
      images: product.image ? [{ url: product.image, width: 600, height: 600 }] : [],
    },
    robots: { index: true, follow: true },
  };
}

// ============================================================
// SSR — داده‌های محصول
// ============================================================
export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const numId = Number(id);

  // هر دو حالت — شناسه‌ی بی‌معنی و محصولِ حذف‌شده — با notFound() جواب
  // می‌گیرند تا متنِ درست (./not-found.tsx) نشان داده شود و آدرس هم عوض نشود.
  // نکته‌ی مهم درباره‌ی کدِ HTTP در همان فایل توضیح داده شده.
  if (isNaN(numId)) {
    notFound();
  }

  const product = await getProduct(numId).catch(() => null);

  if (!product) {
    notFound();
  }

  const related = await getRelatedProducts(numId).catch(() => []);

  return (
    <>
      <ProductJsonLd product={product} />
      <BreadcrumbJsonLd
        items={[
          { name: "خانه", url: "/" },
          { name: "محصولات", url: "/products" },
          { name: product.title, url: `/product/${product.id}` },
        ]}
      />
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

        {/* دیدگاه خریداران */}
        <ProductReviews productId={product.id} />

        {/* محصولات مرتبط — `data-reveal` همتای `#pdRelatedWrap` در
            product.html است. عمداً اینجا هست و نه دورِ `<RecentlyViewed>`:
            آن یکی محتوایش را سمتِ کلاینت از localStorage می‌خواند و تا آن
            لحظه یک المانِ بی‌ارتفاع است. ناظرِ IntersectionObserver روی المانِ
            صفر-ارتفاع هیچ‌وقت فعال نمی‌شود، پس محتوایش برای همیشه نامرئی
            می‌ماند — بدتر از نداشتنِ انیمیشن. */}
        {related.length > 0 && (
          <section data-reveal="" className="mt-16">
            <h2 className="text-xl font-extrabold text-ink mb-6">
              محصولات مرتبط
            </h2>
            <ProductCardGrid products={related.slice(0, 5)} />
          </section>
        )}

        {/* اخیراً دیده‌شده — بدونِ خودِ این محصول (js/product.js:41) */}
        <div className="mt-16">
          <RecentlyViewed exceptId={product.id} />
        </div>
      </div>
    </>
  );
}
