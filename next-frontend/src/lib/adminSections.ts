// ============================================================
// بخش‌های پنل مدیریت — یک‌منبعِ حقیقت
// ============================================================
// این آرایه نوارِ ناوبریِ `app/admin/layout.tsx` و پانویسِ همان پوسته را
// می‌سازد. یک‌جا بودنشان دلیل دارد: قبلاً نوار و صفحه‌ی راهنما هر کدام فهرستِ
// خودشان را داشتند و امکان نداشت واگرا نشوند.
//
// ترتیب عیناً همان ترتیبِ نوارِ پنلِ قدیمیِ Express است (حذف‌شده)، تا
// مدیر مجبور نشود جای بخش‌ها را از نو یاد بگیرد.
//
// `href: null` یعنی «این نما هنوز به Next منتقل نشده». روزی که نمایی منتقل شد،
// فقط `href` همین‌جا پر می‌شود و نوار و پانویس هر دو با هم به‌روز می‌شوند —
// جای دیگری نباید دست بخورد.
//
// **وضعیت فعلی: ۱۳ از ۱۳ منتقل شده.** هیچ `href: null`‌یی نمانده، پس نه برچسبِ
// «Express» در نوار پیدا می‌شود و نه پانویسِ وضعیتِ مهاجرت (هر دو به همین
// مقادیر شرطی‌اند و با پر شدنِ آخرین `href` خودشان ناپدید شدند).
//
// پس `PENDING_SECTIONS` عمداً می‌ماند: پوسته و پانویس با `length === 0`
// کارِ درست را می‌کنند، و اگر روزی نمایی به Express برگشت یا نمای چهاردهمی
// اضافه شد، فقط یک `href: null` لازم است — بدونِ بازنویسیِ هیچ کامپوننتی.
//
// نکته‌ی مهاجرت: `key` عیناً همان `data-view` نسخه‌ی Express است، چون تاریخچه
// و پیوندهای قدیمی به همان اشاره می‌کنند. ولی `href` نامِ مسیرِ **طبیعیِ Next**
// است و لازم نیست با کلید یکی باشد (مثلاً کلیدِ `log` → `/admin/activity`،
// همنامِ خودِ endpoint).
//
// نکته: این فایل هیچ‌وقت به ادمین بودنِ کاربر کاری ندارد. مجوزِ واقعی سمتِ
// Express اعمال می‌شود و از اینجا قابل دور زدن نیست (middleware.ts هم فقط
// «واردشده بودن» را چک می‌کند). نمای منتقل‌نشده هم اگر کسی آدرسش را دستی بزند
// به ۴۰۴ می‌رسد، نه به یک نوارِ نیمه‌کاره.

import type { IconName } from "@/components/Icon";

export interface AdminSection {
  /** کلیدِ نما در نسخه‌ی Express — همان `data-view` */
  key: string;
  label: string;
  /** مسیر در Next — `null` یعنی هنوز منتقل نشده */
  href: string | null;
  /** یک‌خطی: این نما چه کاری می‌کند */
  hint: string;
  /**
   * آیکونِ بخش — در نوارِ پنل و در سرصفحه‌ی خودِ صفحه.
   *
   * چرا اینجا و نه در هر کامپوننت: آیکون و برچسب یک چیز را می‌گویند، پس
   * نباید دو جا تعریف شوند — همان دلیلی که خودِ این فایل وجود دارد. نوعش
   * همان `IconName` است تا نامِ تایپوییِ آیکون در `tsc` بگیرد، نه در مرورگر.
   */
  icon: IconName;
}

// `as const` + `satisfies` هر دو لازمند و کارشان جداست:
//   • `satisfies readonly AdminSection[]` یعنی هر ردیف باید همان شکلِ قبلی
//     را داشته باشد — اگر روزی فیلدی جا بیفتد یا نامش غلط شود، `tsc` می‌گیرد.
//   • `as const` یعنی `key` یک **متنِ ثابت** می‌ماند، نه `string`. از همین
//     یکی است که `AdminSectionKey` (پایین‌تر) ساخته می‌شود — و از همان یکی
//     است که `sectionKey="…"` در صفحه‌ها با نامِ غلط در `tsc` می‌ترکد، نه با
//     یک صفحه‌ی سفیدِ بی‌صدا در زمانِ اجرا.
export const ADMIN_SECTIONS = [
  {
    key: "dash",
    label: "داشبورد",
    href: "/admin",
    hint: "فروش، سفارش‌های باز، هشدارها و رویدادهای اخیر",
    icon: "dashboard",
  },
  {
    key: "orders",
    label: "سفارش‌ها",
    href: "/admin/orders",
    hint: "تغییر وضعیت، کد رهگیری، یادداشت، لغو و مرجوعی",
    icon: "cart",
  },
  {
    key: "stock",
    label: "انبار و کالا",
    href: "/admin/stock",
    hint: "ویرایش قیمت و موجودی، انتشار و برداشتنِ کالا",
    icon: "package",
  },
  {
    key: "people",
    label: "مشتری‌ها",
    href: "/admin/people",
    hint: "فهرست مشتریان با آمار خرید، جستجو، صفحه‌بندی و نقش کارمند",
    icon: "user",
  },
  {
    key: "crm",
    label: "CRM مشتریان",
    href: "/admin/crm",
    hint: "امتیاز RFM، سگمنت‌های هوشمند، یادداشت و پیگیری",
    icon: "heart",
  },
  {
    key: "reviews",
    label: "نظرات",
    href: "/admin/reviews",
    hint: "تأیید یا رد دیدگاه‌های خریداران",
    icon: "checkCircle",
  },
  {
    key: "coupons",
    label: "تخفیف‌ها",
    href: "/admin/coupons",
    hint: "کد تخفیف درصدی یا ثابت با سقف و تاریخ انقضا",
    icon: "tag",
  },
  {
    key: "wholesale",
    label: "عمده‌فروشی",
    href: "/admin/wholesale",
    hint: "صفِ تماسِ درخواست‌های خرید عمده (B2B)",
    icon: "truck",
  },
  {
    key: "report",
    label: "گزارش‌ها",
    href: "/admin/reports",
    hint: "نمودار فروش، محصولات برتر، سهم دسته‌بندی‌ها و گزارش ماه‌به‌ماه",
    icon: "chart",
  },
  {
    key: "config",
    label: "تنظیمات",
    href: "/admin/settings",
    hint: "هزینه ارسال، پیام اطلاعیه، بنر جشنواره، تعطیلی موقت فروشگاه",
    icon: "settings",
  },
  {
    key: "log",
    label: "رویدادها",
    href: "/admin/activity",
    hint: "تایم‌لاین کاملِ کارهای انجام‌شده",
    icon: "history",
  },
  {
    key: "errors",
    label: "خطاها",
    href: "/admin/errors",
    hint: "خطاهای گروه‌بندی‌شده‌ی سرور با جزئیاتِ فنی",
    icon: "alert",
  },
  {
    key: "system",
    label: "وضعیت سیستم",
    href: "/admin/system",
    hint: "متریک سرور، سلامت دیتابیس، بکاپ‌ها",
    icon: "shield",
  },
] as const satisfies readonly AdminSection[];

/**
 * کلیدهای معتبرِ یک بخش — «یکی از این‌ها»، نه یک رشتهٔ آزاد.
 *
 * کاربرش `AdminPage` است: صفحه‌ی `/admin/stock` می‌نویسد `sectionKey="stock"`
 * و اگر روزی نامِ کلید عوض شود، `tsc` همان ۱۳ صفحه را نام می‌برد — به‌جای
 * اینکه مدیر یک سرصفحه‌ی بی‌آیکون ببیند و کسی نفهمد چرا.
 */
export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number]["key"];

/**
 * همان ردیف‌ها، ولی با نوعِ عریض‌شده (`href: string | null`).
 *
 * چرا: با `as const` مقدارِ `href` هر ردیف یک متنِ ثابت است و TS مقایسه‌اش با
 * `null` را «بی‌معنی» می‌داند («این شرط هیچ‌وقت درست نمی‌شود») — درست هم
 * می‌گوید، ولی همان شرط است که `PENDING_SECTIONS` را می‌سازد. این متغیر همان
 * داده را با نوعِ قرارداد (`AdminSection`) نگه می‌دارد و بحث را تمام می‌کند.
 */
const ALL: AdminSection[] = [...ADMIN_SECTIONS];

const BY_KEY = new Map<string, AdminSection>(ADMIN_SECTIONS.map((s) => [s.key, s]));

/** بخش با کلیدش — `null` یعنی چنین بخشی نیست (با نوعِ `AdminSectionKey` نباید پیش بیاید) */
export function sectionByKey(key: string): AdminSection | null {
  return BY_KEY.get(key) ?? null;
}

/** بخش‌های آماده در Next — با انتقالِ نمای آخر، این می‌شود همان `ADMIN_SECTIONS` */
export const READY_SECTIONS = ALL.filter((s) => s.href !== null);
/** بخش‌هایی که هنوز در Express کار می‌کنند — فعلاً خالی */
export const PENDING_SECTIONS = ALL.filter((s) => s.href === null);
