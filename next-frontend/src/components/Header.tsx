"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCart, getCategories, getMe, getProducts } from "@/lib/api";
import { useShopInfo } from "@/lib/useShopInfo";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { MobileDrawer } from "@/components/MobileDrawer";
import { Icon, SpriteIcon } from "@/components/Icon";
import { useWishlistIds } from "@/lib/useWishlist";
import { HEADER_SCROLLED_AT } from "@/lib/scrollFx";
import { useScrollPast } from "@/lib/useScrollPast";
import type {
  AuthMeResponse,
  CartResponse,
  Product,
  ShopCategory,
} from "@/lib/types";

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

function SearchBox() {
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
    // فقط ≥۹۰۰px — همان نقطه‌ی شکستِ Express. زیرِ آن، جستجو در منوی کشویی
    // است (`#drawerSearch`)، نه در هدر.
    <div ref={boxRef} className="relative hidden min-[900px]:block w-64">
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

// ============================================================
// منوی کشوییِ دسته‌بندی — همتای `#catMenu` + `initCatMenu` (common.js:494)
// ============================================================
// این منو در نسخه‌ی Next نبود، با اینکه تنها راهِ دیدنِ **کلِ** نقشه‌ی
// دسته‌بندی‌ها در یک نگاه بود. فهرستش از `/api/shop/categories` می‌آید (همان
// کاری که `initDynamicCats` می‌کرد) و آیکونِ هر دسته از خودِ سرور می‌آید.
//
// تا وقتی پاسخ نرسیده فقط «نمایش همه‌ی محصولات» هست — نه یک فهرستِ ثابتِ
// دستی. نسخه‌ی Express فهرستِ ثابتی در HTML داشت که با پاسخِ سرور جایگزین
// می‌شد؛ آن فهرستِ ثابت به‌مرور از دیتابیس جدا می‌افتاد و دسته‌ی حذف‌شده را
// نشان می‌داد.

const CAT_LINK =
  "flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] rounded-lg transition-colors hover:bg-surface-2";

function CatMenu({ categories }: { categories: ShopCategory[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex h-full items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[13.5px] font-bold"
        style={{ color: open ? "var(--color-teal)" : "var(--color-ink)" }}
      >
        <Icon name="menu" size={18} style={{ color: "var(--color-gold)" }} />
        دسته‌بندی کالاها
        <Icon
          name="chevronDown"
          size={14}
          className="transition-transform"
          style={{
            color: "var(--color-ink-soft)",
            transform: open ? "rotate(180deg)" : undefined,
          }}
        />
      </button>

      <div
        role="menu"
        className={`absolute top-full right-0 z-50 min-w-[248px] flex-col rounded-[16px] p-2 transition-opacity ${
          open ? "flex opacity-100" : "pointer-events-none invisible opacity-0"
        }`}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line-strong)",
          boxShadow: "var(--shadow)",
        }}
      >
        {categories.map((cat) => (
          <Link
            key={cat.id}
            role="menuitem"
            href={`/products?category=${encodeURIComponent(cat.name)}`}
            onClick={() => setOpen(false)}
            className={CAT_LINK}
          >
            <SpriteIcon id={cat.icon} size={22} /> {cat.name}
          </Link>
        ))}
        <Link
          role="menuitem"
          href="/products"
          onClick={() => setOpen(false)}
          className={CAT_LINK}
        >
          <Icon name="package" size={20} style={{ color: "var(--color-teal)" }} />
          نمایش همه‌ی محصولات
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// ردیفِ دومِ هدر (فقط ≥۹۰۰px) — همتای `div.subnav` در Express
// ============================================================
// ‏`subnav` زیرِ ۹۰۰px پنهان می‌شود و جایش منوی کشویی می‌آید — عیناً همان
// قاعده‌ی `@media (max-width:900px)` نسخه‌ی اصلی.
//
// «خرید عمده» عمداً به فهرستِ Express اضافه شده: آنجا هیچ لینکی به
// wholesale.html از صفحه‌ی اصلی نمی‌رفت و فروشگاه B2B آن را از دست می‌داد.
// (بقیه‌ی پنج لینک همان‌های Express‌اند.)

const SUBNAV_LINKS = [
  { href: "/", label: "خانه" },
  { href: "/products", label: "محصولات" },
  { href: "/wholesale", label: "خرید عمده" },
  { href: "/#about", label: "درباره ما" },
  { href: "/#faq", label: "سوالات متداول" },
  { href: "/#contact", label: "تماس با ما" },
];

function Subnav({ categories }: { categories: ShopCategory[] }) {
  const pathname = usePathname();

  return (
    <div
      className="hidden min-[900px]:block"
      style={{ borderTop: "1px solid var(--color-line)" }}
    >
      <div className="mx-auto flex h-11 max-w-[1180px] items-center gap-7 px-6">
        <CatMenu categories={categories} />
        <nav className="flex items-center gap-5 text-[13.5px] font-medium" aria-label="منوی اصلی">
          {SUBNAV_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-teal"
                style={{ color: active ? "var(--color-teal)" : "var(--color-ink-soft)" }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <span
          className="ms-auto flex items-center gap-2 text-[12.5px] font-bold"
          style={{ color: "var(--color-ink-soft)" }}
        >
          <Icon name="truck" size={16} style={{ color: "var(--color-gold)" }} />
          ارسال سریع به سراسر کشور
        </span>
      </div>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const shop = useShopInfo();

  // همتای `header.site.scrolled` در style.css (common.js:391). بدونِ این،
  // هدرِ چسبیده همان زمینهٔ روشنِ اولیه را نگه می‌داشت و وقتی مشتری روی
  // محتوای روشن اسکرول می‌کرد، مرزِ هدر گم می‌شد.
  const scrolled = useScrollPast(HEADER_SCROLLED_AT);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // همان درخواستی که `initDynamicCats` می‌زد: دسته‌بندی‌ها از پنل می‌آیند و
  // هدر/منو نباید فهرستِ ثابتی داشته باشند.
  const { data: categories = [] } = useQuery<ShopCategory[]>({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: wishIds } = useWishlistIds();
  const wishCount = wishIds?.length ?? 0;

  const cartCount = cartData?.count || 0;
  const user = authData?.user || null;

  // با هر جابه‌جاییِ صفحه منو بسته می‌شود. لازم است چون ناوبریِ Next سمتِ
  // کلاینت است و کامپوننت unmount نمی‌شود؛ بدونِ این، منو بعد از رفتن به صفحه‌ی
  // جدید هم باز می‌ماند و روی محتوا افتاده است.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      {/* نوارِ اطلاعیه **بیرونِ** هدر است، نه داخلش. تفاوت رفتار جدی است:
          هدر `sticky` است، پس اگر نوار داخلش باشد تا ابد بالای صفحه می‌ماند،
          در حالی که در نسخه‌ی Express نوار بالای هدر در جریانِ صفحه بود و با
          اسکرول کنار می‌رفت (`initShopBar` آن را به ابتدای body می‌گذاشت). */}
      <AnnouncementBar shop={shop} />

      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: scrolled ? "rgba(8,14,12,.94)" : "var(--color-surface)",
          boxShadow: scrolled ? "0 14px 40px -22px rgba(0,0,0,.8)" : "none",
          transition: "background .2s ease, box-shadow .2s ease",
          borderColor: "var(--color-line-strong)",
        }}
      >
        {/* نوارِ سه‌رنگِ برند — همتای `header.site::before` در style.css */}
        <div
          className="h-[3px]"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(90deg, var(--color-teal), var(--color-gold) 50%, var(--color-coral))",
          }}
        />

        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-6 py-3 min-[900px]:gap-[18px]">
          {/* لوگو — نشان + نام + زیرنویس، عیناً ساختار Express */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3"
            aria-label="پلاسکو گلی — صفحه اصلی"
          >
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- نشانِ ۴۸px که از rewrite مسیر /picture سرو می‌شود */}
              <img
                src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jpg"
                alt="لوگوی پلاسکو گلی"
                width={48}
                height={48}
                className="h-12 w-12 object-cover"
              />
            </span>
            <span className="flex flex-col leading-tight">
              <span
                className="text-lg font-extrabold"
                style={{ color: "var(--color-teal)" }}
              >
                پلاسکو گلی
              </span>
              <small
                className="hidden text-[11px] font-normal min-[900px]:block"
                style={{ color: "var(--color-ink-soft)" }}
              >
                فروشگاه لوازم پلاستیکی خانه
              </small>
            </span>
          </Link>

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
              <Icon name="heart" size={20} />
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
              <Icon name="cart" size={20} />
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

            {/* دکمه‌ی منو — فقط زیرِ ۹۰۰px، همتای `.menu-toggle` */}
            <button
              type="button"
              className="flex min-[900px]:hidden rounded-full p-2 transition-colors"
              style={{ color: "var(--color-ink-soft)" }}
              aria-label="باز کردن منو"
              aria-expanded={drawerOpen}
              aria-controls="drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
          </div>
        </div>

        <Subnav categories={categories} />
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={(options) => {
          setDrawerOpen(false);
          if (options?.restoreFocus !== false) {
            // فوکوس به دکمه‌ی منو برمی‌گردد، مگر وقتی کاربر روی یک لینک زده
            // و صفحه در حال عوض شدن است.
            document
              .querySelector<HTMLButtonElement>('[aria-controls="drawer"]')
              ?.focus();
          }
        }}
        categories={categories}
        user={user}
      />
    </>
  );
}
