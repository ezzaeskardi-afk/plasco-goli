import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://plascogoli.ir";

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
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}