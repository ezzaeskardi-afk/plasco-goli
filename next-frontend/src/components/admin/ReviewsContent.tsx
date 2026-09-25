"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminReviews, setReviewStatus } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { StarRow } from "@/components/StarRow";
import {
  Panel,
  Pill,
  Spinner,
  ErrorBox,
  ForbiddenBox,
  Btn,
  faAgo,
  faNum,
} from "@/components/admin/AdminBits";
import type { AdminReview } from "@/lib/adminTypes";

// ============================================================
// نظرات — صفِ تأیید
// ============================================================
// فقط دیدگاه‌های «تأییدشده» روی صفحه‌ی محصول دیده می‌شوند، پس این صفحه تنها
// راهِ رسیدنِ یک دیدگاه به سایت است. سه نکته:
//
//  ۱. تبِ پیش‌فرض «در انتظار تأیید» است، نه «همه». کاری که برایش اینجا آمده‌ای
//     همان است؛ فهرستِ ۴۸ نظرِ رد‌شده کمکی به انجامِ کار نمی‌کند.
//  ۲. «برگشت به صف» فقط از صفِ تأیید معنا دارد، پس روی نظری که همین حالا در
//     انتظار است دکمه‌ی اضافه نشان داده نمی‌شود.
//  ۳. `isBuyer` را خودِ سرور تشخیص می‌دهد (خریدارِ واقعیِ همان کالا)، نه پنل.
//     کنارِ برچسبش نوشته می‌شود، چون برای تصمیم‌گیری مهم است.

type Filter = "pending" | "all" | "approved" | "rejected";

export function ReviewsContent() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("pending");

  const reviewsQuery = useQuery({
    queryKey: ["adminReviews", filter],
    queryFn: () => getAdminReviews(filter),
    retry: false,
    staleTime: 15_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: "approved" | "rejected" | "pending";
    }) => setReviewStatus(id, status),
    onSuccess: (_res, vars) => {
      toast(
        vars.status === "approved"
          ? "تأیید شد و روی صفحه‌ی محصول می‌رود"
          : vars.status === "rejected"
            ? "رد شد"
            : "به صفِ تأیید برگشت",
        { tone: "success" },
      );
      // هر چهار تب شمارنده دارند، پس همه باید تازه شوند — و داشبورد هم
      // «نظرات در انتظار تأیید» را نشان می‌دهد.
      queryClient.invalidateQueries({ queryKey: ["adminReviews"] });
      queryClient.invalidateQueries({ queryKey: ["adminOverview"] });
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "تغییر وضعیت ممکن نشد", {
        tone: "error",
      }),
  });

  if (
    reviewsQuery.error instanceof ApiError &&
    [401, 403].includes(reviewsQuery.error.status)
  ) {
    return <ForbiddenBox />;
  }

  const counts = reviewsQuery.data?.counts;
  const reviews = reviewsQuery.data?.reviews ?? [];

  const FILTERS: { key: Filter; label: string; n?: number }[] = [
    { key: "pending", label: "در انتظار تأیید", n: counts?.pending },
    { key: "all", label: "همه", n: counts?.all },
    { key: "approved", label: "تأییدشده", n: counts?.approved },
    { key: "rejected", label: "ردشده", n: counts?.rejected },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className="rounded-full px-3 py-2 text-xs font-bold sm:py-1.5"
              style={
                on
                  ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                  : { background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }
              }
              aria-pressed={on}
            >
              {f.label}
              {f.n != null && <span className="mr-1.5">{faNum(f.n)}</span>}
            </button>
          );
        })}
      </div>

      {counts && counts.pending > 0 && filter === "pending" && (
        <p
          className="rounded-[18px] p-3 text-[11px] leading-relaxed"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
        >
          {faNum(counts.pending)} دیدگاه منتظر تأیید است. تا تأیید نشوند روی صفحه‌ی
          محصول دیده نمی‌شوند و در «حرف مشتری‌ها»ی صفحه‌ی اصلی هم نمی‌آیند.
        </p>
      )}

      {reviewsQuery.isPending ? (
        <Spinner label="در حال گرفتن نظرات…" />
      ) : reviewsQuery.error ? (
        <ErrorBox
          message={
            reviewsQuery.error instanceof ApiError
              ? reviewsQuery.error.message
              : "خطا در گرفتن نظرات"
          }
          onRetry={() => reviewsQuery.refetch()}
        />
      ) : reviews.length === 0 ? (
        <Panel title="نظری نیست">
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
            {filter === "pending"
              ? "صفِ تأیید خالی است — همه‌ی دیدگاه‌ها بررسی شده‌اند."
              : "با این فیلتر دیدگاهی نیست."}
          </p>
        </Panel>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <ReviewCard
                review={r}
                busy={statusMutation.isPending}
                onSet={(status) => statusMutation.mutate({ id: r.id, status })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  busy,
  onSet,
}: {
  review: AdminReview;
  busy: boolean;
  onSet: (status: "approved" | "rejected" | "pending") => void;
}) {
  const tone =
    review.status === "approved" ? "teal" : review.status === "rejected" ? "coral" : "gold";
  const label =
    review.status === "approved"
      ? "تأییدشده"
      : review.status === "rejected"
        ? "ردشده"
        : "در انتظار تأیید";

  return (
    <div
      className="rounded-[16px] p-3.5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <StarRow value={review.rating} size={14} label={`${faNum(review.rating)} ستاره`} />
        <Pill label={label} tone={tone} />
        {review.isBuyer && <Pill label="خریدارِ این کالا" tone="teal" />}
        <span className="mr-auto text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
          {faAgo(review.createdAt)}
        </span>
      </div>

      <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--color-ink-soft)" }}>
        {review.body}
      </p>

      <div className="text-[10px] flex flex-wrap gap-x-3 gap-y-1 mb-2.5"
           style={{ color: "var(--color-ink-dim)" }}>
        <span>{review.userName || "بدون نام"}</span>
        <span dir="ltr">{review.userPhone}</span>
        <Link href={`/product/${review.productId}`} className="hover:underline"
              style={{ color: "var(--color-teal)" }}>
          {review.productTitle}
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-2.5" style={{ borderTop: "1px solid var(--color-line)" }}>
        {review.status !== "approved" && (
          <Btn tone="teal" disabled={busy} onClick={() => onSet("approved")}>
            تأیید و انتشار
          </Btn>
        )}
        {review.status !== "rejected" && (
          <Btn tone="coral" disabled={busy} onClick={() => onSet("rejected")}>
            رد
          </Btn>
        )}
        {review.status !== "pending" && (
          <Btn tone="dim" disabled={busy} onClick={() => onSet("pending")}>
            برگشت به صف
          </Btn>
        )}
      </div>
    </div>
  );
}
