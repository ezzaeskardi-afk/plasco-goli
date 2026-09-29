import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";
import { StallNotice } from "@/components/StallNotice";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // «ورود / ثبت‌نام» عیناً عنوانِ `login.html` است: در نتایجِ جست‌وجو و در
  // تاریخچه‌ی مرورگر، همین دو کلمه به مشتری می‌گوید این صفحه‌ی ثبت‌نامِ
  // تازه‌ورودها هم هست، نه فقط جای کسانی که از قبل حساب دارند.
  title: "ورود / ثبت‌نام",
  description: "ورود یا ثبت‌نام با شماره موبایل در فروشگاه پلاسکو گلی.",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="auth-card mx-auto max-w-[430px] p-8 text-center">
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
    </AuthShell>
  );
}