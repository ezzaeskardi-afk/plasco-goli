"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ToastProvider } from "./Toast";

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
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}