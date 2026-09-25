"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAdminOverview } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import {
  Panel,
  Pill,
  Spinner,
  ErrorBox,
  ForbiddenBox,
  StatCard,
  faNum,
  faAgo,
  toman,
  tomanShort,
} from "@/components/admin/AdminBits";

// ============================================================
// داشبورد — همتای نگاهِ اولِ `data-view="dash"` در پنل Express
// ============================================================
// همه‌ی عددها از یک درخواست می‌آیند: `GET /api/admin/overview`. دلیلش این است
// که داشبورد ۶ بخش دارد؛ اگر هر کدام کوئری خودش را می‌زد، باز کردنِ این صفحه
// ۶ رفت‌وبرگشت می‌شد و اعدادِ کارت‌ها هم می‌توانستند به لحظه‌های مختلف تعلق
// داشته باشند (مثلاً فروشِ امروز از دیروز کمتر به نظر برسد).
//
// سه نکته‌ای که هنگامِ ساختنِ این نما عمداً رعایت شده:
//
//  ۱. اعدادِ پول با `tomanShort` کوتاه می‌شوند. «۱٫۶ میلیارد تومان» یک نگاه
//     گرفته می‌شود؛ «۱٬۶۳۸٬۹۷۷٬۰۰۰ تومان» نه — و کارتِ آمار جای عددِ بلند نیست.
//  ۲. «امروز» ممکن است صفر باشد و این طبیعی است، نه خرابی. کارتِ امروز کنارِ
//     هفته و ماه می‌آید تا مدیر بتواند مقایسه کند و صفر را باور کند.
//  ۳. بخش‌هایی که معمولاً خالی‌اند (مرجوعی، تقاضای از‌دست‌رفته) پنهان نمی‌شوند،
//     ولی خالی‌بودنشان نوشته می‌شود. یک کادرِ خالیِ بی‌توضیح شبیه باگ است.

export function DashboardContent() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["adminOverview"],
    queryFn: getAdminOverview,
    // داشبورد ابزارِ لحظه‌ای است؛ داده‌ی نیم‌دقیقه‌ای اینجا بی‌معنی است
    staleTime: 20_000,
    retry: false,
  });

  if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
    return <ForbiddenBox />;
  }
  if (isPending) return <Spinner label="در حال گرفتن آمار…" />;
  if (error) {
    return (
      <ErrorBox
        message={error instanceof ApiError ? error.message : "خطا در گرفتن آمار"}
        onRetry={() => refetch()}
      />
    );
  }
  if (!data) return null;

  const s = data.stats;
  const maxSales = Math.max(1, ...data.series.map((p) => p.sales));
  const pendingReviews = s.pending_reviews;

  return (
    <div className="space-y-6">
      {/* ---------- کارت‌های فروش ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="فروش امروز" value={tomanShort(s.today_sales)} hint={`${faNum(s.today_orders)} سفارش`} />
        <StatCard label="فروش ۷ روز" value={tomanShort(s.week_sales)} tone="gold" />
        <StatCard label="فروش ۳۰ روز" value={tomanShort(s.month_sales)} tone="gold" />
        <StatCard label="میانگین هر سفارش" value={tomanShort(s.avg_order)} tone="pink" />
      </div>

      {/* ---------- کارهای باز — چیزی که مدیر باید دستش بگیرد ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="در انتظار ارسال"
          value={faNum(s.awaiting_shipment)}
          hint="پرداخت‌شده، هنوز نفرستاده"
          tone={s.awaiting_shipment > 0 ? "teal" : "dim"}
        />
        <StatCard
          label="نظرات در انتظار تأیید"
          value={faNum(pendingReviews)}
          tone={pendingReviews > 0 ? "gold" : "dim"}
        />
        <StatCard
          label="درخواست مرجوعی"
          value={faNum(s.return_requests)}
          tone={s.return_requests > 0 ? "pink" : "dim"}
        />
        <StatCard
          label="درخواست عمده‌ی نو"
          value={faNum(data.newWholesaleRequests)}
          tone={data.newWholesaleRequests > 0 ? "gold" : "dim"}
        />
      </div>

      {/* ---------- نمودار ۱۴ روز ---------- */}
      <Panel
        title="فروش ۱۴ روز گذشته"
        action={
          <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
            بیشترین روز: {tomanShort(maxSales)}
          </span>
        }
      >
        {/* نمودارِ میله‌ای با div — نه کتابخانه. پروژه هیچ کتابخانه‌ی نمودار
            ندارد و برای ۱۴ عدد، آوردنِ ۱۰۰ کیلوبایت وابستگی توجیه ندارد. */}
        <div className="flex items-end justify-between gap-1 h-32" role="img"
             aria-label="نمودار فروش ۱۴ روز گذشته">
          {data.series.map((p) => {
            const h = Math.round((p.sales / maxSales) * 100);
            return (
              <div key={p.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${Math.max(p.sales > 0 ? 6 : 2, h)}%`,
                    background: p.sales > 0 ? "var(--color-teal)" : "var(--color-line-strong)",
                  }}
                  title={`${p.day} — ${toman(p.sales)} (${faNum(p.orders)} سفارش)`}
                />
                <span className="text-[9px] truncate w-full text-center"
                      style={{ color: "var(--color-ink-dim)" }}>
                  {p.day.slice(8)}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---------- کم‌موجودها ---------- */}
        <Panel
          title="کالاهای رو به اتمام"
          action={
            <Link href="/admin/stock" className="text-[11px] font-bold"
                  style={{ color: "var(--color-teal)" }}>
              همه‌ی انبار ←
            </Link>
          }
        >
          {data.lowStock.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
              موجودی هیچ کالایی زیر آستانه نیست.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.lowStock.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-lg shrink-0 overflow-hidden grid place-items-center"
                        style={{ background: "var(--color-surface-2)" }}>
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- پیش‌نمایشِ ۳۶px؛ next/image اینجا فقط سربار است
                      <img src={p.image} alt="" width={36} height={36} className="object-cover w-9 h-9" />
                    ) : (
                      <span className="text-base">🧺</span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0 text-xs truncate" style={{ color: "var(--color-ink-soft)" }}>
                    {p.title}
                  </span>
                  <Pill
                    label={p.stock === 0 ? "ناموجود" : `${faNum(p.stock)} عدد`}
                    tone={p.stock === 0 ? "coral" : "gold"}
                  />
                </li>
              ))}
            </ul>
          )}

          {data.wishedOutOfStock.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--color-line)" }}>
              <p className="text-[11px] mb-2" style={{ color: "var(--color-ink-dim)" }}>
                مشتری‌ها منتظر این‌ها هستند (در علاقه‌مندی، ولی ناموجود):
              </p>
              <ul className="space-y-1.5">
                {data.wishedOutOfStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate" style={{ color: "var(--color-ink-soft)" }}>{p.title}</span>
                    <Pill label={`${faNum(p.wishers)} نفر`} tone="pink" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* ---------- پرفروش‌ترین‌ها ---------- */}
        <Panel title="پرفروش‌ترین کالاها">
          {data.topProducts.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
              هنوز فروشی ثبت نشده است.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.topProducts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2.5 text-xs">
                  <span className="w-5 shrink-0 text-center font-bold"
                        style={{ color: "var(--color-ink-dim)" }}>
                    {faNum(i + 1)}
                  </span>
                  <Link href={`/product/${p.id}`} className="flex-1 min-w-0 truncate hover:underline"
                        style={{ color: "var(--color-ink-soft)" }}>
                    {p.title}
                  </Link>
                  <span className="shrink-0" style={{ color: "var(--color-ink-dim)" }}>
                    {faNum(p.qty)} عدد
                  </span>
                  <span className="shrink-0 font-bold w-24 text-left" style={{ color: "var(--color-teal)" }}>
                    {tomanShort(p.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---------- آخرین رویدادها ---------- */}
        <Panel
          title="آخرین کارهای انجام‌شده"
          action={
            <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
              دفترِ رویدادها
            </span>
          }
        >
          {data.recentActivity.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
              رویدادی ثبت نشده است.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="text-xs flex items-start gap-2">
                  <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }}>
                    {a.target || "—"}
                  </span>
                  <span className="flex-1 min-w-0" style={{ color: "var(--color-ink-soft)" }}>
                    {a.detail || a.action}
                  </span>
                  <span className="shrink-0 text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
                    {faAgo(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ---------- وضعیت فروشگاه ---------- */}
        <Panel title="وضعیت فروشگاه">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="مشتری‌ها" value={faNum(s.total_users)}
                      hint={`${faNum(s.new_users_week)} نفر در ۷ روز`} tone="dim" />
            <StatCard label="بازدید امروز" value={faNum(s.today_visits)} tone="dim" />
            <StatCard label="کالاهای منتشرشده"
                      value={faNum(s.total_products - s.draft_products)}
                      hint={`${faNum(s.draft_products)} پیش‌نویس`} tone="dim" />
            <StatCard label="ارزش موجودی انبار" value={tomanShort(s.inventory_value)} tone="gold" />
            <StatCard label="ناموجود" value={faNum(s.out_of_stock)}
                      tone={s.out_of_stock > 0 ? "coral" : "dim"} />
            <StatCard label="سفارش‌های لغوشده" value={faNum(s.canceled_orders)} tone="dim" />
          </div>

          {s.draft_products > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed rounded-xl p-2.5"
               style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}>
              {faNum(s.draft_products)} کالا پیش‌نویس مانده و در سایت دیده نمی‌شود. از
              «انبار و کالا» می‌توانی منتشرشان کنی.
            </p>
          )}
        </Panel>
      </div>

      {/* ---------- میان‌بُر ---------- */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["/admin/orders", "سفارش‌ها", s.awaiting_shipment],
            ["/admin/reviews", "نظرات", pendingReviews],
            ["/admin/stock", "انبار", s.low_stock],
          ] as const
        ).map(([href, label, count]) => (
          <Link
            key={href}
            href={href}
            className="rounded-full px-4 py-2 text-xs font-bold"
            style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
          >
            {label}
            {count > 0 && (
              <span className="mr-1.5 font-extrabold" style={{ color: "var(--color-teal)" }}>
                {faNum(count)}
              </span>
            )}
          </Link>
        ))}
        <span className="text-[11px] self-center mr-auto" style={{ color: "var(--color-ink-dim)" }}>
          در کل {faNum(s.total_orders)} سفارش ثبت شده است.
        </span>
      </div>
    </div>
  );
}
