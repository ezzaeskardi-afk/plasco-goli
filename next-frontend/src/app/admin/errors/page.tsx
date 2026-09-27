import type { Metadata } from "next";
import { ErrorsContent } from "@/components/admin/ErrorsContent";

// ============================================================
// `/admin/errors` — خطاهای سرور
// ============================================================
// همان نمای «خطاها» در پنل Express (`data-view="errors"`).
//
// این نما و «وضعیت سیستم» عمداً جدا مانده‌اند و هر دو هم بخشی از خطاها را
// نشان می‌دهند: آن یکی نمای **سلامت** است (چند خطا در ۷ روز، در یک کارت) و
// این یکی نمای **بررسی** (هر گروه با stack، فاصله‌ی زمانی و تکرار). ادغامشان
// یعنی یا صفحه‌ی سلامت با stack trace شلوغ شود، یا صفحه‌ی عیب‌یابی بدونِ
// جزئیاتِ لازم بماند.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "خطاها",
};

export default function AdminErrorsPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-2">خطاهای سرور</h1>
      <p className="text-xs mb-6" style={{ color: "var(--color-ink-dim)" }}>
        خطاهای گروه‌بندی‌شده‌ی ۱۴ روزِ اخیر. «مشتری خطا دید» تعدادِ پاسخ‌های
        ۵xx است — همان عددی که به فروش وصل است. جزئیاتِ فنی هر خطا با کلیک روی
        خودش باز می‌شود.
      </p>
      <ErrorsContent />
    </div>
  );
}
