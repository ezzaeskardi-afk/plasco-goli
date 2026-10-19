"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/adminSections";
import { useLogout } from "@/lib/useLogout";
import type { PanelRole } from "@/components/admin/NoAccess";

const GROUPS = [
  {
    label: "فروش و مشتریان",
    keys: [
      "dash",
      "orders",
      "stock",
      "people",
      "crm",
      "reviews",
      "coupons",
      "wholesale",
      "report",
    ],
  },
  {
    label: "سیستم و محتوا",
    keys: ["config", "log", "errors", "system"],
  },
] as const;

const BY_KEY = new Map<string, AdminSection>(ADMIN_SECTIONS.map((s) => [s.key, s]));

function sectionsFor(role: PanelRole): readonly AdminSection[] {
  if (role !== "staff") return ADMIN_SECTIONS;
  return ADMIN_SECTIONS.filter((s) => s.href === "/admin/orders");
}

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function Brand({ compact = false }: { compact?: boolean }) {
  const size = compact ? 32 : 40;
  return (
    <Link
      href="/admin"
      className="flex min-w-0 items-center gap-2.5"
      aria-label="پنل مدیریت پلاسکو گلی"
    >
      <Image
        src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jpg"
        alt=""
        width={size}
        height={size}
        className={`${compact ? "h-8 w-8" : "h-10 w-10"} shrink-0 rounded-[12px] object-cover`}
        style={{ boxShadow: "0 10px 24px -16px rgba(37, 214, 176, 0.9)" }}
      />
      <span className="min-w-0">
        <span
          className={`block truncate font-extrabold leading-tight ${
            compact ? "text-[12px]" : "text-[13.5px]"
          }`}
          style={{ color: "var(--color-ink)" }}
        >
          پنل مدیریت
        </span>
        <span
          className="block truncate text-[10px] leading-tight"
          style={{ color: "var(--color-ink-dim)" }}
        >
          پلاسکو گلی
        </span>
      </span>
    </Link>
  );
}

function SectionLink({
  section,
  active,
  onNavigate,
}: {
  section: AdminSection;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={section.href as string}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 text-[12.5px] font-semibold transition-colors ${
        active ? "" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
      }`}
      style={
        active
          ? {
              background: "rgba(37, 214, 176, 0.1)",
              color: "var(--color-teal)",
              boxShadow: "inset 3px 0 0 var(--color-teal)",
            }
          : undefined
      }
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] transition-colors"
        style={
          active
            ? { background: "rgba(37, 214, 176, 0.16)" }
            : {
                background: "rgba(255, 255, 255, 0.045)",
                color: "var(--color-ink-dim)",
              }
        }
        aria-hidden="true"
      >
        <Icon name={section.icon} size={15} />
      </span>
      <span className="truncate">{section.label}</span>
      {active && (
        <span
          className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "var(--color-teal)" }}
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

function NavList({
  role,
  pathname,
  onNavigate,
}: {
  role: PanelRole;
  pathname: string;
  onNavigate?: () => void;
}) {
  const sections = sectionsFor(role);

  if (role === "staff") {
    return (
      <nav aria-label="بخش‌های پنل مدیریت" className="space-y-0.5">
        {sections.map((section) => (
          <SectionLink
            key={section.key}
            section={section}
            active={section.href !== null && isActive(pathname, section.href)}
            onNavigate={onNavigate}
          />
        ))}
        <p
          className="mt-2 rounded-xl px-3 py-2 text-center text-[10px] font-bold"
          style={{ background: "rgba(255,255,255,.04)", color: "var(--color-ink-dim)" }}
        >
          دسترسی کارمند · فقط سفارش‌ها
        </p>
      </nav>
    );
  }

  return (
    <nav aria-label="بخش‌های پنل مدیریت">
      {GROUPS.map((group) => {
        const visible = group.keys
          .map((key) => BY_KEY.get(key))
          .filter((section): section is AdminSection => !!section)
          .filter((section) => sections.includes(section));
        if (!visible.length) return null;
        return (
          <div key={group.label} className="mb-3">
            <p
              className="mb-1.5 px-3 text-[9.5px] font-bold tracking-wide"
              style={{ color: "var(--color-ink-dim)" }}
            >
              {group.label}
            </p>
            <div className="space-y-0.5">
              {visible.map((section) => (
                <SectionLink
                  key={section.key}
                  section={section}
                  active={section.href !== null && isActive(pathname, section.href)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  phone,
  role,
  onNavigate,
}: {
  phone: string;
  role: PanelRole;
  onNavigate?: () => void;
}) {
  const { logout, busy } = useLogout();
  const roleLabel = role === "admin" ? "مدیر" : role === "staff" ? "کارمند" : "مشتری";

  return (
    <div className="border-t p-3" style={{ borderColor: "rgba(37, 214, 176, 0.12)" }}>
      <div
        className="mb-2 flex items-center gap-2 rounded-xl px-2 py-2"
        style={{ background: "rgba(255,255,255,.035)" }}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
          aria-hidden="true"
        >
          <Icon name="user" size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9.5px]" style={{ color: "var(--color-ink-dim)" }}>
            {roleLabel} · واردشده
          </span>
          <span
            className="block truncate text-[11px] font-bold"
            style={{ color: "var(--color-ink)" }}
            dir="ltr"
          >
            {phone || "—"}
          </span>
        </span>
      </div>

      <Link
        href="/"
        onClick={onNavigate}
        className="flex min-h-10 items-center justify-center gap-2 rounded-xl text-[11.5px] font-extrabold transition duration-200 hover:brightness-110"
        style={{
          background: "linear-gradient(135deg, var(--color-teal), var(--color-teal-dark))",
          color: "#04211B",
          boxShadow: "0 12px 26px -16px rgba(37, 214, 176, 0.85)",
        }}
      >
        <Icon name="home" size={15} />
        مشاهده سایت
      </Link>

      <button
        type="button"
        onClick={logout}
        disabled={busy}
        aria-busy={busy}
        className="mt-1.5 flex min-h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-[11px] font-bold transition-colors hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
        style={{ color: "var(--color-coral)" }}
      >
        <Icon name="logout" size={14} />
        {busy ? "در حال خروج…" : "خروج از حساب"}
      </button>
    </div>
  );
}

export function AdminSidebar({
  role = "unknown",
  phone = "",
}: {
  role?: PanelRole;
  phone?: string;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawer(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawer]);

  return (
    <>
      <aside
        className="sticky top-0 hidden h-screen w-[266px] shrink-0 flex-col border-l lg:flex"
        style={{
          background: "linear-gradient(180deg, #0e1a16 0%, #08110e 100%)",
          borderColor: "rgba(37, 214, 176, 0.14)",
        }}
        aria-label="پنل مدیریت"
      >
        <div className="px-4 pb-3 pt-4">
          <Brand />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <NavList role={role} pathname={pathname} />
        </div>
        <SidebarFooter phone={phone} role={role} />
      </aside>

      <div
        className="sticky top-0 z-40 flex items-center gap-2 border-b px-4 py-2.5 backdrop-blur-md lg:hidden"
        style={{
          background: "linear-gradient(180deg, rgba(18,31,26,.96), rgba(11,20,17,.92))",
          borderColor: "var(--color-line)",
        }}
      >
        <Brand compact />
        <span className="flex-1" />
        <Link
          href="/"
          aria-label="مشاهده سایت"
          title="مشاهده سایت"
          className="grid h-9 w-9 place-items-center rounded-full transition-colors"
          style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
        >
          <Icon name="home" size={16} />
        </Link>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={drawer}
          aria-controls="admin-mobile-menu"
          onClick={() => setDrawer(true)}
          className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] font-extrabold"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          بخش‌ها
          <Icon name="menu" size={15} />
        </button>
      </div>

      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawer ? "" : "pointer-events-none"}`}
        aria-hidden={!drawer}
        inert={!drawer}
      >
        <button
          type="button"
          tabIndex={drawer ? 0 : -1}
          aria-label="بستن منوی بخش‌ها"
          onClick={() => setDrawer(false)}
          className={`absolute inset-0 transition-opacity duration-200 ${
            drawer ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background: "rgba(0, 0, 0, 0.6)",
            cursor: "default",
            border: "none",
          }}
        />
        <div
          id="admin-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="بخش‌های پنل مدیریت"
          className={`absolute inset-y-0 right-0 flex w-[86%] max-w-[330px] flex-col shadow-2xl transition-transform duration-300 ${
            drawer ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ background: "linear-gradient(180deg, #0e1a16 0%, #08110e 100%)" }}
        >
          <div
            className="flex items-center justify-between gap-2 border-b px-4 py-3"
            style={{ borderColor: "rgba(37, 214, 176, 0.14)" }}
          >
            <Brand compact />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="بستن منو"
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: "rgba(255,255,255,.05)", color: "var(--color-ink-soft)" }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <NavList role={role} pathname={pathname} onNavigate={() => setDrawer(false)} />
          </div>
          <SidebarFooter phone={phone} role={role} onNavigate={() => setDrawer(false)} />
        </div>
      </div>
    </>
  );
}
