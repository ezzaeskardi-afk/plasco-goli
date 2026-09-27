import type { Metadata } from "next";
import { ReportsContent } from "@/components/admin/ReportsContent";

// ============================================================
// `/admin/reports` — گزارش‌ها
// ============================================================
// همان نمای «گزارش‌ها» در پنل Express (`data-view="report"`): نمودار فروشِ
// بازه‌ی دلخواه، پرفروش‌ترین کالاها، بهترین مشتری‌ها، سهم دسته‌بندی‌ها و
// گزارشِ ماه‌به‌ماهِ شمسی با خروجیِ CSV.
//
// چرا اینجا و نه در داشبورد: داشبورد به سؤالِ «الان چه خبر؟» جواب می‌دهد و
// همیشه یک بازه‌ی ثابت دارد. این نما به «چرا؟» جواب می‌دهد و بازه دستِ مدیر
// است. قاطی‌کردنشان یعنی داشبوردی که نه سریع بالا می‌آید و نه بازه‌اش عوض
// می‌شود.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "گزارش‌ها",
};

export default function AdminReportsPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-2">گزارش‌ها</h1>
      <p className="text-xs mb-6" style={{ color: "var(--color-ink-dim)" }}>
        فروش، پرفروش‌ها، بهترین مشتری‌ها و گزارش ماه‌به‌ماهِ شمسی. هر بخش پنجره‌ی
        زمانیِ خودش را بالای جدولش نوشته است.
      </p>
      <ReportsContent />
    </div>
  );
}
