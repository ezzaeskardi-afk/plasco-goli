import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderSuccessContent } from "@/components/OrderSuccessContent";

// noindex مثل نسخه‌ی اصلی (frontend/order-success.html خط ۸ و
// robots.txt در server.js:758): این صفحه محتوای شخصیِ یک سفارش را نشان
// می‌دهد و نباید در نتایج جست‌وجو بیاید.
export const metadata: Metadata = {
  title: "نتیجه سفارش",
  description: "وضعیت پرداخت و جزئیات سفارش شما.",
  robots: { index: false, follow: true },
};

// وضعیتِ سفارش هر لحظه ممکن است عوض شود (درگاه، کارِ دوره‌ایِ reconcile).
// هیچ‌چیزِ این صفحه نباید کش شود.
export const dynamic = "force-dynamic";

export default function OrderSuccessPage() {
  // useSearchParams داخلِ Suspense لازم است، وگرنه build با خطای
  // «missing suspense boundary with useSearchParams» می‌شکند.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
