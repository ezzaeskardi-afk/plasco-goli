import { ProductGone } from "@/components/ProductGone";

// ============================================================
// محصولِ حذف‌شده — مرزِ `notFound()`ِ صفحه‌ی محصول
// ============================================================
// محتوا در `components/ProductGone.tsx` است تا با صفحه‌ی `/product-gone`
// (همان صفحه‌ای که middleware با کدِ ۴۱۰ برمی‌گرداند) یکی بماند. توضیحِ کاملِ
// داستانِ کدِ HTTP در همان کامپوننت و در `lib/productGone.ts` نوشته شده.

export default function ProductNotFound() {
  return <ProductGone />;
}
