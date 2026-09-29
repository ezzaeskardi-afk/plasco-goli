"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// ============================================================
// پنهان‌کردنِ چارچوبِ فروشگاه در مسیرهای «تمام‌صفحه»
// ============================================================
// در نسخه‌ی Express صفحه‌ی ورود یک سندِ مستقل بود: `<body class="auth-page">`
// با هدر و پاورقیِ **حذف‌شده** (`frontend/login.html` هیچ `<header>`/`<footer>`
// نداشت). چرا: ورود یک تصمیمِ تک‌کاره است و هرچه لینکِ اضافه بالای فرم باشد،
// چشم و انگشت را از فرم دور می‌کند — به‌جایش دکمه‌ی «بازگشت به فروشگاه» گذاشته
// شده بود.
//
// در Next، هدر و پاورقی داخلِ `layout.tsx` ریشه‌اند و هیچ layoutِ تودرتویی
// نمی‌تواند آن‌ها را بردارد (لایه‌های فرزند فقط *داخل* `{children}` می‌نشینند).
// پس تصمیم در سمتِ کلاینت گرفته می‌شود: هر قطعه‌ای که داخلِ این پوشش بپیچد، در
// مسیرهای زیر رندر نمی‌شود.
//
// نکته‌ی مهم: چون نوارِ اطلاعیه‌ی فروشگاه (`AnnouncementBar`) داخلِ خودِ هدر
// است، این پوشش آن را هم پنهان می‌کند — دقیقاً همان چیزی که `initShopBar` در
// common.js با `if (document.body.classList.contains('auth-page')) return;`
// انجام می‌داد. نوارِ ناوبریِ پایین هم پیش‌تر در همان مسیر خودش را رندر نمی‌کرد.

/** مسیرهایی که چارچوبِ فروشگاه در آن‌ها نمایش داده نمی‌شود. */
const STANDALONE_ROUTES = new Set(["/login"]);

export function HideOnStandalone({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (STANDALONE_ROUTES.has(pathname)) return null;
  return <>{children}</>;
}

export { STANDALONE_ROUTES };
