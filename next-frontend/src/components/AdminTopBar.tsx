"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { PanelRole } from "@/components/admin/NoAccess";

// ============================================================
// نوارِ بالای پنل — برند + راهِ برگشت به فروشگاه
// ============================================================
// چرا این فایل وجود دارد: تا امروز پنل دو چیزِ متناقض داشت — چارچوبِ کاملِ
// فروشگاه (هدر با جستجو و سبد و «دسته‌بندی کالا» و نوارِ مشتریان) **و** نوارِ
// بخش‌های پنل. یعنی مدیر هم بالای سرش تبلیغِ خرید داشت و هم نوارِ کارِ خودش را
// گم می‌کرد. حالا چارچوبِ فروشگاه در همه‌ی مسیرهای `/admin` پنهان است
// (`HideOnStandalone`) و به‌جایش همین نوار می‌آید: برند، و یک دکمه‌ی روشنِ
// «بازگشت به صفحه سایت».
//
// چرا «بازگشت به صفحه سایت» و نه «بازگشت به فروشگاه»: همان واژه‌ای که خودِ
// کاربر به کار برد. مقصدش `/` است — یعنی همان صفحه‌ی اصلیِ فروشگاه، نه صفحه‌ی
// ورود (که برای مدیرِ واردشده بی‌معنی است) و نه تاریخچه‌ی مرورگر.
//
// چرا دکمه‌ی پررنگ و نه یک لینکِ ساده: این نوار با `sticky` بالای صفحه می‌ماند،
// پس کاربر همیشه یک راهِ یک‌کلیکی برای دیدنِ نتیجه‌ی کارش دارد — «قیمت را عوض
// کردم، ببینم در فروشگاه چه شکلی است». لینکِ کم‌رنگ وسطِ نوارِ پنل، همان چیزی
// است که دیده نمی‌شود.
//
// `use client` چون `PanelRole` از `NoAccess` می‌آید و آن فایل کلاینتی است؛ ولی
// مهم‌تر: این کامپوننت فقط نمایش است و هیچ داده‌ای نمی‌گیرد — پوسته‌ی سروری
// (`app/admin/layout.tsx`) هدرهای `x-panel-*` را می‌خواند و به‌صورت prop
// می‌دهد، پس قاعده‌ی دسترسی هنوز در یک جا تصمیم گرفته می‌شود.

/** شماره‌ی تماسِ مدیر — فقط نمایشی، برای اینکه معلوم باشد با کدام حساب داخل است */
function PhoneChip({ phone }: { phone: string }) {
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold lg:inline-flex"
      dir="ltr"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-line)",
        color: "var(--color-ink-dim)",
      }}
      title="شماره‌ی حسابی که با آن وارد شده‌اید"
    >
      <Icon name="user" size={12} />
      {phone}
    </span>
  );
}

export function AdminTopBar({
  role = "unknown",
  phone = "",
}: {
  role?: PanelRole;
  phone?: string;
}) {
  return (
    <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-6">
      {/* ---------- برند ---------- */}
      {/* مقصدش `/admin` است: «لوگو = خانه‌ی همین بخش»، همان قاعده‌ای که در
          فروشگاه هم هست و مدیر نباید برایش فکر کند. */}
      <Link
        href="/admin"
        className="flex min-w-0 items-center gap-2.5"
        aria-label="پنل مدیریت پلاسکو گلی"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px]"
          style={{
            background: "linear-gradient(150deg, var(--color-teal), var(--color-teal-dark))",
            color: "#04211B",
            boxShadow: "0 10px 22px -14px rgba(37, 214, 176, 0.95)",
          }}
          aria-hidden="true"
        >
          <Icon name="dashboard" size={18} />
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-[13px] font-extrabold leading-tight"
            style={{ color: "var(--color-ink)" }}
          >
            پنل مدیریت
          </span>
          <span
            className="hidden truncate text-[10px] leading-tight sm:block"
            style={{ color: "var(--color-ink-dim)" }}
          >
            پلاسکو گلی
          </span>
        </span>
      </Link>

      {/* ---------- سمتِ چپ: حساب + برگشت به فروشگاه ---------- */}
      <div className="flex shrink-0 items-center gap-2">
        {phone && <PhoneChip phone={phone} />}

        {/* کارمند برچسبِ نقشش را در *نوار* می‌بیند (نسخه‌ی متنی‌اش آنجاست که
            فهرستِ کوتاهِ او توضیح لازم دارد). اینجا فقط یک نقطه‌ی رنگی می‌آید
            تا معلوم باشد «حسابِ تو کارمند است» بدونِ اینکه دو بار گفته شود. */}
        {role === "staff" && (
          <span
            className="hidden h-2 w-2 rounded-full sm:block"
            style={{ background: "var(--color-gold)" }}
            title="حساب شما کارمند است — فقط بخش سفارش‌ها"
            aria-hidden="true"
          />
        )}

        <Link
          href="/"
          title="بازگشت به صفحه‌ی سایت پلاسکو گلی"
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-extrabold transition duration-200 hover:-translate-y-px hover:brightness-110 active:translate-y-0 sm:gap-2 sm:px-4 sm:text-xs"
          style={{
            background: "linear-gradient(135deg, var(--color-teal), var(--color-teal-dark))",
            color: "#04211B",
            boxShadow: "0 12px 26px -14px rgba(37, 214, 176, 0.85)",
          }}
        >
          <Icon
            name="home"
            size={15}
            className="transition-transform duration-200 group-hover:-translate-x-0.5"
          />
          <span className="hidden sm:inline">بازگشت به صفحه سایت</span>
          <span className="sm:hidden">صفحه سایت</span>
        </Link>
      </div>
    </div>
  );
}
