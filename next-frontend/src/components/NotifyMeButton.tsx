"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { notifyMeWhenInStock, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

// ============================================================
// «موجود شد خبرم کن»
// ============================================================
// همتای notifyBtnHtml و شنونده‌اش در frontend/js/common.js:280-320. در نسخه‌ی
// Next هیچ‌جا نبود: کالای ناموجود هم در فهرست و هم در صفحه‌ی محصول بن‌بست بود —
// مشتری فقط «ناموجود» می‌دید و می‌رفت؛ همان مشتری که با یک پیامک برمی‌گشت.
//
// یک کامپوننت، دو مصرف‌کننده (کارتِ محصول و صفحه‌ی جزئیات)، چون منطقِ سه حالتِ
// خطا یکی است و دو بار نوشتنش یعنی دو بار از قلم افتادن.

export function NotifyMeButton({
  productId,
  size = "md",
}: {
  productId: number;
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const router = useRouter();
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => notifyMeWhenInStock(productId),
    onSuccess: (res) => {
      toast(res.message || "ثبت شد؛ به محض موجود شدن خبرتان می‌کنیم", {
        tone: "success",
      });
      setDone(true);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast("برای «خبرم کن» اول وارد حساب‌تان شوید", { tone: "info" });
        // مقصدِ بازگشت از خودِ آدرسِ فعلی خوانده می‌شود و نه از useSearchParams:
        // آن هوک صفحه‌ی استاتیک را به رندرِ کلاینتی می‌کشاند و SSGِ صفحه‌های
        // محصول را خراب می‌کند. اینجا فقط لحظه‌ی کلیک لازم است.
        const back = window.location.pathname + window.location.search;
        setTimeout(() => {
          router.push(`/login?redirect=${encodeURIComponent(back)}`);
        }, 1100);
        return; // به حالتِ اول برنگرد؛ داریم می‌رویم صفحه‌ی ورود
      }
      // ۴۰۹ یعنی موجودی همین لحظه شارژ شد. پیامِ سرور خودش این را می‌گوید و
      // دکمه به حالتِ اول برمی‌گردد: کاربر صفحه را نو کند و بخرد.
      toast(
        err instanceof ApiError && err.message
          ? err.message
          : "ثبت نشد؛ دوباره تلاش کنید",
        { tone: "error" },
      );
    },
  });

  const busy = mutation.isPending;
  const small = size === "sm";

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={busy || done}
      aria-busy={busy}
      aria-live="polite"
      className={`rounded-full font-bold transition-colors inline-flex items-center justify-center gap-1.5 disabled:cursor-default ${
        small ? "w-full py-1.5 text-xs" : "py-2.5 px-6 text-sm self-start"
      }`}
      style={{
        background: done ? "var(--color-teal-tint)" : "var(--color-surface-2)",
        color: done ? "var(--color-teal)" : "var(--color-ink)",
        border: `1px solid ${done ? "var(--color-teal)" : "var(--color-line-control)"}`,
        minHeight: small ? "34px" : undefined,
        opacity: busy ? 0.7 : 1,
      }}
    >
      {done ? (
        <svg
          width={small ? 14 : 16} height={small ? 14 : 16} viewBox="0 0 20 20"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M4 10.5l4 4 8-9" />
        </svg>
      ) : (
        // زنگ — همتای #i-history در نسخه‌ی Express، ولی گویاتر
        <svg
          width={small ? 14 : 16} height={small ? 14 : 16} viewBox="0 0 20 20"
          fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M10 2.5a4.5 4.5 0 00-4.5 4.5c0 3.5-1.5 4.5-1.5 4.5h12s-1.5-1-1.5-4.5A4.5 4.5 0 0010 2.5z" />
          <path d="M8.2 14.5a2 2 0 003.6 0" />
        </svg>
      )}
      {done ? "خبرت می‌کنیم" : busy ? "در حال ثبت…" : "موجود شد خبرم کن"}
    </button>
  );
}
