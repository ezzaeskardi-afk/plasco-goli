"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminOrders,
  getAdminOrder,
  setOrderStatus,
  cancelOrder,
  setOrderTracking,
  setOrderNote,
} from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  Panel,
  StatusPill,
  Spinner,
  ErrorBox,
  ForbiddenBox,
  Btn,
  Input,
  ORDER_FLOW,
  ORDER_STATUS,
  faAgo,
  faDateTime,
  faNum,
  toman,
} from "@/components/admin/AdminBits";
import type { AdminOrder, OrderStatus } from "@/lib/adminTypes";

// ============================================================
// سفارش‌ها — پرکارترین نمای پنل
// ============================================================
// این نما جای «باز کردنِ admin.html و پیدا کردنِ سفارش» را می‌گیرد. سه تصمیم
// که از رفتارِ خودِ سرور می‌آید و نه از سلیقه:
//
//  ۱. گذرهای وضعیت از `ORDER_FLOW` ساخته می‌شوند، نه از یک فهرستِ دستی.
//     سرور `ADMIN_STATUS_FLOW` را دارد و هر گذرِ نامجاز را ۴۰۹ می‌کند. اگر
//     پنل دکمه‌ی نامجاز نشان بدهد، مدیر فقط «ممکن نیست» می‌بیند و نمی‌فهمد چرا.
//
//  ۲. همیشه `from` فعلیِ سفارش فرستاده می‌شود. سرور
//     `UPDATE ... WHERE id = ? AND status = ?` می‌زند؛ یعنی `from` یک قفلِ
//     خوش‌بینانه است. اگر مدیر در یک تب سفارش را جلو برده باشد و تبِ دیگر
//     همان لحظه دکمه را بزند، درخواستِ دوم ۴۰۹ می‌گیرد و ما صفحه را تازه
//     می‌کنیم — به‌جای اینکه وضعیت را عقب برگرداند.
//
//  ۳. جزئیات از یک کوئریِ جداگانه می‌آید، نه از ردیفِ فهرست. وگرنه به‌محضِ
//     اینکه سفارش از فیلترِ فعلی خارج شود (مثلاً «ارسال‌شده» را می‌زنی و فیلتر
//     روی «پرداخت‌شده» است) پنلِ جزئیات زیرِ دست ناپدید می‌شد.

type Filter = "all" | "active" | OrderStatus;

export function OrdersContent() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("active");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const limit = 25;

  const listQuery = useQuery({
    queryKey: ["adminOrders", filter, search, offset],
    queryFn: () => getAdminOrders({ status: filter, q: search, limit, offset }),
    retry: false,
    staleTime: 15_000,
  });

  const detailQuery = useQuery({
    queryKey: ["adminOrder", selectedId],
    queryFn: () => getAdminOrder(selectedId as number),
    enabled: selectedId != null,
    retry: false,
  });

  // پس از هر تغییر، هم فهرست و هم جزئیات تازه می‌شوند: تغییر وضعیت روی شمارشِ
  // فیلترها و روی «در انتظار ارسال»ِ داشبورد هم اثر دارد.
  function refresh(id: number) {
    queryClient.invalidateQueries({ queryKey: ["adminOrders"] });
    queryClient.invalidateQueries({ queryKey: ["adminOrder", id] });
    queryClient.invalidateQueries({ queryKey: ["adminOverview"] });
  }

  const onMutationError = (err: unknown, fallback: string) => {
    toast(err instanceof ApiError ? err.message : fallback, { tone: "error" });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, from, to }: { id: number; from: OrderStatus; to: OrderStatus }) =>
      setOrderStatus(id, from, to),
    onSuccess: (res) => {
      toast(`وضعیت به «${ORDER_STATUS[res.order.status]?.label ?? res.order.status}» تغییر کرد`, {
        tone: "success",
      });
      refresh(res.order.id);
    },
    onError: (err) => onMutationError(err, "تغییر وضعیت ممکن نشد"),
  });

  const isForbidden =
    (listQuery.error instanceof ApiError &&
      [401, 403].includes(listQuery.error.status)) ||
    (detailQuery.error instanceof ApiError &&
      [401, 403].includes(detailQuery.error.status));

  if (isForbidden) return <ForbiddenBox />;

  const counts = listQuery.data?.counts;
  const activeCount = counts ? (counts.paid ?? 0) + (counts.shipped ?? 0) : 0;

  // ترتیبِ تب‌ها عیناً مسیرِ طبیعیِ سفارش است، از پرداخت‌شده تا لغو
  const TABS: { key: Filter; label: string; n?: number }[] = [
    { key: "active", label: "در جریان", n: activeCount },
    { key: "all", label: "همه", n: counts?.all },
    { key: "paid", label: "پرداخت‌شده", n: counts?.paid },
    { key: "shipped", label: "ارسال‌شده", n: counts?.shipped },
    { key: "delivered", label: "تحویل‌شده", n: counts?.delivered },
    { key: "return_requested", label: "درخواست مرجوعی", n: counts?.return_requested },
    { key: "returned", label: "مرجوع‌شده", n: counts?.returned },
    { key: "canceled", label: "لغوشده", n: counts?.canceled },
    { key: "failed", label: "ناموفق", n: counts?.failed },
  ];

  const orders = listQuery.data?.orders ?? [];
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="space-y-5">
      {/* ---------- فیلترها ---------- */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const on = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setFilter(t.key);
                  setOffset(0);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
                style={
                  on
                    ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                    : { background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }
                }
                aria-pressed={on}
              >
                {t.label}
                {t.n != null && <span className="mr-1.5">{faNum(t.n)}</span>}
              </button>
            );
          })}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
            setOffset(0);
          }}
        >
          <Input
            value={q}
            onChange={setQ}
            placeholder="جستجو: شماره سفارش، موبایل، نام، کد رهگیری…"
            ariaLabel="جستجوی سفارش"
            className="flex-1 min-w-0"
          />
          <Btn type="submit" tone="teal">
            جستجو
          </Btn>
          {search && (
            <Btn
              tone="dim"
              onClick={() => {
                setQ("");
                setSearch("");
                setOffset(0);
              }}
            >
              پاک کردن
            </Btn>
          )}
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        {/* ---------- فهرست ---------- */}
        <div className="lg:col-span-3">
          {listQuery.isPending ? (
            <Spinner label="در حال گرفتن سفارش‌ها…" />
          ) : listQuery.error ? (
            <ErrorBox
              message={
                listQuery.error instanceof ApiError
                  ? listQuery.error.message
                  : "خطا در گرفتن سفارش‌ها"
              }
              onRetry={() => listQuery.refetch()}
            />
          ) : orders.length === 0 ? (
            <Panel title="سفارشی پیدا نشد">
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
                با این فیلتر سفارشی نیست.
                {search && ` برای «${search}» چیزی پیدا نشد.`}
              </p>
            </Panel>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] px-1"
                   style={{ color: "var(--color-ink-dim)" }}>
                <span>{faNum(total)} سفارش</span>
                <span>{toman(listQuery.data?.sum ?? 0)} (پرداخت‌شده)</span>
              </div>

              <ul className="space-y-2">
                {orders.map((o) => {
                  const on = o.id === selectedId;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(o.id)}
                        className="w-full text-right rounded-[16px] p-3 transition-colors"
                        style={{
                          background: "var(--color-surface)",
                          border: `1px solid ${
                            on ? "var(--color-teal)" : "var(--color-line)"
                          }`,
                        }}
                        aria-pressed={on}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-extrabold"
                                style={{ color: "var(--color-ink)" }}>
                            #{faNum(o.id)}
                          </span>
                          <StatusPill status={o.status} />
                          <span className="mr-auto text-[10px]"
                                style={{ color: "var(--color-ink-dim)" }}>
                            {faAgo(o.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]"
                             style={{ color: "var(--color-ink-soft)" }}>
                          <span className="truncate">{o.userName || "بدون نام"}</span>
                          <span dir="ltr" style={{ color: "var(--color-ink-dim)" }}>
                            {o.userPhone}
                          </span>
                          <span className="mr-auto shrink-0 font-bold"
                                style={{ color: "var(--color-teal)" }}>
                            {toman(o.total)}
                          </span>
                        </div>
                        <div className="text-[10px] mt-1 truncate"
                             style={{ color: "var(--color-ink-dim)" }}>
                          {faNum(o.items?.length ?? 0)} قلم · {o.address?.city || "—"}
                          {o.trackingCode ? ` · رهگیری ${o.trackingCode}` : ""}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {(offset > 0 || offset + limit < total) && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Btn tone="dim" disabled={offset === 0}
                       onClick={() => setOffset(Math.max(0, offset - limit))}>
                    ← قبلی
                  </Btn>
                  <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
                    {faNum(Math.floor(offset / limit) + 1)} از{" "}
                    {faNum(Math.max(1, Math.ceil(total / limit)))}
                  </span>
                  <Btn tone="dim" disabled={offset + limit >= total}
                       onClick={() => setOffset(offset + limit)}>
                    بعدی →
                  </Btn>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- جزئیات ---------- */}
        <div className="lg:col-span-2 lg:sticky lg:top-4">
          {selectedId == null ? (
            <Panel title="یک سفارش را انتخاب کن">
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
                برای دیدن اقلام، آدرس و کارهای قابل‌انجام، روی یکی از سفارش‌های
                فهرست بزن.
              </p>
            </Panel>
          ) : detailQuery.isPending ? (
            <Spinner label={`سفارش #${faNum(selectedId)}`} />
          ) : detailQuery.error ? (
            <ErrorBox
              message={
                detailQuery.error instanceof ApiError
                  ? detailQuery.error.message
                  : "خطا در گرفتن سفارش"
              }
              onRetry={() => detailQuery.refetch()}
            />
          ) : detailQuery.data ? (
            <OrderDetail
              order={detailQuery.data}
              busy={statusMutation.isPending}
              onStatus={(from, to) =>
                statusMutation.mutate({ id: detailQuery.data.id, from, to })
              }
              onRefresh={() => refresh(detailQuery.data.id)}
              onError={onMutationError}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// پنلِ جزئیات + کارها
// ============================================================

function OrderDetail({
  order,
  busy,
  onStatus,
  onRefresh,
  onError,
}: {
  order: AdminOrder;
  busy: boolean;
  onStatus: (from: OrderStatus, to: OrderStatus) => void;
  onRefresh: () => void;
  onError: (err: unknown, fallback: string) => void;
}) {
  const toast = useToast();
  const [tracking, setTracking] = useState(order.trackingCode || "");
  const [note, setNote] = useState(order.adminNote || "");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const trackingMutation = useMutation({
    mutationFn: (code: string) => setOrderTracking(order.id, code),
    onSuccess: () => {
      toast("کد رهگیری ذخیره شد", { tone: "success" });
      onRefresh();
    },
    onError: (err) => onError(err, "ذخیره‌ی کد رهگیری ممکن نشد"),
  });

  const noteMutation = useMutation({
    mutationFn: (text: string) => setOrderNote(order.id, text),
    onSuccess: () => {
      toast("یادداشت ذخیره شد", { tone: "success" });
      onRefresh();
    },
    onError: (err) => onError(err, "ذخیره‌ی یادداشت ممکن نشد"),
  });

  const cancelMutation = useMutation({
    mutationFn: (why: string) => cancelOrder(order.id, why),
    onSuccess: () => {
      toast("سفارش لغو شد و کالاها به انبار برگشت", { tone: "success" });
      setCancelOpen(false);
      setReason("");
      onRefresh();
    },
    onError: (err) => onError(err, "لغو سفارش ممکن نشد"),
  });

  const nexts = ORDER_FLOW[order.status] ?? [];
  const canCancel = ["paid", "shipped", "delivered", "return_requested"].includes(order.status);

  return (
    <div className="space-y-4">
      <Panel
        title={`سفارش #${faNum(order.id)}`}
        action={<StatusPill status={order.status} />}
      >
        <dl className="space-y-1.5 text-[11px]">
          <Row label="مشتری" value={order.userName || "بدون نام"} />
          <Row label="موبایل" value={order.userPhone} ltr />
          <Row label="ثبت" value={faDateTime(order.createdAt)} />
          {order.paidAt && <Row label="پرداخت" value={faDateTime(order.paidAt)} />}
          {order.deliveredAt && <Row label="تحویل" value={faDateTime(order.deliveredAt)} />}
          {order.refId && <Row label="شماره پیگیری بانک" value={order.refId} ltr />}
          <Row label="ارسال" value={toman(order.shippingFee)} />
          {order.discount > 0 && (
            <Row
              label={`تخفیف${order.couponCode ? ` (${order.couponCode})` : ""}`}
              value={`−${toman(order.discount)}`}
            />
          )}
          <Row label="مبلغ کل" value={toman(order.total)} strong />
        </dl>

        {order.cancelReason && (
          <p className="mt-3 rounded-xl p-2.5 text-[11px]"
             style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}>
            دلیل لغو: {order.cancelReason}
          </p>
        )}
        {order.returnReason && (
          <p className="mt-3 rounded-xl p-2.5 text-[11px]"
             style={{ background: "var(--color-pink-tint)", color: "var(--color-pink)" }}>
            دلیل مرجوعی مشتری: {order.returnReason}
          </p>
        )}
      </Panel>

      {/* ---------- اقلام ---------- */}
      <Panel title={`اقلام (${faNum(order.items?.length ?? 0)})`}>
        <ul className="space-y-2">
          {(order.items ?? []).map((it) => (
            <li key={`${it.productId}-${it.title}`} className="flex items-center gap-2.5 text-xs">
              <Link href={`/product/${it.productId}`} className="flex-1 min-w-0 truncate hover:underline"
                    style={{ color: "var(--color-ink-soft)" }}>
                {it.title}
              </Link>
              <span className="shrink-0" style={{ color: "var(--color-ink-dim)" }}>
                {faNum(it.qty)} ×
              </span>
              <span className="shrink-0 font-bold w-24 text-left" style={{ color: "var(--color-ink)" }}>
                {toman(it.price * it.qty)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---------- آدرس ---------- */}
      <Panel title="آدرس تحویل">
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          {order.address?.fullName}
          {order.address?.phone && (
            <>
              {" · "}
              <span dir="ltr">{order.address.phone}</span>
            </>
          )}
          <br />
          {order.address?.province && `${order.address.province}، `}
          {order.address?.city && `${order.address.city} — `}
          {order.address?.addressLine}
          {order.address?.postalCode && ` (کدپستی: ${order.address.postalCode})`}
        </p>
      </Panel>

      {/* ---------- کارها ---------- */}
      <Panel title="کارهای قابل انجام">
        {nexts.length === 0 && !canCancel && (
          <p className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
            این سفارش بسته شده است؛ کار دیگری روی آن نمی‌شود انجام داد.
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {nexts.map((to) => (
            <Btn
              key={to}
              disabled={busy}
              tone={to === "canceled" ? "coral" : "teal"}
              onClick={() => onStatus(order.status, to)}
              title={
                to === "canceled"
                  ? "با این دکمه لغو می‌شود؛ برای ثبت دلیل از «لغو با دلیل» استفاده کن"
                  : undefined
              }
            >
              {to === "shipped" && "ارسال شد"}
              {to === "delivered" && "تحویل شد"}
              {to === "paid" && "برگشت به پرداخت‌شده"}
              {to === "canceled" && "لغو"}
            </Btn>
          ))}

          {/* تأییدِ مرجوعی مسیرِ خودش را دارد: موجودی هم برمی‌گردد (تراکنشِ اتمی).
              از همین API می‌رود، ولی به‌عنوان یک کارِ جدا نشان داده می‌شود. */}
          {order.status === "return_requested" && (
            <Btn tone="pink" disabled={busy}
                 onClick={() => onStatus("return_requested", "returned")}>
              تأیید مرجوعی و برگشت به انبار
            </Btn>
          )}

          {canCancel && (
            <Btn tone="coral" disabled={busy || cancelMutation.isPending}
                 onClick={() => setCancelOpen((v) => !v)}>
              لغو با دلیل
            </Btn>
          )}
        </div>

        {cancelOpen && (
          <div className="mt-3 flex gap-2">
            <Input
              value={reason}
              onChange={setReason}
              placeholder="دلیل لغو (برای مشتری و دفتر رویدادها ثبت می‌شود)"
              ariaLabel="دلیل لغو"
              className="flex-1 min-w-0"
            />
            <Btn
              tone="coral"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(reason)}
            >
              تأیید لغو
            </Btn>
          </div>
        )}
      </Panel>

      {/* ---------- رهگیری ---------- */}
      <Panel title="کد رهگیری پستی">
        <div className="flex gap-2">
          <Input
            value={tracking}
            onChange={setTracking}
            placeholder="مثلاً 1234567890123"
            ariaLabel="کد رهگیری"
            dir="ltr"
            className="flex-1 min-w-0"
          />
          <Btn
            tone="teal"
            disabled={trackingMutation.isPending || tracking === (order.trackingCode || "")}
            onClick={() => trackingMutation.mutate(tracking)}
          >
            ذخیره
          </Btn>
        </div>
        <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
          فقط حرف و رقم و خط تیره، حداقل ۴ کاراکتر. خالی گذاشتن یعنی پاک‌کردن.
        </p>
      </Panel>

      {/* ---------- یادداشت داخلی ---------- */}
      <Panel title="یادداشت داخلی">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="فقط در پنل دیده می‌شود و به مشتری نمی‌رود."
          className="w-full rounded-[14px] px-3 py-2 text-xs outline-none resize-y"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-line-control)",
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <Btn
            tone="teal"
            disabled={noteMutation.isPending || note === (order.adminNote || "")}
            onClick={() => noteMutation.mutate(note)}
          >
            ذخیره‌ی یادداشت
          </Btn>
          {note !== (order.adminNote || "") && (
            <span className="text-[10px]" style={{ color: "var(--color-gold)" }}>
              تغییرِ ذخیره‌نشده
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  ltr,
}: {
  label: string;
  value: string;
  strong?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: "var(--color-ink-dim)" }}>{label}</dt>
      <dd
        className={strong ? "font-extrabold" : ""}
        dir={ltr ? "ltr" : undefined}
        style={{ color: strong ? "var(--color-teal)" : "var(--color-ink-soft)" }}
      >
        {value}
      </dd>
    </div>
  );
}
