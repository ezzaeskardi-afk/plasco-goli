import type { Metadata } from "next";
import { OG_IMAGE, OG_IMAGE_ALT, OG_IMAGE_SIZE, SHOP_NAME } from "@/lib/site";

// ============================================================
// متادیتای اشتراک‌گذاری (og / twitter) — همان چیزی که Express می‌فرستاد
// ============================================================
// چرا یک تابعِ مشترک و نه نوشتنِ دستی در هر صفحه — سه دلیلِ سنجیده:
//
//   ۱) ادغامِ متادیتا در Next **سطحی** است: تا وقتی صفحه‌ای `openGraph` خودش
//      را بدهد، کلِ آبجکتِ `openGraph`ِ layout جایگزین می‌شود — از جمله
//      `siteName` و `locale`. نتیجه‌اش یک واگراییِ واقعی بود: `og:site_name`
//      روی `/products` و `/terms` **غایب** بود در حالی که نسخه‌ی Express آن
//      را داشت، و `og:type` هم هیچ‌کدام نداشتند. پس هر صفحه‌ای که این تابع را
//      صدا بزند، همه‌ی میدان‌ها را با هم می‌آورد.
//
//   ۲) Express برای هر صفحه یک جفت متنِ *جدا* داشت؛ مثلاً در `terms.html`
//      توضیحِ og با توضیحِ twitter فرق می‌کند («…حریم خصوصی در فروشگاه پلاسکو
//      گلی.» در برابر «…حریم خصوصی.»). این تابع هر دو را می‌پذیرد تا وفاداری
//      حفظ شود و کسی مجبور نشود برای همین تفاوت، تابع را دور بزند.
//
//   ۳) `og:type=product` (که Express برای صفحه‌ی محصول می‌فرستاد) در unionِ
//      تایپِ خودِ Next نیست. این محدودیت همین‌جا، یک بار، با کامنت حل می‌شود
//      نه در هر صفحه با یک `as` پراکنده.
//
// اندازه‌گیریِ مرجع: `frontend/index.html`، `products.html`، `terms.html` و
// `wholesale.html` هر چهار تا `og:image` را روی لوگو با پهنای ۵۱۲ و ارتفاعِ
// ۵۱۲ می‌گذاشتند و `og:image:alt` هم برای سه‌تای اول همین متنِ ثابت بود.

// ⚠️ `og:type=product` از این مسیر **نمی‌گذرد**: خودِ Next (در
// `generate/opengraph.js`) روی `type` یک `switch` می‌زند و برای هر مقدارِ
// ناشناس در **زمانِ build** استثنا می‌اندازد — «Invalid OpenGraph type:
// product». یعنی نه فقط تایپ، بلکه اجرا هم `product` را رد می‌کند.
//
// پس `type`ِ این تابع به دو مقدارِ پشتیبانی‌شده محدود است و صفحه‌ی محصول
// `og:type=product` را مثل `product:price:*` به‌صورت یک تگِ واقعی در
// صفحه می‌سازد (React آن را به <head> می‌برد).

export interface SocialOptions {
  /** عنوانِ og — در Express همیشه عنوانِ کاملِ صفحه بود (با « | پلاسکو گلی») */
  title: string;
  /** توضیحِ og */
  description: string;
  /** مسیرِ نسبیِ صفحه برای og:url (با metadataBase مطلق می‌شود) */
  path: string;
  /** اگر twitter عنوانش با og فرق دارد (صفحه‌ی اصلی) */
  twitterTitle?: string;
  /**
   * توضیحِ twitter. `null` یعنی «این تگ را نساز» — چون صفحه‌ی محصول در نسخه‌ی
   * Express هیچ `twitter:description`ی نداشت و ابزارها در نبودش به
   * `og:description` برمی‌گردند. تفاوتِ عمدی با «undefined» که یعنی «همان
   * توضیحِ og را بگذار».
   */
  twitterDescription?: string | null;
  type?: "website" | "article";
  /** کارتِ توییتر؛ پیش‌فرض: عکس دارد → summary_large_image، ندارد → summary */
  card?: "summary" | "summary_large_image";
  /** عکسِ اشتراک‌گذاری؛ پیش‌فرض لوگوی فروشگاه */
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export function pageSocial({
  title,
  description,
  path,
  twitterTitle,
  twitterDescription,
  type = "website",
  card,
  image,
  imageAlt,
  imageWidth,
  imageHeight,
}: SocialOptions): Pick<Metadata, "openGraph" | "twitter"> {
  const ogImage = image || OG_IMAGE;
  const ogImageAlt = imageAlt || OG_IMAGE_ALT;
  // عکسِ محصول ابعادِ واقعی‌اش را در API ندارد؛ پس همان‌طور که Express می‌کرد
  // برای آن width/height اعلام نمی‌شود (عددِ حدسی بدتر از نبودنش است).
  const width = imageWidth ?? (image ? undefined : OG_IMAGE_SIZE.width);
  const height = imageHeight ?? (image ? undefined : OG_IMAGE_SIZE.height);

  return {
    openGraph: {
      // ⚠️ فقط وقتی ساخته می‌شود که مقدار داشته باشد. اگر کلید با
      // `undefined` ساخته شود، `'type' in openGraph` درست است و همان
      // `switch`ِ Next روی `undefined` به `default` می‌افتد و build را
      // می‌شکند — یعنی «نبودنِ کلید» با «کلیدِ undefined» یکی نیست.
      ...(type ? { type } : {}),
      siteName: SHOP_NAME,
      locale: "fa_IR",
      url: path,
      title,
      description,
      images: [{ url: ogImage, width, height, alt: ogImageAlt }],
    },
    twitter: {
      card: card || (image ? "summary_large_image" : "summary"),
      title: twitterTitle || title,
      ...(twitterDescription === null
        ? {}
        : { description: twitterDescription || description }),
      images: [{ url: ogImage, alt: ogImageAlt }],
    },
  };
}
