import type { MetadataRoute } from "next";
import { getProducts, getCategories } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://plascogoli.ir";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // صفحات ثابت
  const staticPages = [
    { path: "", priority: 1, changeFreq: "daily" as const },
    { path: "/products", priority: 0.9, changeFreq: "daily" as const },
    { path: "/wholesale", priority: 0.7, changeFreq: "weekly" as const },
    { path: "/terms", priority: 0.5, changeFreq: "monthly" as const },
  ];

  for (const page of staticPages) {
    entries.push({
      url: `${BASE_URL}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.changeFreq,
      priority: page.priority,
    });
  }

  // محصولات
  try {
    const data = await getProducts({ page: 1 });
    const products = data.products || [];
    for (const p of products) {
      entries.push({
        url: `${BASE_URL}/product/${p.id}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.6,
        images: p.image ? [`${BASE_URL}${p.image}`] : undefined,
      });
    }
  } catch {
    // اگر API در دسترس نبود، حداقل صفحات ثابت را برگردان
  }

  return entries;
}