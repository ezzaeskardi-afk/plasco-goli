"use client";

import { useEffect, useState } from "react";

// ============================================================
// «از این ارتفاع گذشتیم؟»
// ============================================================
// همتای همان حلقه‌ی `initScrollFx` در common.js:391 — با همان دو جزئیاتی که
// آنجا عمدی بود و اینجا هم مهم‌اند:
//
//   ۱. `requestAnimationFrame` با پرچمِ `ticking`: مرورگر در هر اسکرول ده‌ها
//      رویداد می‌دهد و اگر هر کدام یک `setState` بزند، ری‌اکت در همان فریم چند
//      بار رندر می‌کند. سنجیده شد که بدونِ این، اسکرولِ سریع روی موبایل هدر را
//      می‌لرزاند.
//   ۲. مقداری که برمی‌گردانیم **بولی** است نه خودِ عدد. اگر عدد برگردانیم، هر
//      پیکسلِ اسکرول یک رندر می‌شود؛ با بولی، رندر فقط سرِ عبور از آستانه
//      رخ می‌دهد.
//
// شرطِ مقایسه دقیقاً `> threshold` است، نه `>=`: با `y > 600` دکمه در پیکسلِ
// ۶۰۱ می‌آید و در ۶۰۰ می‌رود — همان رفتاری که نسخه‌ی اصلی داشت.
export function useScrollPast(threshold: number): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setPast(window.scrollY > threshold);
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // یک بار همین حالا: اگر صفحه از قبل اسکرول‌شده لود شود (رِفرشِ وسطِ صفحه،
    // یا برگشت با دکمه‌ی back) نباید تا اولین حرکتِ انگشت خالی بماند.
    onScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return past;
}
