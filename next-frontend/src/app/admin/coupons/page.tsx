import type { Metadata } from "next";
import { CouponsContent } from "@/components/admin/CouponsContent";
import { AdminPage } from "@/components/admin/PageHead";

// ============================================================
// `/admin/coupons` — کدهای تخفیف
// ============================================================
// ساخت، ویرایش، خاموش/روشن و حذفِ کد تخفیف — همان کاری که نمای «تخفیف‌ها» در
// پنل Express می‌کرد.
//
// این نما یکی از دو جایی است که پنلِ Express و Next می‌توانند با هم اختلاف
// داشته باشند: هر دو روی همان جدولِ `coupons` کار می‌کنند، پس کدی که اینجا
// ساخته شود همان لحظه در پنل قدیمی هم دیده می‌شود. اگر روزی یکی از دو پنل
// بازنشسته شد، این نما باید تا آخرین لحظه با آن یکی هم‌سو بماند.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد (توضیح در admin/page.tsx).

export const metadata: Metadata = {
  title: "تخفیف‌ها",
};

export default function AdminCouponsPage() {
  return (
    <AdminPage
      sectionKey="coupons"
      title="کدهای تخفیف"
      desc="ساخت، ویرایش و خاموش/روشن کردنِ کد تخفیفِ درصدی و مبلغِ ثابت، با سقفِ مصرف و تاریخِ انقضا."
    >
      <CouponsContent />
    </AdminPage>
  );
}
