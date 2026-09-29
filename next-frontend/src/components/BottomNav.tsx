"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCart, getMe } from "@/lib/api";
import { useWishlistIds } from "@/lib/useWishlist";
import type { AuthMeResponse, CartResponse } from "@/lib/types";

// ============================================================
// نوار ناوبری پایین (موبایل) — همتای `initBottomNav` در common.js:681
// ============================================================
// چرا مهم است: این نوار تنها ناوبریِ همیشه‌در‌دسترس روی گوشی است. در نسخه‌ی
// Express پنج مقصد اصلی (خانه، محصولات، سبد، علاقه‌مندی، حساب) همیشه زیرِ شستِ
// مشتری بودند؛ در نسخه‌ی Next روی گوشی فقط یک ردیفِ اسکرولی زیرِ هدر بود که
// باید افقی اسکرول می‌شد و «سبد» و «علاقه‌مندی» هم در آن نبود.
//
// چهار تصمیم که از نسخه‌ی اصلی آمده و هر کدام دلیلی دارد:
//
//   ۱. **صفحه‌ی ورود نوار ندارد.** آن صفحه تمام‌صفحه است و تمرکز باید روی فرم
//      باشد (`data-no-bottom-nav` در login.html). پنل `/admin` هم نوار ندارد،
//      چون در Express اصلاً `common.js` را لود نمی‌کرد.
//   ۲. **سبد روی «سبد» و «پرداخت» فعال می‌ماند** — نه فقط روی `/cart`. مشتری
//      که وسطِ پرداخت است نباید فکر کند از سبد بیرون آمده.
//   ۳. **«حساب» و «علاقه‌مندی» هیچ‌وقت با هم فعال نمی‌شوند.** هر دو به
//      `/account` می‌روند و بدونِ این تفکیک، مشتری روی تبِ علاقه‌مندی دو تبِ
//      روشن می‌دید و نمی‌فهمید کجاست.
//   ۴. شمارنده‌ها فقط وقتی چیزی هست نشان داده می‌شوند؛ عددِ صفر روی آیکون
//      یعنی «یک چیزی اینجاست که نیست».

export type BottomNavTab = "home" | "products" | "cart" | "wishlist" | "account";

/**
 * کدام تب‌ها فعال‌اند. خالص است تا سنجیدنی باشد — همین منطق در نسخه‌ی اصلی
 * داخلِ یک رشته‌ی HTML تو‌در‌تو بود و هیچ راهی برای آزمودنش نبود.
 */
export function bottomNavActive(
  pathname: string,
  hash: string,
): Record<BottomNavTab, boolean> {
  const onWishlist = pathname.startsWith("/account") && hash === "#wishlist";
  return {
    home: pathname === "/",
    // `/products` و `/product/12` هر دو یعنی «محصولات» — عیناً مثل `is(['product'])`
    // در نسخه‌ی Express که با پیشوند مقایسه می‌کرد.
    products: pathname.startsWith("/product"),
    cart: pathname === "/cart" || pathname.startsWith("/checkout"),
    wishlist: onWishlist,
    account:
      !onWishlist &&
      (pathname.startsWith("/login") || pathname.startsWith("/account")),
  };
}

/** آیا در این مسیر نوار را نشان بدهیم؟ (ورودِ تمام‌صفحه و پنل: نه) */
export function showsBottomNav(pathname: string): boolean {
  return !pathname.startsWith("/login") && !pathname.startsWith("/admin");
}

/** نشانگرِ عددی روی آیکون — فارسی، و فقط وقتی عددی هست. */
function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="bn-count" aria-hidden="true">
      {new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(n)}
    </span>
  );
}

function Icon({ path, extra }: { path: string; extra?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {extra}
    </svg>
  );
}

/**
 * هشِ جاری. `usePathname` هش را ندارد و سمتِ سرور هم وجود ندارد، پس با
 * `hashchange` هم‌گام می‌شود — و با عوض‌شدنِ مسیر صفر می‌شود، وگرنه بعد از
 * رفتن از `/account#wishlist` به صفحه‌ی دیگر، تبِ علاقه‌مندی روشن می‌ماند.
 */
function useHash(pathname: string): string {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);
  return hash;
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const hash = useHash(pathname);

  // همان دو کلیدی که هدر می‌خواند؛ TanStack Query کش را شریک می‌کند، پس این
  // دو خط هیچ درخواستِ اضافه‌ای به بک‌اند نمی‌زنند.
  const { data: cartData } = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: getCart,
    staleTime: 30_000,
    retry: false,
  });
  const { data: authData } = useQuery<AuthMeResponse>({
    queryKey: ["auth"],
    queryFn: getMe,
    staleTime: 60_000,
    retry: false,
  });
  const { data: wishIds } = useWishlistIds();

  if (!showsBottomNav(pathname)) return null;

  const user = authData?.user ?? null;
  const active = bottomNavActive(pathname, hash);
  const cls = (tab: BottomNavTab) => `bn-item${active[tab] ? " active" : ""}`;

  return (
    <nav className="bottom-nav" aria-label="ناوبری پایین">
      <Link href="/" className={cls("home")}>
        <Icon path="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
        <span>خانه</span>
      </Link>

      <Link href="/#products" className={cls("products")}>
        <Icon path="M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M12 13v8" />
        <span>محصولات</span>
      </Link>

      <Link href="/cart" className={cls("cart")}>
        <span className="bn-badge-wrap">
          <Icon
            path="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"
            extra={
              <>
                <circle cx="10" cy="21" r="1.4" fill="currentColor" />
                <circle cx="17" cy="21" r="1.4" fill="currentColor" />
              </>
            }
          />
          <Badge n={cartData?.count ?? 0} />
        </span>
        <span>سبد خرید</span>
      </Link>

      <Link href="/account#wishlist" className={cls("wishlist")}>
        <span className="bn-badge-wrap">
          <Icon path="M12 20.5S4 15.2 4 9.6A4.4 4.4 0 0 1 8.4 5.2c1.6 0 3 .9 3.6 2.1.6-1.2 2-2.1 3.6-2.1A4.4 4.4 0 0 1 20 9.6c0 5.6-8 10.9-8 10.9z" />
          <Badge n={wishIds?.length ?? 0} />
        </span>
        <span>علاقه‌مندی</span>
      </Link>

      <Link
        href={user ? "/account" : "/login"}
        className={cls("account")}
      >
        <Icon path="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" extra={<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />} />
        <span>{user ? "حساب من" : "ورود"}</span>
      </Link>
    </nav>
  );
}
