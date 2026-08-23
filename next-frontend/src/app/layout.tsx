import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SITE_URL, OG_IMAGE } from "@/lib/site";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0B1411",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "./",
  },
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
  robots: { index: true, follow: true },
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
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}