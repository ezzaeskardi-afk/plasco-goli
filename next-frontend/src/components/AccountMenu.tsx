"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLogout } from "@/lib/useLogout";
import type { User } from "@/lib/types";

const ITEM =
  "flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-[12.5px] font-semibold transition-colors";

export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { logout, busy } = useLogout();

  const isAdmin = user.isAdmin || user.isStaff;
  const initial = (user.fullName || "").trim().charAt(0);

  function goToTab(event: React.MouseEvent<HTMLAnchorElement>, tab: "orders" | "wishlist") {
    setOpen(false);
    if (pathname !== "/account") return;
    event.preventDefault();
    if (window.location.hash !== `#${tab}`) window.location.hash = tab;
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="header-account-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full py-1 ps-1.5 pe-3 text-sm font-bold transition-all hover:brightness-110"
        style={{ background: "var(--color-teal)", color: "#04211B" }}
      >
        <span
          className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] font-extrabold"
          style={{ background: "rgba(4, 33, 27, .22)" }}
          aria-hidden="true"
        >
          {initial || <Icon name="user" size={14} />}
        </span>
        <span className="max-w-[9rem] truncate">{user.fullName || "حساب من"}</span>
        <Icon
          name="chevronDown"
          size={14}
          className="transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined, opacity: 0.75 }}
        />
      </button>

      <div
        id="header-account-menu"
        role="menu"
        aria-label="منوی حساب کاربری"
        className={`absolute end-0 top-full z-50 mt-2 w-[252px] overflow-hidden rounded-2xl p-2 transition-all duration-150 ${
          open
            ? "visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-1 opacity-0"
        }`}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line-strong)",
          boxShadow: "var(--shadow)",
        }}
      >
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold"
            style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
            aria-hidden="true"
          >
            {initial || <Icon name="user" size={16} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-extrabold text-ink">
              {user.fullName || "کاربر پلاسکو"}
            </span>
          </span>
        </div>

        <div className="my-1 h-px" style={{ background: "var(--color-line)" }} />

        <Link
          role="menuitem"
          href="/account"
          onClick={(event) => goToTab(event, "orders")}
          className={`${ITEM} text-ink-soft hover:bg-surface-2 hover:text-ink`}
        >
          <Icon name="user" size={16} />
          حساب من
        </Link>
        <Link
          role="menuitem"
          href="/account#orders"
          onClick={(event) => goToTab(event, "orders")}
          className={`${ITEM} text-ink-soft hover:bg-surface-2 hover:text-ink`}
        >
          <Icon name="cart" size={16} />
          سفارش‌های من
        </Link>
        <Link
          role="menuitem"
          href="/account#wishlist"
          onClick={(event) => goToTab(event, "wishlist")}
          className={`${ITEM} text-ink-soft hover:bg-surface-2 hover:text-ink`}
        >
          <Icon name="heart" size={16} />
          علاقه‌مندی‌ها
        </Link>
        {isAdmin && (
          <Link
            role="menuitem"
            href="/admin"
            onClick={() => setOpen(false)}
            className={`${ITEM} text-ink-soft hover:bg-surface-2 hover:text-ink`}
          >
            <Icon name="dashboard" size={16} />
            پنل مدیریت
          </Link>
        )}

        <div className="my-1 h-px" style={{ background: "var(--color-line)" }} />

        <button
          type="button"
          role="menuitem"
          onClick={logout}
          disabled={busy}
          aria-busy={busy}
          className={`${ITEM} w-full cursor-pointer text-right disabled:cursor-wait disabled:opacity-60`}
          style={{ color: "var(--color-coral)" }}
        >
          <Icon name="logout" size={16} />
          {busy ? "در حال خروج…" : "خروج از حساب"}
        </button>
      </div>
    </div>
  );
}
