import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0B1411",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "پلاسکو گلی — فروشگاه محصولات پلاستیکی",
    template: "%s | پلاسکو گلی",
  },
  description:
    "فروشگاه اینترنتی پلاسکو گلی — خرید محصولات پلاستیکی با کیفیت، ارسال سریع به سراسر کشور، ضمانت اصل بودن کالا و پرداخت امن.",
  metadataBase: new URL("https://plascogoli.ir"),
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: "پلاسکو گلی",
    title: "پلاسکو گلی — فروشگاه محصولات پلاستیکی",
    description: "خرید محصولات پلاستیکی با کیفیت — ارسال به سراسر کشور",
    images: [{ url: "/assets/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "پلاسکو گلی",
    description: "فروشگاه محصولات پلاستیکی",
    images: ["/assets/og-image.png"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/assets/favicon.png", apple: "/assets/apple-touch-icon.png" },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}