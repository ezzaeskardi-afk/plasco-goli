"use client";

import { useId, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAdminReports, getMonthlySales, monthlyCsvHref } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import {
  Btn,
  ErrorBox,
  ForbiddenBox,
  Panel,
  Spinner,
  StatCard,
  faNum,
  toman,
} from "@/components/admin/AdminBits";
import type {
  AdminReportsResponse,
  CategoryShare,
  MonthlySalesResponse,
  MonthlySalesRow,
  SalesPoint,
  TopCustomer,
  TopProduct,
} from "@/lib/adminTypes";

// ============================================================
// گزارش‌ها
// ============================================================
// این نما **دو بازه‌ی مستقل** دارد و این عمدی است:
//
//   • بازه‌ی روزانه (۷ تا ۳۶۵ روز) جوابِ «این هفته چطور بود؟» را می‌دهد.
//   • گزارشِ ماه‌به‌ماه جوابِ «مرداد چطور بود؟» را می‌دهد — و بازه‌ی روزانه
//     به این سؤال جواب نمی‌دهد، چون «۳۰ روز اخیر» تکه‌ای از دو ماهِ شمسی است.
//
// دو select جدا یعنی مدیر می‌تواند هم‌زمان «۳۰ روز اخیر» و «۲۴ ماه» را ببیند
// بدونِ اینکه یکی دیگری را عوض کند. ادغام‌کردنشان یک فیلتر می‌ساخت که هیچ‌کدام
// از دو سؤال را درست جواب نمی‌داد.
//
// ============================================================
// یک تله‌ی واقعی که در همین نما رفع شده
// ============================================================
// فهرستِ «برترین‌ها» به بازه‌ی انتخاب‌شده **کاری ندارد**:
//   • `topProducts` روی ۹۰ روزِ اخیر است (TOP_PRODUCTS_WINDOW_DAYS در
//     lib/db.js:1799 — پنجره عمدی است، وگرنه کوئریِ JSONِ هر سفارشِ تاریخِ
//     فروشگاه اجرا می‌شد).
//   • `topCustomers` و `categories` روی کلِ تاریخِ فروشگاه‌اند.
// نسخه‌ی Express این را نمی‌گفت، پس مدیر «۷ روز» را انتخاب می‌کرد، جدول‌ها
// تکان نمی‌خوردند و نتیجه‌اش این بود که به عددها بی‌اعتماد شود. اینجا بالای
// همان دو جدول نوشته شده که پنجره‌شان چیست.
//
// تولتیپِ نمودار: نسخه‌ی Express با دستکاریِ DOM یک div متحرک می‌ساخت. اینجا
// مختصاتِ همان نقطه از خودِ محاسبه‌ی نمودار می‌آید و در state نگه داشته
// می‌شود، پس با زوم و تغییر عرض هم سرِ جایش می‌ماند و در RTL جابه‌جا نمی‌شود.

const DAY_RANGES = [7, 30, 90, 365] as const;
const MONTH_RANGES = [6, 12, 24, 36] as const;

/**
 * رقم‌های لاتین را فارسی می‌کند.
 *
 * لازم است چون برچسبِ ماه را **سرور** می‌سازد (`${b.name} ${b.jy}` در
 * db.js:1765) و `jy` عددِ لاتین است: «مرداد 1405». در صفحه‌ای که همه‌جایش
 * «۱۴۰۴» است، همان یک عدد لاتین غلط به نظر می‌رسد. اسمِ ماه رقم ندارد، پس
 * این تبدیل هیچ‌چیزِ دیگری را دست نمی‌زند.
 */
function faDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** برچسبِ کوتاهِ روز برای محورِ نمودار: «۵/۱۲» */
function dayLabel(iso: string): string {
  // ⚠️ `day` از سرور **تاریخِ محلی** است («2026-08-23»)، نه یک تایم‌استمپِ
  // UTC مثلِ بقیه‌ی فیلدهای این پروژه. پس نباید از `faDate` (AdminBits) رد
  // شود: آن یکی به رشته‌های بدونِ Z خودش «Z» می‌چسباند و تاریخ را یک روز
  // عقب می‌برد. اینجا نیمه‌شبِ محلی درست است.
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fa-IR", { month: "numeric", day: "numeric" });
}

export function ReportsContent() {
  const [days, setDays] = useState<number>(30);
  const [months, setMonths] = useState<number>(12);

  const report = useQuery({
    queryKey: ["admin-reports", days],
    queryFn: () => getAdminReports(days),
    // با عوض‌کردنِ بازه، نمودارِ قبلی سرِ جایش می‌ماند و فقط کمرنگ می‌شود؛
    // بدونِ این، هر تغییرِ بازه یک پرشِ سفیدِ کوتاه می‌سازد.
    placeholderData: keepPreviousData,
  });

  const monthly = useQuery({
    queryKey: ["admin-monthly", months],
    queryFn: () => getMonthlySales(months),
    placeholderData: keepPreviousData,
  });

  const forbidden =
    (report.error instanceof ApiError && report.error.status === 403) ||
    (monthly.error instanceof ApiError && monthly.error.status === 403);
  if (forbidden) return <ForbiddenBox />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
          بازه:
        </span>
        {DAY_RANGES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className="rounded-full px-3 py-2 text-xs font-bold min-h-10 sm:min-h-0 sm:py-1.5"
            style={
              days === d
                ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                : { background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }
            }
          >
            {faNum(d)} روز
          </button>
        ))}
        <Btn
          tone="dim"
          className="mr-auto"
          onClick={() => void report.refetch()}
          disabled={report.isFetching}
        >
          {report.isFetching ? "در حال تازه‌سازی…" : "تازه‌سازی"}
        </Btn>
        {/* چاپِ همین صفحه. نسخه‌ی Express هم همین کار را می‌کرد و CSSِ چاپِ
            پروژه (`@media print`) هم همان‌جا نوشته شده، پس دست‌نخورده کار می‌کند. */}
        <Btn tone="dim" onClick={() => window.print()}>
          چاپ
        </Btn>
      </div>

      {report.error && (
        <ErrorBox
          message={`گزارش نیامد — ${message(report.error)}`}
          onRetry={() => void report.refetch()}
        />
      )}

      {report.isLoading ? (
        <Spinner label="در حال محاسبه‌ی گزارش…" />
      ) : report.data ? (
        <DayReport data={report.data} stale={report.isFetching} />
      ) : null}

      <MonthlyReport
        months={months}
        onMonths={setMonths}
        data={monthly.data}
        loading={monthly.isLoading}
        fetching={monthly.isFetching}
        error={monthly.error}
        onRetry={() => void monthly.refetch()}
      />
    </div>
  );
}

// ============================================================
// گزارشِ بازه‌ی روزانه
// ============================================================

function DayReport({
  data,
  stale,
}: {
  data: AdminReportsResponse;
  stale: boolean;
}) {
  const { series, stats } = data;

  const inRange = useMemo(
    () =>
      series.reduce((a, p) => ({ sales: a.sales + p.sales, orders: a.orders + p.orders }), {
        sales: 0,
        orders: 0,
      }),
    [series],
  );
  const best = useMemo(
    () => series.reduce<SalesPoint | null>((a, p) => (p.sales > (a?.sales ?? 0) ? p : a), null),
    [series],
  );
  const activeDays = series.filter((p) => p.orders > 0).length;
  const failed = (stats.failed_orders || 0) + (stats.canceled_orders || 0);

  return (
    <div className="space-y-4" style={{ opacity: stale ? 0.6 : 1 }}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={`فروشِ ${faNum(data.days)} روز`}
          value={toman(inRange.sales)}
          hint={`${faNum(inRange.orders)} سفارش در این بازه`}
        />
        <StatCard
          label="میانگین روزانه"
          value={toman(Math.round(inRange.sales / data.days))}
          tone="dim"
          hint={`${faNum(activeDays)} روز از ${faNum(data.days)} روز فروش داشته`}
        />
        <StatCard
          label="میانگین هر سفارش"
          value={toman(inRange.orders ? Math.round(inRange.sales / inRange.orders) : 0)}
          tone="dim"
          hint={`میانگین کلِ تاریخِ فروشگاه: ${toman(
            stats.total_orders ? Math.round(stats.total_sales / stats.total_orders) : 0,
          )}`}
        />
        <StatCard
          label="بهترین روز"
          // چرا `text-lg` را با یک span کوچک‌تر می‌شکنیم: یک تاریخِ شمسی جا
          // بیشتری از یک عدد می‌خواهد و در همان اندازه‌ی بقیه‌ی کارت‌ها
          // می‌شکند.
          value={best && best.sales > 0 ? dayLabel(best.day) : "—"}
          tone="gold"
          hint={best && best.sales > 0 ? `${toman(best.sales)} در یک روز` : "در این بازه فروشی نبوده"}
        />
        <StatCard
          label="سفارش‌های بینتیجه"
          value={faNum(failed)}
          tone={failed > 0 ? "coral" : "teal"}
          hint={`${faNum(stats.failed_orders || 0)} پرداختِ ناموفق · ${faNum(
            stats.canceled_orders || 0,
          )} لغوشده`}
        />
      </div>

      <Panel
        title="نمودار فروش"
        action={
          series.length > 0 && (
            <span className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
              از {dayLabel(series[0].day)} تا {dayLabel(series[series.length - 1].day)}
            </span>
          )
        }
      >
        <SalesChart series={series} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="پرفروش‌ترین کالاها"
          action={<WindowNote>۹۰ روزِ اخیر</WindowNote>}
        >
          <Table
            head={["#", "کالا", "تعداد", "درآمد"]}
            rows={data.topProducts.map((p: TopProduct, i) => [
              faNum(i + 1),
              p.title || "—",
              faNum(p.qty),
              toman(p.revenue),
            ])}
            empty="فروشی ثبت نشده است"
          />
        </Panel>

        <Panel
          title="بهترین مشتری‌ها"
          action={<WindowNote>کلِ تاریخِ فروشگاه</WindowNote>}
        >
          <Table
            head={["#", "مشتری", "سفارش", "مجموع خرید"]}
            rows={data.topCustomers.map((c: TopCustomer, i) => [
              faNum(i + 1),
              // نام می‌تواند خالی باشد (اختیاری است) و شماره در آن حالت تنها
              // شناسه‌ی مشتری است — پس هیچ‌وقت هر دو با هم پنهان نمی‌شوند.
              c.fullName?.trim() || c.phone || "بدون نام",
              faNum(c.orders),
              toman(c.spent),
            ])}
            empty="خریدی ثبت نشده است"
          />
        </Panel>
      </div>

      <Panel title="سهم دسته‌بندی‌ها" action={<WindowNote>کلِ تاریخِ فروشگاه</WindowNote>}>
        <BarList
          rows={data.categories.map((c: CategoryShare) => ({ name: c.category, value: c.revenue }))}
          empty="هنوز داده‌ای ثبت نشده"
        />
      </Panel>
    </div>
  );
}

/** توضیحِ پنجره‌ی زمانیِ یک جدول — بدونش عددها با فیلترِ بازه قابل‌تطبیق نیستند */
function WindowNote({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
      style={{ background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }}
    >
      {children}
    </span>
  );
}

// ============================================================
// نمودار خطی — SVG دست‌ساز، بدونِ کتابخانه
// ============================================================

function SalesChart({ series }: { series: SalesPoint[] }) {
  // شناسه‌ی گرادیان باید یکتا باشد وگرنه دو نمودارِ هم‌زمان یک گرادیان را
  // می‌گیرند. `useId` کاراکترِ «:» دارد که در `url(#…)` نمی‌شود رویش حساب
  // کرد، پس فیلترش می‌کنیم.
  const gid = `adChartGrad${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);

  const n = series.length;
  if (n === 0) {
    return (
      <p className="text-xs py-8 text-center" style={{ color: "var(--color-ink-dim)" }}>
        داده‌ای برای نمایش نیست
      </p>
    );
  }

  // هندسه عیناً همان نسخه‌ی Express است: ارتفاعِ ثابت، عرضِ متناسب با تعداد
  // نقطه‌ها (تا فاصله‌ها یکنواخت بماند)، و `preserveAspectRatio` تا نقطه‌ها
  // بیضی نشوند.
  const H = 210;
  const padX = 10;
  const padTop = 16;
  const padBottom = 26;
  const W = Math.max(560, Math.min(1100, n * 46));
  const rawMax = Math.max(...series.map((p) => p.sales));
  const hasSales = rawMax > 0;
  const max = Math.max(rawMax, 1);
  const base = H - padBottom;
  const plotH = base - padTop;
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(n - 1, 1);
  const y = (v: number) => base - (v / max) * plotH;

  const line = series
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.sales).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const gy = (padTop + f * plotH).toFixed(1);
    return <line key={f} x1={0} x2={W} y1={gy} y2={gy} />;
  });

  // فقط چند نقطه‌ی نشانه‌گذاری‌شده تا نمودارِ ۳۶۵ روزه شلوغ نشود.
  const step = Math.max(1, Math.round(n / 12));
  const labelIdx =
    n <= 8 ? series.map((_, i) => i) : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];

  const bw = (W - padX * 2) / Math.max(n - 1, 1);
  const p = hover !== null ? series[hover] : null;

  return (
    <div className="relative">
      {/* سقفِ محور فقط وقتی معنا دارد که فروشی باشد. `max` عمداً کفِ ۱ دارد
          (وگرنه تقسیم بر صفر در محاسبه‌ی ارتفاع)، ولی نوشتنِ «سقفِ بازه: ۱
          تومان» روی یک بازه‌ی بی‌فروش، عددی ساختگی را واقعی جلوه می‌دهد — همان
          ایرادی که نسخه‌ی Express داشت. */}
      <div style={{ fontSize: 11, color: "var(--color-ink-dim)" }}>
        {hasSales ? `سقفِ بازه: ${toman(max)}` : "در این بازه فروشی ثبت نشده است"}
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`نمودار فروشِ ${faNum(n)} روز`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1CC9AD" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1CC9AD" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g stroke="rgba(37,214,176,.14)" strokeWidth="1">
          {grid}
        </g>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#1CC9AD" strokeWidth="2" strokeLinejoin="round" />

        {series.map((point, i) =>
          i % step === 0 || i === n - 1 ? (
            <circle
              key={point.day}
              cx={x(i)}
              cy={y(point.sales)}
              r={hover === i ? 4.5 : 3.2}
              fill="#1CC9AD"
            />
          ) : null,
        )}

        {labelIdx.map((i) => (
          <text
            key={series[i].day}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            // ⚠️ `direction: ltr` لازم است و بدونش دو برچسبِ ابتدا و انتها
            // بریده می‌شوند. علتش این است که `text-anchor: start` در متنِ RTL
            // یعنی «لبه‌ی **راست**ِ متن روی این نقطه» — پس برچسبِ آخرِ محور از
            // x=W−10 به سمت راست بیرون می‌زند و لبه‌ی چپ نمودار هم برعکس.
            // در نسخه‌ی Express همین اتفاق می‌افتاد و کسی اندازه‌اش را نگرفته
            // بود («۶/۵» به «۵/» می‌رسید). برچسب یک تاریخِ عددی است، پس
            // چپ‌به‌راست خواندنش درست است و `text-anchor` هم همان می‌شود که
            // انتظار داریم.
            direction="ltr"
            fontSize="10"
            fill="var(--color-ink-dim)"
          >
            {dayLabel(series[i].day)}
          </text>
        ))}

        {/* ناحیه‌ی حساسِ نامرئی — کلِ ستونِ هر روز. داخل SVG رسم می‌شود تا
            مختصاتش با نقطه‌ها یکی باشد و با هیچ پدینگِ CSS جابه‌جا نشود. */}
        <g fill="transparent" onPointerLeave={() => setHover(null)}>
          {series.map((point, i) => (
            <rect
              key={point.day}
              x={x(i) - bw / 2}
              y={0}
              width={bw}
              height={base}
              onPointerEnter={() => setHover(i)}
            />
          ))}
        </g>
      </svg>

      {p && (
        <div
          className="pointer-events-none absolute rounded-lg px-2.5 py-1.5 text-[10px] font-bold leading-relaxed"
          style={{
            left: `${(x(hover as number) / W) * 100}%`,
            top: 12,
            transform: "translateX(-50%)",
            background: "var(--color-ink)",
            color: "var(--color-cream)",
            whiteSpace: "nowrap",
          }}
        >
          {dayLabel(p.day)} — {toman(p.sales)} · {faNum(p.orders)} سفارش
        </div>
      )}
    </div>
  );
}

// ============================================================
// گزارشِ ماه‌به‌ماه
// ============================================================

function MonthlyReport({
  months,
  onMonths,
  data,
  loading,
  fetching,
  error,
  onRetry,
}: {
  months: number;
  onMonths: (m: number) => void;
  data: MonthlySalesResponse | undefined;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Panel
      title="گزارش ماه‌به‌ماه"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {MONTH_RANGES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMonths(m)}
              aria-pressed={months === m}
              className="rounded-full px-2.5 py-1.5 text-[11px] font-bold min-h-10 sm:min-h-0 sm:py-1"
              style={
                months === m
                  ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                  : { background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }
              }
            >
              {faNum(m)} ماه
            </button>
          ))}
          {/* خروجی، یک ناوبریِ معمولیِ مرورگر است نه fetch — چون سرور فایل
              می‌فرستد و کوکیِ نشست در ناوبری خودش می‌رود. */}
          <a
            href={monthlyCsvHref(months)}
            className="rounded-full px-2.5 py-1.5 text-[11px] font-bold"
            style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
          >
            خروجی CSV
          </a>
        </div>
      }
    >
      {error ? (
        <ErrorBox message={`گزارش ماهانه نیامد — ${message(error)}`} onRetry={onRetry} />
      ) : loading ? (
        <Spinner label="در حال محاسبه‌ی ماه‌ها…" />
      ) : !data ? null : (
        <div className="space-y-4" style={{ opacity: fetching ? 0.6 : 1 }}>
          {data.calendar !== "jalali" && (
            // سرور بدونِ ICUِ کامل ماه‌ها را **میلادی** می‌شمارد. اگر این را
            // نگوییم، مدیر «مرداد» را می‌خواند و در حالی که مرداد نیست.
            <p
              className="rounded-[14px] px-3 py-2 text-[11px] leading-relaxed"
              style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
            >
              ⚠️ تقویمِ شمسی روی این سرور در دسترس نیست؛ ماه‌های این جدول
              میلادی‌اند، نه شمسی.
            </p>
          )}

          <p className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
            {data.best
              ? `بهترین ماه: ${faDigits(data.best.label)} با ${toman(data.best.sales)}`
              : "هنوز فروشی ثبت نشده است"}
          </p>

          <BarList
            rows={data.rows
              .filter((m) => m.sales > 0)
              .map((m) => ({ name: faDigits(m.label), value: m.sales }))}
            empty="در این بازه فروشی ثبت نشده"
          />

          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[520px] text-right text-xs">
              <thead>
                <tr style={{ color: "var(--color-ink-dim)" }}>
                  <th className="px-2 pb-2 font-bold">ماه</th>
                  <th className="px-2 pb-2 font-bold">فروش</th>
                  <th className="px-2 pb-2 font-bold">سفارش</th>
                  <th className="px-2 pb-2 font-bold">مشتری</th>
                  <th className="px-2 pb-2 font-bold">میانگین</th>
                  <th className="px-2 pb-2 font-bold">رشد</th>
                </tr>
              </thead>
              <tbody>
                {/* سرور از قدیم به جدید می‌فرستد؛ جدول برعکس نشان داده می‌شود تا
                    ماهِ جاری بالا باشد — همان چیزی که مدیر اول می‌خواهد ببیند.
                    نمودارِ میله‌ایِ بالا ترتیبِ زمانی را نگه می‌دارد. */}
                {data.rows
                  .slice()
                  .reverse()
                  .map((m: MonthlySalesRow, i) => (
                    <tr
                      key={m.start}
                      style={
                        i === 0
                          ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                          : { borderTop: "1px solid var(--color-line)" }
                      }
                    >
                      <td className="px-2 py-2">
                        <b>{faDigits(m.label)}</b>
                        {i === 0 && (
                          <span className="ms-2 text-[10px] opacity-80">ماه جاری</span>
                        )}
                      </td>
                      <td className="px-2 py-2">{toman(m.sales)}</td>
                      <td className="px-2 py-2">{faNum(m.orders)}</td>
                      <td className="px-2 py-2">{faNum(m.customers)}</td>
                      <td className="px-2 py-2">{toman(m.avg)}</td>
                      <td className="px-2 py-2">
                        <Growth value={m.growth} />
                      </td>
                    </tr>
                  ))}
                <tr style={{ borderTop: "2px solid var(--color-line)" }}>
                  <td className="px-2 py-2 font-bold">جمع کل</td>
                  <td className="px-2 py-2 font-bold">{toman(data.totals.sales)}</td>
                  <td className="px-2 py-2">{faNum(data.totals.orders)}</td>
                  <td className="px-2 py-2">—</td>
                  <td className="px-2 py-2">{toman(data.totals.avg)}</td>
                  <td className="px-2 py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * رشدِ ماه — سه حالت و هر سه باید فرق کنند.
 *
 * `null` یعنی **ماهِ قبل صفر بوده**، نه «۰٪ رشد». سرور عمداً به‌جای ۱۰۰٪ یا
 * بی‌نهایت `null` می‌دهد (db.js:1773) و صفر یعنی «بی‌تغییر». اگر این سه را
 * یکی نشان بدهیم، گزارش دروغ می‌گوید.
 */
function Growth({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span style={{ color: "var(--color-ink-dim)" }} title="ماه قبل فروشی نداشته؛ درصدِ رشد معنا ندارد">
        —
      </span>
    );
  }
  const tone = value > 0 ? "var(--color-teal)" : value < 0 ? "var(--color-coral)" : "var(--color-ink-dim)";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "";
  return (
    <span style={{ color: tone }}>
      {arrow} {faNum(Math.abs(value))}٪
    </span>
  );
}

// ============================================================
// میله‌های افقی — پرفروش‌ها / دسته‌ها / ماه‌ها
// ============================================================

function BarList({ rows, empty }: { rows: { name: string; value: number }[]; empty: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
        {empty}
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={`${r.name}-${i}`} className="flex items-center gap-3 text-[11px]">
          <span className="w-32 shrink-0 truncate" style={{ color: "var(--color-ink-soft)" }}>
            {r.name || "—"}
          </span>
          <span className="shrink-0 font-bold" style={{ color: "var(--color-ink)" }}>
            {toman(r.value)}
          </span>
          {/* درصدِ هر میله محاسبه‌شدنی است، پس با کلاسِ ثابت بیان نمی‌شود —
              و صفتِ style در HTMLِ سرور هم با CSP بلوکه می‌شود. اینجا چون
              React است و این مقادیر از داده می‌آیند، همان style ساده درست
              است (نسخه‌ی Express مجبور بود با data-w و JS بنویسدش). */}
          <span
            className="h-2 flex-1 overflow-hidden rounded-full"
            style={{ background: "var(--color-surface-2)" }}
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${((Number(r.value) || 0) / max) * 100}%`,
                background: "var(--color-teal)",
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// جدولِ ساده — سرستون + ردیف
// ============================================================

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
        {empty}
      </p>
    );
  }
  return (
    // روی موبایل جدول‌های ۴ ستونی جا نمی‌شوند؛ به‌جای فشرده‌کردنِ ستون‌ها،
    // اسکرولِ افقیِ خودِ جدول می‌آید تا عددها خوانا بمانند.
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[380px] text-right text-xs">
        <thead>
          <tr style={{ color: "var(--color-ink-dim)" }}>
            {head.map((h) => (
              <th key={h} className="px-2 pb-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row[0]}-${i}`} style={{ borderTop: "1px solid var(--color-line)" }}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-2 py-2"
                  style={{ color: j === 0 ? "var(--color-ink-dim)" : "var(--color-ink-soft)" }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function message(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "خطای نامشخص";
}
