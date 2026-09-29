"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, SpriteIcon } from "@/components/Icon";
import type { ShopCategory, User } from "@/lib/types";

// ============================================================
// منوی کشوییِ موبایل — همتای `#drawer` + `initDrawer` در common.js:۳۲۲
// ============================================================
// این منو در نسخه‌ی Next **کاملاً وجود نداشت**. روی گوشی، نسخه‌ی Next یک ردیفِ
// افقیِ چهارلینکی نشان می‌داد که نه جستجو داشت، نه دسته‌بندی‌ها، نه لینک‌های
// راهنما — یعنی مشتریِ موبایل هیچ راهی به «درباره ما» یا «قوانین» نداشت.
//
// سه نکته‌ی دسترس‌پذیری که از نسخه‌ی اصلی آمده و هر کدام باگی را می‌بندد:
//
//   • `role="dialog"` + `aria-modal="true"`: صفحه‌خوان اعلام می‌کند منو باز
//     شده، وگرنه کاربر نمی‌فهمد چرا تب بعدی او را به جای دیگری برد.
//   • فوکوس روی دکمه‌ی **بستن** می‌رود، نه اولین لینک: کاربر تازه منو را باز
//     کرده و احتمالِ «بستن» بیشتر از پریدن به اولین آیتم است.
//   • تلهِ Tab: بدونِ آن، کاربرِ کیبورد به لینک‌های زیرِ منو می‌رسید و جایی
//     فوکوس می‌گرفت که نمی‌دید.
//
// بدنِ صفحه قفل نمی‌شود — عیناً مثل نسخه‌ی اصلی که در `initDrawer` هیچ
// `no-scroll`ای نمی‌گذاشت.

const FOCUSABLE =
  'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])';

export function MobileDrawer({
  open,
  onClose,
  categories,
  user,
}: {
  open: boolean;
  onClose: (options?: { restoreFocus?: boolean }) => void;
  categories: ShopCategory[];
  user: User | null;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // کلیک روی لینک‌ها فوکوس را به دکمه‌ی منو برنمی‌گرداند: صفحه در حال عوض شدن
  // است و برگرداندنِ فوکوس فقط کاربر را گیج می‌کند (همان `restore:false`).
  const closeAfterNav = () => onClose({ restoreFocus: false });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    closeAfterNav();
    if (q) router.push(`/products?q=${encodeURIComponent(q)}`);
  }

  return (
    <div
      id="drawer"
      className={`mobile-drawer${open ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="منوی اصلی"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drawer-panel" ref={panelRef}>
        <div className="drawer-head">
          <span className="flex items-center gap-3 text-[17px] font-extrabold">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[12px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- نشانِ ۴۰px که از rewrite مسیر /picture سرو می‌شود */}
              <img
                src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jpg"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-cover"
              />
            </span>
            پلاسکو گلی
          </span>
          <button
            type="button"
            ref={closeRef}
            className="drawer-close rounded-full p-2"
            aria-label="بستن منو"
            onClick={() => onClose()}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form className="drawer-search" onSubmit={submit} role="search">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            maxLength={60}
            placeholder="جستجوی محصول..."
            aria-label="جستجو در محصولات"
          />
        </form>

        <span className="drawer-label">صفحات</span>
        <Link href="/" onClick={closeAfterNav}>
          <Icon name="home" size={19} /> خانه
        </Link>
        <Link href="/products" onClick={closeAfterNav}>
          <Icon name="package" size={19} /> محصولات
        </Link>
        <Link href="/cart" onClick={closeAfterNav}>
          <Icon name="cart" size={19} /> سبد خرید
        </Link>
        <Link href={user ? "/account" : "/login"} onClick={closeAfterNav}>
          <Icon name="user" size={19} />{" "}
          {user ? `حساب ${user.fullName || "من"}` : "ورود / ثبت‌نام"}
        </Link>

        {categories.length > 0 && (
          <>
            <span className="drawer-label">دسته‌بندی‌ها</span>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/products?category=${encodeURIComponent(cat.name)}`}
                onClick={closeAfterNav}
              >
                <SpriteIcon id={cat.icon} size={19} /> {cat.name}
              </Link>
            ))}
          </>
        )}

        <span className="drawer-label">راهنما</span>
        <Link href="/#about" onClick={closeAfterNav}>
          <Icon name="shield" size={19} /> درباره ما
        </Link>
        <Link href="/#faq" onClick={closeAfterNav}>
          <Icon name="checkCircle" size={19} /> سوالات متداول
        </Link>
        <Link href="/#contact" onClick={closeAfterNav}>
          <Icon name="phone" size={19} /> تماس با ما
        </Link>
        <Link href="/terms" onClick={closeAfterNav}>
          <Icon name="note" size={19} /> قوانین و راهنمای خرید
        </Link>
      </div>
    </div>
  );
}
