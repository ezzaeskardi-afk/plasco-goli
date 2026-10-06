import type { CSSProperties, ReactNode } from "react";

// ============================================================
// آیکون‌های مشترک — آینه‌ی `public/assets/icons.svg`
// ============================================================
// چرا این کامپوننت وجود دارد: نسخه‌ی Express یک اسپرایت (symbol/sprite) داشت و
// هر صفحه با `<svg><use href="#i-truck"/></svg>` آیکون را صدا می‌زد. در Next
// استفاده از `<use href="/assets/icons.svg#i-truck">` هم ممکن است ولی یک
// درخواستِ دوم و وابستگیِ زمانِ اجرا می‌آورد؛ پس مسیرها را همان‌جا داخلِ خود
// صفحه می‌گذاشتیم — که با پنج بخشِ تازه (پاورقی، دراور، درباره، سوالات، تماس)
// یعنی همان مسیر در چند فایل تکرار شود.
//
// این فایل **یک منبعِ حقیقت** است: مسیرها نویسه‌به‌نویسه از همان اسپرایت
// برداشته شده‌اند و `stroke-width`/`fill` دست‌کاری نشده‌اند. اگر روزی آیکونی
// در اسپرایت عوض شود، تغییرش فقط همین‌جاست. (نگهبانِ `shellParity.test.ts`
// نبودِ هیچ آیکونِ لازم را می‌گیرد.)

const ICONS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 11l9-8 9 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  package: (
    <>
      <path d="M3 8l9-5 9 5-9 5-9-5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="21" r="1.4" fill="currentColor" />
      <circle cx="17" cy="21" r="1.4" fill="currentColor" />
    </>
  ),
  heart: (
    <path d="M12 20.5S4 15.2 4 9.6A4.4 4.4 0 0 1 8.4 5.2c1.6 0 3 .9 3.6 2.1.6-1.2 2-2.1 3.6-2.1A4.4 4.4 0 0 1 20 9.6c0 5.6-8 10.9-8 10.9z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  close: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  chevronDown: (
    <path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  arrowRight: (
    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20.8 3.6v3.8H17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  truck: (
    <>
      <path d="M2 7h11v9H2zM13 11h5l3 3v2h-8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="18" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // ---------- آیکون‌های پنلِ مدیریت ----------
  // همان مسیرهای `i-dashboard`/`i-chart`/`i-settings`/`i-alert`/`i-history`
  // در `public/assets/icons.svg` — نویسه‌به‌نویسه، فقط با نام‌گذاریِ camelCase
  // (اسپرایت `stroke-linecap` دارد، JSX `strokeLinecap`).
  //
  // چرا کپی و نه `<use>`: اسپرایت در زمانِ اجرا با `IconSprite` تزریق می‌شود و
  // تا رسیدنش آیکونِ خالی دیده می‌شود؛ نوارِ پنل نباید به آن مسابقه ببازد.
  dashboard: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="3" width="8" height="5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="10" width="8" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 20h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3v2.4M12 18.6V21M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 18H2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.2 3.6v3.8h3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.6V12l3.2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 12l2.3 2.3L15.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.5l2.5 2.5L16 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  check: (
    <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  tag: (
    <>
      <path d="M12.6 2H4v8.6L14.4 21l8.6-8.6L12.6 2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </>
  ),
  phone: (
    <path d="M6 3h3l2 5-2.5 1.8a12 12 0 0 0 5.7 5.7L16 13l5 2v3a2 2 0 0 1-2 2C10.6 20 4 13.4 4 5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  ),
  pin: (
    <>
      <path d="M12 22s7-7.4 7-12.6A7 7 0 0 0 5 9.4C5 14.6 12 22 12 22z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="9.4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  note: (
    <>
      <path d="M5 3.6h9.5L19 8.1V20.4H5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14.2 3.8V8.4H18.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 12.5h8M8 16h5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </>
  ),
  telegram: (
    <path d="M21 4L2.5 11.3c-1 .4-1 1.4.1 1.7l4.6 1.4 1.7 5.4c.2.7 1.1.9 1.6.4l2.5-2.4 4.7 3.5c.7.5 1.6.1 1.8-.7L22 5.2c.2-.9-.6-1.6-1-1.2z" fill="currentColor" />
  ),
  whatsapp: (
    <>
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2z" fill="currentColor" />
      <path d="M8.4 7.6c.3-.6.5-.6.8-.6h.6c.2 0 .5 0 .7.5.3.6.9 2 1 2.1.1.2.1.4 0 .6-.2.3-.3.4-.5.6-.2.2-.4.4-.2.8.3.5 1.1 1.6 2.3 2.5 1.5 1.2 2.2 1.3 2.5 1.4.3.1.5 0 .7-.2.2-.3.7-.9.9-1.2.2-.3.4-.2.7-.1.3.1 2 1 2.4 1.1.3.2.5.2.6.4.1.2.1 1-.3 1.9-.4.9-2.1 1.7-2.9 1.8-.7.1-1.5.2-4.9-1.1-4-1.6-6.5-5.7-6.7-6-.2-.2-1.5-2-1.5-3.8s1-2.7 1.4-3.1z" fill="#fff" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

/** نامِ همه‌ی آیکون‌های موجود — برای نگهبانِ برابری و آزمون‌ها. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/**
 * شناسه‌ی آیکونی که سرور می‌فرستد (مثلاً `i-tub` در دسته‌بندی‌ها).
 *
 * اعتبارسنجی لازم است چون این رشته از API می‌آید و داخل `href` می‌نشیند؛
 * شکلِ مجاز سخت‌گیرانه گرفته می‌شود تا نه فاصله و نه نویسه‌ی خاصی رد شود.
 */
export function spriteIconId(raw: unknown): string | null {
  const id = String(raw ?? "");
  return /^i-[a-z0-9-]{1,32}$/.test(id) ? id : null;
}

/**
 * آیکون از اسپرایتِ تزریق‌شده (`IconSprite`) — برای تصویرسازی‌های ۴۸×۴۸
 * دسته‌بندی‌ها که در قالبِ ۲۴×۲۴ این فایل جا نمی‌شوند.
 *
 * اگر `id` نامعتبر باشد هیچ چیزی رندر نمی‌شود، نه یک `<use>` شکسته: مرورگر
 * برای fragmentِ ناموجود مربعِ خالی می‌کشد.
 */
export function SpriteIcon({
  id,
  size = 40,
  className,
}: {
  id: unknown;
  size?: number;
  className?: string;
}) {
  const safe = spriteIconId(id);
  if (!safe) return null;
  return (
    <svg aria-hidden="true" width={size} height={size} className={className}>
      <use href={`#${safe}`} />
    </svg>
  );
}

export function Icon({
  name,
  className,
  size,
  style,
}: {
  name: IconName;
  className?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      style={style}
    >
      {ICONS[name]}
    </svg>
  );
}
