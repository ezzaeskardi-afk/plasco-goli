import Link from "next/link";

// ============================================================
// محصولِ حذف‌شده — متن از frontend/product-gone.html
// ============================================================
// این فایل مرزِ `notFound()`ِ صفحه‌ی محصول است، نه یک صفحه‌ی مستقلِ
// `/product-gone`. دلیلش: در App Router آدرس همان `/product/۱۲۳` می‌ماند
// (ریدایرکت نمی‌شود)، که همان رفتارِ نسخه‌ی Express است.
//
// یک محدودیتِ واقعی که باید بدانید — و با آزمایش تأیید شده:
// نسخه‌ی Express برای محصولِ حذف‌شده کدِ **۴۱۰** می‌دهد (server.js:503). اینجا
// کدِ HTTP همچنان **۲۰۰** است، چون این مسیر SSG/ISR است و Next پاسخِ
// `notFound()` را هم به‌عنوان prerender کش می‌کند:
//
//     GET /product/77771  →  200   x-nextjs-cache: MISS   x-nextjs-prerender: 1
//
// راهِ گرفتنِ ۴۰۴ واقعی یکی از این دوتاست، و هر دو چیزِ گران‌تری را خراب
// می‌کنند، پس عمداً انتخاب نشده‌اند:
//   • `dynamicParams = false` → محصولِ تازه‌ای که از پنل اضافه می‌شود تا بیلدِ
//     بعدی ۴۰۴ می‌گیرد (generateStaticParams فقط موقعِ build اجرا می‌شود).
//   • `dynamic = "force-dynamic"` → SSGِ همه‌ی ۳۸ محصول از بین می‌رود.
//
// چیزی که *واقعاً* از سئو محافظت می‌کند و انجام شده: `generateMetadata` در
// همین حالت `robots: { index: false }` برمی‌گرداند، پس گوگل صفحه را ایندکس
// نمی‌کند. آسیبِ اصلیِ soft-404 همین بود.

export default function ProductGone() {
  return (
    <div className="mx-auto max-w-[460px] px-6 py-16 text-center">
      <div
        className="rounded-[20px] p-9"
        style={{
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="w-16 h-16 rounded-full mx-auto mb-5 grid place-items-center"
          style={{
            background: "var(--color-teal-tint)",
            border: "1px solid rgba(37, 227, 196, 0.26)",
          }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-teal)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8"
          >
            <path d="M16.5 9.4 7.5 4.21" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>

        <h1
          className="text-lg font-extrabold mb-3 leading-relaxed"
          style={{ color: "var(--color-ink)" }}
        >
          این محصول دیگر در فروشگاه موجود نیست
        </h1>
        <p
          className="text-sm leading-loose"
          style={{ color: "var(--color-ink-soft)" }}
        >
          احتمالاً از سبد محصولات ما حذف شده. ولی کلی محصول دیگر داریم که شاید
          دقیقاً همانی باشد که دنبالش هستید.
        </p>

        <div className="flex flex-wrap gap-2.5 justify-center mt-7">
          <Link
            href="/products"
            className="rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-teal)", color: "#04211B" }}
          >
            مشاهده‌ی محصولات
          </Link>
          <Link
            href="/"
            className="rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{
              background: "transparent",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-strong)",
            }}
          >
            صفحه‌ی اصلی
          </Link>
        </div>
      </div>
    </div>
  );
}
