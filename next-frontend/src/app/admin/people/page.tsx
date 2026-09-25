import type { Metadata } from "next";
import { PeopleContent } from "@/components/admin/PeopleContent";

// ============================================================
// `/admin/people` — مشتری‌ها
// ============================================================
// فهرستِ همه‌ی حساب‌های ثبت‌نامی با آمارِ خرید، جستجو، ترتیب، فیلتر و
// صفحه‌بندی. همان کاری که نمای «مشتری‌ها» در پنلِ Express می‌کرد، به‌اضافه‌ی
// صفحه‌بندی و یک پیوندِ مستقیم به پرونده‌ی هر مشتری در CRM.
//
// چرا پرونده‌ی مشتری دوباره ساخته نشد: `/admin/crm?customer=<id>` همان پرونده
// را باز می‌کند، با برچسب، یادداشت، پیگیری و امتیازِ RFM که در نمای مشتری‌ها
// وجود ندارد. ساختنِ یک پرونده‌ی دوم یعنی دو جای متفاوت برای یک کار — و
// دقیقاً همان چیزی که این مهاجرت می‌خواهد جمعش کند. پس این نما «راهِ ورود»
// است و CRM «اتاق».
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "مشتری‌ها",
};

export default function AdminPeoplePage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">مشتری‌ها</h1>
      <PeopleContent />
    </div>
  );
}
