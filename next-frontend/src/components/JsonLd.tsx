// ============================================================
// JSON-LD — دقیقاً مطابق با Express (همان schemaها، همان داده‌ها)
// ============================================================

import { SITE_URL, SHOP_NAME, OG_IMAGE } from "@/lib/site";

/* ---------- Store (صفحه اصلی) ---------- */
export function StoreJsonLd() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: SHOP_NAME,
    url: SITE_URL,
    description:
      "فروشگاه اینترنتی محصولات پلاستیکی با کیفیت — ارسال سریع به سراسر کشور",
    image: `${SITE_URL}${OG_IMAGE}`,
    // telephone عمداً نیست: قبلاً رشته‌ی خالی بود و schema.org برای مقدارِ
    // خالی هشدار می‌دهد. هر وقت شماره‌ی فروشگاه قطعی شد، همین‌جا اضافه شود.
    address: { "@type": "PostalAddress", addressCountry: "IR" },
    openingHours: "Sa-Th 09:00-18:00",
    // priceRange باید بازه‌ی قیمت باشد نه کدِ ارز (قبلاً "IRR" بود، که
    // بی‌معنی است — ارز جای خودش در Offer.priceCurrency آمده).
    priceRange: "۵۰٬۰۰۰ – ۲٬۰۰۰٬۰۰۰ تومان",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

/* ---------- WebSite (صفحه اصلی) ---------- */
export function WebSiteJsonLd() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SHOP_NAME,
    url: SITE_URL,
    inLanguage: "fa-IR",
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

/* ---------- FAQPage (صفحه اصلی) ---------- */
export function FAQPageJsonLd() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "چطور سفارش بدم؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "محصول را به سبد اضافه کنید، با شماره موبایل وارد شوید، آدرس تحویل بدهید و پرداخت کنید.",
        },
      },
      {
        "@type": "Question",
        name: "هزینه ارسال چقدر است؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "ارسال به سراسر کشور. برای سفارش‌های بالای ۳ میلیون تومان رایگان است.",
        },
      },
      {
        "@type": "Question",
        name: "آیا محصولات ضمانت دارند؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "بله، تمام محصولات پلاسکو گلی ضمانت اصل بودن دارند.",
        },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
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
      image: p.image ? `${SITE_URL}${encodeURI(p.image)}` : undefined,
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
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
    name,
    description,
    url: `${SITE_URL}/products`,
    isPartOf: {
      "@type": "WebSite",
      name: SHOP_NAME,
      url: SITE_URL,
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

/* ---------- Product (صفحه تکی محصول) ---------- */
export function ProductJsonLd({
  product,
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
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: 1500000,
          currency: "IRR",
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "IR",
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "IR",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
      },
    },
    image: [
      product.image
        ? `${SITE_URL}${encodeURI(product.image)}`
        : undefined,
      ...product.images.map((img) =>
        img ? `${SITE_URL}${encodeURI(img)}` : "",
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}