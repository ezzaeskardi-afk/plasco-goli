import type { Metadata } from "next";
import { ErrorsContent } from "@/components/admin/ErrorsContent";
import { AdminPage } from "@/components/admin/PageHead";

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
    <AdminPage
      sectionKey="errors"
      title="خطاهای سرور"
      desc="خطاهای گروه‌بندی‌شده‌ی ۱۴ روزِ اخیر. «مشتری خطا دید» تعدادِ پاسخ‌های ۵xx است — همان عددی که به فروش وصل است. جزئیاتِ فنی هر خطا با کلیک روی خودش باز می‌شود."
    >
      <ErrorsContent />
    </AdminPage>
  );
}
