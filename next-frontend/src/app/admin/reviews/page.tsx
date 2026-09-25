import type { Metadata } from "next";
import { ReviewsContent } from "@/components/admin/ReviewsContent";

// ============================================================
// `/admin/reviews` — نظرات
// ============================================================
// تنها راهِ رسیدنِ یک دیدگاه به سایت. فقط «تأییدشده»ها روی صفحه‌ی محصول و در
// «حرف مشتری‌ها»ی صفحه‌ی اصلی دیده می‌شوند.
//
// `robots` عمداً نیست — پوسته‌ی `/admin` آن را می‌دهد.

export const metadata: Metadata = {
  title: "نظرات",
};

export default function AdminReviewsPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">نظرات</h1>
      <ReviewsContent />
    </div>
  );
}
