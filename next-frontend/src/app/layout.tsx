import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HideOnStandalone } from "@/components/HideOnStandalone";
import { SITE_URL, OG_IMAGE } from "@/lib/site";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0B1411",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // `alternates.canonical` عمداً اینجا نیست.
  //
  // در نسخه‌ی Express فقط چهار صفحه‌ی ایندکس‌شدنی canonical داشتند (خانه،
  // محصولات، قوانین، عمده) و هیچ‌کدام از صفحه‌های noindex نه. وقتی این‌جا
  // `./` گذاشته شده بود، هر صفحه — حتی سبد، ورود، ۴۰۴ و ۵۰۰ — یک canonical
  // می‌گرفت. بدترینش صفحه‌ی ۴۰۴ بود که `/_not-found` را به‌عنوان آدرسِ
  // کانونیکِ خود اعلام می‌کرد؛ یعنی به گوگل می‌گفت «نسخه‌ی اصلیِ من همان
  // آدرسِ ۴۰۴ است». حالا canonical را هر صفحه‌ی ایندکس‌شدنی خودش صریح می‌دهد.
  title: {
    default: "پلاسکو گلی — فروشگاه محصولات پلاستیکی",
    template: "%s | پلاسکو گلی",
  },
  description:
    "فروشگاه اینترنتی پلاسکو گلی — خرید محصولات پلاستیکی با کیفیت، ارسال سریع به سراسر کشور، ضمانت اصل بودن کالا و پرداخت امن.",
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: "پلاسکو گلی",
    title: "پلاسکو گلی — فروشگاه محصولات پلاستیکی",
    description: "خرید محصولات پلاستیکی با کیفیت — ارسال به سراسر کشور",
    images: [{ url: OG_IMAGE }],
  },
  twitter: {
    // لوگو مربع است، پس summary درست‌تر از summary_large_image است؛
    // با کارتِ بزرگ، عکسِ مربع بریده و بدشکل نمایش داده می‌شود.
    card: "summary",
    title: "پلاسکو گلی",
    description: "فروشگاه محصولات پلاستیکی",
    images: [OG_IMAGE],
  },
  // `max-image-preview:large` هم در Express بود (index.html و products.html).
  // بدونش گوگل تصویرِ کوچک را در نتایج نشان می‌دهد، و برای فروشگاهی که تمام
  // تصمیمِ خریدش را با عکس می‌گیرد یعنی کلیکِ کمتر.
  robots: { index: true, follow: true, "max-image-preview": "large" },
  // فایل‌های واقعی در frontend/assets. قبلاً favicon.png نوشته شده بود که
  // وجود ندارد (۴۰۴) — نسخه‌ی اصلی favicon.svg دارد.
  icons: {
    icon: [{ url: "/assets/favicon.svg", type: "image/svg+xml" }],
    apple: "/assets/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen flex flex-col">
        <Providers>
          {/* «رفتن به محتوای اصلی» — در نسخه‌ی Express روی هر ۱۵ صفحه بود و در
              Next هیچ‌جا نبود. تنها راهِ کاربرِ کیبورد (یا screen reader) برای
              رد کردنِ هدر و نوارها و رسیدنِ یک‌کلیکی به محتوا همین است؛
              بدونش باید صدها لینکِ هدر و پاورقی را تب‌بزند.
              اولِ <body> است تا اولین چیزِ focusable باشد، و با `top:-60px`
              پنهان می‌ماند تا با Tab فوکوس بگیرد (CSS در globals.css). */}
          <a href="#main" className="skip-link">
            رفتن به محتوای اصلی
          </a>
          <HideOnStandalone>
            <Header />
          </HideOnStandalone>
          {/* `id="main"` هدفِ همین لینک است و باید بماند. */}
          <main id="main" className="flex-1">{children}</main>
          <HideOnStandalone>
            <Footer />
          </HideOnStandalone>
        </Providers>
      </body>
    </html>
  );
}