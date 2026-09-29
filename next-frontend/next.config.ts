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
  // ============================================================
  // پروکسی به Express — فقط دو چیز: API و عکس‌های محصول
  // ============================================================
  // پیش‌تر پنج rewriteِ دیگر هم اینجا بود (`/assets/*`، `/sw.js`،
  // `/manifest.webmanifest`، `/manifest.json`، `/offline.html`). آن پنج دارند
  // محتوای *فرانت‌اندِ* Express را سرو می‌کردند نه داده‌ی مغازه — یعنی تا وقتی
  // اینجا بودند، پوشه‌ی `frontend/` قابلِ حذف نبود: با حذفش فونت و فاوآیکون و
  // سرویس‌ورکر و صفحه‌ی آفلاین می‌رفت، در حالی که هیچ‌کدام کارِ بک‌اند نبودند.
  //
  // حالا همه در `next-frontend/public/` هستند. `public/` به‌هرحال بر
  // rewriteهای `afterFiles` اولویت دارد، ولی حذفِ خودِ rewrite عمدی است: اگر
  // روزی فایلی از `public` جا بماند، باید ۴۰۴ بگیری و بفهمی — نه اینکه خاموش
  // از Expressِ در حالِ خروج سرو شود و ماه‌ها بعد، روزِ بازنشستگیِ آن، یک‌جا
  // بشکند.
  //
  // `/manifest.json` هم عمداً حذف شد: نه HTMLهای Express و نه layoutِ Next به
  // آن لینک نمی‌دهند و نامِ واقعی `manifest.webmanifest` است.
  //
  // چیزی که *می‌ماند* دو مورد است و هر دو داده‌ی مغازه‌اند نه فرانت‌اند:
  // `/api/*` خودِ سرور، و `/picture/*` عکسِ محصول‌ها که بیرونِ `frontend/`
  // زندگی می‌کند (`backend/lib/paths.js`) و پنل مدیریت روی همان آپلود می‌کند.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/picture/:path*", destination: `${API_ORIGIN}/picture/:path*` },
    ];
  },

  // ============================================================
  // نشانی‌های عصرِ Express — جای دیگری زندگی می‌کنند
  // ============================================================
  // اینجا قبلاً یک `redirects()` با یک عضو بود: `/order-success.html`، چون
  // درگاه پرداخت (routes/orders.js:125-163) مشتری را به همان نامِ دنیای
  // Express برمی‌گرداند و روی این مبدأ ۴۰۴ می‌گرفت.
  //
  // حالا همه‌ی نشانی‌های `.html` یک‌جا در `src/middleware.ts` (با نقشه‌ی
  // `src/lib/legacyUrls.ts`) رسیدگی می‌شوند — همان یک عضو هم به آنجا منتقل شد
  // تا یک منبعِ حقیقت بماند و در Vitest قابلِ سنجش باشد. `redirects()`ِ این
  // فایل عمداً سایرِ ریدایرکت‌ها را دست نمی‌زند؛ فقط این یکی جابه‌جا شد.

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
      // ⚠️ فقط در production — و این یک باگِ واقعی بود که خودش را جای دیگری
      // نشان می‌داد: الهای هوشمندِ Turbopack در حالتِ dev چانک‌ها را با نامِ
      // **بدونِ هش** می‌فرستد (`chunks/app/order-success/page.js`)، در حالی که
      // `next build` نام را هش می‌کند (`page-7a2ef452e77f87b5.js`).
      //
      // با `immutable` روی نامِ بدونِ هش، مرورگر همان فایل را یک سال کش می‌کرد
      // و هر ویرایشی در کد **هرگز دیده نمی‌شد** — یعنی دولوپر فکر می‌کرد کدش کار
      // نمی‌کند، یا کد را دستکاری می‌کرد که خطای دیگری را می‌ساخت. کش بدونِ
      // راهِ پاک کردن، ضررش از کدِ کهنه بیشتر است.
      //
      // در dev هیچ هدری نمی‌گذاریم تا خودِ Next سیاستِ درستِ خودش را اعمال کند؛
      // سنجیده شد: با همین گیت، همان فایل‌ها `no-store, must-revalidate`
      // می‌گیرند — یعنی این هدرِ ما بود که آن سیاست را کنار می‌زد.
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/_next/static/:path*",
              headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
            },
          ]
        : []),
      // نکته: `public/assets` را دست نمی‌زنیم؛ در dev خودِ Next همان
      // `max-age=2592000, immutable` را می‌فرستد (اندازه‌گیری شد)، پس گیت‌کردنش
      // اینجا فقط یک شاخه‌ی تکراری می‌ساخت و چیزی را عوض نمی‌کرد.
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
