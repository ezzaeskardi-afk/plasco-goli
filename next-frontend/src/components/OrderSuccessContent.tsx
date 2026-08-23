"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getMe, getOrder, reorderOrder, ApiError } from "@/lib/api";
import type { Order } from "@/lib/types";

// ============================================================
// صفحه‌ی نتیجه‌ی سفارش
// ============================================================
// این صفحه جایی است که مشتری بعد از برگشت از درگاه پرداخت می‌رسد. متنِ همه‌ی
// حالت‌ها عیناً از frontend/js/order-success.js آمده و **عمداً بازنویسی نشده**؛
// دلیلش در همان فایل نوشته شده و مهم‌ترین قاعده‌ی این صفحه است:
//
//   ادعای قطعی درباره‌ی پول نکن. در حالت pending_payment ما هیچ تأییدیه‌ای از
//   درگاه نگرفته‌ایم، پس کاملاً ممکن است بانک پول را برداشته باشد. گفتنِ
//   «مبلغی از حساب شما کسر نشده» در آن حالت دروغ است.

type Tone = "teal" | "gold" | "coral";

const TONE: Record<Tone, string> = {
  teal: "var(--color-teal)",
  gold: "var(--color-gold)",
  coral: "var(--color-coral)",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "پرداخت‌شده",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  pending_payment: "در انتظار پرداخت",
  failed: "ناموفق",
  // بک‌اند «canceled» با یک l می‌نویسد (routes/orders.js). املای دیگر یعنی
  // مشتری به‌جای «لغو شده» رشته‌ی انگلیسیِ خام را می‌بیند.
  canceled: "لغو شده",
  return_requested: "در انتظار بررسی مرجوعی",
  returned: "مرجوع شده",
};

const PAID_LIKE = [
  "paid",
  "shipped",
  "delivered",
  "return_requested",
  "returned",
];
const CAN_REORDER = ["failed", "canceled", "pending_payment"];

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

// دکمه‌ها هشت جای این صفحه تکرار می‌شوند؛ استایل‌شان یک بار اینجا تعریف
// می‌شود تا با بقیه‌ی صفحات (که همین رنگ‌ها را دارند) یکدست بماند.
const BTN = "rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90";
const BTN_MAIN = { background: "var(--color-teal)", color: "#04211B" } as const;
const BTN_OUT = {
  background: "transparent",
  color: "var(--color-ink)",
  border: "1px solid var(--color-line-strong)",
} as const;

/** حالتی که روی کارتِ بالای صفحه نشان داده می‌شود */
interface Result {
  tone: Tone;
  title: string;
  desc: string;
  /** دکمه‌ها را در حالت‌های خطا فرق می‌کند */
  kind: "order" | "notfound" | "invalid" | "unreadable";
}

export function OrderSuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId");

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reordering, setReordering] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!orderId) {
      setResult({
        tone: "coral",
        title: "سفارشی پیدا نشد",
        desc: "لینک نامعتبر است.",
        kind: "invalid",
      });
      setLoading(false);
      return;
    }

    // مثل نسخه‌ی اصلی، بررسیِ ورود همین‌جا (سمتِ کلاینت) انجام می‌شود و نه در
    // middleware: کسی که همین حالا پول داده نباید به‌خاطر یک کندیِ لحظه‌ایِ
    // بک‌اند به صفحه‌ی ورود پرت شود.
    const me = await getMe().catch(() => null);
    if (!me?.user) {
      router.push(
        `/login?redirect=${encodeURIComponent(`/order-success?orderId=${orderId}`)}`,
      );
      return;
    }

    try {
      const { order: o } = await getOrder(Number(orderId));
      setOrder(o);

      if (PAID_LIKE.includes(o.status)) {
        setResult({
          tone: "teal",
          title: "پرداخت با موفقیت انجام شد",
          desc: `شماره سفارش شما: ${toFa(o.id)} — رسیدش را در «سفارش‌های من» می‌بینید.`,
          kind: "order",
        });
      } else if (o.status === "pending_payment") {
        setResult({
          tone: "gold",
          title: "نتیجه‌ی پرداخت هنوز مشخص نیست",
          desc:
            "تأییدیه‌ای از درگاه به ما نرسیده. چند دقیقه صبر کنید و همین صفحه را یک بار تازه کنید. " +
            "اگر باز هم همین را دید و مبلغی از حسابتان کم شده، بانک آن را حداکثر تا ۷۲ ساعت خودکار برمی‌گرداند.",
          kind: "order",
        });
      } else if (o.status === "canceled") {
        setResult({
          tone: "coral",
          title: "این سفارش لغو شده",
          desc:
            o.cancelReason ||
            "اگر هنوز کالا را می‌خواهید، با یک دکمه دوباره سفارش بدهید.",
          kind: "order",
        });
      } else {
        setResult({
          tone: "coral",
          title: "پرداخت انجام نشد",
          desc:
            "سفارش ثبت نشد و کالاها به انبار برگشتند. اگر مبلغی از حسابتان کم شده باشد، " +
            "بانک آن را حداکثر تا ۷۲ ساعت خودکار برمی‌گرداند.",
          kind: "order",
        });
      }
    } catch (err) {
      // فقط ۴۰۴ حق دارد بگوید «سفارشی پیدا نشد». اگر *هر* خطایی — مثل قطعیِ
      // لحظه‌ایِ اینترنت — این را بگوید، برای کسی که همین حالا پول داده یعنی
      // «پولم رفت و سفارشی هم نیست».
      if (err instanceof ApiError && err.status === 404) {
        setResult({
          tone: "coral",
          title: "سفارشی پیدا نشد",
          desc: "این شماره سفارش برای حساب شما نیست. اگر پرداخت کرده‌اید، سفارش‌های من را ببینید.",
          kind: "notfound",
        });
      } else {
        setResult({
          tone: "coral",
          title: "وضعیت سفارش را نتوانستیم بگیریم",
          desc: `${
            err instanceof Error ? err.message : "خطای نامشخص."
          } سفارش شما سر جایش است؛ فقط این صفحه نتوانست وضعیتش را بخواند.`,
          kind: "unreadable",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReorder = async () => {
    if (!order) return;
    setReordering(true);
    setNotice("");
    try {
      const r = await reorderOrder(order.id);
      if (r.skipped?.length) {
        // کالاهای جاافتاده باید *گفته* شوند، وگرنه مشتری سبدِ کمتر از انتظارش
        // را می‌بیند و فکر می‌کند سایت خراب است.
        setNotice(
          `سبد چیده شد؛ ولی ${r.skipped
            .map((s) => `«${s.title}» ${s.reason}`)
            .join("، ")}`,
        );
        setTimeout(() => router.push("/cart"), 2200);
      } else {
        router.push("/cart");
      }
    } catch (err) {
      setReordering(false);
      setNotice(err instanceof ApiError ? err.message : "خطا در چیدن سبد");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  if (!result) return null;

  const canReorder = Boolean(order && CAN_REORDER.includes(order.status));
  const color = TONE[result.tone];

  return (
    <div className="mx-auto max-w-[640px] px-6 py-12">
      {/* کارتِ نتیجه */}
      <div
        className="rounded-[18px] p-8 text-center"
        style={{ background: "var(--color-surface)", boxShadow: "var(--shadow-sm)" }}
      >
        <div
          className="w-16 h-16 rounded-full mx-auto mb-5 grid place-items-center"
          style={{ background: `${color}1A`, border: `1px solid ${color}44` }}
          aria-hidden="true"
        >
          {result.tone === "teal" ? (
            <CheckIcon color={color} />
          ) : (
            <AlertIcon color={color} />
          )}
        </div>

        <h1
          className="text-xl font-extrabold mb-3 leading-relaxed"
          style={{ color: "var(--color-ink)" }}
        >
          {result.title}
        </h1>
        <p
          className="text-sm leading-loose"
          style={{ color: "var(--color-ink-soft)" }}
        >
          {result.desc}
        </p>

        {notice && (
          <p
            className="mt-4 rounded-xl px-4 py-3 text-xs leading-relaxed"
            style={{
              background: "var(--color-gold-tint)",
              color: "var(--color-ink-soft)",
            }}
            role="status"
          >
            {notice}
          </p>
        )}

        <div className="flex flex-wrap gap-2.5 justify-center mt-7">
          {result.kind === "invalid" && (
            <Link href="/" className={BTN} style={BTN_MAIN}>
              بازگشت به فروشگاه
            </Link>
          )}

          {result.kind === "notfound" && (
            <>
              <Link href="/account" className={BTN} style={BTN_MAIN}>
                سفارش‌های من
              </Link>
              <Link href="/" className={BTN} style={BTN_OUT}>
                بازگشت به فروشگاه
              </Link>
            </>
          )}

          {result.kind === "unreadable" && (
            <>
              <button
                type="button"
                onClick={() => load()}
                className={BTN}
                style={BTN_MAIN}
              >
                تلاش دوباره
              </button>
              <Link href="/account" className={BTN} style={BTN_OUT}>
                سفارش‌های من
              </Link>
            </>
          )}

          {result.kind === "order" && (
            <>
              {canReorder && (
                <button
                  type="button"
                  onClick={handleReorder}
                  disabled={reordering}
                  className={`${BTN} disabled:opacity-60`}
                  style={BTN_MAIN}
                >
                  {reordering ? "در حال چیدن سبد…" : "دوباره سفارش بده"}
                </button>
              )}
              <Link href="/account" className={BTN} style={BTN_OUT}>
                سفارش‌های من
              </Link>
              <Link
                href="/products"
                className={BTN}
                style={canReorder ? BTN_OUT : BTN_MAIN}
              >
                ادامه‌ی خرید
              </Link>
            </>
          )}
        </div>
      </div>

      {/* جزئیات سفارش */}
      {order && (
        <div
          className="rounded-[18px] p-5 mt-5"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <b className="text-sm" style={{ color: "var(--color-ink)" }}>
                سفارش #{toFa(order.id)}
              </b>
              <div className="text-xs mt-1" style={{ color: "var(--color-ink-dim)" }}>
                {order.createdAt?.slice(0, 10)}
              </div>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{ background: `${color}20`, color }}
            >
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          <div
            className="text-xs space-y-1.5 py-3 border-y"
            style={{
              color: "var(--color-ink-soft)",
              borderColor: "var(--color-line)",
            }}
          >
            {order.items?.map((item, i) => (
              <div key={i}>
                {item.title} × {toFa(item.qty)}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-3">
            <span className="text-xs" style={{ color: "var(--color-ink-soft)" }}>
              مبلغ کل
            </span>
            <span
              className="text-sm font-extrabold"
              style={{ color: "var(--color-teal)" }}
            >
              {toFa(order.total)} تومان
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-8 h-8"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-8 h-8"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
