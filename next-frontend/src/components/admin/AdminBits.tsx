"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OrderStatus } from "@/lib/adminTypes";

// ============================================================
// قطعه‌های مشترکِ پنل مدیریت
// ============================================================
// عمداً یک فایلِ کوچک است و نه یک کتابخانه‌ی کامپوننت: چهار نمای این پنل به
// همان چهار قطعه نیاز دارند (کارتِ آمار، پنل، برچسب، حالتِ خطا/در دسترس نبودن).
// تنها دلیلی که اینجا «use client» است، دکمه‌ی «دوباره تلاش کن» است.

// ============================================================
// موبایل
// ============================================================
// آیا کاربر همین حالا روی صفحه‌ی باریک است؟
//
// چرا با matchMedia و نه با CSS: خیلی از چیزها با کلاس حل می‌شوند (چیدمان،
// اندازه)، ولی بعضی تصمیم‌ها نمی‌شوند — مثلاً «جزئیاتِ سفارش در موبایل باید
// یک برگه‌ی تمام‌صفحه باشد» یعنی رندرِ یک دکمه‌ی بستن و قفل‌کردن اسکرولِ صفحه.
//
// مقدارِ اولیه false است و در effect ست می‌شود: رندرِ سرور و اولین رندرِ کلاینت
// یکی می‌مانند، پس هیدریشن نمی‌شکند.
export function useIsNarrow(query = "(max-width: 1023px)"): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return narrow;
}

// ---------- عدد و پول ----------

export function faNum(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(Number.isFinite(n) ? n : 0);
}

export function toman(n: number): string {
  return `${faNum(n)} تومان`;
}

/** عددِ بزرگ به شکلِ خوانا: ۱٫۶ میلیارد تومان — برای کارتِ «ارزش انبار» */
export function tomanShort(n: number): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `${faNum(Math.round(v / 100_000_000) / 10)} میلیارد تومان`;
  if (v >= 1_000_000) return `${faNum(Math.round(v / 100_000) / 10)} میلیون تومان`;
  return toman(v);
}

// ---------- تاریخ ----------
// تایم‌استمپ‌های دیتابیس **UTC** و بدونِ `Z` ذخیره می‌شوند
// («2026-08-23 21:36:11»). اگر مستقیم به `new Date()` داده شوند، مرورگر آن‌ها
// را محلی فرض می‌کند و ساعتِ هر سفارش ۳ ساعت و نیم جابه‌جا می‌شود — یعنی
// سفارشی که ساعت ۲۳ ثبت شده، «فردا» نشان داده می‌شود. همان کاری که `faDate`
// در routes/admin.js:745 می‌کند اینجا هم انجام می‌شود: تبدیل فاصله به `T` و
// افزودنِ `Z` تا UTC صریح شود.
function toUtc(v: string | null | undefined): Date | null {
  if (!v) return null;
  const raw = String(v);
  // دو شکلِ زمانیِ متفاوت از سرور می‌آید و اینجا یکی می‌شوند:
  //   • تایم‌استمپِ دیتابیس: «2026-08-23 21:36:11» — فاصله دارد، Z ندارد
  //   • مِتی‌امپِ فایلِ بکاپ:  «2026-09-25T13:17:01.084Z» — ISO و کامل
  // قبلاً به هر دو «Z» افزوده می‌شد؛ روی دومی «...084ZZ» می‌ساخت که تاریخِ
  // بی‌اعتبار است و نتیجه‌اش «—» بود. فهرستِ بکاپ‌ها همه‌جا «— — —» نشان
  // می‌داد و خطِ «آخرین خواندن» هم خالی می‌ماند. حالا فقط آن‌که Z ندارد
  // علامت می‌خورد.
  const iso = /[TZ]/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function faDateTime(v: string | null | undefined): string {
  const d = toUtc(v);
  return d ? d.toLocaleString("fa-IR") : "—";
}

export function faDate(v: string | null | undefined): string {
  const d = toUtc(v);
  return d ? d.toLocaleDateString("fa-IR") : "—";
}

/** «۳ روز پیش» — برای فهرستِ کهنه‌شدنِ موجودی و رویدادها */
export function faAgo(v: string | null | undefined): string {
  const d = toUtc(v);
  if (!d) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "همین حالا";
  if (mins < 60) return `${faNum(mins)} دقیقه پیش`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${faNum(hours)} ساعت پیش`;
  return `${faNum(Math.round(hours / 24))} روز پیش`;
}

// ============================================================
// وضعیتِ سفارش
// ============================================================
// برچسب‌ها و رنگ‌ها یک‌جا تعریف شده‌اند تا فهرست، جزئیات و فیلترها هیچ‌وقت
// دو نامِ متفاوت برای یک وضعیت نشان ندهند (چیزی که در نسخه‌ی Express با
// رشته‌های پراکنده ممکن بود).

type Tone = "teal" | "gold" | "coral" | "pink" | "dim";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending_payment: { label: "در انتظار پرداخت", tone: "gold" },
  paid: { label: "پرداخت‌شده", tone: "teal" },
  shipped: { label: "ارسال‌شده", tone: "gold" },
  delivered: { label: "تحویل‌شده", tone: "teal" },
  canceled: { label: "لغوشده", tone: "coral" },
  return_requested: { label: "درخواست مرجوعی", tone: "pink" },
  returned: { label: "مرجوع‌شده", tone: "pink" },
  failed: { label: "ناموفق", tone: "dim" },
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS[status as OrderStatus]?.label ?? status;
}

/**
 * گذرهای مجازِ وضعیت — کپیِ `ADMIN_STATUS_FLOW` در lib/db.js:1566.
 *
 * چرا در UI هم تکرار می‌شود: سرور هر گذرِ نامجاز را ۴۰۹ می‌کند و مدیر فقط
 * پیامِ «ممکن نیست» می‌بیند. اگر دکمه‌ها از همین نقشه ساخته شوند، مدیر فقط
 * کارهایی را می‌بیند که واقعاً می‌شود انجام داد.
 *
 * توجه: `return_requested → returned` در این نقشه نیست، چون مسیرِ خودش را
 * دارد (adminAcceptReturnTx؛ موجودی را هم برمی‌گرداند). آن یکی در خودِ نمای
 * جزئیات به‌عنوان دکمه‌ی «تأیید مرجوعی» اضافه می‌شود.
 */
export const ORDER_FLOW: Record<string, OrderStatus[]> = {
  paid: ["shipped", "canceled"],
  shipped: ["delivered", "paid", "canceled"],
  delivered: ["shipped"],
  return_requested: ["delivered"],
  canceled: [],
  returned: [],
};

const TONE_STYLE: Record<Tone, { background: string; color: string }> = {
  teal: { background: "var(--color-teal-tint)", color: "var(--color-teal)" },
  gold: { background: "var(--color-gold-tint)", color: "var(--color-gold)" },
  coral: { background: "var(--color-coral-tint)", color: "var(--color-coral)" },
  pink: { background: "var(--color-pink-tint)", color: "var(--color-pink)" },
  dim: { background: "var(--color-surface-2)", color: "var(--color-ink-dim)" },
};

export function Pill({
  label,
  tone = "dim",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className="inline-block shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={TONE_STYLE[tone]}
    >
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const meta = ORDER_STATUS[status as OrderStatus];
  return <Pill label={meta?.label ?? status} tone={meta?.tone ?? "dim"} />;
}

// ============================================================
// حالت‌های بارگذاری / خطا
// ============================================================

export function Spinner({ label = "در حال بارگذاری…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12">
      <span
        className="inline-block h-6 w-6 rounded-full border-2 animate-spin"
        style={{
          borderColor: "rgba(37, 214, 176, 0.3)",
          borderTopColor: "var(--color-teal)",
        }}
      />
      <span className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
        {label}
      </span>
    </div>
  );
}

export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-[18px] p-4 text-sm flex items-center justify-between gap-4"
      style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
      role="alert"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-full px-3 py-2 text-xs font-bold sm:py-1.5"
          style={{ background: "var(--color-coral)", color: "var(--color-ink-on-warm)" }}
        >
          دوباره تلاش کن
        </button>
      )}
    </div>
  );
}

/**
 * «این بخش برای تو نیست» — حالتِ ۴۰۳.
 *
 * مسیرِ `/admin` در middleware فقط «واردشده بودن» را چک می‌کند، نه ادمین بودن؛
 * مجوزِ واقعی سمتِ Express است. پس ممکن است مشتریِ عادی هم به این صفحات برسد و
 * هر درخواستش ۴۰۳ بگیرد. بدونِ این قطعه، او به‌جای یک جمله‌ی روشن، چند کادرِ
 * قرمزِ «خطای سرور» می‌دید.
 */
export function ForbiddenBox() {
  return (
    <div
      className="rounded-[18px] p-5 text-sm"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        color: "var(--color-ink-soft)",
      }}
    >
      <p className="font-bold mb-1" style={{ color: "var(--color-ink)" }}>
        دسترسی به پنل مدیریت ندارید
      </p>
      <p className="text-xs leading-relaxed">
        این بخش فقط برای مدیر و کارمندان فروشگاه است. اگر فکر می‌کنید اشتباهی
        رخ داده، با مدیر فروشگاه تماس بگیرید.
      </p>
      <Link
        href="/"
        className="inline-block mt-3 rounded-full px-4 py-2 text-xs font-bold"
        style={{ background: "var(--color-teal)", color: "#04211B" }}
      >
        بازگشت به فروشگاه
      </Link>
    </div>
  );
}

// ============================================================
// چیدمانِ کارت‌ها
// ============================================================

export function StatCard({
  label,
  value,
  hint,
  tone = "teal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div
      className="rounded-[18px] p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <div className="text-[11px] mb-1.5" style={{ color: "var(--color-ink-dim)" }}>
        {label}
      </div>
      <div
        className="text-lg font-extrabold leading-tight"
        style={{ color: TONE_STYLE[tone].color }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] mt-1" style={{ color: "var(--color-ink-dim)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[18px] p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** دکمه‌ی اصلی/فرعیِ پنل — یک شکل، تا هر نما دکمه‌ی خودش را نسازد */
export function Btn({
  children,
  onClick,
  tone = "teal",
  disabled,
  type = "button",
  title,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: Tone;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  const style = TONE_STYLE[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      // `min-h-10` یعنی ۴۰ پیکسل روی موبایل. استانداردِ لمسی ۴۴ است، ولی
      // ۴۰ همان جایی است که «اشتباهی نخورد» را می‌دهد بدونِ اینکه دکمه‌ها
      // روی دسکتاپ چاق شوند؛ `sm:min-h-0` ارتفاع را به حالتِ قبلی برمی‌گرداند.
      className={`rounded-full px-4 py-2 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 min-h-10 sm:min-h-0 sm:px-3.5 sm:py-1.5 ${className}`}
      style={{ background: style.background, color: style.color }}
    >
      {children}
    </button>
  );
}

/** ورودیِ پنل — استایلِ یکسان برای فیلترها و فرم‌های کوچک */
export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  onKeyDown,
  dir,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  dir?: "ltr" | "rtl";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      dir={dir}
      aria-label={ariaLabel}
      // چرا ۱۶ پیکسل روی موبایل: اگر فونتِ ورودی کمتر از ۱۶ باشد، iOS در
      // لحظه‌ی فوکوس کلِ صفحه را زوم می‌کند و پنل زیرِ انگشت جابه‌جا می‌شود.
      // `sm:text-xs` ظاهرِ دسکتاپ را دست‌نخورده نگه می‌دارد.
      className={`rounded-full px-3 py-2 text-[16px] outline-none min-h-10 sm:min-h-0 sm:py-1.5 sm:text-xs ${className}`}
      style={{
        background: "var(--color-surface-2)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-line-control)",
      }}
    />
  );
}
