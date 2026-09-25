import { Suspense } from "react";
import { CrmContent } from "@/components/CrmContent";
import type { Metadata } from "next";

// `robots` عمداً اینجا نیست: `app/admin/layout.tsx` برای هر صفحه‌ی زیرِ /admin
// `noindex, nofollow` می‌گذارد. قبلاً همین‌جا `{ index: false }` بود و چون
// متادیتای فرزند فیلدِ `robots` را کامل جایگزین می‌کند (نه اینکه با والد ادغام
// شود)، نتیجه `noindex` تنها بود و `follow` به پیش‌فرضِ `true` برمی‌گشت — یعنی
// همان چیزی که می‌خواستیم جلویش را بگیریم. حالا یک‌جا در پوسته تعیین می‌شود.
export const metadata: Metadata = {
  title: "مدیریت ارتباط با مشتری",
};

export default function CrmPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">
        مدیریت ارتباط با مشتری (CRM)
      </h1>

      {/*
        مرزِ Suspense لازم است، نه تزئینی: داخلِ CrmContent از
        `useSearchParams` استفاده می‌شود (برای پیوندِ `/admin/crm?customer=<id>`
        از نمای مشتری‌ها) و Next بدونِ این مرز، build را با خطای
        «missing suspense boundary with useSearchParams» می‌شکند — همان چیزی که
        در `app/login/page.tsx` و `app/order-success/page.tsx` هم رعایت شده.
        fallback خودش اسکلتِ تب‌ها را نشان می‌دهد تا صفحه از خالی به پر نپرد.
      */}
      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="h-9 w-56 rounded-full animate-pulse" style={{ background: "var(--color-surface)" }} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl p-4 h-28 animate-pulse"
                  style={{ background: "var(--color-surface)" }}
                />
              ))}
            </div>
          </div>
        }
      >
        <CrmContent />
      </Suspense>
    </div>
  );
}
