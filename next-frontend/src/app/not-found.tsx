import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";

// ============================================================
// ۴۰۴ — همتای `frontend/404.html`
// ============================================================
// سه چیز این‌جا با نسخه‌ی Express یکی شده است، چون هر سه در بازرسیِ متادیتا
// بیرون آمدند:
//
//   ۱. عنوان: «صفحه پیدا نشد (۴۰۴)» — نه «پیدا نشد». عددِ ۴۰۴ در عنوان به
//      کاربری که از یک لینکِ خرابِ بیرونی آمده می‌گوید مشکل از آدرس است، نه
//      از سایت. (متنِ داخلِ صفحه هم همان می‌گوید.)
//   ۲. توضیحِ متا: در Express بود و این‌جا نبود، پس پیش‌نمایشِ لینکِ خراب در
//      تلگرام/واتساپ توضیحِ عمومیِ فروشگاه را نشان می‌داد.
//   ۳. دکمه‌ی دوم: «مشاهده محصولات». صفحه‌ی ۴۰۴ تنها جایی است که کاربر
//      *قطعاً* راهش را گم کرده؛ تنها گذاشتنش با یک دکمه‌ی «بازگشت به خانه»
//      یعنی فرستادنش به نقطه‌ی صفر. Express دو مسیر می‌داد: خانه، یا مستقیم
//      رفتن سرِ محصولات.
//
// `robots` این‌جا **باید** نوشته شود — و دلیلش تجربی کشف شد:
//
// Next خودش روی پاسخِ ۴۰۴ یک `<meta name="robots" content="noindex">` می‌گذارد.
// اگر این فایل robots نداشته باشد، تگِ دوم از `layout.tsx` می‌آید که
// `index, follow, max-image-preview:large` است — یعنی صفحه‌ی ۴۰۴ دو دستورِ
// **متناقض** به گوگل می‌دهد («ایندکس کن» و «ایندکس نکن»). گوگل سخت‌گیرانه‌ترین
// را می‌گیرد و رفتار نهایی درست می‌ماند، ولی سورسِ متناقض بدهیِ واقعی است.
//
// با نوشتنِ robots این‌جا، هر دو تگ هم‌جهت می‌شوند: `noindex` (خودکارِ Next) و
// `noindex, follow` (همین خط) — دقیقاً همان معنایی که Express در 404.html داشت.
export const metadata: Metadata = {
  title: "صفحه پیدا نشد (۴۰۴)",
  description: "این صفحه در فروشگاه پلاسکو گلی پیدا نشد.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="text-center max-w-md">
        <div
          className="w-16 h-16 rounded-full mx-auto mb-5 grid place-items-center"
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-line)",
          }}
          aria-hidden="true"
        >
          <Icon name="search" size={30} className="text-ink-dim" />
        </div>

        <h1 className="text-xl font-extrabold mb-2" style={{ color: "var(--color-ink)" }}>
          این صفحه پیدا نشد (۴۰۴)
        </h1>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          آدرس اشتباه است یا این صفحه جابه‌جا شده. نگران نباشید؛ از این‌جا
          ادامه بدهید:
        </p>

        <div className="flex flex-wrap gap-2.5 justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-teal)", color: "#04211B" }}
          >
            <Icon name="home" size={17} />
            صفحه‌ی اصلی
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition-colors"
            style={{
              background: "transparent",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-control)",
            }}
          >
            <Icon name="package" size={17} />
            مشاهده محصولات
          </Link>
        </div>
      </div>
    </div>
  );
}
