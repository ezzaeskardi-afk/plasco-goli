import type { Metadata } from "next";
import { ActivityContent } from "@/components/admin/ActivityContent";
import { AdminPage } from "@/components/admin/PageHead";

// ============================================================
// `/admin/activity` — دفتر رویدادها
// ============================================================
// همان نمای «رویدادها» در پنل Express (`data-view="log"`، و در نوار با برچسبِ
// «رویدادها»). مسیر در Next `/admin/activity` است چون نامِ خودِ endpoint هم
// همین است (`/api/admin/activity`) و کلیدِ بخش در `adminSections.ts` هم `log`
// می‌ماند — چون همان `data-view` نسخه‌ی Express است و باید قابلِ تطبیق بماند.
//
// این تنها جای پنل است که «کی این کار را کرد» را می‌گوید. کاربردِ اصلی‌اش
// عیب‌یابی است: «این محصول چرا از سایت رفت؟» جوابش همین‌جاست.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "رویدادها",
};

export default function AdminActivityPage() {
  return (
    <AdminPage
      sectionKey="log"
      title="دفتر رویدادها"
      desc="تازه‌ترین کارهای انجام‌شده در پنل: تغییر وضعیت سفارش، ویرایش کالا، تنظیمات، ورود و خروج مدیران. ورودهای ناموفق با رنگ قرمز مشخص می‌شوند."
    >
      <ActivityContent />
    </AdminPage>
  );
}
