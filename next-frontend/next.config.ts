import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // پروکسی به Express (:3000)
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:3000/api/:path*" },
      { source: "/picture/:path*", destination: "http://localhost:3000/picture/:path*" },
      { source: "/assets/:path*", destination: "http://localhost:3000/assets/:path*" },
      { source: "/sw.js", destination: "http://localhost:3000/sw.js" },
      { source: "/manifest.json", destination: "http://localhost:3000/manifest.json" },

    ];
  },

  // next/image — عکس‌ها از Express میان
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/picture/**",
      },
    ],
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // هدرهای امنیتی + کش
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }],
      },
    ];
  },

  compress: true,
  poweredByHeader: false,

  // افزایش timeout برای SSR که از Express دیتا می‌گیره
  staticPageGenerationTimeout: 30,
};

export default nextConfig;