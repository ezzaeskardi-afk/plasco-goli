"use client";

import { useEffect } from "react";

// ============================================================
// ۵۰۰ — خطای ریشه (global-error)
// ============================================================
// این فایل آخرین مرزِ خطای Next است: خطاهایی را می‌گیرد که `app/error.tsx`
// نمی‌تواند، چون خودِ `layout.tsx` ریشه (یا Providerهای آن) هنگام رندر ترکیده
// اند. `error.tsx` زیرِ لایه‌ی ریشه می‌نشیند و همین‌ها را نمی‌بیند.
//
// چرا همه‌چیز درون‌خطی است و از globals.css استفاده نمی‌کند:
// global-error **جای** layout ریشه را می‌گیرد، پس استایل‌شیتی که آن لایه
// لینک می‌کرد اصلاً رندر نمی‌شود. اگر روی کلاس‌ها و متغیرهای CSS تکیه کنیم،
// دقیقاً همان لحظه‌ای که این صفحه لازم است، بی‌استایل و به‌هم‌ریخته دیده می‌شود.
// پس رنگ‌ها صریح نوشته شده‌اند — همان پالتِ offline.html.
//
// نسخه‌ی Express این صفحه `frontend/500.html` بود که به `/css/style.css` و
// `/js/err-500.js` وابسته بود. متنش عیناً همین‌جا آمده، ولی وابستگی‌هایش نه:
// متنِ سفارشِ تلفنی و اطمینان‌دادن درباره‌ی سبد و پرداخت، همان چیزی است که
// مشتریِ نگران در آن لحظه لازم دارد.
//
// `<title>` هم لازم است چون از یک کامپوننت کلاینت نمی‌توان `metadata` صادر
// کرد؛ بدونش تبِ مرورگر عنوانِ خالی می‌گیرد.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // بدونِ این، خطای ریشه هیچ‌جا دیده نمی‌شود و «۵۰۰» بی‌ردّ می‌ماند.
  useEffect(() => {
    console.error(error);
  }, [error]);

  const ink = "#EDF6F1";
  const inkSoft = "#9FB3AB";
  const teal = "#25E3C4";
  const coral = "#FF6A4D";
  const line = "rgba(237,246,241,.12)";

  const btnBase = {
    display: "inline-block",
    padding: "12px 24px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 800,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    border: "1px solid transparent",
  } as const;

  return (
    <html lang="fa" dir="rtl">
      <head>
        <title>خطای موقت سرور (۵۰۰) | پلاسکو گلی</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#0B1411" />
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
      </head>
      <body
        style={{
          margin: 0,
          background: "#0B1411",
          color: ink,
          fontFamily:
            'Vazirmatn, Vazir, "Segoe UI", Tahoma, system-ui, sans-serif',
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
          }}
        >
          <div
            role="alert"
            style={{
              width: "100%",
              maxWidth: 520,
              textAlign: "center",
              background: "#12201B",
              border: `1px solid ${line}`,
              borderRadius: 20,
              padding: "44px 30px",
              boxShadow: "0 30px 60px -30px rgba(0,0,0,.6)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 78,
                height: 78,
                margin: "0 auto 22px",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "rgba(255,106,77,.10)",
                border: "1px solid rgba(255,106,77,.26)",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={coral}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 36, height: 36 }}
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <span
              style={{
                display: "inline-block",
                fontSize: 12,
                fontWeight: 800,
                color: coral,
                background: "rgba(255,106,77,.10)",
                border: "1px solid rgba(255,106,77,.26)",
                borderRadius: 999,
                padding: "4px 12px",
                marginBottom: 14,
              }}
            >
              خطای ۵۰۰
            </span>

            <h1 style={{ fontSize: 23, lineHeight: 1.6, margin: "0 0 12px" }}>
              مشکلی موقت در سرور پیش آمد
            </h1>

            <p
              style={{
                color: inkSoft,
                fontSize: 14.5,
                lineHeight: 2.1,
                margin: 0,
              }}
            >
              تقصیر شما نیست و سبد خرید و سفارش‌های شما سر جای خودشان امن
              هستند. چند لحظه صبر کنید و دوباره تلاش کنید؛ اگر پرداختی انجام
              داده‌اید، وضعیتش در حساب کاربری‌تان ثبت شده است.
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                flexWrap: "wrap",
                marginTop: 26,
              }}
            >
              {/* reset از خودِ Next می‌آید: بخشِ شکسته را دوباره رندر می‌کند. */}
              <button
                type="button"
                onClick={reset}
                style={{ ...btnBase, background: teal, color: "#04211B" }}
              >
                تلاش دوباره
              </button>
              {/*
                اینجا عامداً <a> است نه <Link>: این صفحه *جای* لایه‌ی ریشه
                را می‌گیرد، یعنی همان Providerی که مسیریابِ Next در آن زندگی
                می‌کند ممکن است اصلاً رندر نشده باشد (و اگر با همین خطا
                ترکیده باشد، <Link> دوباره می‌ترکد). ضمناً در چنین حالتی
                بارگذاریِ کاملِ صفحه دقیقاً همان چیزی است که می‌خواهیم.
              */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  ...btnBase,
                  background: "transparent",
                  color: ink,
                  border: `1px solid ${line}`,
                }}
              >
                صفحه‌ی اصلی
              </a>
            </div>

            <div
              style={{
                marginTop: 26,
                paddingTop: 20,
                borderTop: `1px solid ${line}`,
                fontSize: 13,
                color: inkSoft,
                lineHeight: 2.1,
              }}
            >
              عجله دارید؟ سفارش‌تان را تلفنی بدهید:{" "}
              <a
                href="tel:09113567409"
                style={{ color: teal, fontWeight: 700 }}
              >
                <bdo dir="ltr" style={{ fontVariantNumeric: "tabular-nums" }}>
                  ۰۹۱۱-۳۵۶-۷۴۰۹
                </bdo>
              </a>
              <br />
              یا در واتساپ پیام بدهید:{" "}
              <a
                href="https://wa.me/989113567409"
                target="_blank"
                rel="noopener"
                style={{ color: teal, fontWeight: 700 }}
              >
                واتساپ پلاسکو گلی
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
