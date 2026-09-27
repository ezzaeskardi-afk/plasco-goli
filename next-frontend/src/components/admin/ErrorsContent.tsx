"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminErrors } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import {
  Btn,
  ErrorBox,
  ForbiddenBox,
  Panel,
  Pill,
  Spinner,
  StatCard,
  faAgo,
  faDateTime,
  faDate,
  faNum,
} from "@/components/admin/AdminBits";
import type { AdminErrorGroup } from "@/lib/adminTypes";

// ============================================================
// خطاهای سرور
// ============================================================
// این نما لاگِ **خام** را نشان نمی‌دهد و این تنها تصمیمِ مهمش است: یک خطِ
// لاگ حدود ۱۵۰۰ کاراکتر است که بیشترش stack traceِ داخلیِ express است. اگر
// خطایی ۲۰۰ بار تکرار شده باشد، ۲۰۰ خط می‌شود و خطای یک‌بارِ *مهم* لای آن گم
// می‌شود. سرور خودش گروه‌بندی می‌کند (`lib/error-digest.js`) و اینجا نشان
// داده می‌شود: «این خطا ۱۲ بار، آخرین بار ۲ ساعت پیش».
//
// ============================================================
// ترتیبِ کارت‌ها سلیقه‌ای نیست
// ============================================================
// «مشتری خطا دید» اول می‌آید چون تنها عددی است که به فروش وصل است. خیلی از
// خطاها لاگ می‌شوند ولی کاربر جوابِ درست گرفته (مثل شکستِ پیامکِ اطلاع‌رسانی)
// — آن‌ها مهم‌اند ولی فوری نیستند. اگر «تعداد خطا» اول می‌آمد، مدیر همیشه یک
// عددِ بزرگِ بی‌خطر می‌دید و به کلِ صفحه بی‌اعتماد می‌شد.
//
// ============================================================
// دو حالتِ «صفر» که نباید یکی شوند
// ============================================================
//   • «۰ خطا» یعنی واقعاً چیزی نبوده.
//   • `unavailable` یعنی پوشه‌ی لاگ خوانده نشد — یعنی **نمی‌دانیم**.
// سرور به‌جای ۵۰۰ همان `unavailable` را می‌فرستد تا پنل باز بماند
// (routes/admin.js:207). اگر این را نشان ندهیم، مدیر یک صفحه‌ی سبز می‌بیند و
// نتیجه می‌گیرد همه‌چیز خوب است. پس این حالت صریح گفته می‌شود و کارت‌های
// عددی هم بی‌معنا علامت می‌خورند.
//
// این مسیر یکی از دو مسیری است که حتی برای **کارمند** هم ۴۰۳ می‌دهد (stack
// ساختارِ داخلیِ سرور را نشان می‌دهد)، پس ۴۰۳ باید به «دسترسی نداری» ترجمه
// شود، نه «خطای سرور».

/** بازه‌ها — سقفِ خودِ error-digest است: فقط ۱۴ روز لاگ نگه داشته می‌شود */
const DAYS = [1, 3, 7, 14] as const;

export function ErrorsContent() {
  const [days, setDays] = useState<number>(7);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-errors", days],
    queryFn: () => getAdminErrors(days),
  });

  if (error instanceof ApiError && error.status === 403) return <ForbiddenBox />;
  if (error) {
    return (
      <ErrorBox
        message={`خطاها نیامد — ${error instanceof Error ? error.message : "خطای نامشخص"}`}
        onRetry={() => void refetch()}
      />
    );
  }

  const totals = data?.totals;
  const groups = data?.groups ?? [];
  const daily = data?.daily ?? [];
  const unavailable = data?.unavailable;
  const peak = Math.max(...daily.map((d) => d.errors), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
          بازه:
        </span>
        {DAYS.map((d) => (
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
            {d === 1 ? "امروز" : `${faNum(d)} روز`}
          </button>
        ))}
        <Btn
          tone="dim"
          className="mr-auto"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? "در حال تازه‌سازی…" : "تازه‌سازی"}
        </Btn>
      </div>

      {unavailable ? (
        <p
          className="rounded-[18px] p-4 text-xs leading-relaxed"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
        >
          پوشه‌ی لاگ خوانده نشد: <span dir="ltr">{unavailable}</span>
          <br />
          پس «۰ خطا» در این صفحه یعنی «نمی‌دانم»، نه «خبری نیست». تا وقتی این
          پیام هست، به کارت‌های زیر اعتماد نکن.
        </p>
      ) : isLoading ? (
        <Spinner label="در حال خواندنِ خطاها…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label="مشتری خطا دید"
              value={faNum(totals?.http5xx ?? 0)}
              tone={(totals?.http5xx ?? 0) > 0 ? "coral" : "teal"}
              hint={
                (totals?.http5xx ?? 0) > 0
                  ? "پاسخِ ۵xx — این‌ها را جدی بگیر"
                  : "هیچ مشتری‌ای صفحه‌ی خطا ندید"
              }
            />
            <StatCard
              label="خطاهای ثبت‌شده"
              value={faNum(totals?.errors ?? 0)}
              tone="dim"
              hint={`${faNum(totals?.groups ?? 0)} نوعِ متفاوت`}
            />
            <StatCard
              label="امروز"
              value={faNum(totals?.today ?? 0)}
              tone={(totals?.today ?? 0) > 0 ? "gold" : "teal"}
              hint={data?.since ? `از ${faDate(data.since)}` : undefined}
            />
          </div>

          {/* نمودارِ روزانه: میله‌ها فقط نسبت به هم معنا دارند، پس محور و عدد
              لازم نیست — tooltipِ هر میله عددِ خودش را می‌دهد. */}
          {daily.length > 1 && (
            <div
              className="flex items-end gap-1 h-16"
              role="img"
              aria-label={`نمودار خطاهای ${faNum(daily.length)} روز`}
            >
              {daily.map((d) => (
                <span
                  key={d.day}
                  title={`${d.day}: ${d.errors} خطا · ${d.http5xx} پاسخ ۵xx`}
                  className="flex-1 rounded-t-[3px] min-h-[2px]"
                  style={{
                    height: `${Math.max(3, (d.errors / peak) * 100)}%`,
                    background: d.errors > 0 ? "var(--color-coral)" : "var(--color-surface-2)",
                  }}
                />
              ))}
            </div>
          )}

          <Panel
            title="خطاهای گروه‌بندی‌شده"
            action={
              <span className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
                حداکثر ۶۰ گروهِ آخر
              </span>
            }
          >
            {groups.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
                خطای ثبت‌شده‌ای نیست — همه چیز سالم است.
              </p>
            ) : (
              <ul className="space-y-2">
                {groups.map((g, i) => (
                  // گروهِ اول فقط وقتی از قبل باز است که تکرار داشته باشد
                  // (`count > 1`): خطای یک‌باره معمولاً قابل‌صرف‌نظر است و
                  // بازکردنِ خودکارش، ستونِ اول را شلوغ می‌کند.
                  <ErrorGroupRow key={g.key} group={g} defaultOpen={i === 0 && g.count > 1} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/**
 * یک گروهِ خطا، بسته به‌طور پیش‌فرض.
 *
 * جزئیاتِ فنی داخل `<details>` می‌ماند: صاحبِ مغازه لازم نیست stack را
 * ببیند، ولی وقتی می‌خواهد بفرستد برای بررسی، همان چند خط دقیقاً همان چیزی
 * است که لازم دارد. `dir="ltr"` روی آن هم لازم است — یک stack trace در
 * متنِ RTL بی‌این قابلِ خواندن نیست.
 *
 * ⚠️ عمداً با `ErrorGroupRow` در `SystemContent.tsx` یکی نشده: آن یکی نمای
 * **خلاصه‌ی** وضعیت سیستم است (۱۲ گروه، بدونِ `first` و بدونِ فاصله‌ی زمانیِ
 * کامل) و این یکی نمای کاملِ خطاها. ادغامشان یعنی یا خلاصه شلوغ شود یا این
 * ناقص بماند.
 */
function ErrorGroupRow({ group, defaultOpen }: { group: AdminErrorGroup; defaultOpen: boolean }) {
  return (
    <li>
      <details
        open={defaultOpen}
        className="rounded-[14px] px-3 py-2"
        style={{ background: "var(--color-surface-2)" }}
      >
        <summary className="flex cursor-pointer items-center gap-2">
          <Pill label={`${faNum(group.count)}×`} tone={group.count > 4 ? "coral" : "dim"} />
          <span className="min-w-0 flex-1">
            <bdo dir="ltr" className="block truncate text-[11px]" style={{ color: "var(--color-ink)" }}>
              {group.title}
            </bdo>
            {group.reason && (
              <small
                dir="ltr"
                className="block truncate text-[10px]"
                style={{ color: "var(--color-ink-dim)" }}
              >
                {group.reason}
              </small>
            )}
          </span>
          <time
            className="shrink-0 whitespace-nowrap text-[10px]"
            style={{ color: "var(--color-ink-dim)" }}
            title={faDateTime(group.last)}
          >
            {faAgo(group.last)}
          </time>
        </summary>

        <div className="mt-2">
          <p className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
            اولین بار {faDateTime(group.first)} · آخرین بار {faDateTime(group.last)}
          </p>
          {group.stack.length > 0 ? (
            <pre
              dir="ltr"
              className="mt-2 overflow-x-auto rounded-lg p-2 text-[10px] leading-relaxed"
              style={{ background: "var(--color-surface)", color: "var(--color-ink-dim)" }}
            >
              {group.stack.join("\n")}
            </pre>
          ) : (
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
              جزئیاتِ فنی برای این خطا ثبت نشده است.
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
