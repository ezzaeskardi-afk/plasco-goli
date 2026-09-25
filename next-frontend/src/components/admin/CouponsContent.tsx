"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  Panel,
  Pill,
  Spinner,
  ErrorBox,
  ForbiddenBox,
  Btn,
  Input,
  faDate,
  faNum,
  toman,
} from "@/components/admin/AdminBits";
import type { Coupon, CouponInput } from "@/lib/adminTypes";
import {
  couponStateOf,
  COUPON_STATE_LABEL,
  localToday,
  type CouponState,
} from "@/lib/couponState";

// ============================================================
// کدهای تخفیف
// ============================================================
// ارزشِ اصلیِ این نما یک محاسبه‌ی کوچک است، نه فهرستِ کدها: **کدام کدِ «فعال»
// واقعاً کار نمی‌کند.** در دیتابیس `active` فقط یک پرچمِ دستی است؛ کدی که
// «فعال» است می‌تواند منقضی شده باشد یا ظرفیتش پر شده باشد. مشتری آن را در
// سبد می‌زند و «این کد تخفیف معتبر نیست» می‌گیرد، در حالی که پنل کد را فعال
// نشان می‌دهد. پس وضعیتِ واقعی هر کد از همان قواعدِ `quoteCoupon`
// (lib/db.js:2235) بازسازی می‌شود و برچسب می‌گیرد.
//
// دو نکته‌ی دیگر که از خودِ سرور می‌آید و شکلِ فرم را تعیین کرده:
//
//  ۱. **کد بعد از ساخت تغییرناپذیر است.** در `PUT` هیچ‌جا خوانده نمی‌شود
//     (`cleanCouponInput(body, false)` و کوئریِ به‌روزرسانی هم ستونِ `code` را
//     ندارند). پس در حالتِ ویرایش، کد فقط نمایش داده می‌شود؛ اگر ورودیِ
//     ویرایش‌شدنی بود، مدیر کدِ تازه تایپ می‌کرد، ذخیره می‌زد و بی‌صدا هیچ
//     اتفاقی نمی‌افتاد.
//  ۲. `perUserLimit` و بقیه‌ی سقف‌ها **۰ = نامحدود** معنا می‌دهند و
//     `cleanCouponInput` مقدارِ خالی را هم ۰ می‌کند. یعنی خالی گذاشتنِ این
//     فیلد یعنی «نامحدود»، نه «پیش‌فرض». مقدارِ پیش‌فرضِ فرم عمداً `1` است تا
//     با پیش‌فرضِ خودِ دیتابیس (`per_user_limit INTEGER DEFAULT 1`) یکی باشد.

type Filter = "all" | CouponState;

// رنگ هر برچسب اینجاست (کارِ UI) ولی برچسبش در `lib/couponState.ts` است —
// همان ماژولی که نمای «تنظیمات» هم برای بررسیِ کدِ روی بنر استفاده می‌کند.
// یک قاعده، یک جا.
const STATE_TONE: Record<CouponState, "teal" | "dim" | "gold" | "coral"> = {
  live: "teal",
  inactive: "dim",
  expired: "coral",
  exhausted: "gold",
};

/** توضیحِ یک‌خطیِ اینکه این کد چه می‌کند */
function describe(c: Coupon): string {
  if (c.type === "percent") {
    const cap = c.maxDiscount > 0 ? ` تا سقف ${toman(c.maxDiscount)}` : "";
    return `${faNum(c.value)}٪ تخفیف${cap}`;
  }
  return `${toman(c.value)} تخفیف ثابت`;
}

export function CouponsContent() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const couponsQuery = useQuery({
    queryKey: ["adminCoupons"],
    queryFn: getCoupons,
    retry: false,
    staleTime: 20_000,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["adminCoupons"] });
  }

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      updateCoupon(id, { active }),
    onSuccess: (res) => {
      toast(res.coupon.active ? "کد روشن شد" : "کد خاموش شد", { tone: "success" });
      refresh();
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "تغییر وضعیت ممکن نشد", {
        tone: "error",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCoupon(id),
    onSuccess: (_res, id) => {
      toast("کد حذف شد. سفارش‌های قبلی دست نخوردند.", { tone: "success" });
      setConfirmDelete(null);
      // اگر همین کد در حال ویرایش بود، فرم باید بسته شود. خودِ `editingCoupon`
      // هم بعد از به‌روزشدنِ فهرست آن را می‌بندد، ولی آن یک رفت‌وبرگشتِ شبکه
      // طول می‌کشد و تا آن لحظه فرمی روی صفحه می‌ماند که «ذخیره‌ی تغییرات»ش به
      // یک idِ حذف‌شده PUT می‌زند و ۴۰۴ می‌گیرد.
      setEditing((cur) => (cur && cur !== "new" && cur.id === id ? null : cur));
      refresh();
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "حذف ممکن نشد", { tone: "error" }),
  });

  const all = useMemo(() => couponsQuery.data?.coupons ?? [], [couponsQuery.data]);

  // فرمِ ویرایش به نسخه‌ی **زنده‌ی** کد وصل است، نه به شیئی که لحظه‌ی
  // کلیک گرفته شده بود. دو چیز را درست می‌کند: کدی که حذف شده خودش فرم را
  // می‌بندد، و مقادیری که فرم نشان می‌دهد مال همین حالا هستند نه مال پنج دقیقه
  // پیش. اگر کد از فهرست رفته باشد (`null`)، فرم رندر نمی‌شود.
  const editingCoupon =
    editing && editing !== "new" ? all.find((c) => c.id === editing.id) ?? null : null;
  const states = useMemo(() => {
    const today = localToday();
    const m = new Map<number, CouponState>();
    for (const c of all) m.set(c.id, couponStateOf(c, today));
    return m;
  }, [all]);

  const filtered = useMemo(
    () => (filter === "all" ? all : all.filter((c) => states.get(c.id) === filter)),
    [all, filter, states],
  );

  if (
    couponsQuery.error instanceof ApiError &&
    [401, 403].includes(couponsQuery.error.status)
  ) {
    return <ForbiddenBox />;
  }
  if (couponsQuery.isPending) return <Spinner label="در حال گرفتن کدها…" />;
  if (couponsQuery.error) {
    return (
      <ErrorBox
        message={
          couponsQuery.error instanceof ApiError
            ? couponsQuery.error.message
            : "خطا در گرفتن کدهای تخفیف"
        }
        onRetry={() => couponsQuery.refetch()}
      />
    );
  }

  const countOf = (s: CouponState) => all.filter((c) => states.get(c.id) === s).length;
  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "همه", n: all.length },
    { key: "live", label: "کار می‌کند", n: countOf("live") },
    { key: "exhausted", label: "ظرفیت پر", n: countOf("exhausted") },
    { key: "expired", label: "منقضی", n: countOf("expired") },
    { key: "inactive", label: "خاموش", n: countOf("inactive") },
  ];

  const brokenActive = all.filter(
    (c) => c.active && ["expired", "exhausted"].includes(states.get(c.id) as string),
  ).length;
  const totalUses = all.reduce((s, c) => s + c.uses, 0);

  return (
    <div className="space-y-5">
      {/* ---------- هشدارِ کدهایی که «فعال»اند ولی کار نمی‌کنند ---------- */}
      {brokenActive > 0 && (
        <p
          className="rounded-[18px] p-3 text-[11px] leading-relaxed"
          style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
        >
          {faNum(brokenActive)} کد روی «فعال» مانده ولی دیگر کار نمی‌کند (منقضی یا
          ظرفیت‌پُر). مشتری آن را در سبد می‌زند و پاسخِ «کد معتبر نیست» می‌گیرد. با
          فیلترِ «ظرفیت پر» و «منقضی» پیدایشان کن.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="rounded-full px-3 py-1.5 text-xs font-bold"
                style={
                  on
                    ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                    : { background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }
                }
                aria-pressed={on}
              >
                {f.label} <span className="mr-1">{faNum(f.n)}</span>
              </button>
            );
          })}
        </div>

        <span className="text-[11px] mr-auto" style={{ color: "var(--color-ink-dim)" }}>
          {faNum(totalUses)} استفاده در کل
        </span>

        <Btn
          tone="teal"
          onClick={() => setEditing(editing === "new" ? null : "new")}
        >
          {editing === "new" ? "بستنِ فرم" : "+ کد تخفیف تازه"}
        </Btn>
      </div>

      {editing === "new" && (
        <CouponForm
          key="new"
          onDone={() => {
            setEditing(null);
            refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {editingCoupon && (
        <CouponForm
          key={editingCoupon.id}
          coupon={editingCoupon}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* ---------- فهرست ---------- */}
      {filtered.length === 0 ? (
        <Panel title={all.length === 0 ? "هنوز کد تخفیفی نساخته‌ای" : "چیزی با این فیلتر نیست"}>
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
            {all.length === 0
              ? "با دکمه‌ی «کد تخفیف تازه» اولین کد را بساز. کد روی صفحه‌ی سبد خرید مشتری وارد می‌شود."
              : "فیلترِ دیگری را امتحان کن."}
          </p>
        </Panel>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const state = states.get(c.id) as CouponState;
            const usageText =
              c.usageLimit > 0
                ? `${faNum(c.uses)} از ${faNum(c.usageLimit)}`
                : `${faNum(c.uses)} استفاده (بی‌نهایت)`;

            return (
              <li
                key={c.id}
                className="rounded-[16px] p-3.5"
                style={{
                  background: "var(--color-surface)",
                  border: `1px solid ${
                    state === "live" ? "var(--color-line)" : "var(--color-line-strong)"
                  }`,
                }}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-extrabold tracking-wide"
                        dir="ltr"
                        style={{ color: "var(--color-ink)" }}
                      >
                        {c.code}
                      </span>
                      <Pill label={COUPON_STATE_LABEL[state]} tone={STATE_TONE[state]} />
                      {c.type === "percent" ? (
                        <Pill label="درصدی" tone="dim" />
                      ) : (
                        <Pill label="مبلغ ثابت" tone="dim" />
                      )}
                    </div>

                    <p className="text-xs mt-1.5" style={{ color: "var(--color-teal)" }}>
                      {describe(c)}
                    </p>

                    <div
                      className="text-[10px] mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5"
                      style={{ color: "var(--color-ink-dim)" }}
                    >
                      {c.minTotal > 0 && <span>حداقل خرید: {toman(c.minTotal)}</span>}
                      <span>{usageText}</span>
                      <span>
                        {c.perUserLimit > 0
                          ? `هر مشتری ${faNum(c.perUserLimit)} بار`
                          : "هر مشتری بی‌نهایت"}
                      </span>
                      <span>
                        {c.expiresAt ? `تا ${faDate(c.expiresAt)}` : "بدون انقضا"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mr-auto">
                    {/* مقایسه با id، نه با شیء: بعد از هر به‌روزرسانیِ فهرست
                        شیءها نو می‌شوند و مقایسه‌ی مرجعِ شیء همیشه نادرست
                        می‌شد — یعنی دکمه «ویرایش» می‌ماند درحالی‌که فرم باز است. */}
                    <Btn
                      tone="dim"
                      onClick={() => setEditing(editingCoupon?.id === c.id ? null : c)}
                    >
                      {editingCoupon?.id === c.id ? "بستن" : "ویرایش"}
                    </Btn>
                    {/* تا وقتی فرمِ ویرایشِ همین کد باز است، سوئیچِ ردیف خاموش
                        می‌شود. دلیل: `active` یک فیلد است با دو کنترلِ همزمان
                        روی صفحه. اگر مدیر اینجا خاموش کند و بعد «ذخیره‌ی
                        تغییرات» را بزند، مقدارِ چک‌باکسِ فرم دوباره روشنش
                        می‌کند — یعنی کارِ خودش را بی‌صدا برمی‌گرداند. */}
                    <Btn
                      tone={c.active ? "gold" : "teal"}
                      disabled={toggleMutation.isPending || editingCoupon?.id === c.id}
                      title={
                        editingCoupon?.id === c.id
                          ? "اول فرمِ ویرایش را ذخیره یا ببند"
                          : undefined
                      }
                      onClick={() => toggleMutation.mutate({ id: c.id, active: !c.active })}
                    >
                      {c.active ? "خاموش کن" : "روشن کن"}
                    </Btn>

                    {confirmDelete === c.id ? (
                      <>
                        <Btn
                          tone="coral"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(c.id)}
                        >
                          حذفِ قطعی
                        </Btn>
                        <Btn tone="dim" onClick={() => setConfirmDelete(null)}>
                          انصراف
                        </Btn>
                      </>
                    ) : (
                      <Btn tone="coral" onClick={() => setConfirmDelete(c.id)}>
                        حذف
                      </Btn>
                    )}
                  </div>
                </div>

                {confirmDelete === c.id && (
                  <p
                    className="mt-2.5 pt-2.5 text-[10px] leading-relaxed"
                    style={{
                      borderTop: "1px solid var(--color-line)",
                      color: "var(--color-coral)",
                    }}
                  >
                    این کار برگشت‌پذیر نیست. سفارش‌های قبلی که با این کد ثبت شده‌اند
                    دست نمی‌خورند (کد روی خودِ سفارش ذخیره شده)، ولی از این لحظه هیچ
                    مشتری نمی‌تواند از آن استفاده کند. اگر فقط می‌خواهی موقتاً از کار
                    بیفتد، «خاموش کن» را بزن.
                    <br />
                    <strong>نکته‌ی گران:</strong> اگر بعداً کدی با همین نام بسازی،
                    شمارنده‌ی استفاده‌اش از صفر شروع می‌شود (شمارش از زمانِ ساختِ کد
                    است، نه از تاریخِ سفارش). یعنی سقفِ استفاده از نو باز می‌شود، در
                    حالی که سفارش‌های قبلی هنوز با همان کد ثبت شده‌اند.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// فرمِ ساخت/ویرایش
// ============================================================

interface FormState {
  code: string;
  type: "percent" | "fixed";
  value: string;
  minTotal: string;
  maxDiscount: string;
  usageLimit: string;
  perUserLimit: string;
  expiresAt: string;
  active: boolean;
}

const EMPTY: FormState = {
  code: "",
  type: "percent",
  value: "",
  minTotal: "",
  maxDiscount: "",
  usageLimit: "",
  // عمداً `1` و نه خالی: خالی یعنی ۰ یعنی «نامحدود» — که با پیش‌فرضِ دیتابیس
  // (per_user_limit DEFAULT 1) فرق دارد و مدیر انتظارش را ندارد.
  perUserLimit: "1",
  expiresAt: "",
  active: true,
};

/**
 * اعتبارسنجیِ سمتِ کلاینت — آینه‌ی `cleanCouponInput` در routes/admin.js:537.
 *
 * این جایِ اعتبارسنجیِ سرور نیست (سرور هم چک می‌کند و خطایش نمایش داده
 * می‌شود)؛ فقط برای این است که مدیر برای اشتباهِ واضح لازم نباشد رفت‌وبرگشتِ
 * شبکه بدهد. پیام‌ها عیناً همان متن‌های سرورند تا دو نسخه‌ی متفاوت از یک قاعده
 * به مدیر نشان داده نشود.
 */
function validate(f: FormState, forCreate: boolean): string | null {
  if (forCreate && !/^[A-Za-z0-9_-]{3,30}$/.test(f.code.trim())) {
    return "کد فقط حرف انگلیسی، رقم و خط تیره (۳ تا ۳۰ کاراکتر)";
  }
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const value = num(f.value);
  if (f.type === "percent") {
    if (!Number.isInteger(value) || value < 1 || value > 90) {
      return "درصد تخفیف باید بین ۱ تا ۹۰ باشد";
    }
  } else if (!Number.isInteger(value) || value < 1000 || value > 2_000_000_000) {
    return "مبلغ تخفیف ثابت باید حداقل ۱۰۰۰ تومان باشد";
  }
  const minTotal = num(f.minTotal);
  if (!Number.isInteger(minTotal) || minTotal < 0 || minTotal > 2_000_000_000) {
    return "مقدار «حداقل خرید» معتبر نیست";
  }
  const maxDiscount = num(f.maxDiscount);
  if (!Number.isInteger(maxDiscount) || maxDiscount < 0 || maxDiscount > 2_000_000_000) {
    return "مقدار «سقف تخفیف» معتبر نیست";
  }
  const usageLimit = num(f.usageLimit);
  if (!Number.isInteger(usageLimit) || usageLimit < 0 || usageLimit > 1_000_000) {
    return "مقدار «سقف کل استفاده» معتبر نیست";
  }
  const perUserLimit = num(f.perUserLimit);
  if (!Number.isInteger(perUserLimit) || perUserLimit < 0 || perUserLimit > 1000) {
    return "مقدار «سقف هر مشتری» معتبر نیست";
  }
  if (f.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(f.expiresAt)) {
    return "تاریخ انقضا باید به شکل YYYY-MM-DD باشد";
  }
  return null;
}

function CouponForm({
  coupon,
  onDone,
  onCancel,
}: {
  /** نبودِ این یعنی حالتِ ساخت */
  coupon?: Coupon;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const forCreate = !coupon;

  const [f, setF] = useState<FormState>(() =>
    coupon
      ? {
          code: coupon.code,
          type: coupon.type,
          value: String(coupon.value),
          minTotal: coupon.minTotal ? String(coupon.minTotal) : "",
          maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount) : "",
          usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : "",
          perUserLimit: String(coupon.perUserLimit),
          expiresAt: coupon.expiresAt ?? "",
          active: coupon.active,
        }
      : EMPTY,
  );
  const [error, setError] = useState("");

  const saveMutation = useMutation({
    mutationFn: (payload: CouponInput) =>
      coupon ? updateCoupon(coupon.id, payload) : createCoupon(payload),
    onSuccess: () => {
      toast(coupon ? "کد ویرایش شد" : "کد تخفیف ساخته شد", { tone: "success" });
      onDone();
    },
    onError: (err) => {
      // ۴۰۹ = کد تکراری. پیامِ خودِ سرور («این کد قبلاً ساخته شده») نشان داده
      // می‌شود، نه یک متنِ عمومی — چون دقیقاً همین را مدیر باید بداند.
      const msg =
        err instanceof ApiError ? err.message : "ذخیره‌ی کد ممکن نشد";
      setError(msg);
      toast(msg, { tone: "error" });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate(f, forCreate);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    const num = (v: string) => (v.trim() === "" ? 0 : Math.round(Number(v)));
    saveMutation.mutate({
      // کد فقط در ساخت فرستاده می‌شود؛ سرور در PUT آن را نمی‌خواند
      ...(forCreate ? { code: f.code.trim().toUpperCase() } : {}),
      type: f.type,
      value: num(f.value),
      minTotal: num(f.minTotal),
      maxDiscount: f.type === "percent" ? num(f.maxDiscount) : 0,
      expiresAt: f.expiresAt,
      usageLimit: num(f.usageLimit),
      perUserLimit: num(f.perUserLimit),
      active: f.active,
    });
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      onSubmit={submit}
      className="rounded-[18px] p-4 space-y-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-teal)" }}
    >
      <h2 className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>
        {coupon ? `ویرایشِ کد ${coupon.code}` : "کد تخفیف تازه"}
      </h2>

      {/* ---------- کد ---------- */}
      <Field label="کد (چیزی که مشتری وارد می‌کند)">
        {forCreate ? (
          <Input
            value={f.code}
            onChange={(v) => set("code", v.toUpperCase())}
            placeholder="مثلاً NOWRUZ1404"
            dir="ltr"
            ariaLabel="کد تخفیف"
            className="w-56"
          />
        ) : (
          <span
            className="text-sm font-extrabold tracking-wide"
            dir="ltr"
            style={{ color: "var(--color-ink-soft)" }}
          >
            {coupon?.code}
            <span className="text-[10px] font-normal mr-2" style={{ color: "var(--color-ink-dim)" }}>
              (کد بعد از ساخت تغییر نمی‌کند)
            </span>
          </span>
        )}
      </Field>

      {/* ---------- نوع و مقدار ---------- */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="نوع تخفیف">
          <div className="flex gap-1.5">
            {(
              [
                ["percent", "درصدی"],
                ["fixed", "مبلغ ثابت"],
              ] as const
            ).map(([key, label]) => {
              const on = f.type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("type", key)}
                  className="rounded-full px-3.5 py-1.5 text-xs font-bold"
                  style={
                    on
                      ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                      : { background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }
                  }
                  aria-pressed={on}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={f.type === "percent" ? "درصد (۱ تا ۹۰)" : "مبلغ (حداقل ۱٬۰۰۰ تومان)"}>
          <Input
            value={f.value}
            onChange={(v) => set("value", v)}
            type="number"
            dir="ltr"
            ariaLabel="مقدار تخفیف"
            className="w-32"
          />
        </Field>

        <Field label="حداقل خرید (خالی = بدون شرط)">
          <Input
            value={f.minTotal}
            onChange={(v) => set("minTotal", v)}
            type="number"
            dir="ltr"
            ariaLabel="حداقل خرید"
            className="w-36"
          />
        </Field>

        {/* سقفِ تخفیف فقط برای درصدی معنا دارد: برای مبلغِ ثابت، تخفیف از قبل
            ثابت است و سقف نمی‌تواند چیزی را محدود کند. نشان‌دادنش فقط گیج
            می‌کند، پس پنهان می‌شود و صفر فرستاده می‌شود. */}
        {f.type === "percent" && (
          <Field label="سقف تخفیف (خالی = بدون سقف)">
            <Input
              value={f.maxDiscount}
              onChange={(v) => set("maxDiscount", v)}
              type="number"
              dir="ltr"
              ariaLabel="سقف تخفیف"
              className="w-36"
            />
          </Field>
        )}
      </div>

      {/* ---------- سقف‌های استفاده ---------- */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="سقف کل استفاده (خالی = نامحدود)">
          <Input
            value={f.usageLimit}
            onChange={(v) => set("usageLimit", v)}
            type="number"
            dir="ltr"
            ariaLabel="سقف کل استفاده"
            className="w-36"
          />
        </Field>
        <Field label="سقف هر مشتری (خالی = نامحدود)">
          <Input
            value={f.perUserLimit}
            onChange={(v) => set("perUserLimit", v)}
            type="number"
            dir="ltr"
            ariaLabel="سقف هر مشتری"
            className="w-36"
          />
        </Field>
        <Field label="تاریخ انقضا (خالی = بدون انقضا)">
          <Input
            value={f.expiresAt}
            onChange={(v) => set("expiresAt", v)}
            type="date"
            dir="ltr"
            ariaLabel="تاریخ انقضا"
            className="w-44"
          />
        </Field>
      </div>

      {/* ۰ و خالی هر دو «نامحدود» معنا می‌دهند — یک بار صریح گفته می‌شود، چون
          تفاوتش با «پیش‌فرض» می‌تواند گران تمام شود. */}
      <p className="text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
        خالی گذاشتنِ هر سقف یعنی <strong>نامحدود</strong> (در دیتابیس ۰ ذخیره
        می‌شود)، نه «مقدار پیش‌فرض». کدی که انقضا ندارد همیشه معتبر می‌ماند.
      </p>

      <label className="flex items-center gap-2 text-xs cursor-pointer"
             style={{ color: "var(--color-ink-soft)" }}>
        <input
          type="checkbox"
          checked={f.active}
          onChange={(e) => set("active", e.target.checked)}
          className="accent-[var(--color-teal)]"
        />
        فعال باشد (اگر خاموش باشد، مشتری با این کد تخفیف نمی‌گیرد)
      </label>

      {error && (
        <p className="text-xs" style={{ color: "var(--color-coral)" }} role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Btn type="submit" tone="teal" disabled={saveMutation.isPending}>
          {coupon ? "ذخیره‌ی تغییرات" : "ساختنِ کد"}
        </Btn>
        <Btn tone="dim" onClick={onCancel}>
          انصراف
        </Btn>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] mb-1" style={{ color: "var(--color-ink-dim)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}
