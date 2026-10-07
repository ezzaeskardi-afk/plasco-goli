"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActivity } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import {
  Btn,
  ErrorBox,
  ForbiddenBox,
  Panel,
  Spinner,
  faAgo,
  faDateTime,
  faNum,
} from "@/components/admin/AdminBits";
import type { ActivityEntry } from "@/lib/adminTypes";

// ============================================================
// دفتر رویدادها
// ============================================================
// «کی چه کاری کرد» — تنها جای پنل که نشان می‌دهد تغییرات از کجا آمده‌اند.
//
// چرا برچسبِ فارسی لازم است و کدِ خام کافی نیست: مقدارِ `action` یک کلیدِ
// ماشینی است (`product_bulk`, `login_failed`) و مدیر با دیدنِ آن نمی‌فهمد چه
// شده. در نسخه‌ی Express این نگاشت وجود داشت ولی **ناقص** بود: ۲۹ کلید را
// ترجمه می‌کرد و ۱۳ کلیدِ دیگر را خام نشان می‌داد — همه‌ی رویدادهای CRM
// (`crm_note_add`, `crm_task_delete`, …) و دو رویدادِ عمده‌فروشی
// (`wholesale_status`, `wholesale_delete`). یعنی همان جاهایی که پرکاربردترین
// بخش‌های تازه‌ی پنل بودند، دفتر رویدادها انگلیسی نشان می‌داد. فهرستِ زیر
// کامل است و از خودِ کدِ سرور گرفته شده (`note(req, '…')` در routes/admin.js
// و `logAdminAction(…)` در routes/auth.js).
//
// هر کلیدِ ناشناس هم باز هم خام نشان داده می‌شود، نه پنهان: اگر روزی رویدادی
// اضافه شود و کسی نگاشت را به‌روز نکند، دیدنِ کلیدِ خام یک ایرادِ کوچک است،
// ولی پنهان‌کردنِ رویداد یعنی از دست دادنِ اطلاعات.

const ACTION_FA: Record<string, string> = {
  // سفارش
  order_status: "تغییر وضعیت سفارش",
  order_cancel: "لغو سفارش",
  order_note: "یادداشت سفارش",
  order_tracking: "کد رهگیری",
  order_manual: "سفارش دستی",
  // نظر
  review_status: "وضعیت نظر",
  // تخفیف
  coupon_create: "ساخت کد تخفیف",
  coupon_update: "ویرایش کد تخفیف",
  coupon_delete: "حذف کد تخفیف",
  // کالا
  product_create: "ساخت محصول",
  product_update: "ویرایش محصول",
  product_delete: "حذف محصول",
  product_zeroed: "ناموجود کردن محصول",
  product_bulk: "ویرایش گروهی",
  product_publish: "انتشار در سایت",
  product_unpublish: "برداشتن از سایت",
  image_upload: "آپلود عکس",
  // دسته‌بندی
  category_create: "ساخت دسته‌بندی",
  category_update: "ویرایش دسته‌بندی",
  category_delete: "حذف دسته‌بندی",
  category_move: "جابه‌جایی دسته‌بندی",
  // فروشگاه و نگهداری
  settings_update: "تغییر تنظیمات",
  backup: "بکاپ دیتابیس",
  export_csv: "خروجی اکسل",
  staff_grant: "دادن نقش کارمند",
  staff_revoke: "گرفتن نقش کارمند",
  login_ok: "ورود به پنل",
  login_failed: "ورود ناموفق به پنل",
  otp_code_burned: "سوختن کد ورود با پیامک",
  // عمده‌فروشی — در نسخه‌ی Express ترجمه نشده بود
  wholesale_status: "وضعیت درخواست عمده",
  wholesale_delete: "حذف درخواست عمده",
  // CRM — در نسخه‌ی Express ترجمه نشده بود
  crm_note_add: "ثبت یادداشت مشتری",
  crm_note_delete: "حذف یادداشت مشتری",
  crm_task_add: "ساخت پیگیری",
  crm_task_toggle: "انجام/برگشت پیگیری",
  crm_task_delete: "حذف پیگیری",
  crm_tag_add: "ساخت برچسب",
  crm_tag_delete: "حذف برچسب",
  crm_tags_set: "تغییر برچسب‌های مشتری",
  crm_recalc: "بازمحاسبه‌ی امتیاز مشتری",
  crm_recalc_all: "بازمحاسبه‌ی همه‌ی امتیازها",
  crm_activity_add: "ثبت تماس/پیگیری",
};

/**
 * لحنِ هر رویداد — فقط جاهایی مقدار می‌گیرد که رنگ واقعاً معنا دارد.
 *
 * «بد» یعنی برگشت‌ناپذیر یا مشکوک (`order_cancel`, `product_delete`,
 * `login_failed`) و «هشدار» یعنی برگشت‌پذیر ولی اثرگذار روی مشتری
 * (`product_unpublish`, `settings_update`, `wholesale_delete`).
 *
 * `login_failed` عمداً قرمز است: تنها سطری در کلِ دفتر است که محتمل است کارِ
 * خودِ مدیر **نباشد**. `otp_code_burned` هم برای همین قرمز است: کسی پنج بار
 * پشتِ سرِ هم کدِ پیامکیِ یک شماره را غلط زده و پنجره‌ی کد سوخته.
 */
const ACTION_TONE: Record<string, "bad" | "warn"> = {
  order_cancel: "bad",
  product_delete: "bad",
  otp_code_burned: "bad",
  product_zeroed: "warn",
  product_bulk: "warn",
  settings_update: "warn",
  product_unpublish: "warn",
  category_delete: "bad",
  staff_grant: "warn",
  staff_revoke: "warn",
  login_failed: "bad",
  wholesale_delete: "warn",
  crm_recalc_all: "warn",
};

const DOT_COLOR = {
  bad: "var(--color-coral)",
  warn: "var(--color-gold)",
  none: "var(--color-teal)",
} as const;

/** تعدادِ رویداد در هر درخواست — سقفِ خودِ سرور ۳۰۰ است */
const LIMITS = [30, 60, 120, 300] as const;

export function ActivityContent() {
  const [limit, setLimit] = useState<number>(60);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-activity", limit],
    queryFn: () => getActivity(limit),
  });

  if (error instanceof ApiError && error.status === 403) return <ForbiddenBox />;
  if (error) {
    return (
      <ErrorBox
        message={`دفتر رویدادها نیامد — ${error instanceof Error ? error.message : "خطای نامشخص"}`}
        onRetry={() => void refetch()}
      />
    );
  }

  const activity = data?.activity ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
          تعداد:
        </span>
        {LIMITS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLimit(n)}
            aria-pressed={limit === n}
            className="rounded-full px-3 py-2 text-xs font-bold min-h-10 sm:min-h-0 sm:py-1.5"
            style={
              limit === n
                ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                : { background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }
            }
          >
            {faNum(n)}
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

      <Panel
        title="رویدادها"
        action={
          !isLoading && (
            <span className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
              {faNum(activity.length)} رویدادِ آخر
            </span>
          )
        }
      >
        {isLoading ? (
          <Spinner label="در حال خواندنِ دفتر رویدادها…" />
        ) : activity.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
            هنوز رویدادی ثبت نشده است.
          </p>
        ) : (
          <ul>
            {activity.map((a) => (
              <ActivityRow key={a.id} entry={a} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const tone = ACTION_TONE[entry.action];
  const label = ACTION_FA[entry.action] ?? entry.action;

  return (
    <li
      className="flex items-start gap-3 py-2.5"
      style={{ borderTop: "1px solid var(--color-line)" }}
    >
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: DOT_COLOR[tone ?? "none"] }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <b className="text-xs" style={{ color: "var(--color-ink)" }}>
          {label}
        </b>
        {entry.target && (
          <>
            {" — "}
            {/* هدف می‌تواند شماره‌ی سفارش («#۴۲») یا کدِ تخفیف یا نامِ کالا
                باشد؛ هر سه با `bdo` درست خوانده می‌شوند. */}
            <bdo dir="ltr" className="text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
              {entry.target}
            </bdo>
          </>
        )}
        <div className="text-[10px] mt-0.5" style={{ color: "var(--color-ink-dim)" }}>
          {entry.detail || ""}
          {entry.by ? `${entry.detail ? " · " : ""}توسط ${entry.by}` : ""}
        </div>
      </span>
      {/* زمانِ نسبی خوانا است و زمانِ کامل در tooltip می‌ماند — همان کاری که
          نسخه‌ی Express می‌کرد. */}
      <time
        className="shrink-0 whitespace-nowrap text-[10px]"
        style={{ color: "var(--color-ink-dim)" }}
        title={faDateTime(entry.at)}
      >
        {faAgo(entry.at)}
      </time>
    </li>
  );
}
