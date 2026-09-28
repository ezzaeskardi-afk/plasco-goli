import type { Metadata } from "next";
import { ProductEditor } from "@/components/admin/ProductEditor";

// ============================================================
// `/admin/stock/new` — ساختِ کالای تازه
// ============================================================
// کالای ساخته‌شده **منتشرنشده** به دنیا می‌آید و قیمتش هم هر چه مدیر بگذارد
// همان می‌ماند؛ انتشار کارِ جداگانه‌ای است که دو نگهبان دارد (کالای بی‌عکس و
// کالای صفر تومان). این دقیقاً همان جریانِ «واردکردنِ دسته‌عکسِ تحویلی» است:
// اول کالا ساخته می‌شود، بعد عکس و قیمت پر می‌شود، بعد منتشر می‌شود.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "کالای تازه",
};

export default function AdminNewProductPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">کالای تازه</h1>
      <ProductEditor />
    </div>
  );
}
