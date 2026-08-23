import type { NextConfig } from "next";

// ============================================================
// مبدأِ Express — یک‌جا، از متغیرِ محیطی
// ============================================================
// قبلاً `http://localhost:3000` در هفت جای همین فایل دستی نوشته شده بود. یعنی
// روزی که بک‌اند جای دیگری بالا می‌آمد (سروِ دیگر، پورتِ دیگر، داکر)، باید هفت
// خط دست‌کاری می‌شد و هر یکی که جا می‌ماند یک ۴۰۴ِ خاموش می‌ساخت: عکس‌ها بیایند
// ولی sw.js نه، یا API بیاید ولی manifest نه.
//
// همان متغیری استفاده می‌شود که `src/lib/site.ts` برای fetchِ سمتِ سرور
// می‌خواند (`API_ORIGIN`)، تا پروکسی و SSR هیچ‌وقت به دو جای مختلف نزنند.
// Next فایل‌های `.env` را پیش از ارزیابیِ همین فایل بار می‌کند، پس مقدار
// در دسترس است.
const API_ORIGIN = (process.env.API_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");

// آدرسِ عکس‌ها برای next/image باید تکه‌تکه داده شود (پروتکل/هاست/پورت)، پس
// از همان یک مبدأ استخراج می‌شود و دستی تکرار نمی‌شود.
const apiUrl = new URL(API_ORIGIN);

// روی HTTPS کوکی امن می‌شود؛ همان پرچمی که Express برای HSTS و
// upgrade-insecure-requests می‌خواند (server.js:84).
const HTTPS_MODE = /^(1|true|yes|on)$/i.test(String(process.env.COOKIE_SECURE || ""));

// ============================================================
// سیاست امنیت محتوا (CSP) روی مبدأِ Next
// ============================================================
// اینجا عمداً `script-src` و `style-src` و `default-src` گذاشته *نشده* — و این
// یک تصمیم است، نه فراموشی:
//
//   • App Router در هر صفحه چند `<script>` درون‌خطی تزریق می‌کند (داده‌ی RSC،
//     `self.__next_f.push(...)`). محتوایشان از صفحه‌ای به صفحه‌ی دیگر عوض
//     می‌شود، پس هشِ ثابت جواب نمی‌دهد.
//   • راهِ رسمیِ Next برای این کار nonce است، ولی nonce در هر درخواست فرق
//     می‌کند و مستندِ خودِ Next می‌گوید صفحه باید داینامیک رندر شود. این
//     فروشگاه ۵۲ صفحه‌ی استاتیک دارد که ۳۸ تایش صفحه‌ی محصول است — یعنی
//     nonce دقیقاً همان SSG را از بین می‌برد که برایش وقت گذاشته شده.
//   • `script-src 'self' 'unsafe-inline'` هم امنیتِ نمایشی است: با
//     'unsafe-inline' مرورگر دیگر اسکریپتِ ما را از اسکریپتِ تزریق‌شده
//     تشخیص نمی‌دهد، یعنی همان چیزی که CSP برایش هست از کار می‌افتد.
//
// پس بقیه‌ی دستورها — که هیچ‌کدام به nonce نیاز ندارند و همه سدِ حمله‌های
// واقعی‌اند — نوشته می‌شوند. مبدأِ Express (`frontend/`) CSPِ کاملِ خودش را
// دارد و دست‌نخورده می‌ماند (server.js:129).
const CSP = [
  // بی‌اثر کردنِ <base href> تزریقی؛ وگرنه همه‌ی لینک‌های نسبیِ صفحه را
  // می‌توان به دامنه‌ی مهاجم برد
  "base-uri 'self'",
  "object-src 'none'",
  // نسخه‌ی مدرنِ X-Frame-Options — جلوی clickjacking
  "frame-ancestors 'self'",
  // سایت هیچ iframe ندارد؛ پرداخت با ریدایرکت انجام می‌شود
  "frame-src 'none'",
  // فرم فقط به خودمان یا درگاه پست می‌شود، نه به جای سوم
  "form-action 'self' https://www.zarinpal.com",
  "worker-src 'self'", // سرویس‌ورکرِ خودمان
  "manifest-src 'self'",
  ...(HTTPS_MODE ? ["upgrade-insecure-requests"] : []),
  // همان نقطه‌ی گزارشی که Express استفاده می‌کند؛ از طریقِ rewrite به
  // /api می‌رسد. بدونش تخلف‌ها بی‌صدا بلاک می‌شوند و کسی خبردار نمی‌شود.
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

const nextConfig: NextConfig = {
  // پروکسی به Express
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/picture/:path*", destination: `${API_ORIGIN}/picture/:path*` },
      { source: "/assets/:path*", destination: `${API_ORIGIN}/assets/:path*` },
      { source: "/sw.js", destination: `${API_ORIGIN}/sw.js` },
      // نامِ واقعیِ فایل manifest.webmanifest است؛ قبلاً manifest.json نوشته
      // شده بود که روی Express ۴۰۴ می‌داد. هر دو نام پروکسی می‌شوند تا اگر
      // جایی لینکِ قدیمی مانده باشد هم کار کند.
      { source: "/manifest.webmanifest", destination: `${API_ORIGIN}/manifest.webmanifest` },
      { source: "/manifest.json", destination: `${API_ORIGIN}/manifest.webmanifest` },

      // صفحه‌ی «آفلاین» عمداً به Next تبدیل *نشده*.
      // sw.js خط ۱۳ این آدرس را به‌عنوان OFFLINE_URL پیش‌کش می‌کند و روی این
      // مبدأ ۴۰۴ می‌گرفت — یعنی درست همان لحظه‌ای که اینترنت قطع می‌شد،
      // مشتری به‌جای صفحه‌ی فارسیِ ما صفحه‌ی خطای خشکِ مرورگر را می‌دید.
      //
      // چرا صفحه‌ی Next نشد: خودِ offline.html در کامنتش می‌گوید نباید به هیچ
      // فایلِ بیرونی وابسته باشد (نه CSS، نه فونت)، چون همان فایل هم بارگذاری
      // نمی‌شود. یک صفحه‌ی Next حتماً به /_next/static/css/… وابسته است، پس
      // تبدیلش دقیقاً همان چیزی را خراب می‌کرد که دلیلِ وجودش است.
      { source: "/offline.html", destination: `${API_ORIGIN}/offline.html` },
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
        protocol: apiUrl.protocol.replace(":", "") as "http" | "https",
        hostname: apiUrl.hostname,
        // پورتِ خالی یعنی پورتِ پیش‌فرضِ پروتکل (۸۰/۴۴۳)؛ next/image
        // همین را می‌خواهد و نباید "80" دستی گذاشت.
        port: apiUrl.port,
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
          // سه هدرِ زیر روی مبدأِ Express بود و روی مبدأِ Next نبود
          // (server.js:157-163). یعنی همان صفحه‌ها که حالا از :3001 سرو
          // می‌شوند، محافظتی را از دست داده بودند که نسخه‌ی قبلی داشت.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // پنجره‌ی سایت از پنجره‌ای که بازش کرده جدا می‌شود — مهم است چون
          // از این سایت به درگاه پرداخت می‌رویم و window.opener نباید
          // قابل دست‌کاری بماند.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: CSP },
          { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
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
