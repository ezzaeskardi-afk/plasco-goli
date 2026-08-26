"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { useAddToCart } from "@/lib/useAddToCart";
import { useShopInfo, lowStockThreshold } from "@/lib/useShopInfo";
import { pushRecent } from "@/lib/recent";
import { StarRow } from "@/components/StarRow";
import { NotifyMeButton } from "@/components/NotifyMeButton";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(price: number): string {
  return `${toFa(price)} تومان`;
}

// سقفِ هر قلم در سبد؛ عیناً MAX_QTY_PER_ITEM در backend/routes/cart.js.
// اگر اینجا بیشتر بگذاریم، کاربر عددی را انتخاب می‌کند که سرور رد می‌کند.
const MAX_QTY_PER_ITEM = 99;

// ============================================================
// لایت‌باکس — همتای نسخه‌ی Express (js/product.js:223-369)
// ============================================================
// کلیدهای ←/→ (RTL: راست = قبلی)، Esc بستن، شمارنده‌ی «X از Y». Tab داخلش
// حبس نمی‌کنیم چون فقط دو دکمه دارد و Esc/کلیک‌برچسب خروجِ کافی است.

function Lightbox({
  images,
  index,
  onClose,
  onMove,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onMove: (next: number) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      // RTL: فلشِ راست = تصویرِ قبلی، فلشِ چپ = بعدی
      if (e.key === "ArrowRight") onMove((index - 1 + images.length) % images.length);
      if (e.key === "ArrowLeft") onMove((index + 1) % images.length);
    }
    document.addEventListener("keydown", onKey);
    // اسکرولِ پس‌زمینه قفل شود
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, onClose, onMove]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`تصویر ${toFa(index + 1)} از ${toFa(images.length)}`}
    >
      <Image
        src={images[index]}
        alt=""
        fill
        sizes="100vw"
        className="object-contain p-8"
        onClick={(e) => e.stopPropagation()}
      />
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="تصویر قبلی"
            onClick={(e) => { e.stopPropagation(); onMove((index - 1 + images.length) % images.length); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full text-2xl font-bold"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          >
            ›
          </button>
          <button
            type="button"
            aria-label="تصویر بعدی"
            onClick={(e) => { e.stopPropagation(); onMove((index + 1) % images.length); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full text-2xl font-bold"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          >
            ‹
          </button>
          <span
            className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          >
            {toFa(index + 1)} از {toFa(images.length)}
          </span>
        </>
      )}
      <button
        type="button"
        aria-label="بستن"
        onClick={onClose}
        className="absolute top-4 left-4 w-10 h-10 rounded-full text-xl font-bold"
        style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
      >
        ×
      </button>
    </div>
  );
}

export function ProductDetail({ product }: { product: Product }) {
  const outOfStock = product.stock <= 0;
  const hasDiscount = product.discountPercent > 0 && product.oldPrice > 0;
  const shop = useShopInfo();
  const addMutation = useAddToCart();

  // ---------- گالری ----------
  // کاور اول، بعد تصاویر گالری؛ تکراری‌ها حذف — همان منطقِ js/product.js:230
  const gallery = useMemo(() => {
    const list: string[] = [];
    if (product.image) list.push(product.image);
    for (const img of product.images || []) {
      if (img && !list.includes(img)) list.push(img);
    }
    return list;
  }, [product.image, product.images]);
  const hasGallery = gallery.length > 0;

  const [imgIndex, setImgIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  // ---------- سبد ----------
  // سقفِ انتخاب = کمترِ موجودیِ انبار و سقفِ هر قلم. نسخه‌ی Express این را
  // `stock > 0 ? stock : 99` می‌گرفت که برای موجودیِ بالای ۹۹ عددی می‌داد که
  // سرور با ۴۰۹ رد می‌کرد.
  const maxQty = Math.max(1, Math.min(product.stock, MAX_QTY_PER_ITEM));
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = addMutation.isPending;

  // ---------- نوار خریدِ چسبانِ موبایل ----------
  const buyRowRef = useRef<HTMLDivElement>(null);
  const [buyRowGone, setBuyRowGone] = useState(false);
  const lowStock = !outOfStock && product.stock <= lowStockThreshold(shop);

  useEffect(() => {
    // ثبتِ بازدید برای «اخیراً دیده‌شده» — قبل از رندرِ بخش، مثل js/product.js:40
    pushRecent(product.id);
  }, [product.id]);

  useEffect(() => {
    const el = buyRowRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setBuyRowGone(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (addTimer.current) clearTimeout(addTimer.current);
    };
  }, []);

  const handleAdd = useCallback(() => {
    addMutation.mutate(
      { productId: product.id, qty },
      {
        onSuccess: () => {
          // حالتِ «اضافه شد» ۱٫۲ ثانیه می‌ماند و بعد به حالتِ اول برمی‌گردد —
          // همان زمان‌بندیِ frontend/js/product.js تا دو فرانت‌اند یک حس بدهند.
          setJustAdded(true);
          if (addTimer.current) clearTimeout(addTimer.current);
          addTimer.current = setTimeout(() => setJustAdded(false), 1200);
        },
      },
    );
  }, [addMutation, product.id, qty]);

  const wholesale = product.wholesale ?? null;
  const savings = hasDiscount ? product.oldPrice - product.price : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* ================= گالری ================= */}
      <div>
        <button
          type="button"
          onClick={() => hasGallery && setLightbox(true)}
          className="relative rounded-[26px] overflow-hidden aspect-square w-full block cursor-zoom-in"
          style={{ background: "var(--color-surface)" }}
          aria-label="بزرگ‌نمایی تصویر"
        >
          {hasGallery ? (
            <Image
              src={gallery[imgIndex]}
              alt={product.title}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-8xl"
              style={{ background: "var(--color-surface-2)" }}
            >
              <svg
                width="96" height="96" viewBox="0 0 64 64"
                fill="none" stroke="currentColor" strokeWidth="1"
                style={{ color: "var(--color-teal-dark)" }}
              >
                <rect x="8" y="12" width="48" height="40" rx="6" />
                <path d="M8 28h48" />
                <circle cx="22" cy="44" r="4" />
                <circle cx="42" cy="44" r="4" />
              </svg>
            </div>
          )}
        </button>

        {/* بندانگشتی‌ها — فقط وقتی بیش از یک تصویر داریم */}
        {hasGallery && gallery.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1" role="tablist" aria-label="تصاویر محصول">
            {gallery.map((src, i) => (
              <button
                key={src}
                type="button"
                role="tab"
                aria-selected={i === imgIndex}
                aria-label={`تصویر ${toFa(i + 1)}`}
                onClick={() => setImgIndex(i)}
                className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 transition-all"
                style={{
                  background: "var(--color-surface-2)",
                  outline: i === imgIndex ? "2px solid var(--color-teal)" : "1px solid var(--color-line)",
                  outlineOffset: "-1px",
                  opacity: i === imgIndex ? 1 : 0.65,
                }}
              >
                <Image src={src} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ================= اطلاعات محصول ================= */}
      <div className="flex flex-col gap-4">
        {product.category && (
          <span className="text-xs font-medium text-teal">{product.category}</span>
        )}

        <h1 className="text-2xl md:text-3xl font-extrabold text-ink leading-tight">
          {product.title}
        </h1>

        {product.rating != null && product.rating.count > 0 && (
          <a
            href="#reviews"
            className="flex items-center gap-2 w-fit transition-opacity hover:opacity-80"
          >
            <StarRow value={product.rating.avg} size={16} />
            <span className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
              {/* عددها فارسی، مثل بقیه‌ی سایت. قبلاً toFixed(1) بود که «4.5»
                  لاتین می‌داد وسطِ متنِ فارسی. */}
              <b style={{ color: "var(--color-ink)" }}>{toFa(product.rating.avg)}</b>{" "}
              ({toFa(product.rating.count)} دیدگاه)
            </span>
          </a>
        )}

        <div className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
          {hasDiscount ? (
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-extrabold text-teal">{toToman(product.price)}</span>
              <span className="text-sm text-ink-dim line-through">{toToman(product.oldPrice)}</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
              >
                {toFa(product.discountPercent)}٪ تخفیف
              </span>
            </div>
          ) : (
            <span className="text-3xl font-extrabold" style={{ color: "var(--color-ink-soft)" }}>
              {toToman(product.price)}
            </span>
          )}

          {/* خطِ پس‌انداز — همتای js/product.js:118: به مشتری صریح بگو با این
              خرید چقدر کمتر می‌پردازد */}
          {savings > 0 && (
            <p className="mt-2 text-xs font-medium" style={{ color: "var(--color-teal)" }}>
              با این خرید {toToman(savings)} کمتر می‌پردازید
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          {outOfStock ? (
            <span className="text-coral font-medium">ناموجود</span>
          ) : lowStock ? (
            <span className="text-gold font-medium">فقط {toFa(product.stock)} عدد در انبار</span>
          ) : (
            <span className="text-teal font-medium">موجود در انبار</span>
          )}
        </div>

        {/* ناموجود؟ به‌جای بن‌بست، «موجود شد خبرم کن» — عیناً همان چیزی که
            نسخه‌ی Express داشت (js/product.js:146-155) و اینجا جا افتاده بود. */}
        {outOfStock && (
          <div className="flex flex-col gap-2 mt-2">
            <NotifyMeButton productId={product.id} />
            <small className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
              به محض شارژ موجودی، پیامک می‌گیرید.
            </small>
          </div>
        )}

        {!outOfStock && (
          <div ref={buyRowRef} className="contents">
            {/* انتخابِ تعداد */}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-ink-soft">تعداد:</span>
              <div
                className="inline-flex items-center rounded-full overflow-hidden"
                style={{ border: "1px solid var(--color-line-control)" }}
              >
                <button
                  type="button"
                  aria-label="کاهش تعداد"
                  disabled={qty <= 1}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "var(--color-ink)" }}
                >
                  −
                </button>
                {/* عدد با aria-live خوانده می‌شود، وگرنه کاربرِ صفحه‌خوان بعد از
                    زدنِ + هیچ بازخوردی نمی‌گیرد. */}
                <span
                  aria-live="polite"
                  className="w-10 text-center text-sm font-bold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {toFa(qty)}
                </span>
                <button
                  type="button"
                  aria-label="افزایش تعداد"
                  disabled={qty >= maxQty}
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  className="w-9 h-9 text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "var(--color-ink)" }}
                >
                  +
                </button>
              </div>
              {qty >= maxQty && (
                <span className="text-xs text-ink-dim">
                  حداکثر {toFa(maxQty)} عدد
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              aria-busy={busy}
              className="mt-2 rounded-full py-3 px-8 text-base font-bold transition-all self-start inline-flex items-center gap-2 disabled:cursor-wait"
              style={{
                background: justAdded
                  ? "var(--color-teal-dark)"
                  : "var(--color-teal)",
                color: "#04211B",
                boxShadow: "var(--shadow-glow-teal)",
                opacity: busy ? 0.75 : 1,
              }}
            >
              {justAdded ? (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="7" cy="17" r="1.5" />
                  <circle cx="15" cy="17" r="1.5" />
                  <path d="M2 3h2.5L7 12h8l2-6H5" />
                </svg>
              )}
              {justAdded
                ? "اضافه شد"
                : busy
                  ? "در حال افزودن…"
                  : "افزودن به سبد خرید"}
            </button>
          </div>
        )}

        {/* پله‌ی عمده — همتای بلوکِ wholesale در js/product.js:177-186 */}
        {wholesale && (
          <div
            className="rounded-[18px] p-4 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: "var(--color-gold-tint)" }}
          >
            <div className="text-xs leading-relaxed" style={{ color: "var(--color-gold)" }}>
              <b>خرید عمده:</b> از {toFa(wholesale.minQty)} عدد به بالا، هر واحد{" "}
              <b>{toToman(wholesale.unitPrice)}</b> ({toFa(wholesale.discount)}٪ تخفیف)
            </div>
            <Link
              href={`/wholesale?product=${product.id}`}
              className="rounded-full px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-85"
              style={{ background: "var(--color-gold)", color: "#2B0A03" }}
            >
              استعلام عمده
            </Link>
          </div>
        )}

        {/* مزایا — همتای perks در js/product.js:190-200 */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" style={{ color: "var(--color-ink-soft)" }}>
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span>
            ارسال سریع از سراسر کشور
          </li>
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span>
            {shop && shop.freeShippingOver > 0
              ? `ارسال رایگان بالای ${toToman(shop.freeShippingOver)}`
              : "ارسال به سراسر کشور"}
          </li>
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span>
            پرداخت امنِ زرین‌پال
          </li>
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span>
            ۷ روز ضمانت بازگشت کالا
          </li>
        </ul>

        {/* مشخصات فنی — جدولِ key/value مثل js/product.js:205-215 */}
        {product.specs && product.specs.length > 0 && (
          <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--color-surface)" }}>
            <h2 className="text-sm font-bold px-4 pt-3 pb-2" style={{ color: "var(--color-ink)" }}>
              مشخصات
            </h2>
            <table className="w-full text-xs">
              <tbody>
                {product.specs.map((s, i) => (
                  <tr
                    key={`${s.k}-${i}`}
                    className="border-t"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <td className="px-4 py-2 text-ink-dim whitespace-nowrap align-top">{s.k}</td>
                    <td className="px-4 py-2" style={{ color: "var(--color-ink-soft)" }}>{s.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نوار خریدِ چسبانِ موبایل — وقتی ردیفِ خرید از دید خارج شد */}
      {!outOfStock && buyRowGone && (
        <div
          className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-center gap-3 px-4 py-3 border-t"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-line-strong)" }}
        >
          <div className="flex-1 min-w-0">
            <span className="block text-[10px] text-ink-dim">
              {toFa(qty)} × {product.title}
            </span>
            <span className="block text-sm font-extrabold text-teal truncate">
              {toToman(product.price * qty)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy || justAdded}
            aria-busy={busy}
            className="rounded-full py-2.5 px-6 text-sm font-bold transition-colors disabled:cursor-wait shrink-0"
            style={{
              background: justAdded ? "var(--color-teal-dark)" : "var(--color-teal)",
              color: "#04211B",
              opacity: busy ? 0.75 : 1,
            }}
          >
            {justAdded ? "اضافه شد ✓" : busy ? "…" : "افزودن به سبد"}
          </button>
        </div>
      )}

      {/* لایت‌باکس */}
      {lightbox && hasGallery && (
        <Lightbox
          images={gallery}
          index={imgIndex}
          onClose={() => setLightbox(false)}
          onMove={setImgIndex}
        />
      )}
    </div>
  );
}
