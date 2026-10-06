import type { Metadata } from "next";
import { OrdersContent } from "@/components/admin/OrdersContent";
import { AdminPage } from "@/components/admin/PageHead";

// ============================================================
// `/admin/orders` — سفارش‌ها
// ============================================================
// پرکارترین نمای پنل: تغییر وضعیت، کد رهگیری، یادداشت داخلی، لغو و تأیید
// مرجوعی. همه‌ی این کارها روی همان APIیی می‌روند که پنل Express استفاده
// می‌کرده، پس هیچ‌کدام دو پیاده‌سازی ندارند و داده‌ها از یک جا می‌آیند.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد (توضیح در admin/page.tsx).

export const metadata: Metadata = {
  title: "سفارش‌ها",
};

export default function AdminOrdersPage() {
  return (
    <AdminPage
      sectionKey="orders"
      desc="جستجو و فیلترِ سفارش‌ها، تغییرِ وضعیت، کدِ رهگیری، یادداشتِ داخلی، لغو و تأییدِ مرجوعی."
    >
      <OrdersContent />
    </AdminPage>
  );
}
