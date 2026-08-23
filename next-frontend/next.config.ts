import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // پروکسی به Express (:3000)
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:3000/api/:path*" },
      { source: "/picture/:path*", destination: "http://localhost:3000/picture/:path*" },
      { source: "/assets/:path*", destination: "http://localhost:3000/assets/:path*" },
      { source: "/sw.js", destination: "http://localhost:3000/sw.js" },
      // نامِ واقعیِ فایل manifest.webmanifest است؛ قبلاً manifest.json نوشته
      // شده بود که روی Express ۴۰۴ می‌داد. هر دو نام پروکسی می‌شوند تا اگر
      // جایی لینکِ قدیمی مانده باشد هم کار کند.
      { source: "/manifest.webmanifest", destination: "http://localhost:3000/manifest.webmanifest" },
      { source: "/manifest.json", destination: "http://localhost:3000/manifest.webmanifest" },

      // صفحه‌ی «آفلاین» عمداً به Next تبدیل *نشده*.
      // sw.js خط ۱۳ این آدرس را به‌عنوان OFFLINE_URL پیش‌کش می‌کند و روی این
      // مبدأ ۴۰۴ می‌گرفت — یعنی درست همان لحظه‌ای که اینترنت قطع می‌شد،
      // مشتری به‌جای صفحه‌ی فارسیِ ما صفحه‌ی خطای خشکِ مرورگر را می‌دید.
      //
      // چرا صفحه‌ی Next نشد: خودِ offline.html در کامنتش می‌گوید نباید به هیچ
      // فایلِ بیرونی وابسته باشد (نه CSS، نه فونت)، چون همان فایل هم بارگذاری
      // نمی‌شود. یک صفحه‌ی Next حتماً به /_next/static/css/… وابسته است، پس
      // تبدیلش دقیقاً همان چیزی را خراب می‌کرد که دلیلِ وجودش است.
      { source: "/offline.html", destination: "http://localhost:3000/offline.html" },
    ];
  },

  // درگاه پرداخت (routes/orders.js:125-163) کاربر را به آدرسِ نسبیِ
  // `/order-success.html` برمی‌گرداند — نامی از دنیای Express. روی این مبدأ
  // ۴۰۴ بود، یعنی مشتری بعد از پرداخت به صفحه‌ی مرده می‌رسید. این ریدایرکت
  // همان آدرس را به صفحه‌ی Next می‌رساند و کوئری‌استرینگ (orderId / error)
  // خودکار حفظ می‌شود. عمداً موقت (۳۰۷) است، نه دائمی: مرورگر ریدایرکتِ
  // دائمی را برای همیشه کش می‌کند و اگر روزی این نقشه عوض شود، دستمان بسته
  // می‌ماند.
  async redirects() {
    return [
      { source: "/order-success.html", destination: "/order-success", permanent: false },
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