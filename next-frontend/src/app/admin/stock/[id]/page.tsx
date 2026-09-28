import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/ProductEditor";
import type { Metadata } from "next";

// ============================================================
// `/admin/stock/[id]` — ویرایشِ کاملِ یک کالا
// ============================================================
// چرا یک صفحه‌ی جدا و نه مودال: فرمِ کاملِ محصول ده‌ها فیلد دارد (از جمله
// دو آپلود و فهرستِ مشخصات) و در مودال روی موبایل به یک پنجره‌ی اسکرولیِ
// بی‌انتها تبدیل می‌شد. صفحه‌ی جدا آدرسِ خودش را دارد — یعنی می‌شود لینکش را
// فرستاد، در تبِ دوم بازش کرد و بعد از رفرش سرِ جایش برگشت.
//
// شناسه از آدرس می‌آید و **اینجا** سنجیده می‌شود (نه در کامپوننت): آدرسِ
// `/admin/stock/abc` باید ۴۰۴ بدهد، نه صفحه‌ای که تا ابد «در حال خواندنِ
// کالا…» نشان دهد. `ProductEditor` با شناسه‌ی نامعتبر هم رفتارِ درست را دارد،
// ولی این‌جا از رندرِ بی‌فایده جلوگیری می‌شود.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "ویرایشِ کالا",
};

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">ویرایشِ کالا</h1>
      <ProductEditor id={productId} />
    </div>
  );
}
