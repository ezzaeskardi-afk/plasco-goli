"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getMe, getOrder, reorderOrder, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
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

// ============================================================
// پیگیریِ خودکارِ نتیجه
// ============================================================
// مسئله: تنها جایی که سایت می‌فهمد «پول گرفته شد» مسیرِ بازگشتِ درگاه است، و آن
// یک ریدایرکتِ **مرورگر** است. اگر اینترنتِ مشتری وسطِ پرداخت برود، آن درخواست
// هرگز نمی‌آید و سایت خبر ندارد. برای همین بک‌اند سفارش‌های نیمه‌کاره را از خودِ
// درگاه می‌پرسد (lib/reconcile.js) — ولی آن پرسیدن بعد از انقضای مهلتِ ۳۰
// دقیقه‌ای شروع می‌شود و خودش هر ۵ دقیقه یک‌بار اجرا می‌شود.
//
// پس «چند دقیقه صبر کن و همین صفحه را یک بار تازه کن» دستورِ ناقصی بود: ممکن
// است تأییدیه تا نیم‌ساعت بعد نرسد، و مشتری هم نمی‌داند کِی دوباره سر بزند.
// این صفحه حالا خودش می‌پرسد و به‌محضِ روشن‌شدنِ نتیجه خودش عوض می‌شود.
//
// پنجره‌ی بررسی عمداً با ریتمِ بک‌اند هماهنگ است: ۸ بررسیِ ۱۵ ثانیه‌ای (۲
// دقیقه، برای تأییدیه‌های دیررسی که کال‌بکشان گم شده) و بعد ۳۲ بررسیِ یک‌دقیقه‌ای.
// مجموعاً ≈ ۳۴ دقیقه — یعنی همان پنجره‌ای که تطبیق می‌تواند سفارش را روشن کند.
const POLL_MS_FAST = 15_000;
const POLL_MS_SLOW = 60_000;
const POLL_CHECKS_FAST = 8;
const POLL_CHECKS_TOTAL = 40;

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

/**
 * وضعیتِ سفارش → کارتِ نتیجه.
 *
 * چرا تابع و نه کدِ درون‌خطی: هم بارگذاریِ اول و هم هر بررسیِ خودکار باید به
 * یک نتیجه برسند. دو نسخه یعنی امکانِ واگرایی — صفحه‌ای که بسته به اینکه نتیجه
 * را اول دیده باشی یا بعد، دو حرفِ متفاوت بزند.
 *
 * لحنِ متن عمداً محافظه‌کارانه است: در حالتِ pending ما هیچ تأییدیه‌ای از درگاه
 * نداریم، پس نمی‌توانیم بگوییم «مبلغی کم نشده» — این ادعا در آن حالت می‌تواند
 * دروغ باشد.
 */
function resultFor(o: Order): Result {
  if (PAID_LIKE.includes(o.status)) {
    return {
      tone: "teal",
      title: "پرداخت با موفقیت انجام شد",
      desc: `شماره سفارش شما: ${toFa(o.id)} — رسیدش را در «سفارش‌های من» می‌بینید.`,
      kind: "order",
    };
  }
  if (o.status === "pending_payment") {
    return {
      tone: "gold",
      title: "نتیجه‌ی پرداخت هنوز مشخص نیست",
      desc:
        "تأییدیه‌ای از درگاه به ما نرسیده، ولی این به معنیِ پرداخت‌نشدن نیست. " +
        "اگر مبلغی از حسابتان کم شده و سفارش تأیید نشد، بانک آن را حداکثر تا ۷۲ ساعت خودکار برمی‌گرداند.",
      kind: "order",
    };
  }
  if (o.status === "canceled") {
    return {
      tone: "coral",
      title: "این سفارش لغو شده",
      desc:
        o.cancelReason ||
        "اگر هنوز کالا را می‌خواهید، با یک دکمه دوباره سفارش بدهید.",
      kind: "order",
    };
  }
  return {
    tone: "coral",
    title: "پرداخت انجام نشد",
    desc:
      "سفارش ثبت نشد و کالاها به انبار برگشتند. اگر مبلغی از حسابتان کم شده باشد، " +
      "بانک آن را حداکثر تا ۷۲ ساعت خودکار برمی‌گرداند.",
    kind: "order",
  };
}

export function OrderSuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reordering, setReordering] = useState(false);
  const [notice, setNotice] = useState("");
  /** بررسیِ خودکار به سقفِ پنجره‌اش رسید و ایستاد — با «بررسی دوباره» از سر می‌گیرد */
  const [gaveUp, setGaveUp] = useState(false);

  // «آخرین وضعیتی که دیده‌ایم» عمداً در ref است و نه state: اگر در وابستگی‌های
  // effect می‌آمد، هر بررسی کلِ حلقه را از نو می‌ساخت.
  const lastStatusRef = useRef("");
  // جلوگیری از روی‌هم‌افتادنِ درخواست‌ها (شبکه‌ی کند + بررسیِ دستیِ هم‌زمان)
  const inFlightRef = useRef(false);

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
      lastStatusRef.current = o.status;
      setOrder(o);
      setResult(resultFor(o));
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

  /**
   * یک بررسیِ سبک — بدونِ تکرارِ دروازه‌ی ورود و بدونِ دست‌زدن به UI در خطا.
   *
   * دو تفاوتِ عمدی با load:
   *   • گیتِ ورود را تکرار نمی‌کند. اگر می‌کرد، یک قطعیِ گذرای شبکه وسطِ بررسی
   *     مشتری را به صفحه‌ی ورود پرت می‌کرد — درست در حالی که او پول داده.
   *   • خطا را بی‌صدا رد می‌کند. خطای گذرا در یک بررسیِ ۱۵ ثانیه‌ای یعنی «این
   *     نوبت نشد»، نه «وضعیت را نمی‌توانیم بخوانیم». کارتِ قرمز برای آن، مشتری
   *     را بی‌خود می‌ترساند؛ صفحه از قبل خوانده شده و کار می‌کند.
   */
  const refreshOnce = useCallback(async () => {
    if (!orderId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { order: o } = await getOrder(Number(orderId));
      if (o.status === lastStatusRef.current) return;
      lastStatusRef.current = o.status;
      setOrder(o);
      setResult(resultFor(o));
      // فقط خبرِ خوب پیامِ شناور می‌گیرد: عوض‌شدن به «ناموفق» را خودِ کارت
      // می‌گوید و یک پیامِ شناور رویش فقط توی ذوق می‌زند.
      if (PAID_LIKE.includes(o.status)) {
        toast("پرداخت شما تأیید شد و سفارش ثبت شد", { tone: "success" });
      }
    } catch {
      /* گذرا — نوبتِ بعد */
    } finally {
      inFlightRef.current = false;
    }
  }, [orderId, toast]);

  // حلقه‌ی بررسی — فقط تا وقتی نتیجه روشن نشده.
  //
  // سه محافظ دارد و هر سه لازم است:
  //   • تبِ پنهان: هیچ درخواستی نمی‌فرستد و تا برگشتنِ مشتری پارک می‌کند
  //     (visibilitychange دوباره راهش می‌اندازد). پس یک تبِ رهاشده در پس‌زمینه
  //     تا ابد روی سرور درخواست نمی‌زند.
  //   • سقفِ تعدادِ بررسی: بعد از پنجره، ایست و به مشتری بگو — نه حلقه‌ی بی‌پایان.
  //   • پاک‌سازیِ تایمر در unmount تا ناوبری، درخواستِ یتیم جا نگذارد.
  useEffect(() => {
    if (!orderId || order?.status !== "pending_payment" || gaveUp) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let checks = 0;

    function schedule(ms: number) {
      if (cancelled) return;
      timer = setTimeout(() => void run(), ms);
    }

    async function run() {
      if (cancelled) return;
      // تبِ پنهان: بی‌صدا پارک کن؛ visibilitychange از سر می‌گیردش.
      if (document.hidden) return;
      checks += 1;
      await refreshOnce();
      if (cancelled) return;
      // اگر نتیجه عوض شده باشد، همین effect با order.status جدید از نو ساخته
      // می‌شود و شرطِ بالا جلوی ادامه‌ی حلقه را می‌گیرد.
      if (checks >= POLL_CHECKS_TOTAL) {
        setGaveUp(true);
        return;
      }
      schedule(checks < POLL_CHECKS_FAST ? POLL_MS_FAST : POLL_MS_SLOW);
    }

    function onVisible() {
      if (cancelled || document.hidden) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void run();
    }

    document.addEventListener("visibilitychange", onVisible);
    schedule(POLL_MS_FAST);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [orderId, order?.status, gaveUp, refreshOnce]);

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
  const isPending = order?.status === "pending_payment";
  // ⚠️ در حالتِ «در انتظار پرداخت» دکمه‌ی «دوباره سفارش بده» عمداً نمایش داده
  // نمی‌شود. سفارش همان لحظه دارد بررسی می‌شود؛ اگر مشتری سفارشِ دومی بدهد و
  // آن پرداختِ گم‌شده هم بعداً تأیید شود، دو بار از حسابش کم می‌شود. تا وقتی
  // نتیجه روشن نشده، جای درستِ این دکمه یک «بررسی دوباره» است.
  const showReorder = canReorder && !isPending;
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

        {/* وضعیتِ زنده‌ی بررسیِ خودکار. عمداً به‌جای «راهنما» اینجا نشسته: مشتری
            باید بداند کسی دارد پیگیری می‌کند و لازم نیست خودش کاری بکند. */}
        {isPending && (
          <p
            className="mt-4 rounded-xl px-4 py-3 text-xs leading-relaxed"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-ink-dim)",
            }}
            role="status"
          >
            {gaveUp
              ? "بررسیِ خودکار را نگه داشتیم. هر وقت خواستید «بررسی دوباره» را بزنید؛ نتیجه‌ی پرداخت با پیامک هم به شما اطلاع داده می‌شود."
              : "داریم از درگاه بررسی می‌کنیم… این صفحه خودش به‌روز می‌شود و لازم نیست کاری کنید."}
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
              {isPending && (
                <button
                  type="button"
                  onClick={() => {
                    setGaveUp(false);
                    void refreshOnce();
                  }}
                  className={BTN}
                  style={BTN_MAIN}
                >
                  بررسی دوباره
                </button>
              )}
              {showReorder && (
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
