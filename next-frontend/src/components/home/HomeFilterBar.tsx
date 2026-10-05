"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

// ============================================================
// نوارِ فیلترِ بخشِ محصولاتِ صفحه‌ی اصلی — همتای `#filterToolbar` در index.html
// ============================================================
// چرا ساخته شد: گزارشِ برابری دو برچسبِ کاربرمحورِ Express را گم‌شده نشان
// می‌داد — «حروف الفبا» (گزینه‌ی مرتب‌سازی) و «محدوده قیمت» (برچسبِ بازه) —
// چون Express همان نوارِ فیلتر را در صفحه‌ی اصلی هم داشت و Next فقط شبکه‌ی
// کالا را نشان می‌داد. متنِ گزینه‌ها و برچسب‌ها عیناً همان‌های Express‌اند.
//
// سازوکار عمداً ساده‌تر از نسخه‌ی Express است: آن‌جا نوار در جا (in-place)
// فیلتر می‌کرد؛ این‌جا انتخاب‌ها به `/products` می‌روند، جایی که خودِ صفحه‌ی
// فهرست همان فیلترها را با نتیجه‌ی کامل دارد. یعنی کاربر به همان مقصد می‌رسد،
// ولی یک صفحه‌ی فیلتر دو نسخه‌ای نگه نمی‌داریم.

// ارقام فارسی/عربی → لاتین — همان normalizeDigitsی که Express در main.js:466 داشت
function toEnDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

// مقدارِ گزینه‌ها همان مقداری است که صفحهٔ فهرست/بک‌اند می‌شناسد، نه نامِ
// گزینه در Express. Express هم دقیقاً همین را با `SORT_MAP` می‌کرد
// (`main.js:27`): گزینهٔ `default` را به `oldest` نگاشت می‌کرد تا «پیش‌فرض»
// روی ترتیبِ اصلیِ ویترین (`id ASC`) بنشیند؛ نگاشت را این‌جا مستقیم در خودِ
// مقادیر گذاشته‌ایم تا هیچ لایهٔ واسطی مقدارِ ناشناخته به سرور نفرستد.
const SORTS = [
  // «پیش‌فرض» = ترتیبِ اصلیِ ویترین (`oldest` → `id ASC`) — هم‌رفتار با
  // `SORT_MAP.default` در `main.js:28` و `SORT_SQL.oldest` در `db.js:797`.
  { value: "oldest", label: "پیش‌فرض" },
  { value: "price-asc", label: "ارزان‌ترین" },
  { value: "price-desc", label: "گران‌ترین" },
  { value: "newest", label: "جدیدترین" },
  // «حروف الفبا» — عیناً برچسبِ `<option value="name">` در index.html:305 که
  // `SORT_MAP.name` آن را به `title` نگاشت می‌کرد.
  { value: "title", label: "حروف الفبا" },
];

export function HomeFilterBar() {
  const router = useRouter();
  // مقدارِ آغازین همان «پیش‌فرض» است؛ پس select از همان اول «پیش‌فرض» را
  // نشان می‌دهد — عیناً انتخابِ اولیهٔ sortSelect در index.html.
  const [sort, setSort] = useState("oldest");
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");

  function go(nextSort: string, minStr: string, maxStr: string) {
    const sp = new URLSearchParams();
    // مقادیرِ SORTS همین حالا مقادیرِ پذیرفتهٔ صفحهٔ فهرست‌اند؛ فقط `newest`
    // را نمی‌بریم چون خودش پیش‌فرضِ صفحهٔ فهرست است و نشانی را تمیز نگه می‌دارد.
    if (nextSort && nextSort !== "newest") sp.set("sort", nextSort);
    let min = parseInt(toEnDigits(minStr).replace(/\D/g, ""), 10);
    let max = parseInt(toEnDigits(maxStr).replace(/\D/g, ""), 10);
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;
    if (min && max && min > max) [min, max] = [max, min];
    if (min) sp.set("minPrice", String(min));
    if (max) sp.set("maxPrice", String(max));
    const qs = sp.toString();
    router.push(qs ? `/products?${qs}` : "/products");
  }

  const inputStyle = {
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    border: "1px solid var(--color-line)",
  } as const;

  return (
    <div
      data-reveal=""
      className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3"
    >
      <label className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--color-ink-soft)" }}>
        <Icon name="refresh" size={15} style={{ color: "var(--color-gold)" }} />
        مرتب‌سازی
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            go(e.target.value, minInput, maxInput);
          }}
          className="rounded-full px-3 py-1.5 text-xs font-medium outline-none appearance-none cursor-pointer"
          style={inputStyle}
          aria-label="مرتب‌سازی محصولات"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {/* برچسب و placeholderها عیناً از index.html:310-317 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(sort, minInput, maxInput);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--color-ink-soft)" }}>
          <Icon name="tag" size={15} style={{ color: "var(--color-gold)" }} />
          محدوده قیمت <small className="font-normal">(تومان)</small>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={minInput}
          onChange={(e) => setMinInput(e.target.value)}
          placeholder="از مثلاً ۵۰,۰۰۰"
          aria-label="حداقل قیمت"
          className="rounded-full px-3 py-1.5 text-xs outline-none w-36"
          style={inputStyle}
        />
        <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
          تا
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
          placeholder="تا مثلاً ۵۰۰,۰۰۰"
          aria-label="حداکثر قیمت"
          className="rounded-full px-3 py-1.5 text-xs outline-none w-36"
          style={inputStyle}
        />
        <button
          type="submit"
          className="rounded-full px-4 py-1.5 text-xs font-bold"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          اعمال
        </button>
      </form>
    </div>
  );
}
