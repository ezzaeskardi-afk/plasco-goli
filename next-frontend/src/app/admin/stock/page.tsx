import type { Metadata } from "next";
import { StockContent } from "@/components/admin/StockContent";

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
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">انبار و کالا</h1>
      <StockContent />
    </div>
  );
}
