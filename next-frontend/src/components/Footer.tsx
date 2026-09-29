import Link from "next/link";
import { FooterYear } from "@/components/FooterYear";
import { Icon } from "@/components/Icon";

// ============================================================
// پاورقی — همتای `<footer class="site">` نسخه‌ی Express
// ============================================================
// چرا بازنویسی شد: نسخه‌ی قبلیِ Next یک پاورقی «کوتاه‌شده» بود و **شماره‌ی
// تماس، آدرس و راه‌های ارتباطیِ مغازه را کامل از دست داده بود**. یعنی مشتریِ
// نسخه‌ی Next هیچ راهی نداشت تلفن یا آدرس فروشگاه را پیدا کند — در حالی که
// عمده‌فروش و مشتریِ محلی دقیقاً برای همین به پاورقی نگاه می‌کند. لینک‌های
// شبکه‌های اجتماعی (واتساپ) هم غایب بودند.
//
// ساختار چهارستونی و متن‌ها عیناً از frontend/index.html آمده‌اند (‏`footer-grid`)،
// و فقط رنگ/فاصله‌ها به زبانِ Tailwind این پروژه برگردانده شده‌اند.
//
// دو نکته‌ی صادقانه:
//   • اینستاگرام و تلگرام در نسخه‌ی Express هم `href="#"` هستند (جای‌خالیِ
//     پرنشده، نه لینکِ واقعی). اینجا هم دست‌نخورده مانده‌اند تا مقصدی از خودمان
//     اختراع نکنیم؛ وقتی آدرسِ واقعی را دادید، فقط همین دو خط عوض می‌شود.
//   • سال دیگر در JSX نوشته نمی‌شود: `<FooterYear />` آن را در مرورگر حساب
//     می‌کند (همتای initFooterYear)، پس هیچ‌وقت عقب نمی‌ماند.

const PHONE_DISPLAY = "۰۹۱۱-۳۵۶-۷۴۰۹";
const PHONE_HREF = "tel:09113567409";
const WHATSAPP_HREF = "https://wa.me/989113567409";
const ADDRESS = "ساری، بلوار کشاورز، قبل از مسجد صاحب‌الزمان، مغازه پلاسکو گلی";

const SOCIAL = [
  { name: "instagram" as const, href: "#", label: "اینستاگرام" },
  { name: "telegram" as const, href: "#", label: "تلگرام" },
  { name: "whatsapp" as const, href: WHATSAPP_HREF, label: "واتساپ" },
  { name: "phone" as const, href: PHONE_HREF, label: "تماس" },
];

const COLUMNS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: "فروشگاه",
    items: [
      { label: "خانه", href: "/" },
      { label: "محصولات", href: "/products" },
      { label: "درباره ما", href: "/#about" },
      { label: "سوالات متداول", href: "/#faq" },
      { label: "قوانین و راهنمای خرید", href: "/terms" },
    ],
  },
  {
    title: "حساب کاربری",
    items: [
      { label: "سبد خرید", href: "/cart" },
      { label: "ورود / ثبت‌نام", href: "/login" },
      { label: "پیگیری سفارش", href: "/#track" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      className="border-t mt-auto"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-line-strong)",
      }}
    >
      <div className="mx-auto max-w-[1180px] px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-9">
          {/* ستونِ معرفی */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- لوگوی ۴۸px که از rewrite مسیر /picture سرو می‌شود */}
                <img
                  src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jpg"
                  alt="لوگوی پلاسکو گلی"
                  width={48}
                  height={48}
                  className="h-12 w-12 object-cover"
                />
              </span>
              <span className="text-base font-extrabold" style={{ color: "var(--color-ink)" }}>
                پلاسکو گلی
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
              فروشگاه محله‌ای لوازم پلاستیکی خانه؛ جنس اصل، قیمت منصفانه، مشاوره‌ی
              صادقانه.
            </p>

            <div className="mt-5 flex gap-2.5">
              {SOCIAL.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  {...(s.href.startsWith("http")
                    ? { target: "_blank", rel: "noopener" }
                    : {})}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                  style={{
                    border: "1px solid var(--color-line)",
                    color: "var(--color-ink-soft)",
                  }}
                >
                  <Icon name={s.name} size={17} />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-bold mb-4" style={{ color: "var(--color-ink)" }}>
                {col.title}
              </h4>
              <ul className="flex flex-col gap-2.5 text-xs" style={{ color: "var(--color-ink-soft)" }}>
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="hover:text-teal transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* ستونِ ارتباط با ما — همان چیزی که در نسخه‌ی Next کامل غایب بود */}
          <div>
            <h4 className="text-sm font-bold mb-4" style={{ color: "var(--color-ink)" }}>
              ارتباط با ما
            </h4>
            <ul className="flex flex-col gap-2.5 text-xs" style={{ color: "var(--color-ink-soft)" }}>
              <li>
                <a href={PHONE_HREF} dir="ltr" className="hover:text-teal transition-colors">
                  {PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <Link href="/#contact" className="hover:text-teal transition-colors">
                  {ADDRESS}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-8 pt-6 border-t flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{
            borderColor: "var(--color-line)",
            color: "var(--color-ink-dim)",
          }}
        >
          <FooterYear />
          <span>ساخته‌شده با ❤ برای پلاسکو گلی</span>
        </div>
      </div>
    </footer>
  );
}
