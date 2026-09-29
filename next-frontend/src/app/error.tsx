"use client";

import { useEffect } from "react";
import Link from "next/link";

// ============================================================
// مرزِ خطای مسیر — همتای `frontend/500.html`
// ============================================================
// چرا بازنویسی شد: این صفحه تا امروز یک کارتِ لاغر بود («خطایی رخ داد» + یک
// جمله + یک دکمه) در حالی که نسخه‌ی Express برای همین لحظه سه چیز داشت که
// هیچ‌کدام جایگزین ندارد:
//
//   ۱. اطمینان‌دادن درباره‌ی پول و سفارش: «تقصیر شما نیست و سبد خرید و
//      سفارش‌های شما سر جای خودشان امن هستند… اگر پرداختی انجام داده‌اید،
//      وضعیتش در حساب کاربری‌تان ثبت شده است.» این جمله برای مشتری‌ای است که
//      *وسطِ پرداخت* خطا دیده؛ بدونش فرض می‌کند پولش رفته و کالا نیامده.
//   ۲. راهِ خروجِ دوم: «صفحه‌ی اصلی» — چون «تلاش دوباره» اگر سرورِ خراب
//      همان خطا را بدهد، کاربر را در حلقه نگه می‌دارد.
//   ۳. سفارشِ تلفنی: شماره‌ی تماس و واتساپ. فروشگاهِ کوچک با همین یک خط،
//      فروشِ ازدست‌رفته را برمی‌گرداند.
//
// (نسخه‌ی `global-error.tsx` این متن را داشت، ولی آن فقط وقتی دیده می‌شود که
// خودِ layout ریشه ترکیده باشد؛ خطاهای معمولیِ صفحه — که خیلی شایع‌ترند — به
// همین فایل می‌رسند و کاربر همان‌جا صفحه‌ی لاغر را می‌دید.)
//
// متنِ سفارش تلفنی/واتساپ از `SHOP` نسخه‌ی Express آمده است (frontend/500.html)
// و مثل پاورقی ثابت است، پس درون‌خطی گذاشته شده تا این صفحه به هیچ درخواستِ
// شبکه‌ای وابسته نباشد — وقتی سرور خطا داده، درخواستِ بعدی هم می‌تواند خطا بدهد.
const SHOP_PHONE_FA = "۰۹۱۱-۳۵۶-۷۴۰۹";
const SHOP_PHONE = "tel:09113567409";
const SHOP_WHATSAPP = "https://wa.me/989113567409";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // بدون این، خطا بی‌صدا قورت داده می‌شد؛ الگوی رسمی Next برای error boundary
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div
        role="alert"
        className="text-center w-full max-w-[520px] rounded-[20px] p-8"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="w-[70px] h-[70px] rounded-full mx-auto mb-4 grid place-items-center"
          style={{
            background: "var(--color-coral-tint)",
            border: "1px solid rgba(255, 106, 77, 0.26)",
          }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-coral)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <span
          className="inline-block text-[11px] font-extrabold rounded-full px-3 py-1 mb-3.5"
          style={{
            color: "var(--color-coral)",
            background: "var(--color-coral-tint)",
            border: "1px solid rgba(255, 106, 77, 0.26)",
          }}
        >
          خطای ۵۰۰
        </span>

        <h1 className="text-xl font-extrabold mb-3" style={{ color: "var(--color-ink)" }}>
          مشکلی موقت در سرور پیش آمد
        </h1>
        <p className="text-sm leading-loose" style={{ color: "var(--color-ink-soft)" }}>
          تقصیر شما نیست و سبد خرید و سفارش‌های شما سر جای خودشان امن هستند. چند
          لحظه صبر کنید و دوباره تلاش کنید؛ اگر پرداختی انجام داده‌اید،
          وضعیتش در حساب کاربری‌تان ثبت شده است.
        </p>

        <div className="flex flex-wrap gap-2.5 justify-center mt-6">
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-6 py-2.5 text-sm font-extrabold transition-opacity hover:opacity-90"
            style={{ background: "var(--color-teal)", color: "#04211B" }}
          >
            تلاش دوباره
          </button>
          <Link
            href="/"
            className="rounded-full px-6 py-2.5 text-sm font-bold transition-colors"
            style={{
              background: "transparent",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-control)",
            }}
          >
            صفحه‌ی اصلی
          </Link>
        </div>

        <div
          className="mt-6 pt-5 text-[12.5px] leading-loose"
          style={{ borderTop: "1px solid var(--color-line)", color: "var(--color-ink-soft)" }}
        >
          عجله دارید؟ سفارش‌تان را تلفنی بدهید:{" "}
          <a
            href={SHOP_PHONE}
            className="font-bold"
            style={{ color: "var(--color-teal)", fontVariantNumeric: "tabular-nums" }}
          >
            <bdo dir="ltr">{SHOP_PHONE_FA}</bdo>
          </a>
          <br />
          یا در واتساپ پیام بدهید:{" "}
          <a
            href={SHOP_WHATSAPP}
            target="_blank"
            rel="noopener"
            className="font-bold"
            style={{ color: "var(--color-teal)" }}
          >
            واتساپ پلاسکو گلی
          </a>
        </div>
      </div>
    </div>
  );
}
