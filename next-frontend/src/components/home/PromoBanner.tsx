"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

// ============================================================
// بنرِ کد تخفیف — همتای promo-banner در main.js:666-684
// ============================================================
// متنِ بنر و کد از تنظیماتِ فروشگاه می‌آیند (promo_text / promo_code).
// کلیک روی کد = کپی در کلیپ‌بورد + توست؛ بدونِ این، مشتری کد را دستی
// از عکس برمی‌داشت.

export function PromoBanner({ text, code }: { text: string; code: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast("کد کپی شد؛ در سبد خرید واردش کنید", { tone: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // کلیپ‌بورد در همه‌جا در دسترس نیست (http قدیمی، iframe…) — کد را
      // نشان می‌دهیم که دستی بردارد
      toast(`کد تخفیف: ${code}`, { tone: "info" });
    }
  }

  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-16">
      <div
        className="rounded-[26px] p-6 md:p-8 text-center"
        style={{ background: "var(--color-gold-tint)" }}
      >
        <p className="text-base md:text-lg font-extrabold mb-3" style={{ color: "var(--color-gold)" }}>
          {text}
        </p>
        {code && (
          <button
            type="button"
            onClick={copyCode}
            aria-label="کپی کد تخفیف"
            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition-all hover:scale-105"
            style={{
              background: copied ? "var(--color-teal)" : "var(--color-gold)",
              color: copied ? "#04211B" : "#2B0A03",
            }}
          >
            {copied ? "کپی شد ✓" : code}
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="7" y="7" width="10" height="10" rx="2" />
              <path d="M4 13V5a2 2 0 012-2h8" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
