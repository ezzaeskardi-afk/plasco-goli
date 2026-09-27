"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteWholesaleRequest,
  getWholesaleRequests,
  setWholesaleRequestStatus,
} from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
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
  faNum,
} from "@/components/admin/AdminBits";
import type { WholesaleRequest, WholesaleStatus } from "@/lib/adminTypes";

// ============================================================
// درخواست‌های خرید عمده (B2B)
// ============================================================
// این نما یک **صفِ کار** است، نه یک جدولِ داده. تفاوتش در سه چیزِ عمدی:
//
//  ۱. سه ستون ندارد که مدیر خودش بخواند و تصمیم بگیرد؛ هر ردیف یک کارِ بعدیِ
//     روشن دارد. سرور فقط سه وضعیت می‌شناسد (`new` / `contacted` / `done`)،
//     پس از همان سه، همان دکمه‌هایی ساخته می‌شود که واقعاً کار می‌کنند.
//  ۲. شمارشِ «چند تا دیده‌نشده» بالای صفحه است. بجِ کنارِ نوار هم همین عدد را
//     از داشبورد می‌گیرد (`newWholesaleRequests`)، ولی داشبورد باز نمی‌شود
//     مگر کسی سرش بزند.
//  ۳. حذف دو مرحله‌ای است. درخواستِ عمده **مشتریِ واقعی** است و پاک‌کردنش
//     برگشت‌ناپذیر؛ نسخه‌ی Express هم به‌جای `confirm()` خامِ مرورگر، همان
//     دکمه را «مطمئنی؟» می‌کرد و بعد چند ثانیه برمی‌گرداند. عیناً همان رفتار
//     اینجا هست، با فرقِ اینکه حالتِ مسلح در state است و تایمرش در unmount پاک
//     می‌شود.
//
// ============================================================
// یک واقعیتِ تلخ که این نما باید بگوید
// ============================================================
// مسیر `/admin/wholesale/requests` پارامتری ندارد: نه صفحه‌بندی، نه فیلتر.
// سرور `listWholesaleRequests(300)` صدا می‌زند — یعنی تازه‌ترین ۳۰۰ تا و
// بقیه **اصلاً از سرور نمی‌آید**. پس فیلترِ وضعیت و جستجوی این صفحه سمتِ
// مرورگر است و فقط تعدادِ ردیفِ روی صفحه را کم می‌کند؛ و اگر دقیقاً ۳۰۰ ردیف
// برگردد، ممکن است قدیمی‌ترها پنهان شده باشند. آن حالت صریح هشدار داده
// می‌شود — به‌جای اینکه مدیر فکر کند صف تمیز شده.

const STATUS_LABEL: Record<WholesaleStatus, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  done: "انجام شد",
};

const STATUS_TONE: Record<WholesaleStatus, "gold" | "teal" | "dim"> = {
  new: "gold",
  contacted: "teal",
  done: "dim",
};

/** سقفِ خودِ سرور — فقط برای تشخیصِ «ممکن است ردیفی جا مانده باشد» */
const SERVER_LIMIT = 300;

interface Move {
  to: WholesaleStatus;
  label: string;
  tone: "teal" | "gold" | "dim" | "coral";
}

/**
 * گذرهای مجاز از هر وضعیت.
 *
 * ⚠️ برخلاف گذرهای سفارش (`ORDER_FLOW`)، اینجا **قفلِ خوش‌بینانه‌ای وجود
 * ندارد**: مسیرِ PATCH فقط `id` و `status` می‌گیرد و `UPDATE ... WHERE id = ?`
 * می‌زند. یعنی اگر دو مدیر هم‌زمان کار کنند، آخری برنده است و هیچ ۴۰۹ای
 * نمی‌آید. پس دکمه‌ها از *وضعیتِ خوانده‌شده* ساخته می‌شوند ولی نمی‌توانند
 * تضمین کنند — برای همین بعد از هر تغییر، صف دوباره خوانده می‌شود.
 *
 * «انجام شد» از هر دو وضعیتِ دیگر باز است (گاهی تماس آفلاین انجام شده و کسی
 * دکمه‌ی «تماس گرفتم» را نزده)، و از `done` راهِ برگشت هست چون سرور هر سه
 * وضعیت را در PATCH قبول می‌کند و اشتباهِ کلیکِ بی‌بازگشت، یک ردیفِ گم‌شده است.
 */
function movesFor(status: WholesaleStatus): Move[] {
  if (status === "new") {
    return [
      { to: "contacted", label: "تماس گرفتم", tone: "teal" },
      { to: "done", label: "انجام شد", tone: "dim" },
    ];
  }
  if (status === "contacted") {
    return [
      { to: "done", label: "انجام شد", tone: "teal" },
      { to: "new", label: "برگرداندن به «جدید»", tone: "gold" },
    ];
  }
  return [{ to: "contacted", label: "برگشت به «تماس گرفته شد»", tone: "gold" }];
}

type Filter = "all" | WholesaleStatus;

export function WholesaleContent() {
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  /** کدام ردیف در حالتِ «مطمئنی؟» است — فقط یکی در آنِ واحد */
  const [armed, setArmed] = useState<number | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-wholesale"],
    queryFn: getWholesaleRequests,
  });

  // تایمرِ «مطمئنی؟» اگر کامپوننت برود باید پاک شود، وگرنه روی stateِ رفته
  // ست می‌کند.
  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  const requests = useMemo(() => data?.requests ?? [], [data]);

  const counts = useMemo(() => {
    const c = { all: requests.length, new: 0, contacted: 0, done: 0 };
    for (const r of requests) {
      if (r.status === "new") c.new++;
      else if (r.status === "contacted") c.contacted++;
      else if (r.status === "done") c.done++;
    }
    return c;
  }, [requests]);

  const visible = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  );

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: WholesaleStatus }) =>
      setWholesaleRequestStatus(id, status),
    onSuccess: (_res, vars) => {
      toast(`وضعیت به «${STATUS_LABEL[vars.status]}» تغییر کرد`, { tone: "success" });
      // بجِ کنارِ نوار و کارتِ فروشِ داشبورد هر دو از /admin/overview
      // می‌آیند و به درخواست‌های دیده‌نشده وابسته‌اند.
      qc.invalidateQueries({ queryKey: ["admin-wholesale"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: unknown) => toast(messageOf(err), { tone: "error" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteWholesaleRequest(id),
    onSuccess: () => {
      setArmed(null);
      toast("درخواست حذف شد", { tone: "info" });
      qc.invalidateQueries({ queryKey: ["admin-wholesale"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: unknown) => {
      setArmed(null);
      toast(messageOf(err), { tone: "error" });
    },
  });

  if (error instanceof ApiError && error.status === 403) return <ForbiddenBox />;
  if (error) {
    return (
      <ErrorBox
        message={`صفِ درخواست‌های عمده نیامد — ${messageOf(error)}`}
        onRetry={() => void refetch()}
      />
    );
  }
  if (isLoading) return <Spinner label="در حال گرفتنِ درخواست‌های عمده…" />;

  const arm = (id: number) => {
    setArmed(id);
    if (armTimer.current) clearTimeout(armTimer.current);
    // ۳٫۵ ثانیه — همان عددِ نسخه‌ی Express؛ کوتاه‌تر یعنی کاربر فرصتِ رسیدن به
    // دکمه را ندارد و بلندتر یعنی حالتِ مسلح روی صفحه می‌ماند و اشتباهی می‌خورد.
    armTimer.current = setTimeout(() => setArmed(null), 3500);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="کل درخواست‌ها" value={faNum(counts.all)} />
        <StatCard
          label="دیده‌نشده"
          value={faNum(counts.new)}
          tone={counts.new > 0 ? "gold" : "teal"}
          hint={counts.new > 0 ? "منتظرِ تماسِ اول" : "صفِ تماس خالی است"}
        />
        <StatCard label="تماس گرفته‌شده" value={faNum(counts.contacted)} tone="dim" />
        <StatCard label="انجام‌شده" value={faNum(counts.done)} tone="dim" />
      </div>

      {/* فیلترها. «همه» اول می‌آید چون همان چیزی است که مدیر به‌طور پیش‌فرض
          می‌خواهد، و شمارنده‌ها کنارشان می‌نشینند تا معلوم باشد فیلتر قرار است
          چه چیزی نشان بدهد — بدونِ عدد، یک تبِ خالی «شاید خراب است» خوانده می‌شود. */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "new", "contacted", "done"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className="rounded-full px-3 py-2 text-xs font-bold min-h-10 sm:min-h-0 sm:py-1.5"
            style={
              filter === key
                ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                : { background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }
            }
          >
            {key === "all" ? "همه" : STATUS_LABEL[key]} · {faNum(counts[key])}
          </button>
        ))}
        <Btn tone="dim" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "در حال تازه‌سازی…" : "تازه‌سازی"}
        </Btn>
      </div>

      {counts.all >= SERVER_LIMIT && (
        <p
          className="rounded-[14px] px-3 py-2 text-[11px] leading-relaxed"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
        >
          سرور حداکثر {faNum(SERVER_LIMIT)} درخواستِ آخر را برمی‌گرداند و این
          پاسخ پر است؛ یعنی احتمالاً درخواست‌های قدیمی‌تر از {faNum(SERVER_LIMIT)} در
          این صفحه نیستند. اگر لازم است همه را ببینی، درخواست‌های انجام‌شده را
          حذف کن تا فهرست کوتاه شود.
        </p>
      )}

      {visible.length === 0 ? (
        <Panel title="فهرست">
          <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
            {counts.all === 0
              ? "هنوز درخواستِ عمده‌ای نیامده است."
              : `در این وضعیت درخواستی نیست — ${faNum(counts.all)} درخواست در کلِ صف است.`}
          </p>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <WholesaleRow
              key={r.id}
              request={r}
              busy={setStatus.isPending || remove.isPending}
              armed={armed === r.id}
              onMove={(status) => setStatus.mutate({ id: r.id, status })}
              onDeleteRequested={() => arm(r.id)}
              onDeleteConfirmed={() => {
                if (armTimer.current) clearTimeout(armTimer.current);
                remove.mutate(r.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function WholesaleRow({
  request,
  busy,
  armed,
  onMove,
  onDeleteRequested,
  onDeleteConfirmed,
}: {
  request: WholesaleRequest;
  busy: boolean;
  armed: boolean;
  onMove: (status: WholesaleStatus) => void;
  onDeleteRequested: () => void;
  onDeleteConfirmed: () => void;
}) {
  return (
    <li
      className="rounded-[18px] p-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        // ردیفِ دیده‌نشده یک لبه‌ی طلایی می‌گیرد: صف ۳۰۰ ردیفی را چشم باید
        // بتواند بی‌خواندنِ وضعیت تشخیص بدهد.
        borderInlineStartWidth: request.status === "new" ? 3 : 1,
        borderInlineStartColor:
          request.status === "new" ? "var(--color-gold)" : "var(--color-line)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <b className="text-sm" style={{ color: "var(--color-ink)" }}>
          {request.name}
        </b>
        {/* شماره را تلفنی هم می‌کنیم: این صف برایِ **تماس گرفتن** است و اگر
            مدیر بخواهد شماره را روی موبایل دستی کپی کند، کارِ اصلی این صفحه
            دو برابر می‌شود. `dir="ltr"` هم لازم است، وگرنه پرانتز/خطِ تیره‌ی
            RTL جای عرضِ شماره را عوض می‌کند. */}
        <a
          href={`tel:${request.phone}`}
          dir="ltr"
          className="text-xs font-bold"
          style={{ color: "var(--color-teal)" }}
        >
          {request.phone}
        </a>
        <Pill label={STATUS_LABEL[request.status]} tone={STATUS_TONE[request.status]} />
        <time
          className="mr-auto text-[10px]"
          style={{ color: "var(--color-ink-dim)" }}
          title={faDateTime(request.created_at)}
        >
          {faAgo(request.created_at)}
        </time>
      </div>

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        {request.product_title && <span>کالا: {request.product_title}</span>}
        {/* `quantity` صفر یعنی «تعداد نگفته» — نه «صفر». سرور پیش‌فرضِ ۰ دارد و
            فرمِ عمومی این فیلد را اختیاری می‌فرستد. */}
        <span>
          {request.quantity > 0
            ? `تعداد: ${faNum(request.quantity)}`
            : "تعداد اعلام نشده"}
        </span>
        {request.product_id != null && (
          <span style={{ color: "var(--color-ink-dim)" }}>
            کدِ کالا: <span dir="ltr">{faNum(request.product_id)}</span>
          </span>
        )}
      </div>

      {request.note && (
        <p
          className="mt-2 rounded-[12px] px-3 py-2 text-[11px] leading-relaxed"
          style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
        >
          {request.note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {movesFor(request.status).map((m) => (
          <Btn key={m.to} tone={m.tone} disabled={busy} onClick={() => onMove(m.to)}>
            {m.label}
          </Btn>
        ))}

        <Btn
          tone={armed ? "coral" : "dim"}
          className="mr-auto"
          disabled={busy}
          onClick={armed ? onDeleteConfirmed : onDeleteRequested}
          title={armed ? "دوباره بزن تا برای همیشه حذف شود" : "حذفِ درخواست"}
        >
          {armed ? "مطمئنی؟ دوباره بزن" : "حذف"}
        </Btn>
      </div>
    </li>
  );
}

/** پیامِ خطای فابل‌فهم — `ApiError` پیامِ خودِ سرور را در `message` دارد */
function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "خطای نامشخص";
}
