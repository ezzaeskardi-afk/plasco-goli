import Link from "next/link";
import { Icon } from "@/components/Icon";

// ============================================================
// محصولِ حذف‌شده — متن از frontend/product-gone.html
// ============================================================
// این کامپوننت دو مصرف‌کننده دارد و عمداً یکی است تا متن دو جا واگرا نشود:
//
//   ۱. `app/product/[id]/not-found.tsx` — مرزِ `notFound()`ِ صفحه‌ی محصول.
//      در App Router آدرس همان `/product/۱۲۳` می‌ماند (ریدایرکت نمی‌شود)، که
//      همان رفتارِ نسخه‌ی Express است.
//   ۲. `app/product-gone/page.tsx` — صفحه‌ای که middleware بدنه‌اش را با کدِ
//      **۴۱۰** برمی‌گرداند (توضیحِ کامل در `lib/productGone.ts`).
//
// ---------- آن‌چه با آزمایش تأیید شد ----------
// مسیرِ `/product/[id]` هم پر‌رندر (ISR) است و Next پاسخِ `notFound()` را
// به‌عنوان HTMLِ کش‌شده با کدِ **۲۰۰** سرو می‌کند:
//
//     GET /product/77771  →  200   x-nextjs-cache: MISS   x-nextjs-prerender: 1
//
// راهِ گرفتنِ ۴۰۴ واقعی از سمتِ خودِ صفحه یکی از این دوتاست و هر دو چیزِ
// گران‌تری را خراب می‌کنند، پس عمداً انتخاب نشده‌اند:
//   • `dynamicParams = false` → محصولِ تازه‌ای که از پنل اضافه می‌شود تا بیلدِ
//     بعدی ۴۰۴ می‌گیرد (generateStaticParams فقط موقعِ build اجرا می‌شود).
//   • `dynamic = "force-dynamic"` → SSGِ همه‌ی ۳۸ محصول از بین می‌رود.
//
// کدِ وضعیت را در عوض `middleware.ts` می‌گذارد (۴۱۰). اگر middleware در کاری
// دخالت نکند، این صفحه با کدِ ۲۰۰ نشان داده می‌شود ولی `robots: noindex` —
// یعنی همان محافظتی که قبلاً هم جلوی ایندکس‌شدنِ soft-404 را می‌گرفت.

export function ProductGone() {
  return (
    <div className="mx-auto max-w-[460px] px-6 py-16 text-center">
      <div
        className="rounded-[20px] p-9"
        style={{
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* لوگویِ بالای صفحه و آیکون‌های دکمه‌ها از `product-gone.html`
            می‌آیند: آن‌جا لوگو به خانه لینک بود و دکمه‌ها آیکونِ سبد و خانه
            داشتند. لوگو تنها لینکِ *همیشه‌آشنا*ی صفحه است برای کسی که با
            کلیک روی یک محصولِ حذف‌شده به این‌جا افتاده. */}
        <Link
          href="/"
          className="flex items-center justify-center gap-3 mb-6"
          aria-label="پلاسکو گلی — صفحه اصلی"
        >
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- نشانِ ۴۸px که از rewrite مسیر /picture سرو می‌شود */}
            <img
              src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jpg"
              alt="لوگوی پلاسکو گلی"
              width={48}
              height={48}
              decoding="async"
              className="h-12 w-12 object-cover"
            />
          </span>
          <span
            className="text-lg font-extrabold"
            style={{ color: "var(--color-teal)" }}
          >
            پلاسکو گلی
          </span>
        </Link>

        <div
          className="w-16 h-16 rounded-full mx-auto mb-5 grid place-items-center"
          style={{
            background: "var(--color-teal-tint)",
            border: "1px solid rgba(37, 227, 196, 0.26)",
          }}
          aria-hidden="true"
        >
          <Icon name="package" size={32} className="text-teal" />
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
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-teal)", color: "#04211B" }}
          >
            <Icon name="cart" size={17} />
            مشاهده‌ی محصولات
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{
              background: "transparent",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-strong)",
            }}
          >
            <Icon name="home" size={17} />
            صفحه‌ی اصلی
          </Link>
        </div>
      </div>
    </div>
  );
}
