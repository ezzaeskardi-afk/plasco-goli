import type { Metadata } from "next";
import { WholesaleContent } from "@/components/admin/WholesaleContent";
import { AdminPage } from "@/components/admin/PageHead";

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
    <AdminPage
      sectionKey="wholesale"
      title="درخواست‌های خرید عمده"
      desc="صفِ تماسِ مشتریانِ عمده. وضعیت هر درخواست را جلو ببر تا معلوم باشد چه کاری مانده و چه کاری انجام شده است."
    >
      <WholesaleContent />
    </AdminPage>
  );
}
