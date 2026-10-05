"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { Eyebrow } from "@/components/Eyebrow";

// ============================================================
// بنرِ کد تخفیف — همتای promo-banner در main.js:666-684 و `#promoStrip` در
// index.html:348-364
// ============================================================
// متنِ بنر و کد از تنظیماتِ فروشگاه می‌آیند (promo_text / promo_code).
// کلیک روی کد = کپی در کلیپ‌بورد + توست؛ بدونِ این، مشتری کد را دستی
// از عکس برمی‌داشت.
//
// سه تفاوتِ ساختاری با نسخه‌ی قبلی که همه از Express آمده‌اند:
//   • برچسبِ «پیشنهاد ویژه» (eyebrow) بالای متن — Express داشت و Next نداشت.
//   • خطِ «کد تخفیف:» جدا از خودِ کد؛ تا کدی نباشد خط پنهان می‌ماند، عیناً
//     همان `#promoCodeLine[hidden]` در index.html:353.
//   • راهِ رسیدن به محصولات («مشاهده محصولات») زیرِ بنر.
//
// و یک تفاوتِ رفتاری: پوسته‌ی بنر همیشه رندر می‌شود؛ وقتی بنرِ فعالی نیست با
// `hidden` می‌آید — همان کاری که Express می‌کرد و JS بعداً نشانش می‌داد.
// اگر بدونِ بنر کلاً رندر نمی‌شد، متنِ ثابتِ بنر در HTMLِ اولیه نبود و
// گاردِ زنده (parityManifest) به داشتنِ بنر در دیتابیس وابسته می‌شد.

export function PromoBanner({ text, code }: { text: string; code: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const hasPromo = Boolean(text);

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
    <section hidden={!hasPromo} className="mx-auto max-w-[1180px] px-6 pb-16">
      <div
        className="flex flex-col items-center gap-3 rounded-[26px] p-6 md:p-8 text-center"
        style={{ background: "var(--color-gold-tint)" }}
      >
        <Eyebrow>پیشنهاد ویژه</Eyebrow>
        {text && (
          <p className="text-base md:text-lg font-extrabold" style={{ color: "var(--color-gold)" }}>
            {text}
          </p>
        )}
        <p
          hidden={!code}
          className="text-sm font-bold"
          style={{ color: "var(--color-ink-soft)" }}
        >
          کد تخفیف:{" "}
          {code && (
            <button
              type="button"
              onClick={copyCode}
              aria-label="کپی کد تخفیف"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all hover:scale-105"
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
        </p>
        <Link
          href="#products"
          className="rounded-full px-5 py-2 text-xs font-bold transition-colors"
          style={{ border: "1px solid var(--color-line-strong)", color: "var(--color-ink)" }}
        >
          مشاهده محصولات
        </Link>
      </div>
    </section>
  );
}
