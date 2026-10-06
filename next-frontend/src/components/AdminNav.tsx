"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/adminSections";
import type { PanelRole } from "@/components/admin/NoAccess";

// ============================================================
// نوارِ ناوبریِ پنل مدیریت
// ============================================================
// کامپوننتِ کلاینت است چون «کدام بخش باز است» فقط از `usePathname` درمی‌آید.
// `app/admin/layout.tsx` (که سروری است و `metadata` می‌دهد) همین را رندر می‌کند.
//
// شاخه‌ی `href === null` در دوره‌ی مهاجرت وجود داشت: هر نمای منتقل‌نشده
// **نشان داده می‌شد ولی غیرفعال**، با برچسبِ «Express» — چون مدیر باید ببیند
// کلِ پنل چند بخش دارد و کدام‌شان آماده است. پنهان‌کردنشان یعنی او فکر کند
// پنل ناقص است، یا بدتر: فکر کند همان ۱۳ نمای Express همه اینجا هم هستند و
// بی‌دلیل دنبالشان بگردد.
//
// حالا هر ۱۳ بخش منتقل شده و این شاخه هیچ‌وقت اجرا نمی‌شود — عمداً می‌ماند،
// چون با یک `href: null` دیگر (نمای چهاردهم، یا برگشتیِ موقتی به Express)
// دوباره همان رفتارِ درست را می‌دهد و هیچ کامپوننتی لازم نیست عوض شود.
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
// نوعِ بازگشتی `readonly` است چون منبعش (`ADMIN_SECTIONS`) با `as const`
// ساخته می‌شود — و درست هم همین است: نوار نباید هیچ‌وقت فهرستِ بخش‌ها را
// دست‌کاری کند، فقط بخواند.
function sectionsFor(role: PanelRole): readonly AdminSection[] {
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
// فهرستِ کامل را در یک شبکه‌ی دوستونه باز می‌کند. هیچ بخشی پنهان نمی‌ماند.
// (ارتفاعِ هر ردیف از ۴۴ به ۴۸ رسید چون آیکون هم داخلش آمد.)
//
// ============================================================
// دسکتاپ هم سرریز بود — فقط کسی اندازه‌اش را نگرفته بود
// ============================================================
// نوارِ دسکتاپ `max-w-[1180px]` است و ۱۳ بخش، با پدینگِ ۱۲ پیکسلیِ هر طرف،
// می‌شد ۱۲۴۲ پیکسل؛ به‌علاوه‌ی ۴۸ پیکسل فاصله‌ها (۱۲ درز × ۴) و ۴۸ پیکسل
// پدینگِ خودِ نوار = **۱۳۳۶ پیکسل**. یعنی ۱۵۶ پیکسل بیشتر از ظرف.
//
// آن نوار `overflow-x-auto` داشت، پس «کار می‌کرد» — ولی بخشِ سیزدهم
// («وضعیت سیستم»، در RTL سمتِ چپ) بیرون از کادر می‌افتاد و بدونِ اسکرولِ
// افقی دیده نمی‌شد؛ و هیچ نشانه‌ای هم نبود که این نوار اسکرول می‌شود.
//
// سه تغییر، و همه اندازه‌گیری‌شده: پدینگِ ردیف‌ها ۱۲→۸ پیکسل، فونت یک پله
// کوچک‌تر (۱۳ پیکسل)، و `overflow-x-auto` جایش را به `flex-wrap` داد. حالا اگر
// روزی یک بخشِ چهاردهم اضافه شود یا پنجره باریک‌تر از آن باشد، نوار **می‌شکند**
// نه اینکه ببرد.
//
// ⚠️ همین اندازه‌گیری یعنی دسکتاپ **بیرونِ حاشیه‌ی امن نیست**: شکاف بین ۱۱۸۰
// و مجموعِ بخش‌ها حدود ۲۰۰ پیکسل است. پس آیکون‌ها عمداً فقط در فهرستِ موبایل
// آمدند — آیکونِ ۱۴ پیکسلی با فاصله‌اش، ضربدرِ ۱۳، حدود ۲۳۴ پیکسل است و نوار
// را به ردیفِ دوم می‌شکند. برای تشخیصِ بصری، همان قرصِ توپُرِ بخشِ جاری کافی
// است (و در RTL، بخشِ جاری با رنگِ خودش از بقیه جدا می‌شود).
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
    <nav aria-label="بخش‌های پنل مدیریت" className="border-t" style={{ borderColor: "var(--color-line)" }}>
      {/* ---------- موبایل: بخشِ جاری + دکمه‌ی فهرست ---------- */}
      <div className="lg:hidden">
        {/* `py-1.5` و نه `py-2`: این نوار با `sticky` بالای صفحه می‌ماند و
            روی موبایل هر پیکسلِ ارتفاعش از دیدِ محتوا کم می‌کند. ارتفاعِ خود
            دکمه‌ها دست‌نخورده است (۴۰ پیکسل، همان اندازه‌ی لمسی). */}
        <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-4 py-1.5">
          {current && (
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-[9px]"
                style={{
                  background: "var(--color-teal-tint)",
                  color: "var(--color-teal)",
                }}
                aria-hidden="true"
              >
                <Icon name={current.icon} size={13} />
              </span>
              <span
                className="truncate text-sm font-bold"
                style={{ color: "var(--color-teal)" }}
              >
                {current.label}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="admin-section-menu"
            className="mr-auto flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold whitespace-nowrap"
            style={{
              background: open ? "var(--color-teal-tint)" : "var(--color-surface-2)",
              color: open ? "var(--color-teal)" : "var(--color-ink-soft)",
              border: "1px solid var(--color-line)",
            }}
          >
            بخش‌ها
            <Icon
              name="chevronDown"
              size={13}
              className="transition-transform duration-200"
              style={{ transform: open ? "rotate(180deg)" : undefined }}
            />
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
                      className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-xs font-medium"
                      style={{
                        background: "var(--color-surface-2)",
                        color: "var(--color-ink-dim)",
                        opacity: 0.7,
                      }}
                    >
                      <Icon name={section.icon} size={15} />
                      {section.label}
                      <span
                        className="mr-auto rounded-full px-1.5 py-px text-[9px] font-bold"
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
                    className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-xs font-bold"
                    style={
                      active
                        ? {
                            background: "var(--color-teal-tint)",
                            color: "var(--color-teal)",
                            boxShadow: "inset 0 0 0 1px rgba(37, 214, 176, 0.35)",
                          }
                        : {
                            background: "var(--color-surface-2)",
                            color: "var(--color-ink-soft)",
                          }
                    }
                  >
                    <Icon name={section.icon} size={15} />
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
      <ul className="mx-auto hidden max-w-[1180px] flex-wrap items-center gap-1 px-6 py-1.5 text-[13px] lg:flex">
        {sections.map((section) => {
          if (section.href === null) {
            return (
              <li key={section.key}>
                <span
                  aria-disabled="true"
                  title={`«${section.label}» هنوز به نسخه‌ی Next منتقل نشده — فعلاً از پنل Express استفاده کنید`}
                  className="flex shrink-0 cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 font-medium"
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
                // رنگِ حالتِ فعال **درون‌خطی** است، پس کلاس‌های `hover:` رویش
                // اثر نمی‌کنند — یعنی بخشِ جاری با هاور بی‌دلیل تغییر نمی‌کند و
                // فقط بقیه واکنش می‌دهند. این عمدی است.
                className="block shrink-0 whitespace-nowrap rounded-full px-2 py-1.5 font-medium transition-colors hover:bg-surface-2 hover:text-ink"
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, var(--color-teal), var(--color-teal-dark))",
                        color: "#04211B",
                        fontWeight: 800,
                        boxShadow: "0 10px 22px -16px rgba(37, 214, 176, 0.9)",
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
