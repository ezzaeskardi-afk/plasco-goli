import type { Metadata } from "next";
import { WholesaleContent } from "@/components/admin/WholesaleContent";

// ============================================================
// `/admin/wholesale` — درخواست‌های خرید عمده (B2B)
// ============================================================
// همان نمای «عمده‌فروشی» در پنل Express (`data-view="wholesale"`).
//
// چرا یک صفحه‌ی جدا و نه یک تبِ داخلیِ مشتری‌ها: مشتریِ خرده و مشتریِ عمده دو
// کارِ متفاوت‌اند. این یکی یک **صفِ تماس** است (زنگ بزن، وضعیت را جلو ببر) و
// آن یکی یک پایگاهِ داده از خریداران. انداختنشان زیر یک آدرس یعنی هر بار باید
// به مدیر بگوییم کدام تب را بزند.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد و بازنویسی‌اش
// `follow: false` را بی‌صدا از بین می‌برد.

export const metadata: Metadata = {
  title: "عمده‌فروشی",
};

export default function AdminWholesalePage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-2">درخواست‌های خرید عمده</h1>
      <p className="text-xs mb-6" style={{ color: "var(--color-ink-dim)" }}>
        صفِ تماسِ مشتریانِ عمده. وضعیت هر درخواست را جلو ببر تا معلوم باشد چه
        کاری مانده و چه کاری انجام شده است.
      </p>
      <WholesaleContent />
    </div>
  );
}
