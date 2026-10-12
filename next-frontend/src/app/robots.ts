import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/login",
          "/cart",
          "/checkout",
          "/account",
          "/order-success",
          // صفحه‌ی خطای لبه‌ی دامنه (سروشده توسط nginx از `public/`). هیچ‌وقت
          // محتوای فروشگاه نبوده و نباید در نتایج بیاید — خودِ فایل هم
          // `noindex` دارد، ولی مسیرِ آدرسش هم نباید خزیده شود.
          "/error-500.html",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}