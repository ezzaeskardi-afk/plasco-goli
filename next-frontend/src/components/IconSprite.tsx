"use client";

import { useEffect } from "react";

// ============================================================
// تزریقِ اسپرایتِ آیکون‌ها — همتای `loadIconSprite` در common.js:۳
// ============================================================
// در نسخه‌ی Express هر صفحه `common.js` را لود می‌کرد و اولین کارش این بود:
//
//     const res = await fetch('/assets/icons.svg');
//     document.body.insertAdjacentHTML('afterbegin', await res.text());
//
// یعنی آیکون‌ها **در زمانِ اجرا** به سند تزریق می‌شدند و بعد
// `<svg><use href="#i-tub"/></svg>` به همان symbolهای هم‌سند اشاره می‌کرد.
//
// چرا در Next هم همین کار را می‌کنیم و به‌جایش آیکون‌ها را دستی در JSX
// نمی‌نویسیم: تصویرسازی‌های دسته‌بندی (`i-tub`، `i-chair`، …) در قالبِ ۲۴×۲۴
// نیستند؛ هر کدام یک تصویرِ رنگیِ **۴۸×۴۸** با رنگ‌های ثابت‌اند. بازنویسی‌شان
// در TSX یعنی ۹ تصویرِ تکرارشده که با هر تغییرِ اسپرایت از هم جدا می‌افتند.
//
// `display:none` عمداً استفاده نشده: بعضی مرورگرها symbolهای داخلِ یک ظرفِ
// display:none را برای `<use>` بیرونی قابل‌استفاده نمی‌دانند. الگوی امن همان
// «بیرون از جریان، صفر اندازه» است.
//
// این کامپوننت هیچ چیزی رندر نمی‌کند و شکستش هم بی‌صدا است: آیکون‌ها تزئینی‌اند
// و اگر اسپرایت نیامد، صفحه باید عادی بماند (عیناً `catch`ی که در common.js بود).

const SPRITE_URL = "/assets/icons.svg";
const SPRITE_FLAG = "data-pg-icon-sprite";

export function IconSprite() {
  useEffect(() => {
    // در ناوبری‌های کلاینتی ممکن است چند بار mount شود؛ یک بار کافی است.
    if (document.body.querySelector(`[${SPRITE_FLAG}]`)) return;

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(SPRITE_URL, { signal: controller.signal });
        if (!res.ok) return;
        const host = document.createElement("div");
        host.setAttribute(SPRITE_FLAG, "");
        host.setAttribute("aria-hidden", "true");
        host.style.position = "absolute";
        host.style.width = "0";
        host.style.height = "0";
        host.style.overflow = "hidden";
        host.innerHTML = await res.text();
        document.body.insertBefore(host, document.body.firstChild);
      } catch {
        // آیکون‌ها تزئینی‌اند؛ خطای بارگذاری نباید هیچ‌چیز را بخواباند.
      }
    })();

    return () => controller.abort();
  }, []);

  return null;
}
