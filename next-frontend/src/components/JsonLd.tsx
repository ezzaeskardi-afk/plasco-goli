// ============================================================
// JSON-LD — دقیقاً مطابق با Express (همان schemaها، همان داده‌ها)
// ============================================================

import {
  SITE_URL,
  SHOP_NAME,
  OG_IMAGE,
  SHOP_PHONE,
  STORE_ADDRESS,
  publicImagePath,
} from "@/lib/site";
import { HOME_FAQ, type FaqItem } from "@/lib/faq";

/* ---------- درجِ ایمنِ JSON-LD داخلِ صفحه ----------
   ASVS 5.0.0 — بندِ ۱.۲.۱: خروجی باید متناسب با بافتِ خودش رمزگذاری شود؛ اینجا
   بافت داخلِ یک عنصرِ `<script>` است (نه متنِ معمولی که React خودش فرار می‌دهد).

   چرا لازم است: دادهٔ این اسکیماها — نام و توضیحِ محصول، پرسش‌های متداول — از
   پنل مدیریت می‌آید، یعنی ورودیِ کاربر است. `JSON.stringify` تنها `"` و `\` را
   فرار می‌دهد و `<` را دست‌نخورده می‌گذارد، پس یک نامِ محصولِ حاویِ
   `</script><script>…` رشته را می‌بست و اسکریپت در مرورگرِ بازدیدکننده اجرا
   می‌شد. با `\u003c` همان داده فرستاده می‌شود (JSON معتبر است و گوگل هیچ
   تفاوتی نمی‌بیند) ولی اسکریپت با آن دیگر بسته نمی‌شود. */
export function safeJsonLd(ld: unknown): string {
  return JSON.stringify(ld)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/* ---------- Store (صفحه اصلی) ---------- */
export function StoreJsonLd({
  shopPhone,
  shopAddress,
}: {
  /** تلفنِ فروشگاه از تنظیماتِ پنل؛ خالی/غایب → ثابتِ اوراکل (`SHOP_PHONE`). */
  shopPhone?: string;
  /** نشانیِ فروشگاه از تنظیماتِ پنل؛ خالی/غایب → ثابتِ اوراکل (`STORE_ADDRESS`). */
  shopAddress?: string;
}) {
  // این بلوک عیناً از `index.html` نسخه‌ی Express می‌آید — با همان کلیدها و
  // همان مقادیر. اندازه‌گیریِ زنده نشان داد پرتِ اولیه‌ی Next چهار میدان را
  // جا انداخته بود (telephone، currenciesAccepted، paymentAccepted، نشانیِ
  // کامل) و یک میدان را **غلط** گفته بود: `openingHours` را تا ۱۸:۰۰ می‌بست
  // در حالی که متنِ خودِ فروشگاه — هم در Express و هم در پرتِ Next —
  // «شنبه تا پنجشنبه، ۹ صبح تا ۸ شب» است. یعنی دادهٔ ساختاریافته با صفحهٔ
  // تماس تناقض داشت؛ همان چیزی که گوگل برایش هشدار می‌دهد.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Store",
    // `@id` نقطهٔ اتصالِ بقیهٔ اسکیماهاست: `WebSite.publisher` و
    // `CollectionPage.isPartOf` به همین ارجاع می‌دهند (در Express هم بود).
    "@id": `${SITE_URL}/#store`,
    name: SHOP_NAME,
    url: `${SITE_URL}/`,
    description:
      "فروشگاه تخصصی لوازم پلاستیکی خانه؛ تشت، صندلی، ظروف نگهداری، سبد و لوازم آشپزخانه و حمام.",
    image: `${SITE_URL}${OG_IMAGE}`,
    // تلفن/نشانی از تنظیماتِ پنل می‌آید و نبودش به همان ثابتِ اوراکلِ Express
    // برمی‌گردد. قبلاً هر دو هاردکد بودند: مدیر شماره یا نشانی را از پنل عوض
    // می‌کرد ولی داده‌ی ساختاریافته هنوز مالِ قبل را به گوگل می‌گفت — تناقضی
    // که خودِ گوگل برایش هشدار می‌دهد. (پیش‌فرضِ تنظیمات خالی است، پس هر
    // فروشگاهی که این‌ها را ویرایش نکرده باشد دقیقاً همان اوراکل را می‌گیرد.)
    telephone: shopPhone?.trim() || SHOP_PHONE,
    // priceRange باید بازه‌ی قیمت باشد نه کدِ ارز (قبلاً "IRR" بود، که
    // بی‌معنی است — ارز جای خودش در Offer.priceCurrency آمده). `$$` همان
    // مقداری است که Express می‌داد و گوگل هم همین شکل را مستند کرده.
    priceRange: "$$",
    currenciesAccepted: "IRR",
    paymentAccepted: "پرداخت آنلاین زرین‌پال",
    address: shopAddress?.trim()
      ? {
          "@type": "PostalAddress",
          // تنظیمات یک متنِ آزاد است؛ به‌عنوان خیابان می‌نشیند و شهر/کشور
          // مثل اوراکل می‌مانند تا اسکیما معتبر بماند.
          streetAddress: shopAddress.trim(),
          addressLocality: STORE_ADDRESS.addressLocality,
          addressCountry: STORE_ADDRESS.addressCountry,
        }
      : { "@type": "PostalAddress", ...STORE_ADDRESS },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
      ],
      opens: "09:00",
      closes: "20:00",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}

/* ---------- WebSite (صفحه اصلی) ---------- */
export function WebSiteJsonLd() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SHOP_NAME,
    url: `${SITE_URL}/`,
    inLanguage: "fa-IR",
    // ارجاعِ متقابل به همان Store بالا — همان کاری که Express می‌کرد و
    // پایهٔ شناساییِ «فروشگاه» به‌عنوان یک موجودیتِ واحد است.
    publisher: { "@id": `${SITE_URL}/#store` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/products?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}

/* ---------- FAQPage (صفحه اصلی) ---------- */
// ⚠️ از `HOME_FAQ` می‌خواند و نه از یک آرایه‌ی دستی — دلیلش در lib/faq.ts:
// علامت‌گذاریِ FAQ که روی صفحه **دیده نمی‌شود** نقضِ صریحِ راهنمای گوگل است و
// می‌تواند جریمه‌ی اسپم بیاورد. تا امروز همین اتفاق افتاده بود: Next داده‌ی
// ساختاریافته‌ی FAQ داشت ولی بخشِ سوالاتِ متداول را نداشت.
export function FAQPageJsonLd({ items = HOME_FAQ }: { items?: FaqItem[] } = {}) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}

/* ---------- ItemList (محصولات پرفروش صفحه اصلی) ---------- */
export function ItemListJsonLd({
  products,
}: {
  products: { id: number; title: string; image: string | null; price: number; stock: number }[];
}) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_URL}/#top-products`,
    name: `محصولات پرفروش ${SHOP_NAME}`,
    description: "پرفروش‌ترین لوازم پلاستیکی خانه در فروشگاه پلاسکو گلی",
    numberOfItems: products.length,
    itemListOrder: "https://schema.org/ItemListUnordered",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/product/${p.id}`,
      name: p.title,
      image: p.image ? `${SITE_URL}${publicImagePath(p.image)}` : undefined,
      offers: {
        "@type": "Offer",
        price: p.price * 10, // ریال
        priceCurrency: "IRR",
        availability: p.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}

/* ---------- CollectionPage (صفحه محصولات) ---------- */
export function CollectionPageJsonLd({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/products#collection`,
    name,
    description,
    url: `${SITE_URL}/products`,
    inLanguage: "fa-IR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}

/* ---------- Product (صفحه تکی محصول) ---------- */
export function ProductJsonLd({
  product,
  shippingCost,
}: {
  product: {
    id: number;
    title: string;
    description?: string;
    price: number;
    stock: number;
    image: string | null;
    images: string[];
    category: string;
    rating?: { count: number; avg: number } | null;
  };
  /**
   * هزینه‌ی ارسال به **تومان**، از `/api/shop/info` (صفحه‌ی محصول سرورساید
   * واکشی می‌کند). نبودنش — API بالا نبود — یعنی کلِ `shippingDetails` حذف
   * می‌شود؛ اعلامِ کرایه‌ی حدسی بدتر از اعلام نکردن است.
   */
  shippingCost?: number;
}) {
  const productUrl = `${SITE_URL}/product/${product.id}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.title,
    description: product.description || "",
    sku: `PG-${product.id}`,
    url: productUrl,
    category: product.category,
    brand: { "@type": "Brand", name: SHOP_NAME },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "IRR",
      price: product.price * 10,
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: SHOP_NAME },
      // کرایه‌ی اعلامی به گوگل قبلاً عددِ هاردکدِ ۱٬۵۰۰٬۰۰۰ ریال بود، در حالی
      // که کرایه‌ی واقعیِ فروشگاه از تنظیمات می‌آید (پیش‌فرض صفر = ارسال
      // رایگان). یعنی داده‌ی ساختاریافته چیزی می‌گفت که در سبد خرید دیده
      // نمی‌شد — هم سیگنالِ نامعتبر برای گوگل، هم ریسکِ شکایت مشتری. حالا
      // از همان تنظیماتی می‌آید که سبد هم از آن می‌خواند؛ `* 10` یعنی ریال
      // (قیمتِ خودِ محصول هم همین تبدیل را دارد).
      ...(typeof shippingCost === "number"
        ? {
            shippingDetails: {
              "@type": "OfferShippingDetails",
              shippingRate: {
                "@type": "MonetaryAmount",
                value: shippingCost * 10,
                currency: "IRR",
              },
              shippingDestination: {
                "@type": "DefinedRegion",
                addressCountry: "IR",
              },
            },
          }
        : {}),
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "IR",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
      },
    },
    // `publicImagePath` و نه `encodeURI`: مقدارِ `image` از خودِ API **از قبل
    // کدشده** می‌آید و کدکردنِ دوباره‌اش `%25D8…` می‌ساخت؛ نشانی‌ای که ۴۰۴
    // می‌دهد و گوگل هم همان را از `image` برمی‌دارد.
    image: [
      product.image
        ? `${SITE_URL}${publicImagePath(product.image)}`
        : undefined,
      ...product.images.map((img) =>
        img ? `${SITE_URL}${publicImagePath(img)}` : "",
      ),
    ].filter(Boolean),
    // ستاره‌ها در نتایج گوگل. تنها راهِ رسیدنِ این ستاره‌ها به نتایج است و در
    // نسخه‌ی Next جا افتاده بود (نسخه‌ی Express در server.js:608 و
    // js/product.js:435 هر دو داشتند).
    //
    // شرطِ `count > 0 && avg > 0` عیناً همان شرطِ Express است: schema.org برای
    // AggregateRating با reviewCount صفر خطا می‌دهد و گوگل کلِ داده‌ی ساخت‌یافته
    // را کنار می‌گذارد — یعنی حتی Offer و قیمت هم از دست می‌رفت.
    ...(product.rating && product.rating.count > 0 && product.rating.avg > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating.avg,
            reviewCount: product.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}

/* ---------- BreadcrumbList (صفحه تکی محصول) ---------- */
export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}

/* ---------- WebPage (عمومی) ---------- */
export function WebPageJsonLd({
  name,
  description,
  url,
}: {
  name: string;
  description: string;
  url: string;
}) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url: url.startsWith("http") ? url : `${SITE_URL}${url}`,
    isPartOf: {
      "@type": "WebSite",
      name: SHOP_NAME,
      url: SITE_URL,
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
    />
  );
}