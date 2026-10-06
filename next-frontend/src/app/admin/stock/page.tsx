import type { Metadata } from "next";
import { StockContent } from "@/components/admin/StockContent";
import { AdminPage } from "@/components/admin/PageHead";

// ============================================================
// `/admin/stock` — انبار و کالا
// ============================================================
// قلبِ این نما ویرایشِ درجای قیمت و موجودی است، چون همین دو کار است که هر روز
// انجام می‌شود. ویرایشِ سریع به `PUT /api/admin/products/:id` می‌رود که با مقدار
// قبلی ادغام می‌کند — پس فرستادنِ فقط قیمت و موجودی، بقیه‌ی فیلدهای محصول را
// دست نمی‌زند.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "انبار و کالا",
};

export default function AdminStockPage() {
  return (
    <AdminPage
      sectionKey="stock"
      desc="ویرایشِ قیمت و موجودی، انتشار و برداشتنِ کالا، عملیاتِ گروهی، و کالاهایی که مشتری‌ها می‌خواهند ولی موجود نیستند."
    >
      <StockContent />
    </AdminPage>
  );
}
