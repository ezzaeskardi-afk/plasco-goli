"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/api";
import type { AuthMeResponse } from "@/lib/types";
import {
  hasBusyOverlay,
  hasSeenWelcome,
  markWelcomeSeen,
  WELCOME_BUSY_RETRY_MS,
  WELCOME_DELAY_MS,
  WELCOME_INTENT_DELAY_MS,
  WELCOME_INTENT_EVENT,
  WELCOME_PRODUCTS_THRESHOLD,
  welcomePageEligible,
  welcomeScrolledEnough,
} from "@/lib/welcome";

// ============================================================
// کادرِ خوش‌آمد — همتای `showWelcome`/`initWelcomePrompt` نسخه‌ی Express
// ============================================================
// در نسخه‌ی Next این کادر **وجود نداشت**، یعنی تنها جایی که یک بازدیدکننده‌ی
// ناشناس به ثبت‌نام دعوت می‌شد، حذف شده بود؛ مشتری می‌توانست کلِ فروشگاه را
// بگردد و هیچ‌جا به او گفته نشده بود «با شماره‌ات وارد شو تا سفارش‌هایت ذخیره
// شود». متن و شرط‌ها عیناً از frontend/js/common.js آمده‌اند.

export function WelcomePrompt() {
  const pathname = usePathname() ?? "/";

  // همان کلیدِ کشِ هدر — یعنی هیچ درخواستِ `/api/auth/me` دومی زده نمی‌شود.
  const { data, isSuccess, isError } = useQuery<AuthMeResponse>({
    queryKey: ["auth"],
    queryFn: getMe,
    staleTime: 60_000,
    retry: false,
  });

  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);

  const settled = isSuccess || isError;
  const user = data?.user ?? null;
  const eligible = welcomePageEligible(pathname);

  useEffect(() => {
    // تا پاسخِ «وارد شده یا نه» نیامده تصمیم نمی‌گیریم. اگر همین حالا نشانش
    // بدهیم، مشتریِ وارد‌شده یک فریم دعوت به ثبت‌نام می‌بیند.
    if (!eligible || !settled) return;

    // وارد‌شده: نه کادر، و برای همیشه علامت می‌خورَد.
    if (user) {
      markWelcomeSeen();
      return;
    }

    if (hasSeenWelcome()) return;

    let armed = false; // آیا بخشِ محصولات دیده شده؟
    let done = false; // یک‌بار بیشتر اجرا نشود
    const timers: ReturnType<typeof setTimeout>[] = [];
    let io: IntersectionObserver | null = null;

    function stop() {
      done = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener(WELCOME_INTENT_EVENT, onIntent);
      io?.disconnect();
      io = null;
    }

    function fire() {
      if (done) return;
      // کاربر وسطِ یک دیالوگ است (مثلاً فرمِ دیدگاه). پریدن روی آن هم بی‌ادبانه
      // است و هم دیالوگ را از دید خارج می‌کند؛ چند ثانیه بعد دوباره.
      if (hasBusyOverlay()) {
        timers.push(setTimeout(fire, WELCOME_BUSY_RETRY_MS));
        return;
      }
      stop();
      setOpen(true);
    }

    function arm() {
      if (armed) return;
      armed = true;
      timers.push(setTimeout(fire, WELCOME_DELAY_MS));
    }

    // «محصولات را دید» = بخشِ محصولات یک بار وارد دید شد. اگر صفحه چنین بخشی
    // نداشت یا مرورگر ناظر نداشت، فقط تایمر می‌ماند — نه اینکه کادر بیفتد.
    const anchor = document.getElementById("products");
    if (anchor && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          io?.disconnect();
          io = null;
          arm();
        },
        { threshold: WELCOME_PRODUCTS_THRESHOLD },
      );
      io.observe(anchor);
    } else {
      arm();
    }

    function onScroll() {
      if (!armed || done) return;
      if (
        welcomeScrolledEnough(
          window.scrollY,
          window.innerHeight,
          document.documentElement.scrollHeight,
        )
      ) {
        fire();
      }
    }

    // «علاقه‌ی واقعی» از جای دیگرِ سایت (افزودن به سبد) — آنجا ثبت‌نام دیگر
    // مزاحمت نیست، واقعاً به‌دردش می‌خورد که سبدش با بستنِ مرورگر گم نشود.
    function onIntent() {
      if (done) return;
      timers.push(setTimeout(fire, WELCOME_INTENT_DELAY_MS));
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener(WELCOME_INTENT_EVENT, onIntent);

    return stop;
  }, [eligible, settled, user]);

  // ورودِ نرم: اولین رندر نامرئی، فریمِ بعد کلاسِ `open` — همان
  // `requestAnimationFrame` نسخه‌ی Express، فقط با state.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  function dismiss() {
    markWelcomeSeen();
    setShown(false);
    // بعد از پایانِ transition از DOM برداشته می‌شود (۳۰۰ms = طولِ transition).
    // بدونِ این مکث، کادر یک‌دفعه ناپدید می‌شد و حسِ «کرش» می‌داد.
    window.setTimeout(() => setOpen(false), 300);
  }

  if (!open) return null;

  return (
    <div
      className={`welcome-overlay${shown ? " open" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        className="welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wcTitle"
      >
        <button
          type="button"
          className="welcome-close"
          aria-label="بستن"
          onClick={dismiss}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <span className="mx-auto mb-4 block h-[58px] w-[58px] overflow-hidden rounded-full border border-line-strong">
          {/* eslint-disable-next-line @next/next/no-img-element -- نشانِ ۵۸px؛ next/image اینجا فقط سربار و ریسکِ پیکربندی است */}
          <img
            src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jpg"
            alt="لوگوی پلاسکو گلی"
            width={58}
            height={58}
            className="h-[58px] w-[58px] object-cover"
          />
        </span>

        <h3 id="wcTitle">به پلاسکو گلی خوش اومدید 👋</h3>
        <p>
          با شماره موبایل‌تون ثبت‌نام کنید تا سفارش‌هاتون ذخیره بشه،
          علاقه‌مندی‌هاتون رو نشون کنید و خرید بعدی سریع‌تر باشه.
        </p>

        <div className="welcome-actions">
          <Link
            href="/login"
            onClick={markWelcomeSeen}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-teal)", color: "#04211B" }}
          >
            ورود / ثبت‌نام سریع
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-full px-5 py-2.5 text-sm font-bold transition-colors"
            style={{
              background: "transparent",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-strong)",
            }}
          >
            فعلاً فقط نگاه می‌کنم
          </button>
        </div>
      </div>
    </div>
  );
}
