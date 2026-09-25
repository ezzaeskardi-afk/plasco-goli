"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getInventory, updateProduct, setProductPublished } from "@/lib/adminApi";
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
  faNum,
  toman,
  tomanShort,
} from "@/components/admin/AdminBits";
import type { InventoryRow } from "@/lib/adminTypes";

// ============================================================
// انبار و کالا
// ============================================================
// کاری که واقعاً هر روز انجام می‌شود: «قیمتِ این را عوض کن» و «موجودی‌اش را
// درست کن». پس ویرایشِ درجا (price/stock) قلبِ این نماست و نه یک فرمِ کاملِ
// محصول. فرمِ کامل (توضیحات، گالری، مشخصات، عمده) کارِ کم‌تکرارتری است و فعلاً
// در نسخه‌ی Express می‌ماند.
//
// نکته‌ی مهمِ سمتِ سرور که پنل به آن تکیه می‌کند: PUT /api/admin/products/:id
// با مقدارِ قبلی **ادغام** می‌کند، نه اینکه جایگزین کند. پس فرستادنِ فقط
// `{price, stock}` بقیه‌ی فیلدها را پاک نمی‌کند — همان چیزی که «ذخیره‌ی سریع»
// در جدولِ Express هم استفاده می‌کرد. تنها استثنا `oldPrice` است.
//
// و دو سدِ انتشار که عمداً سمتِ سرور هستند و پنل فقط پیامشان را نشان می‌دهد:
// کالای بی‌عکس (۴۰۹، با تأیید رد می‌شود) و کالای صفر تومان (۴۰۰، راهِ عبور
// ندارد — چون کالای رایگان واقعاً فروخته می‌شود).

type Filter = "urgent" | "all" | "out" | "drafts";
type Sort = "urgent" | "best" | "recent";

export function StockContent() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("urgent");
  const [sort, setSort] = useState<Sort>("urgent");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ price: string; stock: string }>({
    price: "",
    stock: "",
  });
  // کالایی که انتشارش ۴۰۹ «عکس ندارد» گرفته و منتظر تأییدِ دوم است
  const [forcePublishId, setForcePublishId] = useState<number | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ["adminInventory"],
    queryFn: () => getInventory(),
    retry: false,
    staleTime: 20_000,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, price, stock }: { id: number; price: number; stock: number }) =>
      updateProduct(id, { price, stock }),
    onSuccess: () => {
      toast("ذخیره شد", { tone: "success" });
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["adminInventory"] });
      queryClient.invalidateQueries({ queryKey: ["adminOverview"] });
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "ذخیره نشد", { tone: "error" }),
  });

  const publishMutation = useMutation({
    mutationFn: ({ id, published, force }: { id: number; published: boolean; force: boolean }) =>
      setProductPublished(id, published, force),
    onSuccess: (res) => {
      toast(res.published ? "منتشر شد" : "از سایت برداشته شد", { tone: "success" });
      setForcePublishId(null);
      queryClient.invalidateQueries({ queryKey: ["adminInventory"] });
      queryClient.invalidateQueries({ queryKey: ["adminOverview"] });
    },
    onError: (err, vars) => {
      // ۴۰۹ یعنی «عکس ندارد؛ دوباره با تأیید بفرست». دکمه‌ی تأیید را نشان می‌دهیم.
      if (err instanceof ApiError && err.status === 409) {
        setForcePublishId(vars.id);
      }
      toast(err instanceof ApiError ? err.message : "انتشار ممکن نشد", { tone: "error" });
    },
  });

  // `useMemo` اینجا فقط «بهینه‌سازی» نیست: `?? []` در هر رندر یک آرایه‌ی تازه
  // می‌سازد، پس بدونِ این، `rows` هم در هر رندر از نو ساخته می‌شد و فیلتر و
  // مرتب‌سازیِ کاتالوگِ ۱۰۸ قلمی روی هر تایپ بی‌دلیل تکرار می‌شد.
  const all = useMemo(
    () => inventoryQuery.data?.products ?? [],
    [inventoryQuery.data],
  );
  const lowStock = inventoryQuery.data?.lowStock ?? [];
  const wished = inventoryQuery.data?.wishedOutOfStock ?? [];

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = all.filter((p) => {
      if (filter === "out" && p.stock !== 0) return false;
      if (filter === "urgent" && p.stock > 5) return false;
      if (filter === "drafts" && p.published) return false;
      if (term) {
        const hay = `${p.title} ${p.category} ${p.badge}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "urgent") return a.stock - b.stock || b.soldQty - a.soldQty;
      if (sort === "best") return b.soldQty - a.soldQty;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });
    return list;
  }, [all, filter, q, sort]);

  const drafts = all.filter((p) => !p.published).length;

  if (
    inventoryQuery.error instanceof ApiError &&
    [401, 403].includes(inventoryQuery.error.status)
  ) {
    return <ForbiddenBox />;
  }

  if (inventoryQuery.isPending) return <Spinner label="در حال گرفتن انبار…" />;
  if (inventoryQuery.error) {
    return (
      <ErrorBox
        message={
          inventoryQuery.error instanceof ApiError
            ? inventoryQuery.error.message
            : "خطا در گرفتن انبار"
        }
        onRetry={() => inventoryQuery.refetch()}
      />
    );
  }

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "urgent", label: "کم‌موجود", n: all.filter((p) => p.stock <= 5).length },
    { key: "all", label: "همه", n: all.length },
    { key: "out", label: "ناموجود", n: all.filter((p) => p.stock === 0).length },
    { key: "drafts", label: "پیش‌نویس", n: drafts },
  ];

  const SORTS: { key: Sort; label: string }[] = [
    { key: "urgent", label: "فوری‌ترین" },
    { key: "best", label: "پرفروش‌ترین" },
    { key: "recent", label: "تازه‌ترین" },
  ];

  return (
    <div className="space-y-5">
      {/* ---------- چیزی که منتظر است ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div
          className="rounded-[18px] p-4"
          style={{
            background: "var(--color-coral-tint)",
            border: "1px solid transparent",
          }}
        >
          <div className="text-[11px] mb-1" style={{ color: "var(--color-coral)" }}>
            ناموجود
          </div>
          <div className="text-xl font-extrabold" style={{ color: "var(--color-coral)" }}>
            {faNum(all.filter((p) => p.stock === 0).length)}
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--color-coral)" }}>
            کالاهای قابل فروش نیستند
          </div>
        </div>

        <div
          className="rounded-[18px] p-4"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
        >
          <div className="text-[11px] mb-1" style={{ color: "var(--color-ink-dim)" }}>
            زیر آستانه‌ی هشدار
          </div>
          <div className="text-xl font-extrabold" style={{ color: "var(--color-gold)" }}>
            {faNum(lowStock.length)}
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--color-ink-dim)" }}>
            طبق آستانه‌ی تنظیماتِ فروشگاه
          </div>
        </div>

        <div
          className="rounded-[18px] p-4"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
        >
          <div className="text-[11px] mb-1" style={{ color: "var(--color-ink-dim)" }}>
            ارزش موجودی انبار
          </div>
          <div className="text-xl font-extrabold" style={{ color: "var(--color-teal)" }}>
            {tomanShort(all.reduce((s, p) => s + p.price * p.stock, 0))}
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--color-ink-dim)" }}>
            {faNum(all.length)} کالا
          </div>
        </div>
      </div>

      {wished.length > 0 && (
        <Panel title="تقاضای از‌دست‌رفته — در علاقه‌مندی مشتری‌ها، ولی ناموجود">
          <ul className="space-y-1.5">
            {wished.map((w) => (
              <li key={w.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 min-w-0 truncate" style={{ color: "var(--color-ink-soft)" }}>
                  {w.title}
                </span>
                <Pill label={`${faNum(w.wishers)} نفر منتظر`} tone="pink" />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {drafts > 0 && filter !== "drafts" && (
        <p
          className="rounded-[18px] p-3 text-[11px] leading-relaxed"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
        >
          {faNum(drafts)} کالا پیش‌نویس است و در سایت دیده نمی‌شود. با تبِ
          «پیش‌نویس» مرورشان کن و منتشرشان کن.
        </p>
      )}

      {/* ---------- فیلتر و مرتب‌سازی ---------- */}
      <div className="flex flex-wrap items-center gap-2">
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
                {f.label} <span className="mr-1">{faNum(f.n)}</span>
              </button>
            );
          })}
        </div>
        <Input
          value={q}
          onChange={setQ}
          placeholder="جستجوی نام یا دسته…"
          ariaLabel="جستجوی کالا"
          className="w-full min-w-0 sm:w-48"
        />
        <div className="flex gap-1.5 mr-auto">
          {SORTS.map((s) => {
            const on = sort === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                className="text-[11px] font-bold rounded-full px-2.5 py-2 sm:py-1"
                style={
                  on
                    ? { background: "var(--color-surface-2)", color: "var(--color-ink)" }
                    : { color: "var(--color-ink-dim)" }
                }
                aria-pressed={on}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- جدول ---------- */}
      {rows.length === 0 ? (
        <Panel title="چیزی پیدا نشد">
          <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
            با این فیلتر کالایی نیست.
          </p>
        </Panel>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] px-1" style={{ color: "var(--color-ink-dim)" }}>
            {faNum(rows.length)} کالا
          </p>
          <ul className="space-y-2">
            {rows.map((p) => (
              <ProductRow
                key={p.id}
                p={p}
                editing={editing === p.id}
                draft={draft}
                setDraft={setDraft}
                saving={saveMutation.isPending}
                publishing={publishMutation.isPending}
                forceNeeded={forcePublishId === p.id}
                onStartEdit={() => {
                  setEditing(p.id);
                  setDraft({ price: String(p.price), stock: String(p.stock) });
                }}
                onCancelEdit={() => setEditing(null)}
                onSave={() => {
                  const price = Number(draft.price);
                  const stock = Number(draft.stock);
                  if (!Number.isFinite(price) || price < 0) {
                    toast("قیمت معتبر نیست", { tone: "error" });
                    return;
                  }
                  if (!Number.isInteger(stock) || stock < 0) {
                    toast("موجودی باید عددِ درست و نامنفی باشد", { tone: "error" });
                    return;
                  }
                  saveMutation.mutate({ id: p.id, price: Math.round(price), stock });
                }}
                onTogglePublished={() =>
                  publishMutation.mutate({
                    id: p.id,
                    published: !p.published,
                    force: forcePublishId === p.id,
                  })
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProductRow({
  p,
  editing,
  draft,
  setDraft,
  saving,
  publishing,
  forceNeeded,
  onStartEdit,
  onCancelEdit,
  onSave,
  onTogglePublished,
}: {
  p: InventoryRow;
  editing: boolean;
  draft: { price: string; stock: string };
  setDraft: (d: { price: string; stock: string }) => void;
  saving: boolean;
  publishing: boolean;
  forceNeeded: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onTogglePublished: () => void;
}) {
  const isDraft = !p.published;
  const out = p.stock === 0;

  return (
    <li
      className="rounded-[16px] p-3"
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${isDraft ? "var(--color-gold)" : "var(--color-line)"}`,
      }}
    >
      {/* `flex-wrap` + ستونِ قیمتِ تمام‌عرض روی موبایل: اندازه‌گیری روی ۳۹۰
          پیکسل نشان داد در حالتِ ویرایش، ورودی‌های قیمت و موجودی (شینک‌نشدنی)
          ستونِ عنوان را به عرضِ صفر می‌رساندند — عنوانِ کالا کامل ناپدید می‌شد و
          «فروش: ۲۵ عدد» کلمه‌به‌کلمه می‌شکست. حالا ویرایشگر یک ردیفِ تمام‌عرض
          زیرِ عنوان است (متن زیرِ عکس، همان‌طور که باید). */}
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="w-11 h-11 rounded-lg shrink-0 overflow-hidden grid place-items-center"
          style={{ background: "var(--color-surface-2)" }}
        >
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- پیش‌نمایشِ ۴۴px؛ next/image اینجا فقط سربار است
            <img src={p.image} alt="" width={44} height={44} className="object-cover w-11 h-11" />
          ) : (
            <span className="text-lg">🧺</span>
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/product/${p.id}`}
              className="text-xs font-bold truncate hover:underline"
              style={{ color: "var(--color-ink)" }}
            >
              {p.title}
            </Link>
            {isDraft && <Pill label="پیش‌نویس — در سایت نیست" tone="gold" />}
            {out && <Pill label="ناموجود" tone="coral" />}
            {p.badge && <Pill label={p.badge} tone="teal" />}
          </div>

          <div className="text-[10px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5"
               style={{ color: "var(--color-ink-dim)" }}>
            <span>{p.category}</span>
            <span>فروش: {faNum(p.soldQty)} عدد</span>
            <span>درآمد: {tomanShort(p.revenue)}</span>
            {p.wishers > 0 && <span style={{ color: "var(--color-pink)" }}>{faNum(p.wishers)} علاقه‌مند</span>}
          </div>
        </div>

        {/* قیمت و موجودی — در حالتِ ویرایش ورودی می‌شوند */}
        <div className="w-full shrink-0 text-right sm:w-auto sm:text-left">
          {editing ? (
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <label className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
                قیمت
              </label>
              <Input
                value={draft.price}
                onChange={(v) => setDraft({ ...draft, price: v })}
                type="number"
                dir="ltr"
                ariaLabel="قیمت"
                className="min-w-0 flex-1 sm:w-24 sm:flex-none"
              />
              <label className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
                موجودی
              </label>
              <Input
                value={draft.stock}
                onChange={(v) => setDraft({ ...draft, stock: v })}
                type="number"
                dir="ltr"
                ariaLabel="موجودی"
                className="min-w-0 flex-1 sm:w-16 sm:flex-none"
              />
            </div>
          ) : (
            <>
              <div className="text-xs font-extrabold" style={{ color: "var(--color-teal)" }}>
                {toman(p.price)}
              </div>
              <div className="text-[11px]" style={{ color: out ? "var(--color-coral)" : "var(--color-ink-soft)" }}>
                موجودی: {faNum(p.stock)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- کارها ---------- */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5"
           style={{ borderTop: "1px solid var(--color-line)" }}>
        {editing ? (
          <>
            <Btn tone="teal" disabled={saving} onClick={onSave}>
              ذخیره
            </Btn>
            <Btn tone="dim" onClick={onCancelEdit}>
              انصراف
            </Btn>
          </>
        ) : (
          <Btn tone="dim" onClick={onStartEdit}>
            ویرایش قیمت و موجودی
          </Btn>
        )}

        <Btn
          tone={isDraft ? "gold" : "dim"}
          disabled={publishing}
          onClick={onTogglePublished}
          title={
            forceNeeded
              ? "این کالا عکس ندارد؛ با این کلیک با تأیید منتشر می‌شود"
              : undefined
          }
        >
          {isDraft
            ? forceNeeded
              ? "منتشر کن با تأیید (بدون عکس)"
              : "منتشر کن"
            : "از سایت بردار"}
        </Btn>

        {p.wholesale_min_qty > 0 && (
          <span className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
            عمده: از {faNum(p.wholesale_min_qty)} عدد، {faNum(p.wholesale_discount)}٪
          </span>
        )}

        {p.stock <= 5 && p.stock > 0 && (
          <span className="mr-auto text-[10px]" style={{ color: "var(--color-gold)" }}>
            رو به اتمام
          </span>
        )}
      </div>
    </li>
  );
}
