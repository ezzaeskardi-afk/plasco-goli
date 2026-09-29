"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ShopInfo } from "@/lib/types";

// ============================================================
// نوارِ سراسریِ اطلاعیه — همتای `initShopBar` در نسخهٔ Express
// ============================================================
// تفاوتِ واقعی که این کامپوننت پر می‌کند: در Next این نوار **فقط** وقتی
// فروشگاه بسته بود نشان داده می‌شد. یعنی مدیر در پنل یک اطلاعیه می‌نوشت
// («ارسالِ عید از ۲۵ اسفند»، «تعطیلاتِ رسمی») و نسخهٔ Next هیچ‌جا نشانش
// نمی‌داد — نه در صفحه‌ی اصلی، نه در صفحه‌ی محصول. حالا:
//
//   • اطلاعیه‌ی عادی روی **همه‌ی** صفحه‌ها (جز صفحه‌های تمام‌صفحه) می‌آید و
//     بسته‌شدنی است؛ بستنش تا پایانِ همان نشست در `sessionStorage` می‌ماند
//     تا با هر کلیکِ صفحه دوباره برنگردد.
//   • پیامِ «فروشگاه بسته است» بسته‌شدنی **نیست**: تا باز شدنِ فروشگاه باید
//     دیده بماند. اگر بستنش بگذاریم، مشتری پیام را می‌بندد و بعد نمی‌فهمد
//     چرا نمی‌تواند سفارش بدهد.

/** کلیدِ ذخیرهٔ «این اطلاعیه را بستم» — عیناً همان کلیدِ Express. */
export const ANNOUNCEMENT_DISMISS_KEY = "pgAnnDismiss";

/**
 * صفحه‌هایی که نوار در آنها نمی‌آید.
 *
 * معادلِ `body.auth-page` در Express: صفحه‌ی ورود تمام‌صفحه است و تمرکز باید
 * فقط روی فرم باشد، نه روی نوارِ بالای آن.
 */
const NO_BAR_ROUTES = ["/login"];

/**
 * متنِ نوار برای یک وضعیتِ فروشگاه، یا `null` اگر چیزی برای گفتن نیست.
 *
 * خالص است تا در تست قابلِ سنجش باشد: تصمیمِ «چه چیزی نشان بده» نباید داخلِ
 * یک `useEffect` گم شود.
 */
export function announcementText(shop: ShopInfo | null): string | null {
  if (!shop) return null;
  const closed = shop.shopOpen === false;
  const msg = closed
    ? shop.announcement || "فروشگاه موقتاً تعطیل است؛ سفارش‌گیری فعلاً بسته است."
    : shop.announcement;
  return msg || null;
}

export function AnnouncementBar({ shop }: { shop: ShopInfo | null }) {
  const pathname = usePathname();
  const msg = announcementText(shop);
  const closed = shop?.shopOpen === false;

  // دو تکه‌ی جدا عمدی است: `checkedMsg` می‌گوید «برای این متن، حافظه را
  // خوانده‌ام». بدونِ آن، نوارِ بسته‌شده یک فریم دیده می‌شد و بعد ناپدید —
  // یک چشمکِ آزاردهنده در هر بارِ باز کردنِ صفحه. حالا نوار یا هست یا نیست.
  const [checkedMsg, setCheckedMsg] = useState<string | null>(null);
  const [dismissedMsg, setDismissedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!msg) return;
    let stored: string | null = null;
    // ذخیره‌سازی اختیاری است: در حالتِ ناشناسِ بعضی مرورگرها صدا زدنش
    // استثنا پرت می‌کند و نباید کلِ هدر را بخواباند.
    try {
      stored = sessionStorage.getItem(ANNOUNCEMENT_DISMISS_KEY);
    } catch {
      stored = null;
    }
    setDismissedMsg(stored);
    setCheckedMsg(msg);
  }, [msg]);

  if (!msg) return null;
  if (NO_BAR_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return null;
  // پیامِ تعطیلی منتظرِ حافظه نمی‌ماند و بسته هم نمی‌شود.
  if (!closed && (checkedMsg !== msg || dismissedMsg === msg)) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 border-b px-4 py-2 text-center text-[12.5px] font-bold"
      style={
        closed
          ? {
              background: "linear-gradient(90deg, rgba(232,80,58,.2), rgba(232,80,58,.08))",
              borderColor: "rgba(232,80,58,.35)",
              color: "#FFB4A3",
            }
          : {
              background: "linear-gradient(90deg, rgba(37,214,176,.18), rgba(37,214,176,.07))",
              borderColor: "rgba(37,214,176,.28)",
              color: "var(--color-ink)",
            }
      }
    >
      <span>{msg}</span>
      {!closed && (
        <button
          type="button"
          aria-label="بستن اطلاعیه"
          onClick={() => {
            try {
              sessionStorage.setItem(ANNOUNCEMENT_DISMISS_KEY, msg);
            } catch {
              // حالتِ خصوصی: بستن فقط برای همین رندر کار می‌کند.
            }
            setDismissedMsg(msg);
            setCheckedMsg(msg);
          }}
          className="shrink-0 cursor-pointer px-1 text-[17px] leading-none opacity-65 transition-opacity hover:opacity-100"
          style={{ background: "none", border: "none", color: "inherit" }}
        >
          ×
        </button>
      )}
    </div>
  );
}
