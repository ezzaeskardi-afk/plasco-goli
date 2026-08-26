"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCart, getMe, getProducts } from "@/lib/api";
import { useShopInfo } from "@/lib/useShopInfo";
import { useWishlistIds } from "@/lib/useWishlist";
import type { CartResponse, AuthMeResponse, Product } from "@/lib/types";

// عددِ نشانگرِ سبد باید فارسی باشد. بقیه‌ی سایت همه‌جا از این استفاده می‌کند و
// فقط این دو نقطه لاتین مانده بود؛ کنارِ «۳ قلم» یک «3» تو ذوق می‌زد.
function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(price: number): string {
  return `${toFa(price)} تومان`;
}

// ============================================================
// جستجوی زنده‌ی هدر — همتای initSearch در نسخه‌ی Express (common.js:568)
// ============================================================
// پیشنهادها با تاخیر ۱۴۰ms گرفته می‌شوند؛ کشِ per-query جلوی درخواست‌های
// تکراریِ تایپِ حرف‌به‌حرف را می‌گیرد. Enter همیشه به /products?q= می‌رود —
// پیشنهاد فقط میان‌بُر است، نه سدِ راه.

function SearchBox({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const cache = useRef(new Map<string, Product[]>());

  // بستن با کلیک بیرون
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // debounce ۱۴۰ms — همان نسخه‌ی Express
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    const cached = cache.current.get(term);
    if (cached) {
      setItems(cached);
      setOpen(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const my = ++seq.current;
      try {
        const res = await getProducts({ search: term, page: 1, limit: 6 });
        if (my !== seq.current) return; // پاسخِ کهنه — کاربر ادامه داده
        cache.current.set(term, res.products);
        if (cache.current.size > 30) cache.current.clear(); // سقفِ حافظه
        setItems(res.products);
        setOpen(true);
      } catch {
        if (my === seq.current) setItems([]);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    goToResults();
  }

  function goToResults() {
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    router.push(`/products?q=${encodeURIComponent(term)}`);
  }

  return (
    <div ref={boxRef} className={`relative ${compact ? "w-full" : "hidden lg:block w-64"}`}>
      <form onSubmit={submit} role="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder="جستجو…"
          aria-label="جستجوی محصولات"
          className="w-full rounded-full py-2 px-4 text-sm outline-none"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-line-control)",
          }}
        />
      </form>

      {open && (q.trim().length >= 2) && (
        <div
          className="absolute top-full mt-1 w-full rounded-2xl overflow-hidden z-50"
          style={{ background: "var(--color-surface)", boxShadow: "var(--shadow)", border: "1px solid var(--color-line)" }}
        >
          {items.length === 0 && !loading && (
            <p className="px-4 py-3 text-xs text-ink-dim">چیزی پیدا نشد</p>
          )}
          {items.map((p) => (
            <Link
              key={p.id}
              href={`/product/${p.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 transition-colors"
            >
              <span
                className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center overflow-hidden"
                style={{ background: "var(--color-surface-2)" }}
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- پیش‌نمایشِ کوچکِ ۳۶px؛ next/image اینجا فقط سربار است
                  <img src={p.image} alt="" width={36} height={36} className="object-cover w-9 h-9" />
                ) : (
                  <span className="text-lg">🧺</span>
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium truncate" style={{ color: "var(--color-ink)" }}>
                  {p.title}
                </span>
                <span className="block text-[10px] text-ink-dim">{toToman(p.price)}</span>
              </span>
            </Link>
          ))}
          {q.trim().length >= 2 && (
            <button
              type="button"
              onClick={goToResults}
              className="w-full text-right px-4 py-2 text-[11px] font-medium text-teal border-t transition-colors hover:bg-surface-2"
              style={{ borderColor: "var(--color-line)" }}
            >
              دیدن همه‌ی نتایج «{q.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const shop = useShopInfo();

  // TanStack Query — کش خودکار، staleTime ۳۰s
  const { data: cartData } = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: getCart,
    staleTime: 30_000,
    retry: false,
    refetchOnMount: true,
  });

  const { data: authData } = useQuery<AuthMeResponse>({
    queryKey: ["auth"],
    queryFn: getMe,
    staleTime: 60_000,
    retry: false,
    refetchOnMount: true,
  });

  const { data: wishIds } = useWishlistIds();
  const wishCount = wishIds?.length ?? 0;

  const cartCount = cartData?.count || 0;
  const user = authData?.user || null;

  const isActive = (href: string) => pathname === href;

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-line-strong)",
      }}
    >
      {/* نوار اعلان — همتای initShopBar در نسخه‌ی Express (common.js:820).
          فروشگاهِ بسته پیامِ ناپدیدشدنی ندارد: تا باز شود باید دیده بماند. */}
      {shop && !shop.shopOpen && (
        <div
          className="px-4 py-1.5 text-center text-xs font-bold"
          style={{ background: "var(--color-coral)", color: "var(--color-ink-on-warm)" }}
          role="alert"
        >
          {shop.announcement || "فروشگاه موقتاً بسته است؛ ثبت سفارش فعلاً ممکن نیست"}
        </div>
      )}

      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-6 py-3">
        {/* لوگو */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span
            className="text-xl font-extrabold"
            style={{ color: "var(--color-teal)" }}
          >
            پلاسکو گلی
          </span>
        </Link>

        {/* منوی اصلی */}
        <nav className="hidden md:flex gap-1 text-sm font-medium">
          <Link
            href="/"
            className={`px-3 py-2 rounded-lg transition-colors ${
              isActive("/")
                ? "bg-teal-tint text-teal"
                : "text-ink-soft hover:text-ink hover:bg-surface-2"
            }`}
          >
            خانه
          </Link>
          <Link
            href="/products"
            className={`px-3 py-2 rounded-lg transition-colors ${
              pathname.startsWith("/products") ||
              pathname.startsWith("/product")
                ? "bg-teal-tint text-teal"
                : "text-ink-soft hover:text-ink hover:bg-surface-2"
            }`}
          >
            محصولات
          </Link>
          <Link
            href="/wholesale"
            className={`px-3 py-2 rounded-lg transition-colors ${
              isActive("/wholesale")
                ? "bg-teal-tint text-teal"
                : "text-ink-soft hover:text-ink hover:bg-surface-2"
            }`}
          >
            خرید عمده
          </Link>
          <Link
            href="/terms"
            className={`px-3 py-2 rounded-lg transition-colors ${
              isActive("/terms")
                ? "bg-teal-tint text-teal"
                : "text-ink-soft hover:text-ink hover:bg-surface-2"
            }`}
          >
            قوانین
          </Link>
        </nav>

        {/* جستجوی دسکتاپ */}
        <SearchBox />

        <div className="flex-1" />

        {/* دکمه‌های سمت چپ */}
        <div className="flex items-center gap-1">
          {/* علاقه‌مندی‌ها — همتای قلبِ هدر در نسخه‌ی Express (common.js:668) */}
          <Link
            href="/account#wishlist"
            className="relative rounded-full p-2 transition-colors"
            style={{ color: "var(--color-ink-soft)" }}
            aria-label={`علاقه‌مندی‌ها ${wishCount > 0 ? `(${toFa(wishCount)})` : ""}`}
          >
            <svg
              width="20" height="20" viewBox="0 0 20 20"
              fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M10 17s-6.5-4.1-8.2-8A4.6 4.6 0 0110 5.4 4.6 4.6 0 0118.2 9c-1.7 3.9-8.2 8-8.2 8z" />
            </svg>
            {wishCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  background: "var(--color-pink)",
                  color: "#fff",
                }}
                aria-label={`${toFa(wishCount)} کالا در علاقه‌مندی‌ها`}
              >
                {toFa(wishCount)}
              </span>
            )}
          </Link>

          <Link
            href="/cart"
            className="relative rounded-full p-2 transition-colors"
            style={{ color: "var(--color-ink-soft)" }}
            aria-label={`سبد خرید ${cartCount > 0 ? `${cartCount} قلم` : ""}`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="7" cy="17" r="1.5" />
              <circle cx="15" cy="17" r="1.5" />
              <path d="M2 3h2.5L7 12h8l2-6H5" />
            </svg>
            {cartCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: "var(--color-coral)",
                  color: "var(--color-ink-on-warm)",
                }}
                // عددِ تنها برای صفحه‌خوان بی‌معنی است؛ با برچسب می‌فهمد چیست.
                aria-label={`${toFa(cartCount)} قلم در سبد`}
              >
                {toFa(cartCount)}
              </span>
            )}
          </Link>

          {user ? (
            <Link
              href={user.isAdmin || user.isStaff ? "/admin" : "/account"}
              className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                background: "var(--color-teal)",
                color: "#04211B",
              }}
            >
              {user.fullName || "حساب من"}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                background: "var(--color-teal)",
                color: "#04211B",
              }}
            >
              ورود
            </Link>
          )}
        </div>
      </div>

      {/* زیرمنوی موبایل */}
      <nav className="md:hidden flex gap-1 px-4 pb-2 text-sm overflow-x-auto">
        <Link
          href="/"
          className={`shrink-0 px-3 py-1.5 rounded-lg ${
            isActive("/")
              ? "bg-teal-tint text-teal font-medium"
              : "text-ink-soft"
          }`}
        >
          خانه
        </Link>
        <Link
          href="/products"
          className={`shrink-0 px-3 py-1.5 rounded-lg ${
            pathname.startsWith("/products")
              ? "bg-teal-tint text-teal font-medium"
              : "text-ink-soft"
          }`}
        >
          محصولات
        </Link>
        <Link
          href="/cart"
          className={`shrink-0 px-3 py-1.5 rounded-lg ${
            isActive("/cart")
              ? "bg-teal-tint text-teal font-medium"
              : "text-ink-soft"
          }`}
        >
          سبد {cartCount > 0 && `(${toFa(cartCount)})`}
        </Link>
        <Link
          href={
            user
              ? user.isAdmin || user.isStaff
                ? "/admin"
                : "/account"
              : "/login"
          }
          className={`shrink-0 px-3 py-1.5 rounded-lg ${
            isActive("/login") ||
            isActive("/account") ||
            isActive("/admin")
              ? "bg-teal-tint text-teal font-medium"
              : "text-ink-soft"
          }`}
        >
          {user ? "پروفایل" : "ورود"}
        </Link>
      </nav>

      {/* جستجوی موبایل — ردیفِ جدا، همیشه دیده شود */}
      <div className="lg:hidden px-4 pb-2">
        <SearchBox compact />
      </div>
    </header>
  );
}
