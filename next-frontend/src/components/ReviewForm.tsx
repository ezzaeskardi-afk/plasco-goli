"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProductReviews, getMe, submitProductReview, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

// ============================================================
// فرمِ ثبت/ویرایشِ دیدگاه
// ============================================================
// همتای frontend/js/product.js:518-578.
//
// چرا کلاینت است و نه سرور: `myReview` به نشستِ کاربر بسته است و صفحه‌ی محصول
// استاتیک/ISR است. اگر این را سمتِ سرور می‌خواندیم، کلِ صفحه داینامیک می‌شد و
// SSGِ ۳۸ صفحه‌ی محصول از بین می‌رفت. پس خلاصه و لیستِ دیدگاه‌ها سمتِ سرور
// رندر می‌شوند (برای گوگل) و فقط همین فرم سمتِ کلاینت داده می‌گیرد.

const MAX_BODY = 500; // عیناً سقفِ سرور در routes/products.js:230

export function ReviewForm({ productId }: { productId: number }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => getProductReviews(productId),
  });

  const mine = reviews?.myReview ?? null;

  // امتیازِ انتخاب‌شده و امتیازی که موس رویش است، جدا نگه داشته می‌شوند تا
  // بعد از برداشتنِ موس دقیقاً به انتخابِ کاربر برگردد — رفتارِ mouseleave
  // در نسخه‌ی Express.
  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState<string | null>(null);

  // تا وقتی کاربر دست نزده، مقدارِ دیدگاهِ قبلیِ خودش نشان داده می‌شود. با
  // useState تنها نمی‌شد، چون داده بعد از اولین رندر می‌رسد؛ `null` یعنی
  // «کاربر تغییری نداده».
  const rating = picked ?? mine?.rating ?? 0;
  const text = body ?? mine?.body ?? "";
  const shown = hover || rating;

  const mutation = useMutation({
    mutationFn: () => submitProductReview(productId, { rating, body: text.trim() }),
    onSuccess: (res) => {
      toast(res.message || "دیدگاه شما ثبت شد", { tone: "success" });
      // فرم از نو با وضعیتِ تازه («در انتظار تأیید») پر می‌شود
      setPicked(null);
      setBody(null);
      queryClient.invalidateQueries({ queryKey: ["reviews", productId] });
    },
    onError: (err) => {
      toast(err instanceof ApiError && err.message ? err.message : "ثبت دیدگاه ممکن نشد", {
        tone: "error",
      });
    },
  });

  if (meLoading || reviewsLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  // مهمان: دعوت به ورود، با برگشت به همین صفحه (پارامترِ redirect همان چیزی
  // است که middleware.ts و صفحه‌ی ورود می‌خوانند).
  if (!me?.user) {
    return (
      <div
        className="rounded-[18px] p-4 text-sm text-center"
        style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
      >
        برای ثبت دیدگاه{" "}
        <Link
          href={`/login?redirect=/product/${productId}`}
          className="font-bold underline"
          style={{ color: "var(--color-teal)", textUnderlineOffset: 3 }}
        >
          وارد حساب‌تان شوید
        </Link>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      toast("اول امتیاز بدهید (روی ستاره‌ها بزنید)", { tone: "error" });
      return;
    }
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[18px] p-4 space-y-3"
      style={{ background: "var(--color-surface)" }}
    >
      <div className="flex items-center gap-2">
        <b className="text-sm" style={{ color: "var(--color-ink)" }}>
          {mine ? "ویرایش دیدگاه شما" : "دیدگاه خود را ثبت کنید"}
        </b>
        {mine?.status === "pending" && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
          >
            در انتظار تأیید
          </span>
        )}
        {mine?.status === "rejected" && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
          >
            تأیید نشد
          </span>
        )}
      </div>

      {/* انتخابگرِ امتیاز — radiogroup، پس با کیبورد هم قابل استفاده است */}
      <div
        role="radiogroup"
        aria-label="امتیاز از ۱ تا ۵"
        className="flex items-center gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === rating}
            aria-label={`${n} ستاره`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => setPicked(n)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 20 20"
              fill={n <= shown ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.5"
              style={{
                color: n <= shown ? "var(--color-gold)" : "var(--color-line-control)",
              }}
            >
              <path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
            </svg>
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        maxLength={MAX_BODY}
        value={text}
        onChange={(e) => setBody(e.target.value)}
        placeholder="تجربه‌تان از این جنس را بنویسید؛ کیفیت، اندازه، رنگ..."
        className="w-full rounded-[14px] px-3 py-2 text-sm outline-none resize-y"
        style={{
          background: "var(--color-surface-2)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-line-control)",
        }}
      />
      {/* شمارنده لازم است: maxLength بی‌صدا جلوی تایپ را می‌گیرد و کاربر
          نمی‌فهمد چرا حرف‌هایش وارد نمی‌شود. */}
      <div className="text-[11px] text-left" style={{ color: "var(--color-ink-dim)" }}>
        {new Intl.NumberFormat("fa-IR").format(text.length)} /{" "}
        {new Intl.NumberFormat("fa-IR").format(MAX_BODY)}
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className="rounded-full px-6 py-2.5 text-sm font-bold transition-colors disabled:cursor-wait"
        style={{
          background: "var(--color-teal)",
          color: "#04211B",
          opacity: mutation.isPending ? 0.7 : 1,
        }}
      >
        {mutation.isPending
          ? "در حال ثبت…"
          : mine
            ? "به‌روزرسانی دیدگاه"
            : "ثبت دیدگاه"}
      </button>
    </form>
  );
}
