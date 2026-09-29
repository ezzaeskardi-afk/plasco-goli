"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { REVEAL_THRESHOLD, staggerDelayMs, TO_TOP_AT } from "@/lib/scrollFx";
import { useScrollPast } from "@/lib/useScrollPast";

// ============================================================
// جلوه‌های اسکرول سراسری — همتای `initScrollFx` + `initScrollReveal`
// ============================================================
// چرا این کامپوننت وجود دارد: در نسخه‌ی Express هر صفحه `common.js` را لود
// می‌کرد و آن دو تابع سه کار می‌کردند. هیچ‌کدام در Next نبود، و یکی‌شان فقط
// «نبودن» نبود — **خرابی** بود:
//
//   `[data-reveal]` در CSS با `opacity:0` شروع می‌کند و منتظرِ کلاس
//   `is-visible` است. در Next ناظری نبود که این کلاس را بگذارد. یعنی هر بخشی
//   که این نشانه را رویش می‌گذاشتیم، برای همیشه نامرئی می‌ماند — محتوا در HTML
//   هست (پس سئو سالم) ولی مشتری جای خالی می‌بیند. پس این کامپوننت شرطِ لازمِ
//   استفاده از `data-reveal` در صفحه‌های Next است، نه یک تجمّل.
//
// دو تفاوتِ عمدی با نسخه‌ی اصلی، هر دو به‌خاطرِ ماهیتِ Next:
//
//   ۱. `MutationObserver`: در Express کلِ HTML سرِ `DOMContentLoaded` آماده بود،
//      پس یک پیمایش کافی بود. اینجا مسیرها سمتِ کلاینت عوض می‌شوند و ممکن است
//      بخشی از محتوا بعد از ناوبری برسد؛ یک پیمایشِ یک‌باره آنها را نامرئی
//      می‌گذاشت. ناظر فقط گره‌های تازه را برمی‌دارد (attr تغییرات را نمی‌گیرد،
//      پس با کلاس‌هایی که خودمان می‌گذاریم حلقه نمی‌سازد).
//   ۲. `/admin` مستثنا است — عیناً همان قاعده‌ی نسخه‌ی Express: `admin.html`
//      هرگز `common.js` را لود نمی‌کرد. پنل ابزارِ کار است و دکمه‌ی «بازگشت به
//      بالا» و انیمیشنِ ورود روی جدول‌هایش فقط مزاحمت است.

/** نشانه‌ی «این المان را قبلاً به ناظر داده‌ام» — تا دوباره تأخیر نگیرد. */
const BOUND = "revealBound";

export function ScrollFx() {
  const pathname = usePathname();
  const showTop = useScrollPast(TO_TOP_AT);
  const enabled = !pathname?.startsWith("/admin");

  useEffect(() => {
    if (!enabled) return;

    const all = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // حالت‌های بی‌ناظر: کاربر «کم‌حرکت» خواسته، یا مرورگر IntersectionObserver
    // ندارد. در هر دو حالت همه‌چیز همان لحظه دیده می‌شود — محتوای نامرئی
    // بدترین نتیجه است. ناظرِ گره هم می‌ماند تا محتوای دیرهنگام هم دیده شود.
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      const showAll = () => all().forEach((el) => el.classList.add("is-visible"));
      showAll();
      const watcher = new MutationObserver(showAll);
      watcher.observe(document.body, { childList: true, subtree: true });
      return () => watcher.disconnect();
    }

    // تأخیرِ پله‌ای، به‌ازای هر والد. ترتیبِ پیمایش همان ترتیبِ DOM است، پس
    // کارت‌های یک گرید پشت‌سرهم می‌آیند و گرید بعدی از صفر شروع می‌کند.
    const seen = new Map<Element, number>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          // از دید خارج شد دیگر کاری نداریم؛ در لیستِ بلند نگاه‌داشتنِ صدها
          // هدف یعنی هزینه‌ی بی‌فایده در هر اسکرول.
          io.unobserve(entry.target);
        }
      },
      { threshold: REVEAL_THRESHOLD },
    );

    const observe = (el: HTMLElement) => {
      if (el.dataset[BOUND] === "1") return;
      el.dataset[BOUND] = "1";
      const key = el.parentElement || document.body;
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      if (i > 0) el.style.setProperty("--rd", `${staggerDelayMs(i)}ms`);
      io.observe(el);
    };

    all().forEach(observe);

    const watcher = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches("[data-reveal]")) observe(node);
          node.querySelectorAll<HTMLElement>("[data-reveal]").forEach(observe);
        }
      }
    });
    watcher.observe(document.body, { childList: true, subtree: true });

    return () => {
      watcher.disconnect();
      io.disconnect();
    };
    // `pathname` در وابستگی‌ها هست چون محتوای مسیرِ تازه باید از نو پیوند بخورد
    // (نشانه‌ی BOUND روی المان‌های قدیمی می‌ماند و بی‌خطر است).
  }, [enabled, pathname]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      className={`to-top${showTop ? " show" : ""}`}
      aria-label="بازگشت به بالای صفحه"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 19V5M6 11l6-6 6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
