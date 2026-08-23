"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ============================================================
// توست — همتای PG.toast در frontend/js/common.js
// ============================================================
// نسخه‌ی Next هیچ راهی برای «گفتنِ نتیجه» به کاربر نداشت، در حالی که نسخه‌ی
// Express همه‌جا از این استفاده می‌کند: افزودن به سبد، لغو سفارش، ثبت نظر،
// خطای شبکه. بدونش هر عملیاتی بی‌صدا انجام می‌شد و کاربر نمی‌فهمید کار شد یا نه.
//
// عددها و رنگ‌ها عمداً عیناً از نسخه‌ی اصلی کپی شده‌اند تا دو فرانت‌اند در دوره‌ی
// گذار یک‌شکل بمانند. دو قاعده‌ی دسترسی‌پذیری هم از همان‌جا آمده و مهم‌اند:
//
//   • ظرف `aria-live="polite"` است، نه assertive: خطای هر فرم نباید حرفِ در
//     جریانِ صفحه‌خوان را قطع کند.
//   • ولی خودِ توستِ *خطا* `role="alert"` می‌گیرد تا فوری خوانده شود؛ وگرنه
//     کاربرِ نابینا فرم را می‌فرستد و نمی‌فهمد چرا هیچ اتفاقی نیفتاد.

type ToastTone = "success" | "error" | "info";

interface ToastAction {
  href?: string;
  label: string;
  onClick?: () => void;
}

interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

/** استایلِ هر لحن — عیناً همان گرادیان‌های common.js */
const TONE_STYLE: Record<ToastTone, React.CSSProperties> = {
  success: {
    background: "linear-gradient(135deg,#25E3C4,#12A78F)",
    color: "#04211B",
  },
  error: {
    background: "linear-gradient(135deg,#FF6A4D,#E8503A)",
    color: "#fff",
  },
  info: {
    background: "#1C2E27",
    color: "#EDF6F1",
    border: "1px solid rgba(237,246,241,.16)",
  },
};

// با اقدام ۵ ثانیه، بی‌اقدام ۲٫۶ ثانیه — چون خواندنِ پیام و رسیدن به لینک
// («مشاهده سبد») از خواندنِ تنهای پیام بیشتر طول می‌کشد.
const MS_WITH_ACTION = 5000;
const MS_PLAIN = 2600;

type ShowToast = (message: string, opts?: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => {
  // خارج از Provider صدا زده شده. سکوتِ محض بدترین حالت است، چون همان چیزی را
  // می‌سازد که این کامپوننت برای رفعش نوشته شده: عملیاتی که بی‌صدا رد می‌شود.
  if (process.env.NODE_ENV !== "production") {
    console.warn("useToast خارج از <ToastProvider> استفاده شده — پیام نمایش داده نشد.");
  }
});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  // تایمرها باید در unmount پاک شوند، وگرنه setState روی کامپوننتِ رفته صدا
  // زده می‌شود.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const show = useCallback<ShowToast>(
    (message, opts = {}) => {
      const id = nextId.current++;
      const item: ToastItem = {
        id,
        message,
        tone: opts.tone || "info",
        action: opts.action,
      };
      setItems((prev) => [...prev, item]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), opts.action ? MS_WITH_ACTION : MS_PLAIN),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        id="pgToastHost"
        role="status"
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          top: 96,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "min(90vw,380px)",
        }}
      >
        {items.map((it) => (
          <ToastRow key={it.id} item={it} onDismiss={() => dismiss(it.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  // ورودِ نرم: اولین رندر با opacity صفر، بعد یک فریم بعد روشن می‌شود. همان
  // requestAnimationFrame نسخه‌ی اصلی، فقط با state.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const base: React.CSSProperties = {
    ...TONE_STYLE[item.tone],
    padding: "13px 18px",
    borderRadius: 12,
    fontSize: "13.5px",
    fontWeight: 700,
    lineHeight: 1.9,
    // بعضی پیام‌ها خط دومی دارند (مثل کد پیگیری). بدون این، خط جدید به فاصله
    // تبدیل می‌شد و همه در یک سطر به‌هم می‌چسبید.
    whiteSpace: "pre-line",
    boxShadow: "0 14px 26px -12px rgba(0,0,0,.35)",
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(-8px)",
    transition: "opacity .25s ease, transform .25s ease",
  };

  const actionStyle: React.CSSProperties = {
    flex: "none",
    color: "inherit",
    fontWeight: 800,
    textDecoration: "underline",
    textUnderlineOffset: 3,
    background: "none",
    border: 0,
    cursor: "pointer",
    font: "inherit",
    padding: 0,
  };

  if (!item.action) {
    return (
      <div style={base} {...(item.tone === "error" ? { role: "alert" } : {})}>
        {item.message}
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
      }}
      {...(item.tone === "error" ? { role: "alert" } : {})}
    >
      <span>{item.message}</span>
      {item.action.href ? (
        <Link href={item.action.href} style={actionStyle} onClick={onDismiss}>
          {item.action.label}
        </Link>
      ) : (
        <button
          type="button"
          style={actionStyle}
          onClick={() => {
            onDismiss();
            item.action?.onClick?.();
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}
