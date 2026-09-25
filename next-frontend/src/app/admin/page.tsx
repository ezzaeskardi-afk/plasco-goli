import type { Metadata } from "next";
import { DashboardContent } from "@/components/admin/DashboardContent";

// ============================================================
// `/admin` — داشبورد
// ============================================================
// این مسیر تا دو مرحله پیش وجود نداشت و ۴۰۴ می‌داد، با اینکه `Header.tsx`
// دکمه‌ی مدیر را دقیقاً به همین آدرس می‌فرستد. بعد یک صفحه‌ی راهنما شد که
// فقط می‌گفت کدام بخش منتقل شده. حالا خودِ داشبورد است — همان چیزی که در
// پنل Express هم نمای اول است.
//
// راهنمایِ «چه چیزی منتقل شده» حذف نشد؛ به دو جای درست‌ترش رفت: نوارِ ناوبری
// بخش‌های منتقل‌نشده را با برچسبِ «Express» غیرفعال نشان می‌دهد، و پانویسِ
// پوسته (`admin/layout.tsx`) شمارش کلی را می‌گوید. آن اطلاعاتِ وضعیت جای
// صفحهِ کارِ روزمره نیست.
//
// `robots` عمداً اینجا نیست: پوسته‌ی `/admin` برای همه‌ی این صفحات
// `noindex, nofollow` می‌گذارد و متادیتای فرزند فیلد `robots` را کامل
// جایگزین می‌کند، پس نوشتنش اینجا فقط nofollow را از دست می‌داد.

export const metadata: Metadata = {
  title: "داشبورد",
};

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">داشبورد</h1>
      <DashboardContent />
    </div>
  );
}
