import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/api";
import { SITE_URL } from "@/lib/site";

// بدونِ این، sitemap فقط یک بار موقعِ build ساخته می‌شد و محصولِ جدید هرگز
// به گوگل معرفی نمی‌شد.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const now = new Date();

  // فقط صفحاتی که واقعاً در این اپ وجود دارند. هر آدرسِ ۴۰۴ در sitemap
  // اعتبارِ crawl را می‌سوزاند، پس قبل از اضافه کردنِ مسیرِ جدید باید
  // src/app/<path>/page.tsx وجود داشته باشد.
  const staticPages = [
    { path: "", priority: 1, changeFreq: "daily" as const },
    { path: "/products", priority: 0.9, changeFreq: "daily" as const },
    { path: "/wholesale", priority: 0.7, changeFreq: "monthly" as const },
    { path: "/terms", priority: 0.4, changeFreq: "yearly" as const },
  ];

  for (const page of staticPages) {
    entries.push({
      url: `${SITE_URL}${page.path}`,
      lastModified: now,
      changeFrequency: page.changeFreq,
      priority: page.priority,
    });
  }

  // همه‌ی محصولات، نه فقط صفحه‌ی اول.
  // قبلاً یک `getProducts({ page: 1 })` بود؛ با ۱۰۰+ محصول یعنی بیشترِ کاتالوگ
  // هرگز در sitemap نمی‌آمد.
  try {
    const seen = new Set<number>();
    let page = 1;
    // سقفِ ۵۰ صفحه یک ترمزِ ایمنی است تا یک باگِ صفحه‌بندی در API این تابع را
    // بی‌نهایت نچرخاند.
    for (; page <= 50; page++) {
      const data = await getProducts({ page });
      const products = data.products || [];
      if (products.length === 0) break;

      for (const p of products) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        entries.push({
          url: `${SITE_URL}/product/${p.id}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.6,
          images: p.image ? [`${SITE_URL}${encodeURI(p.image)}`] : undefined,
        });
      }

      const totalPages = data.meta?.pages ?? 1;
      if (page >= totalPages) break;
    }
  } catch {
    // اگر API در دسترس نبود، حداقل صفحات ثابت را برگردان
  }

  return entries;
}
