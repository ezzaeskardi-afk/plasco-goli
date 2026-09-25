import type { Metadata } from "next";
import { OrdersContent } from "@/components/admin/OrdersContent";

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
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">سفارش‌ها</h1>
      <OrdersContent />
    </div>
  );
}
