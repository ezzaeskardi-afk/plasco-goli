"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ToastProvider } from "./Toast";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";
import { IconSprite } from "./IconSprite";
import { ScrollFx } from "./ScrollFx";
import { BottomNav } from "./BottomNav";
import { WelcomePrompt } from "./WelcomePrompt";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // ۳۰ ثانیه — داده "تازه" محسوب بشه
            gcTime: 5 * 60 * 1000, // ۵ دقیقه — بعد از unmount دور ریخته بشه
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* ToastProvider داخلِ QueryClientProvider است تا هر کامپوننتی که هم
          mutation دارد و هم می‌خواهد نتیجه را اعلام کند، به هر دو دسترسی
          داشته باشد. */}
      <ToastProvider>
        <ServiceWorkerRegistrar />
        {/* اسپرایتِ آیکون‌ها — همتای همان تزریقِ ابتدای common.js. قبل از
            `children` است تا آیکون‌های دسته‌بندی در دراور و منوی کشوییِ هدر
            آماده باشند. */}
        <IconSprite />
        {children}
        {/* سه پوسته‌ی سراسریِ باقی‌مانده از `common.js` — هر سه داخلِ
            QueryClientProvider هستند چون سبد/حسابِ کاربر را از کشِ مشترکِ
            هدر می‌خوانند و هیچ درخواستِ تازه‌ای نمی‌زنند. */}
        <ScrollFx />
        <BottomNav />
        <WelcomePrompt />
      </ToastProvider>
    </QueryClientProvider>
  );
}