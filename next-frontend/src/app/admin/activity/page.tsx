import type { Metadata } from "next";
import { ActivityContent } from "@/components/admin/ActivityContent";

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
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-2">دفتر رویدادها</h1>
      <p className="text-xs mb-6" style={{ color: "var(--color-ink-dim)" }}>
        تازه‌ترین کارهای انجام‌شده در پنل: تغییر وضعیت سفارش، ویرایش کالا،
        تنظیمات، ورود و خروج مدیران. ورودهای ناموفق با رنگ قرمز مشخص می‌شوند.
      </p>
      <ActivityContent />
    </div>
  );
}
