import type { MetadataRoute } from "next";
import { getProducts, getCategories } from "@/lib/api";
import { SITE_URL, publicImagePath } from "@/lib/site";
import type { Product } from "@/lib/types";

// بدونِ این، sitemap فقط یک بار موقعِ build ساخته می‌شد و محصولِ جدید هرگز
// به گوگل معرفی نمی‌شد.
export const revalidate = 3600;

/**
 * تاریخِ دیتابیس (UTC، «YYYY-MM-DD HH:MM:SS») → Date؛ نامعتبر → undefined.
 *
 * چرا `+ "Z"`: همان درسی که `faDate` در پنل گرفت (`admin.js`) — بدونِ Z،
 * `new Date` تاریخ را محلی فرض می‌کند و lastmod چند ساعت جابه‌جا می‌شود.
 *
 * چرا به‌جای «همیشه حالا»: قبلاً همه‌ی آدرس‌ها `lastModified: now` می‌گرفتند
 * که به گوگل سیگنالِ دروغ می‌دهد («همه‌چیز هر روز عوض می‌شود») و بعد از چند
 * بار کلِ lastmod نادیده گرفته می‌شود. همین استدلال در sitemapِ Express هم
 * کامنت شده بود ولی این‌جا پیاده نشده بود. تاریخِ غایب/نامعتبر یعنی آن آدرس
 * اصلاً lastmod نمی‌گیرد — که صادقانه‌تر از یک عددِ ساختگی است.
 */
function isoOf(value: string | null | undefined): Date | undefined {
  const s = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return undefined;
  const d = new Date(s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // ---------- کاتالوگ: همه‌ی محصولات، نه فقط صفحه‌ی اول ----------
  // قبلاً یک `getProducts({ page: 1 })` بود؛ با ۱۰۰+ محصول یعنی بیشترِ کاتالوگ
  // هرگز در sitemap نمی‌آمد. سقفِ ۵۰ صفحه یک ترمزِ ایمنی است تا یک باگِ
  // صفحه‌بندی در API این تابع را بی‌نهایت نچرخاند.
  const products: Product[] = [];
  let totalPages = 1;
  try {
    const seen = new Set<number>();
    for (let page = 1; page <= 50; page++) {
      const data = await getProducts({ page });
      const list = data.products || [];
      if (list.length === 0) break;
      for (const p of list) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        products.push(p);
      }
      totalPages = data.meta?.pages ?? 1;
      if (page >= totalPages) break;
    }
  } catch {
    // اگر API در دسترس نبود، حداقل صفحات ثابت و دسته‌ها برگردند.
  }

  // تازه‌ترین `updated_at` کاتالوگ — lastmod صفحه‌ی اصلی و فهرست (محتوای هر
  // دو همان کاتالوگ است؛ دقیقاً همان کاری که sitemapِ Express هم می‌کند).
  const newest = products.reduce<string>(
    (acc, p) => (p.updatedAt && p.updatedAt > acc ? p.updatedAt : acc),
    "",
  );
  const newestAt = isoOf(newest);

  // فقط صفحاتی که واقعاً در این اپ وجود دارند. هر آدرسِ ۴۰۴ در sitemap
  // اعتبارِ crawl را می‌سوزاند، پس قبل از اضافه کردنِ مسیرِ جدید باید
  // src/app/<path>/page.tsx وجود داشته باشد.
  entries.push({
    url: `${SITE_URL}`,
    ...(newestAt ? { lastModified: newestAt } : {}),
    changeFrequency: "daily",
    priority: 1,
  });
  entries.push({
    url: `${SITE_URL}/products`,
    ...(newestAt ? { lastModified: newestAt } : {}),
    changeFrequency: "daily",
    priority: 0.9,
  });
  entries.push({
    url: `${SITE_URL}/wholesale`,
    changeFrequency: "monthly",
    priority: 0.7,
  });
  entries.push({
    url: `${SITE_URL}/terms`,
    changeFrequency: "yearly",
    priority: 0.4,
  });

  // ---------- دسته‌ها ----------
  // قبلاً هیچ دسته‌ای در sitemap نبود، در حالی که نسخه‌ی Express همه‌ی
  // دسته‌ها را می‌فرستاد. صفحه‌ی دسته‌ی خالی هم نمی‌آید چون این
  // `getCategories` (برخلاف نسخه‌ی پنل) فقط دسته‌های دارای کالای منتشرشده
  // را برمی‌گرداند.
  //
  // کلیدِ `category` و نه `cat`ِ عصرِ Express: این همان شکلی است که
  // `productQuery.ts` کانونیکال می‌داند و لینک‌های درون‌سایت هم با آن ساخته
  // می‌شوند؛ اعلام‌کردنِ شکلِ قدیمی که خودش معادلِ تازه دارد سیگنالِ متضاد است.
  try {
    const categories = await getCategories();
    for (const c of categories) {
      entries.push({
        url: `${SITE_URL}/products?category=${encodeURIComponent(c.name)}`,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // بدونِ دسته‌ها هم خروجی معتبر است.
  }

  // ---------- صفحه‌بندی فهرست ----------
  // صفحه‌ی ۱ همان `/products`ِ بالاست؛ از ۲ به بعد هر صفحه آدرسِ canonical
  // خودش را دارد (`canonicalListingQuery` هم `page` را وقتی >۱ باشد نگه
  // می‌دارد). قبلاً هیچ‌کدام از این‌ها در sitemap نبودند.
  for (let page = 2; page <= totalPages && page <= 50; page++) {
    entries.push({
      url: `${SITE_URL}/products?page=${page}`,
      changeFrequency: "daily",
      priority: 0.5,
    });
  }

  // ---------- محصولات ----------
  for (const p of products) {
    const lastModified = isoOf(p.updatedAt);
    entries.push({
      url: `${SITE_URL}/product/${p.id}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly",
      priority: 0.6,
      // `publicImagePath` و نه `encodeURI`: مقدار از API از قبل کدشده
      // می‌آید؛ encodeURI دوباره‌اش می‌کرد و `<image:loc>` یک نشانیِ
      // ۴۰۴ می‌شد (سنجیده شد).
      images: p.image
        ? [`${SITE_URL}${publicImagePath(p.image)}`]
        : undefined,
    });
  }

  return entries;
}
