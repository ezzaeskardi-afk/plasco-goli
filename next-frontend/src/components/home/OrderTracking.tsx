"use client";

import { useState } from "react";
import { trackOrder, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Order } from "@/lib/types";

// ============================================================
// ردیابی سفارش بدون ورود — همتای initOrderTracking (main.js:893)
// ============================================================
// چرا این بخش حیاتی است: تنها راهِ دیدنِ وضعیتِ سفارش تا بود «ورود با
// پیامک» یعنی یک OTPِ پولی به‌ازای هر کنجکاوی. فرمِ ساده‌ی شماره‌سفارش +
// موبایل همان کار را بدون پیامک می‌کند.

// ارقام فارسی/عربی → لاتین برای شماره‌ی سفارش و موبایل
function toEnDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

const STEPS: { id: string; label: string }[] = [
  { id: "paid", label: "پرداخت شد" },
  { id: "shipped", label: "ارسال شد" },
  { id: "delivered", label: "تحویل شد" },
];

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت شده",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  canceled: "لغو شده",
  failed: "ناموفق",
  return_requested: "درخواست مرجوعی",
  returned: "مرجوع شده",
};

function TrackingTimeline({ order }: { order: Order }) {
  const reached = ["paid", "shipped", "delivered"].indexOf(order.status);
  const offTrack = reached === -1;

  return (
    <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
      <div className="flex items-center justify-between mb-3 text-xs">
        <b style={{ color: "var(--color-ink)" }}>سفارش #{new Intl.NumberFormat("fa-IR").format(order.id)}</b>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            background:
              offTrack
                ? "var(--color-coral-tint)"
                : "var(--color-teal-tint)",
            color: offTrack ? "var(--color-coral)" : "var(--color-teal)",
          }}
        >
          {STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      {!offTrack ? (
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const done = i <= reached;
            return (
              <div key={s.id} className="flex-1 flex items-center gap-1">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: done ? "var(--color-teal)" : "var(--color-surface-2)",
                      color: done ? "#04211B" : "var(--color-ink-dim)",
                    }}
                  >
                    {done ? "✓" : new Intl.NumberFormat("fa-IR").format(i + 1)}
                  </span>
                  <span className="text-[10px]" style={{ color: done ? "var(--color-teal)" : "var(--color-ink-dim)" }}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className="flex-1 h-0.5 -mt-4"
                    style={{ background: i < reached ? "var(--color-teal)" : "var(--color-line)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>
          {order.status === "pending_payment" &&
            "سفارش هنوز پرداخت نشده؛ اگر مبلغ کسر شده، تا ۷۲ ساعت به حساب برمی‌گردد."}
          {order.status === "canceled" &&
            `سفارش لغو شده${order.cancelReason ? ` — دلیل: ${order.cancelReason}` : ""}.`}
          {order.status === "failed" && "پرداخت ناموفق بود؛ می‌توانید دوباره تلاش کنید."}
          {order.status === "return_requested" && "درخواست مرجوعی شما در حال بررسی است."}
          {order.status === "returned" && "این سفارش مرجوع شده است."}
        </p>
      )}

      {order.trackingCode && (
        <p className="mt-3 text-[11px] text-ink-dim" dir="ltr">
          کد رهگیری پستی:{" "}
          {order.trackingCode.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}
        </p>
      )}
    </div>
  );
}

export function OrderTrackingSection() {
  const toast = useToast();
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseInt(toEnDigits(orderId).replace(/\D/g, ""), 10);
    const ph = toEnDigits(phone).replace(/[\s-]/g, "");
    if (!Number.isInteger(id) || id <= 0) {
      toast("شماره‌ی سفارش را وارد کنید (فقط عدد)", { tone: "error" });
      return;
    }
    if (ph.length < 10) {
      toast("شماره موبایلی که سفارش با آن ثبت شده را وارد کنید", { tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await trackOrder(id, ph);
      setOrder(res.order);
    } catch (err) {
      setOrder(null);
      toast(err instanceof ApiError && err.message ? err.message : "پیدا نشد", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    border: "1px solid var(--color-line-control)",
  } as const;

  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-16">
      <div className="rounded-[26px] p-6 md:p-8" style={{ background: "var(--color-surface)" }}>
        <h2 className="text-xl md:text-2xl font-extrabold text-ink mb-2">
          پیگیری سفارش
        </h2>
        <p className="text-xs text-ink-soft mb-5 leading-relaxed">
          بدون ورود — فقط شماره‌ی سفارش و موبایلی که با آن خرید کرده‌اید.
        </p>

        <form onSubmit={submit} className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            inputMode="numeric"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="شماره سفارش"
            aria-label="شماره سفارش"
            className="rounded-full px-4 py-2.5 text-sm outline-none w-full sm:w-44"
            style={inputStyle}
          />
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            aria-label="شماره موبایل"
            dir="ltr"
            className="rounded-full px-4 py-2.5 text-sm outline-none w-full sm:w-48 text-right"
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-60"
            style={{ background: "var(--color-teal)", color: "#04211B" }}
          >
            {busy ? "…" : "پیگیری"}
          </button>
        </form>

        {order && <TrackingTimeline order={order} />}
      </div>
    </section>
  );
}
