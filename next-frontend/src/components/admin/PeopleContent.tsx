"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminUsers, setUserStaff } from "@/lib/adminApi";
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
  faAgo,
  faDate,
  faNum,
  toman,
} from "@/components/admin/AdminBits";
import type { AdminUser } from "@/lib/adminTypes";
import { matchesQuery } from "@/lib/faSearch";

// ============================================================
// مشتری‌ها
// ============================================================
// فهرستِ همه‌ی حساب‌های ثبت‌نامی با آمارِ خریدشان. کاری که این نما می‌کند و
// نمای «سفارش‌ها» نمی‌کند: دیدنِ مشتری به‌عنوان یک رابطه، نه یک تراکنش —
// «چند بار خرید، چقدر، آخرین بار کِی، و آیا دسترسی کارمند دارد».
//
// سه تصمیم که فرمِ این نما را تعیین کرده و همه از خودِ سرور می‌آید:
//
//  ۱. **جستجو و صفحه‌بندی سمتِ مرورگر است.** `GET /api/admin/users` هیچ
//     پارامتری نمی‌گیرد و کلِ جدول را برمی‌گرداند (routes/admin.js:227).
//     یعنی صفحه‌بندی اینجا فقط «چند ردیف روی صفحه» را عوض می‌کند، نه حجمِ
//     دانلود را. این عمدی است و نه سهل‌انگاری: آمارِ سرصفحه («جمعِ خریدِ
//     همین افراد») بدونِ داشتنِ کلِ مجموعه قابلِ محاسبه نیست، و نمای مشتری‌ها
//     دقیقاً برای همان کلِ مجموعه است. روزی که تعداد کاربران از چند هزار بگذرد
//     این تصمیم باید عوض شود: آن وقت `q/limit/offset` روی خودِ `/admin/users`
//     معنا پیدا می‌کند و این نما فقط مصرف‌کننده‌اش می‌شود.
//
//  ۲. **نقشِ کارمند فقط اینجا داده می‌شود** (`POST /users/:id/staff`). تنها
//     جایی در کلِ پنل است — CRM و بقیه‌ی نماها این کنترل را ندارند. اگر این
//     نما بدونِ آن منتقل می‌شد، یک قابلیتِ واقعیِ پنل بی‌صدا از دست می‌رفت.
//     و **فقط ادمین** می‌تواند صدا بزند: خودِ سرور به کارمند ۴۰۳ می‌دهد.
//
//  ۳. `paidOrders` و `totalSpent` فقط سفارش‌های موفق را می‌شمارند (نه
//     در‌انتظارِ‌پرداخت، نه لغو، نه ناموفق). پس مشتریِ «۰ سفارش» ممکن است یک
//     سبدِ رهاشده داشته باشد. این همان عددی است که سرور می‌دهد و اینجا هم
//     همان نشان داده می‌شود — نه یک عددِ خوش‌بینانه‌تر که از جای دیگری بیاید.

const PAGE_SIZE = 24;

type Sort = "spent" | "orders" | "new" | "name";
type Filter = "all" | "buyers" | "idle";

const SORTS: { key: Sort; label: string }[] = [
  { key: "spent", label: "بیشترین خرید" },
  { key: "orders", label: "بیشترین سفارش" },
  { key: "new", label: "تازه‌ترین عضو" },
  { key: "name", label: "نام (الفبا)" },
];


// ============================================================
// برچسب‌ها
// ============================================================

type Flags = {
  isVip: boolean;
  isNew: boolean;
  /** خریدِ موفق داشته ولی مدت‌هاست سراغی نگرفته */
  isCold: boolean;
};

const COLD_DAYS = 90;

function flagsOf(u: AdminUser, vipThreshold: number, now: number): Flags {
  const last = u.lastOrderAt ? new Date(String(u.lastOrderAt).replace(" ", "T") + "Z").getTime() : 0;
  return {
    // «ویژه» = بالای یک‌ونیمِ میانگینِ خریدِ خریدارها — همان قاعده‌ی پنلِ Express
    isVip: u.paidOrders > 0 && vipThreshold > 0 && u.totalSpent >= vipThreshold,
    isNew: (new Date(String(u.createdAt).replace(" ", "T") + "Z").getTime() || 0) > now - 7 * 86_400_000,
    // کسی که خرید کرده و ۹۰ روز ساکت بوده — همان تعریفِ «خواب‌رفته» که در CRM
    // هم استفاده می‌شود، تا دو نما یک مشتری را دو چیزِ متفاوت ننامند.
    isCold: u.paidOrders > 0 && last > 0 && now - last > COLD_DAYS * 86_400_000,
  };
}

export function PeopleContent() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("spent");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);

  const usersQuery = useQuery({
    queryKey: ["adminUsers"],
    queryFn: getAdminUsers,
    retry: false,
    staleTime: 30_000,
  });

  const staffMutation = useMutation({
    mutationFn: ({ id, staff }: { id: number; staff: boolean }) => setUserStaff(id, staff),
    onSuccess: (res) => {
      toast(res.isStaff ? "دسترسی کارمند داده شد" : "دسترسی کارمند گرفته شد", {
        tone: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError && err.status === 403
          ? "فقط مدیرِ فروشگاه می‌تواند نقش کارمند بدهد یا بگیرد"
          : err instanceof ApiError
            ? err.message
            : "تغییر دسترسی ممکن نشد";
      toast(msg, { tone: "error" });
    },
  });

  const all = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data]);

  // آستانه‌ی «ویژه» روی همه‌ی خریدارها حساب می‌شود، نه روی نتیجه‌ی فیلترشده.
  // اگر روی فیلتر حساب می‌شد، برچسبِ «ویژه» با هر جستجو جابه‌جا می‌شد و همان
  // مشتری در دو جستجوی مختلف دو برچسب می‌گرفت.
  const vipThreshold = useMemo(() => {
    const buyers = all.filter((u) => u.paidOrders > 0);
    if (!buyers.length) return 0;
    const avg = buyers.reduce((s, u) => s + u.totalSpent, 0) / buyers.length;
    return avg * 1.5;
  }, [all]);

  const now = Date.now();

  const filtered = useMemo(() => {
    const list = all.filter((u) => {
      if (filter === "buyers" && u.paidOrders === 0) return false;
      if (filter === "idle" && u.paidOrders > 0) return false;
      return matchesQuery(q, u.fullName, u.phone);
    });

    // مرتب‌سازی پایدار است (ES2019)، پس تساوی‌ها ترتیبِ خودِ سرور را نگه
    // می‌دارند: `ORDER BY u.created_at DESC` — یعنی تازه‌ترین عضو بالاتر
    // می‌ماند و ردیف‌ها با هر رندر جابه‌جا نمی‌شوند.
    const cmp: Record<Sort, (a: AdminUser, b: AdminUser) => number> = {
      spent: (a, b) => b.totalSpent - a.totalSpent || b.paidOrders - a.paidOrders,
      orders: (a, b) => b.paidOrders - a.paidOrders || b.totalSpent - a.totalSpent,
      new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      name: (a, b) =>
        (a.fullName || "ی").localeCompare(b.fullName || "ی", "fa") ||
        a.phone.localeCompare(b.phone),
    };
    return [...list].sort(cmp[sort]);
  }, [all, q, filter, sort]);

  // صفحه‌ی جاری از نتیجه‌ی نهایی مشتق می‌شود و کلمپ می‌شود، نه اینکه صرفاً
  // یک عددِ آزاد در state باشد. دلیل: با تغییرِ فیلتر ممکن است نتیجه از ۵
  // صفحه به ۱ صفحه برسد و صفحه‌ی ۴ یعنی فهرستِ خالی — «مشتری‌ای نیست» در
  // حالی که مشتری هست.
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  // هر تغییری در پرس‌وجو، فیلتر یا ترتیب، صفحه را به اول برمی‌گرداند. بدونِ
  // این، جستجو در صفحه‌ی ۳ یک فهرستِ خالی نشان می‌دهد و کاربر فکر می‌کند
  // نتیجه‌ای نیست.
  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  if (usersQuery.error instanceof ApiError && [401, 403].includes(usersQuery.error.status)) {
    return <ForbiddenBox />;
  }
  if (usersQuery.isPending) return <Spinner label="در حال گرفتن مشتری‌ها…" />;
  if (usersQuery.error) {
    return (
      <ErrorBox
        message={
          usersQuery.error instanceof ApiError
            ? usersQuery.error.message
            : "خطا در گرفتن فهرست مشتری‌ها"
        }
        onRetry={() => usersQuery.refetch()}
      />
    );
  }

  const buyersCount = all.filter((u) => u.paidOrders > 0).length;
  const filteredSpent = filtered.reduce((s, u) => s + u.totalSpent, 0);

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "همه", n: all.length },
    { key: "buyers", label: "خریدار", n: buyersCount },
    { key: "idle", label: "بدونِ خرید", n: all.length - buyersCount },
  ];

  return (
    <div className="space-y-5">
      {/* ---------- جستجو و ترتیب ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={resetToFirstPage(setQ)}
          placeholder="نام یا شماره‌ی موبایل…"
          ariaLabel="جستجوی مشتری"
          className="w-64"
        />

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => resetToFirstPage(setFilter)(f.key)}
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

        <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
          ترتیب
          <select
            value={sort}
            onChange={(e) => resetToFirstPage(setSort)(e.target.value as Sort)}
            className="rounded-full px-3 py-1.5 text-xs outline-none"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-control)",
            }}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ---------- نوارِ نتیجه ---------- */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
        style={{ color: "var(--color-ink-dim)" }}
      >
        <span>
          <strong style={{ color: "var(--color-ink)" }}>{faNum(filtered.length)}</strong> مشتری از{" "}
          <strong style={{ color: "var(--color-ink)" }}>{faNum(all.length)}</strong>
        </span>
        {filteredSpent > 0 && (
          <span>
            جمعِ خریدِ این افراد:{" "}
            <span style={{ color: "var(--color-teal)" }}>{toman(filteredSpent)}</span>
          </span>
        )}
        {filtered.length > PAGE_SIZE && (
          <span>
            صفحه‌ی {faNum(currentPage + 1)} از {faNum(lastPage + 1)}
          </span>
        )}
      </div>

      {/* ---------- فهرست ---------- */}
      {pageRows.length === 0 ? (
        <Panel title={all.length === 0 ? "هنوز کسی ثبت‌نام نکرده" : "مشتری‌ای با این فیلترها نیست"}>
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
            {all.length === 0
              ? "اولین مشتری که در فروشگاه ثبت‌نام کند همین‌جا ظاهر می‌شود."
              : "جستجو یا فیلترِ دیگری را امتحان کن."}
          </p>
        </Panel>
      ) : (
        <ul className="space-y-2">
          {pageRows.map((u) => {
            const f = flagsOf(u, vipThreshold, now);
            const isSelf = staffMutation.isPending && staffMutation.variables?.id === u.id;

            return (
              <li
                key={u.id}
                className="rounded-[16px] p-3.5"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-line)",
                }}
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  {/* --- هویت --- */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>
                        {u.fullName || "بدون نام"}
                      </span>
                      {u.isAdmin && <Pill label="مدیر" tone="coral" />}
                      {u.isStaff && <Pill label="کارمند" tone="gold" />}
                      {f.isVip && <Pill label="ویژه" tone="teal" />}
                      {f.isNew && <Pill label="جدید" tone="pink" />}
                      {f.isCold && <Pill label="سرد" tone="dim" />}
                      {u.hasPassword && <Pill label="رمز دارد" tone="dim" />}
                    </div>

                    <a
                      href={`tel:${u.phone}`}
                      className="text-[11px] mt-1 inline-block"
                      dir="ltr"
                      style={{ color: "var(--color-teal)" }}
                    >
                      {u.phone}
                    </a>

                    <div
                      className="text-[10px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5"
                      style={{ color: "var(--color-ink-dim)" }}
                    >
                      <span>عضو از {faDate(u.createdAt)}</span>
                      <span>
                        {u.lastOrderAt
                          ? `آخرین خرید ${faAgo(u.lastOrderAt)}`
                          : "هنوز خریدی ثبت نکرده"}
                      </span>
                    </div>
                  </div>

                  {/* --- آمارِ خرید --- */}
                  <div className="flex gap-5">
                    <div className="text-center">
                      <div className="text-sm font-extrabold" style={{ color: "var(--color-ink)" }}>
                        {faNum(u.paidOrders)}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
                        سفارشِ موفق
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className="text-sm font-extrabold"
                        style={{ color: u.totalSpent > 0 ? "var(--color-teal)" : "var(--color-ink-dim)" }}
                      >
                        {faNum(u.totalSpent)}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
                        تومان خرید
                      </div>
                    </div>
                  </div>

                  {/* --- کارها --- */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/admin/crm?customer=${u.id}`}
                      className="rounded-full px-3.5 py-1.5 text-xs font-bold"
                      style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
                    >
                      پرونده در CRM
                    </Link>

                    {/* نقشِ کارمند برای خودِ مدیر معنا ندارد: مدیر از قبل همه‌کاره
                        است و برداشتنِ این پرچم چیزی از دسترسی‌اش کم نمی‌کند.
                        پنلِ Express هم همین را پنهان می‌کرد. */}
                    {!u.isAdmin && (
                      <Btn
                        tone={u.isStaff ? "dim" : "gold"}
                        disabled={staffMutation.isPending}
                        title={
                          u.isStaff
                            ? "دسترسی کارمند را بگیر (دسترسی به پنل بسته می‌شود)"
                            : "دسترسی کارمند بده (به پنل مدیریت راه پیدا می‌کند)"
                        }
                        onClick={() => staffMutation.mutate({ id: u.id, staff: !u.isStaff })}
                      >
                        {isSelf ? "…" : u.isStaff ? "لغو دسترسی کارمند" : "دسترسی کارمند"}
                      </Btn>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---------- صفحه‌بندی ---------- */}
      {lastPage > 0 && (
        <Pager page={currentPage} lastPage={lastPage} onGo={setPage} />
      )}

      <p className="text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
        آمار فقط سفارش‌های موفق را می‌شمارد (پرداخت‌شده، ارسال‌شده، تحویل‌شده و
        مرجوعی). سفارشِ در‌انتظارِ‌پرداخت یا لغوشده در «تومان خرید» نمی‌آید.
      </p>
    </div>
  );
}

// ============================================================
// صفحه‌بندی
// ============================================================

/**
 * شماره‌صفحه‌ها با پنجره‌ی محدود: صفحه‌ی اول، آخر و ±۱ اطرافِ جاری، بقیه با
 * «…». بدونِ این، ۲۰۰ مشتری یعنی ۹ دکمه و با ۵٬۰۰۰ مشتری یعنی ۲۰۹ دکمه که
 * نوار را می‌شکند.
 */
function pageNumbers(page: number, lastPage: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  for (let i = 0; i <= lastPage; i++) {
    if (i === 0 || i === lastPage || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

function Pager({
  page,
  lastPage,
  onGo,
}: {
  page: number;
  lastPage: number;
  onGo: (p: number) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="صفحه‌بندی مشتری‌ها">
      <Btn tone="dim" disabled={page === 0} onClick={() => onGo(page - 1)}>
        قبلی
      </Btn>

      {pageNumbers(page, lastPage).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-xs" style={{ color: "var(--color-ink-dim)" }}>
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onGo(n)}
            aria-current={n === page ? "page" : undefined}
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={
              n === page
                ? { background: "var(--color-teal)", color: "#04211B" }
                : { background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }
            }
          >
            {faNum(n + 1)}
          </button>
        ),
      )}

      <Btn tone="dim" disabled={page === lastPage} onClick={() => onGo(page + 1)}>
        بعدی
      </Btn>
    </nav>
  );
}
