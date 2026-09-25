"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SECTIONS } from "@/lib/adminSections";
import type { PanelRole } from "@/components/admin/NoAccess";

// ============================================================
// نوارِ ناوبریِ پنل مدیریت
// ============================================================
// کامپوننتِ کلاینت است چون «کدام بخش باز است» فقط از `usePathname` درمی‌آید.
// `app/admin/layout.tsx` (که سروری است و `metadata` می‌دهد) همین را رندر می‌کند.
//
// چرا بخش‌های منتقل‌نشده هم نشان داده می‌شوند، به‌جای اینکه کلاً پنهان شوند:
// مدیر باید ببیند کلِ پنل چند بخش دارد و کدام‌شان آماده است. پنهان‌کردنشان
// یعنی او فکر کند پنل ناقص است، یا بدتر: فکر کند همان ۱۳ نمای Express همه
// اینجا هم هستند و بی‌دلیل دنبالشان بگردد. پس نشان داده می‌شوند، ولی
// غیرفعال و با برچسبِ صریح — نه یک لینکِ مرده که به ۴۰۴ برود.
//
// ============================================================
// نوار بر اساسِ نقش
// ============================================================
// `role` از پوسته می‌آید و خودش از `middleware.ts` (هدرِ `x-panel-role`).
//
// چرا لازم است: سدِ سمتِ سرور کارمندها را فقط به `/orders` راه می‌دهد
// (`routes/admin.js:132`). بدونِ این فیلتر، کارمند هشت لینک می‌دید و هفت‌تایش
// به یک صفحه‌ی «دسترسی ندارید» می‌رسید — یعنی دقیقاً همان ایرادی که برای
// مشتریِ عادی با یک پیامِ روشن حل شد، فقط در مقیاسِ کوچک‌تر و برای نقشِ دیگر.
// نوار باید وعده‌ی همان چیزی را بدهد که باز می‌شود.
//
// `unknown` (هدر نرسیده) عیناً رفتارِ قبل است: همه‌چیز نشان داده می‌شود. این
// هدر یک راهنمای نمایشی است، نه مرزِ امنیتی؛ و فرضِ اشتباه در جهتِ «همه را
// نشان بده» بدترین نتیجه‌اش یک کادرِ ۴۰۳ است، ولی جهتِ مخالف یعنی مدیرِ واقعی
// نوارِ خودش را نمی‌بیند و دنبالِ باگ می‌گردد.
function sectionsFor(role: PanelRole) {
  if (role !== "staff") return ADMIN_SECTIONS;
  return ADMIN_SECTIONS.filter((s) => s.href === "/admin/orders");
}

// ============================================================
// چرا دو نمایش برای یک نوار
// ============================================================
// نوارِ افقی روی موبایل شکسته بود، و عدد‌هایش این را می‌گفت: ۱۳ بخش در یک
// نوارِ ۱۳۸۹ پیکسلی داخلِ صفحه‌ی ۳۸۰ پیکسلی. یعنی در هر لحظه فقط یک‌چهارمِ
// بخش‌ها در دسترس بود و برچسبِ بخش‌های لبه بریده می‌شد («CRM» وسطِ کلمه قطع
// می‌شد) — بدونِ هیچ نشانه‌ای که این نوار اسکرول می‌شود. برای کارِ روزمره روی
// موبایل یعنی «تنظیمات کجاست؟» و چهار بار کشیدنِ انگشت.
//
// حالا روی موبایل: نوار فقط **بخشِ جاری** را نشان می‌دهد و یک دکمه‌ی «بخش‌ها»
// فهرستِ کامل را در یک شبکه‌ی دوستونه باز می‌کند. هیچ بخشی پنهان نمی‌ماند و
// هر ردیف ۴۴ پیکسل ارتفاع دارد. روی دسکتاپ همان نوارِ افقیِ قبلی است.
export function AdminNav({ role = "unknown" }: { role?: PanelRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sections = sectionsFor(role);

  // «داشبورد» مسیرش دقیقاً `/admin` است؛ با `startsWith` روی هر صفحه‌ی
  // دیگری هم روشن می‌ماند — چون `/admin/orders` هم با `/admin` شروع می‌شود.
  // پس همان یکی تطبیقِ دقیق می‌خواهد و بقیه پیشوندی.
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const current =
    sections.find((s) => s.href !== null && isActive(s.href)) ?? sections[0];

  return (
    <nav
      aria-label="بخش‌های پنل مدیریت"
      className="border-b"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-line)",
      }}
    >
      {/* ---------- موبایل: بخشِ جاری + دکمه‌ی فهرست ---------- */}
      <div className="lg:hidden">
        <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-4 py-2">
          <span
            className="text-sm font-bold whitespace-nowrap"
            style={{ color: "var(--color-teal)" }}
          >
            {current?.label ?? "پنل"}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="admin-section-menu"
            className="mr-auto flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold whitespace-nowrap"
            style={{
              background: open ? "var(--color-teal-tint)" : "var(--color-surface-2)",
              color: open ? "var(--color-teal)" : "var(--color-ink-soft)",
              border: "1px solid var(--color-line)",
            }}
          >
            بخش‌ها
            <span className="text-[10px]" aria-hidden="true">
              {open ? "▲" : "▼"}
            </span>
          </button>
        </div>

        {open && (
          <ul
            id="admin-section-menu"
            className="mx-auto grid max-w-[1180px] grid-cols-2 gap-1.5 px-4 pb-3"
          >
            {sections.map((section) => {
              // بخش‌های منتقل‌نشده: غیرفعال، با همان توضیحِ دسکتاپ.
              if (section.href === null) {
                return (
                  <li key={section.key}>
                    <span
                      aria-disabled="true"
                      title={`«${section.label}» هنوز به نسخه‌ی Next منتقل نشده — فعلاً از پنل Express استفاده کنید`}
                      className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-medium"
                      style={{
                        background: "var(--color-surface-2)",
                        color: "var(--color-ink-dim)",
                        opacity: 0.7,
                      }}
                    >
                      {section.label}
                      <span
                        className="rounded-full px-1.5 py-px text-[9px] font-bold"
                        style={{
                          background: "var(--color-gold-tint)",
                          color: "var(--color-gold)",
                        }}
                      >
                        Express
                      </span>
                    </span>
                  </li>
                );
              }

              const active = isActive(section.href);
              return (
                <li key={section.key}>
                  <Link
                    href={section.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="flex min-h-11 items-center rounded-xl px-3 text-xs font-bold"
                    style={
                      active
                        ? {
                            background: "var(--color-teal-tint)",
                            color: "var(--color-teal)",
                          }
                        : {
                            background: "var(--color-surface-2)",
                            color: "var(--color-ink-soft)",
                          }
                    }
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}

            {/* برچسبِ نقش برای کارمند: یک تبِ تنها بدونِ توضیح، شبیه نوارِ نصبِ
                کامل است و ممکن است کاربر فکر کند بخش‌های دیگر حذف شده. */}
            {role === "staff" && (
              <li className="col-span-2">
                <span
                  className="flex min-h-11 items-center justify-center rounded-xl px-3 text-center text-[11px] font-bold"
                  style={{
                    background: "var(--color-surface-2)",
                    color: "var(--color-ink-dim)",
                  }}
                >
                  دسترسی کارمند · فقط سفارش‌ها
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ---------- دسکتاپ: نوارِ افقی ---------- */}
      <ul className="mx-auto hidden max-w-[1180px] items-center gap-1 overflow-x-auto px-6 py-2 text-sm lg:flex">
        {sections.map((section) => {
          if (section.href === null) {
            return (
              <li key={section.key}>
                <span
                  aria-disabled="true"
                  title={`«${section.label}» هنوز به نسخه‌ی Next منتقل نشده — فعلاً از پنل Express استفاده کنید`}
                  className="flex shrink-0 cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 font-medium"
                  style={{ color: "var(--color-ink-dim)", opacity: 0.6 }}
                >
                  {section.label}
                  <span
                    className="rounded-full px-1.5 py-px text-[9px] font-bold"
                    style={{
                      background: "var(--color-gold-tint)",
                      color: "var(--color-gold)",
                    }}
                  >
                    Express
                  </span>
                </span>
              </li>
            );
          }

          const active = isActive(section.href);

          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className="block shrink-0 whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-colors"
                style={
                  active
                    ? {
                        background: "var(--color-teal-tint)",
                        color: "var(--color-teal)",
                      }
                    : { color: "var(--color-ink-soft)" }
                }
              >
                {section.label}
              </Link>
            </li>
          );
        })}

        {role === "staff" && (
          <li className="mr-auto shrink-0 pl-2">
            <span
              title="حساب شما نقش کارمند دارد؛ به همین دلیل فقط بخش سفارش‌ها را می‌بینید"
              className="whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }}
            >
              دسترسی کارمند · فقط سفارش‌ها
            </span>
          </li>
        )}
      </ul>
    </nav>
  );
}
