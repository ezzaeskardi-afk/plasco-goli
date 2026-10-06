import type { Metadata } from "next";
import { ReviewsContent } from "@/components/admin/ReviewsContent";
import { AdminPage } from "@/components/admin/PageHead";

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
    <AdminPage
      sectionKey="reviews"
      desc="صفِ تأییدِ دیدگاه‌های خریداران — تأیید، رد یا برگرداندن به صف. فقط دیدگاهِ تأییدشده روی صفحه‌ی محصول می‌رود."
    >
      <ReviewsContent />
    </AdminPage>
  );
}
