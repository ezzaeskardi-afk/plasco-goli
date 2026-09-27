import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { StallNotice } from "@/components/StallNotice";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ورود",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <div className="py-12 px-4">
      <Suspense
        fallback={
          <div
            className="mx-auto max-w-[420px] rounded-[26px] p-8 text-center"
            style={{ background: "var(--color-surface)" }}
          >
            <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin mx-auto" />
            {/*
              این fallback وقتی دیده می‌شود که مسیرِ ورود از middleware به اینجا
              فرستاده شده باشد — یعنی پرتکرارترین لحظه‌ی گیر کردنِ مشتری. بدونِ
              این هشدار، اگر خودِ فرم هیچ‌وقت mount نشود (چانکِ گم‌شده، خطای
              hydration، اینترنتِ قطع)، کاربر تا ابد به همین چرخ می‌نگریست.
              (در حالتِ سالم، فرم بلافاصله جای این fallback را می‌گیرد.)
            */}
            <StallNotice />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}