import type { Metadata } from "next";
import { ReportsContent } from "@/components/admin/ReportsContent";
import { AdminPage } from "@/components/admin/PageHead";

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
    <AdminPage
      sectionKey="report"
      desc="فروش، پرفروش‌ها، بهترین مشتری‌ها و گزارش ماه‌به‌ماهِ شمسی. هر بخش پنجره‌ی زمانیِ خودش را بالای جدولش نوشته است."
    >
      <ReportsContent />
    </AdminPage>
  );
}
