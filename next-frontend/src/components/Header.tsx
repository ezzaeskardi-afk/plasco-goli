"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCart, getMe } from "@/lib/api";
import type { CartResponse, User } from "@/lib/types";

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  const refreshCart = useCallback(async () => {
    try {
      const cart = await getCart();
      setCartCount(cart.count || 0);
    } catch {
      setCartCount(0);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await getMe();
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    refreshCart();
    refreshUser();
  }, [refreshCart, refreshUser]);

  // رفرش بعد از برگشت از لاگین
  useEffect(() => {
    refreshCart();
    refreshUser();
  }, [pathname, refreshCart, refreshUser]);

  const isActive = (href: string) => pathname === href;

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-line-strong)",
      }}
    >
      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-6 py-3">
        {/* لوگو */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0"
        >
          <span className="text-xl font-extrabold" style={{ color: "var(--color-teal)" }}>
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
              pathname.startsWith("/products") || pathname.startsWith("/product")
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

        <div className="flex-1" />

        {/* دکمه‌های سمت چپ */}
        <div className="flex items-center gap-2">
          <Link
            href="/cart"
            className="relative rounded-full p-2 transition-colors"
            style={{ color: "var(--color-ink-soft)" }}
            aria-label={`سبد خرید ${cartCount > 0 ? `${cartCount} قلم` : ""}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="7" cy="17" r="1.5" />
              <circle cx="15" cy="17" r="1.5" />
              <path d="M2 3h2.5L7 12h8l2-6H5" />
            </svg>
            {mounted && cartCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: "var(--color-coral)",
                  color: "var(--color-ink-on-warm)",
                }}
              >
                {cartCount}
              </span>
            )}
          </Link>

          {mounted && user ? (
            <Link
              href={user.isAdmin ? "/admin" : "/account"}
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
            isActive("/") ? "bg-teal-tint text-teal font-medium" : "text-ink-soft"
          }`}
        >
          خانه
        </Link>
        <Link
          href="/products"
          className={`shrink-0 px-3 py-1.5 rounded-lg ${
            pathname.startsWith("/products") ? "bg-teal-tint text-teal font-medium" : "text-ink-soft"
          }`}
        >
          محصولات
        </Link>
        <Link
          href="/cart"
          className={`shrink-0 px-3 py-1.5 rounded-lg ${
            isActive("/cart") ? "bg-teal-tint text-teal font-medium" : "text-ink-soft"
          }`}
        >
          سبد
        </Link>
        <Link
          href={user ? (user.isAdmin ? "/admin" : "/account") : "/login"}
          className={`shrink-0 px-3 py-1.5 rounded-lg ${
            isActive("/login") || isActive("/account") || isActive("/admin") ? "bg-teal-tint text-teal font-medium" : "text-ink-soft"
          }`}
        >
          {user ? "پروفایل" : "ورود"}
        </Link>
      </nav>
    </header>
  );
}