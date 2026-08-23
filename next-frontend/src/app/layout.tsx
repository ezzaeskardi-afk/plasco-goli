import type { Metadata } from "next";
import "./globals.css";

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
    description:
      "خرید محصولات پلاستیکی با کیفیت — ارسال به سراسر کشور",
    images: [{ url: "/assets/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "پلاسکو گلی",
    description: "فروشگاه محصولات پلاستیکی",
    images: ["/assets/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/assets/favicon.png",
    apple: "/assets/apple-touch-icon.png",
  },
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
        {/* هدر — با Suspense برای کلاینت شدن بخش cart */}
        <header
          className="sticky top-0 z-50 border-b border-line"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-line-strong)",
          }}
        >
          <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-6 py-3">
            {/* لوگو */}
            <a href="/" className="flex items-center gap-2 shrink-0">
              <span className="text-xl font-extrabold text-teal">
                پلاسکو گلی
              </span>
            </a>

            {/* منوی اصلی */}
            <nav className="hidden md:flex gap-1 text-sm font-medium">
              <a href="/" className="px-3 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors">
                خانه
              </a>
              <a href="/products" className="px-3 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors">
                محصولات
              </a>
              <a href="/wholesale" className="px-3 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors">
                خرید عمده
              </a>
              <a href="/terms" className="px-3 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors">
                قوانین
              </a>
            </nav>

            {/* فضای خالی برای پر کردن */}
            <div className="flex-1" />

            {/* دکمه‌های سمت چپ */}
            <div className="flex items-center gap-2">
              <a
                href="/cart"
                className="relative rounded-full p-2 text-ink-soft hover:text-ink transition-colors"
                aria-label="سبد خرید"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="7" cy="17" r="1.5" />
                  <circle cx="15" cy="17" r="1.5" />
                  <path d="M2 3h2.5L7 12h8l2-6H5" />
                </svg>
              </a>
              <a
                href="/login"
                className="rounded-full bg-teal px-4 py-2 text-sm font-semibold text-[#04211B] hover:bg-teal-dark transition-colors"
              >
                ورود
              </a>
            </div>
          </div>

          {/* زیرمنوی موبایل */}
          <nav className="md:hidden flex gap-1 px-4 pb-2 text-sm overflow-x-auto">
            <a href="/" className="shrink-0 px-3 py-1.5 rounded-lg bg-teal-tint text-teal font-medium">
              خانه
            </a>
            <a href="/products" className="shrink-0 px-3 py-1.5 rounded-lg text-ink-soft">
              محصولات
            </a>
            <a href="/wholesale" className="shrink-0 px-3 py-1.5 rounded-lg text-ink-soft">
              عمده
            </a>
            <a href="/terms" className="shrink-0 px-3 py-1.5 rounded-lg text-ink-soft">
              قوانین
            </a>
          </nav>
        </header>

        {/* محتوای اصلی */}
        <main className="flex-1">{children}</main>

        {/* فوتر */}
        <footer
          className="border-t mt-auto"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-line-strong)",
          }}
        >
          <div className="mx-auto max-w-[1180px] px-6 py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div>
                <h4 className="text-sm font-bold text-ink mb-3">پلاسکو گلی</h4>
                <p className="text-xs text-ink-soft leading-relaxed">
                  فروشگاه اینترنتی محصولات پلاستیکی با کیفیت — ارسال سریع به سراسر کشور
                </p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink mb-3">دسترسی سریع</h4>
                <ul className="text-xs text-ink-soft space-y-1.5">
                  <li><a href="/products" className="hover:text-teal transition-colors">محصولات</a></li>
                  <li><a href="/cart" className="hover:text-teal transition-colors">سبد خرید</a></li>
                  <li><a href="/login" className="hover:text-teal transition-colors">ورود</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink mb-3">خدمات</h4>
                <ul className="text-xs text-ink-soft space-y-1.5">
                  <li><a href="/terms" className="hover:text-teal transition-colors">قوانین</a></li>
                  <li><a href="/wholesale" className="hover:text-teal transition-colors">خرید عمده</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink mb-3">نمادها</h4>
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-teal">
                    <span className="text-sm leading-none">✓</span>
                    ضمانت اصل
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-teal">
                    <span className="text-sm leading-none">✓</span>
                    پرداخت امن
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t text-center text-xs text-ink-dim"
              style={{ borderColor: "var(--color-line)" }}>
              © ۱۴۰۴ پلاسکو گلی — تمام حقوق محفوظ است.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}