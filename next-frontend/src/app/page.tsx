import Link from "next/link";
import { getProducts, getCategories, getShopInfo, getRecentReviews } from "@/lib/api";
import { ProductCardGrid } from "@/components/ProductCard";
import { StarRow } from "@/components/StarRow";
import { StoreJsonLd, WebSiteJsonLd, FAQPageJsonLd, ItemListJsonLd } from "@/components/JsonLd";
import { OrderTrackingSection } from "@/components/home/OrderTracking";
import { Icon, SpriteIcon, type IconName } from "@/components/Icon";
import { HOME_FAQ } from "@/lib/faq";
import { pageSocial } from "@/lib/social";
import { RecentlyViewed } from "@/components/home/RecentlyViewed";
import { PromoBanner } from "@/components/home/PromoBanner";
import type { Metadata } from "next";
import type { Product, ShopCategory } from "@/lib/types";

// ISR — بدونِ این خط صفحه‌ی اصلی فقط یک بار موقعِ build ساخته می‌شد و برای
// همیشه یخ می‌زد: محصولِ جدید، تغییرِ قیمت، بنرِ جشنواره و دسته‌بندیِ تازه
// هیچ‌وقت دیده نمی‌شد تا نوبتِ build بعدی. برای یک فروشگاه یعنی صفحه‌ی اولِ
// اشتباه. پنج دقیقه معامله‌ی معقولی است بین تازگی و بارِ سرور.
export const revalidate = 300;

// ============================================================
// سئوی صفحه‌ی اصلی — عیناً همان عنوان/توضیحِ `frontend/index.html`
// ============================================================
// صفحه‌ی اصلی تا امروز هیچ `metadata`‌ای نداشت و به مقدارِ پیش‌فرضِ layout
// تکیه می‌کرد: عنوانِ کوتاه‌ترِ «پلاسکو گلی — فروشگاه محصولات پلاستیکی» و
// توضیحِ عمومی. یعنی صفحه‌ی ورودیِ سایت — همان صفحه‌ای که باید روی
// «لوازم پلاستیکی خانه» رتبه بگیرد — از متنِ کلیدواژه‌دارِ نسخه‌ی Express
// محروم مانده بود، در حالی که هر دو فرانت‌اند روی یک دامنه دیده می‌شوند.
//
// `absolute` عمدی است: templateِ ریشه «%s | پلاسکو گلی» است و اگر عنوان را
// ساده می‌گذاشتیم، نامِ برند دو بار تکرار می‌شد.
export const metadata: Metadata = {
  title: {
    absolute:
      "پلاسکو گلی | فروشگاه آنلاین لوازم پلاستیکی خانه و آشپزخانه",
  },
  description:
    "خرید آنلاین لوازم پلاستیکی خانه از پلاسکو گلی؛ تشت، صندلی، ظروف نگهداری، سبد لباس و لوازم آشپزخانه با جنس اصل، قیمت منصفانه، ارسال سریع و پرداخت امن زرین‌پال.",
  alternates: { canonical: "/" },
  // متن‌های اشتراک‌گذاری عیناً از `index.html`. دو تفاوتِ ریز که در همان فایل
  // بود و این‌جا حفظ می‌شود: (۱) og:title **و** twitter:title کوتاه‌تر از
  // `<title>`اند («…خانه» در برابر «…خانه و آشپزخانه»)، (۲) توضیحِ twitter با
  // توضیحِ og فرق می‌کند. پس عمداً `twitterTitle` داده نمی‌شود تا از همان
  // عنوانِ og استفاده شود — همان چیزی که `index.html` داشت.
  ...pageSocial({
    path: "/",
    title: "پلاسکو گلی | فروشگاه آنلاین لوازم پلاستیکی خانه",
    description:
      "از تشت و صندلی تا هر چیزی که یک خانه برای زندگی روزمره لازم دارد؛ جنس اصل، قیمت منصفانه، ارسال سریع و پرداخت امن.",
    twitterDescription:
      "خرید آنلاین لوازم پلاستیکی خانه؛ جنس اصل، قیمت منصفانه، ارسال سریع.",
  }),
};

// ============================================================
// SSR — داده‌ها موقع رندر سرور گرفته می‌شوند
// ============================================================
async function getHomepageData() {
  const [productsRes, categories, shopInfo, recentReviews] = await Promise.all([
    getProducts({ sort: "newest", page: 1 }).catch(() => null),
    getCategories().catch(() => []),
    getShopInfo().catch(() => null),
    getRecentReviews().catch(() => ({ reviews: [] })),
  ]);

  return {
    products: productsRes?.products?.slice(0, 10) || [],
    categories,
    shopInfo,
    recentReviews: recentReviews?.reviews?.slice(0, 6) || [],
  };
}

// ============================================================
// کامپوننت‌های صفحه
// ============================================================

function HeroSection() {
  return (
    <section id="home" className="relative overflow-hidden py-16 md:py-24">
      {/* پس‌زمینهٔ هیرو */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(800px 500px at 50% 0%, rgba(37,214,176,0.1), transparent 70%)",
        }}
      />

      {/* `data-reveal` — همتای همان نشانه در index.html. دیده‌شدنش کار
          `ScrollFx` است؛ بدونِ آن این بخش نامرئی می‌ماند (globals.css). */}
      <div data-reveal="" className="relative mx-auto max-w-[1180px] px-6 text-center">
        <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">
          <span className="text-teal">پلاسکو گلی</span>
          <br />
          <span className="text-ink">فروشگاه محصولات پلاستیکی</span>
        </h1>
        <p className="text-sm md:text-base text-ink-soft max-w-lg mx-auto mb-6 leading-relaxed">
          محصولات پلاستیکی با کیفیت — از جنس مرغوب، با ضمانت اصل بودن کالا و ارسال
          سریع به سراسر کشور
        </p>

        {/* دکمه‌های CTA */}
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-bold transition-all"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              boxShadow: "var(--shadow-glow-teal)",
            }}
          >
            مشاهدهٔ محصولات
            <span className="text-lg">←</span>
          </Link>
          <Link
            href="/wholesale"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-bold transition-all"
            style={{
              background: "transparent",
              color: "var(--color-gold)",
              border: "1.5px solid var(--color-gold)",
            }}
          >
            خرید عمده
          </Link>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// دسته‌بندی‌ها — همتای بخشِ `cat-strip` در index.html
// ============================================================
// قبلاً اینجا یک ردیفِ قرصِ اسکرولی از نامِ دسته‌ها بود. نسخه‌ی Express کارت‌های
// تصویری دارد: شش کارت با آیکونِ رنگی، به‌علاوهٔ عنوان و توضیحِ بخش. تفاوت فقط
// ظاهر نیست — مشتری‌ای که «تشت و لگن» را می‌خواهد با دیدنِ شکلِ آن سریع‌تر
// پیدا می‌کند تا خواندنِ شش نام، و این بخش تنها جایی است که کلِ نقشه‌ی
// دسته‌بندی‌ها را یک‌جا نشان می‌دهد.

function CategoryStrip({ categories }: { categories: ShopCategory[] }) {
  if (!categories.length) return null;

  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-12 scroll-mt-28">
      <div data-reveal="" className="mb-6 max-w-[640px]">
        <Eyebrow>دسته‌بندی‌ها</Eyebrow>
        <h2
          id="cat-title"
          className="text-xl font-extrabold md:text-2xl"
          style={{ color: "var(--color-ink)" }}
        >
          هر گوشه‌ی خانه، یک قفسه‌ی مخصوص خودش
        </h2>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          محصولات را بر اساس نیاز واقعی خانه دسته‌بندی کرده‌ایم تا سریع‌تر چیزی
          که لازم دارید را پیدا کنید.
        </p>
      </div>

      <div
        data-reveal=""
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
      >
        {categories.slice(0, 6).map((cat) => (
          <Link
            key={cat.id}
            href={`/products?category=${encodeURIComponent(cat.name)}`}
            className="rounded-[18px] px-3.5 py-6 text-center text-sm font-bold transition-transform hover:-translate-y-1"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
            }}
          >
            <span
              className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full"
              style={{
                background: "var(--color-surface-2)",
                border: "2px solid rgba(37,214,176,.28)",
              }}
            >
              <SpriteIcon id={cat.icon} size={40} />
            </span>
            {cat.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function BestSellersSection({ products }: { products: Product[] }) {
  return (
    // `id="products"` عمدی است و دو مصرف‌کننده دارد: لنگرِ «محصولات» در نوار
    // پایین موبایل، و ناظرِ کادرِ خوش‌آمد که وقتی مشتری این بخش را دید
    // تایمرِ ۲۵ ثانیه‌اش را مسلح می‌کند (lib/welcome.ts).
    <section id="products" className="mx-auto max-w-[1180px] px-6 pb-16">
      <div data-reveal="" className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-extrabold text-ink">
          <span className="text-gold">★</span> پرفروش‌ترین‌ها
        </h2>
        <Link
          href="/products"
          className="text-sm font-medium text-teal hover:text-teal-dark transition-colors"
        >
          همهٔ محصولات ←
        </Link>
      </div>
      <div data-reveal="">
        <ProductCardGrid products={products} />
      </div>
    </section>
  );
}

// ============================================================
// چرا پلاسکو گلی — همتای بخشِ `feature-grid` در index.html
// ============================================================
// این جایگزینِ `TrustBadges` قبلی است. آن یکی یک بخشِ ساختگی بود که فقط سه
// نشانه‌ی کوتاه نشان می‌داد؛ نسخه‌ی Express چهار کارت با **توضیح** دارد که به
// سوالاتِ واقعیِ مشتری جواب می‌دهد (چه‌قدر طول می‌کشد؟ پولم امن است؟ جنس
// اصل است؟ می‌توانم مرجوع کنم؟). نگه‌داشتنِ هر دو یعنی یک پیام دو بار.

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "truck",
    title: "ارسال سریع",
    text: "سفارش‌های داخل شهر همان روز، شهرستان ۲ تا ۴ روز کاری.",
  },
  {
    icon: "lock",
    title: "پرداخت امن",
    text: "پرداخت آنلاین از طریق درگاه رسمی زرین‌پال با تمام کارت‌های شتاب.",
  },
  {
    icon: "shield",
    title: "ضمانت اصالت",
    text: "همه‌ی محصولات از تولیدکننده‌های معتبر ایرانی انتخاب می‌شوند.",
  },
  {
    icon: "checkCircle",
    title: "۷ روز مرجوعی",
    text: "کالای آسیب‌دیده یا مغایر را تا یک هفته بدون دردسر پس بگیرید.",
  },
];

function FeaturesSection() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-16">
      {/* عنوان فقط برای screen reader است — عیناً `visually-hidden` در Express */}
      <h2 className="sr-only">چرا پلاسکو گلی</h2>
      <div
        data-reveal=""
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-[18px] p-5"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
            }}
          >
            <Icon name={f.icon} size={26} style={{ color: "var(--color-gold)" }} />
            <b className="mt-3.5 mb-1.5 block text-[15px]" style={{ color: "var(--color-ink)" }}>
              {f.title}
            </b>
            <span className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
              {f.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** برچسبِ کوچکِ طلاییِ بالای عنوانِ بخش‌ها — همتای `span.eyebrow`. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mb-3 inline-flex items-center gap-2 text-[11.5px] font-extrabold tracking-wider"
      style={{ color: "var(--color-gold)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--color-gold)" }}
      />
      {children}
    </span>
  );
}

// ============================================================
// درباره‌ی پلاسکو گلی — همتای `#about` در index.html
// ============================================================
// این بخش در Next **کامل غایب** بود، با اینکه پاورقی و منوی موبایلِ خودِ
// Express به `#about` لینک می‌دهند — یعنی یک لینکِ عمومی که در نسخه‌ی Next به
// هیچ‌جا نمی‌رسید.

const VALUES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "shield",
    title: "جنس تضمینی",
    text: "محصولات از تولیدکننده‌های معتبر و باکیفیت انتخاب می‌شوند.",
  },
  {
    icon: "tag",
    title: "قیمت منصفانه",
    text: "بدون واسطه‌ی اضافه، قیمت واقعی و رقابتی.",
  },
  {
    icon: "check",
    title: "مشاوره‌ی صادقانه",
    text: "همیشه چیزی که واقعاً به‌دردتان می‌خورد را پیشنهاد می‌دهیم.",
  },
];

function AboutSection() {
  return (
    <section id="about" className="mx-auto max-w-[1180px] px-6 pb-16 scroll-mt-28">
      <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-14">
        <div
          data-reveal=""
          aria-hidden="true"
          className="overflow-hidden rounded-[26px]"
          style={{ border: "1px solid var(--color-line)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- همتای همان تصویرِ Express؛ next/image اینجا فقط ریسکِ مسیرِ درصدی‌کد‌شده با نامِ فارسی می‌آورد */}
          <img
            src="/picture/products/ست ادویه گردان 8 عددی چوبی.jpg"
            alt=""
            width={921}
            height={682}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>

        <div data-reveal="">
          <Eyebrow>درباره‌ی پلاسکو گلی</Eyebrow>
          <h2
            id="about-title"
            className="mb-4 text-xl font-extrabold md:text-2xl"
            style={{ color: "var(--color-ink)" }}
          >
            مغازه‌ای که با محله‌ش بزرگ شده
          </h2>
          <p
            className="text-sm leading-loose"
            style={{ color: "var(--color-ink-soft)" }}
          >
            پلاسکو گلی از همان روزهای اول با هدف ساده‌ای شروع شد: وسایل پلاستیکی
            خوب و کاربردی، با قیمتی که هر خانواده‌ای بتواند بخرد. هنوز هم همان راه
            را ادامه می‌دهیم؛ انتخاب دقیق جنس، مشاوره‌ی صادقانه و رفتار محترمانه با
            هر مشتری — حالا هم به‌صورت حضوری و هم آنلاین.
          </p>

          <ul className="mt-6 flex flex-col gap-4">
            {VALUES.map((v) => (
              <li key={v.title} className="flex gap-3">
                <Icon
                  name={v.icon}
                  size={22}
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--color-gold)" }}
                />
                <div>
                  <b className="block text-sm" style={{ color: "var(--color-ink)" }}>
                    {v.title}
                  </b>
                  <span className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
                    {v.text}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// سوالات متداول — همتای `#faq` در index.html
// ============================================================
// این بخش در Next نبود، ولی `<FAQPageJsonLd>` داده‌ی ساختاریافته‌اش را می‌فرستاد.
// گوگل برای FAQ صریحاً «محتوای دیده‌شده روی صفحه» می‌خواهد؛ علامت‌گذاریِ نامرئی
// می‌تواند جریمه‌ی اسپم بیاورد. هر دو از `lib/faq.ts` می‌خوانند.

function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-[1180px] px-6 pb-16 scroll-mt-28">
      <div data-reveal="" className="mb-6 text-center">
        <Eyebrow>سوالات متداول</Eyebrow>
        <h2
          id="faq-title"
          className="text-xl font-extrabold md:text-2xl"
          style={{ color: "var(--color-ink)" }}
        >
          هر سوالی دارید، جوابش اینجاست
        </h2>
      </div>

      <div data-reveal="" className="mx-auto flex max-w-[760px] flex-col gap-3.5">
        {HOME_FAQ.map((item) => (
          <details
            key={item.question}
            className="faq-item rounded-[18px]"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
            }}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3.5 py-[20px] px-[22px] text-[15px] font-bold">
              {item.question}
              <span className="faq-icon" aria-hidden="true">
                +
              </span>
            </summary>
            <div
              className="faq-body px-[22px] pb-[20px] text-[14.5px] leading-loose"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {item.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// راه‌های ارتباطی — همتای `#contact` در index.html
// ============================================================
// به‌همراه نقشه: مشتریِ محلی باید بتواند یک‌کلیکی مسیریابی کند. آدرس و شماره
// عیناً همان‌های پاورقی‌اند (یک منبعِ حقیقت ندارند، ولی هر دو از خودِ مغازه
// آمده‌اند و در دو جای صفحه تکرار می‌شوند — همان کاری که Express می‌کرد).

const MAP_QUERY =
  "%D8%B3%D8%A7%D8%B1%DB%8C%20%D8%A8%D9%84%D9%88%D8%A7%D8%B1%20%DA%A9%D8%B4%D8%A7%D9%88%D8%B1%D8%B2%20%D9%85%D8%B3%D8%AC%D8%AF%20%D8%B5%D8%A7%D8%AD%D8%A8%20%D8%A7%D9%84%D8%B2%D9%85%D8%A7%D9%86";

const CONTACT_INFO: { icon: IconName; title: string; text: string; ltr?: boolean }[] = [
  {
    icon: "pin",
    title: "آدرس فروشگاه",
    text: "ساری، بلوار کشاورز، قبل از مسجد صاحب‌الزمان، مغازه پلاسکو گلی",
  },
  { icon: "phone", title: "تماس تلفنی", text: "۰۹۱۱-۳۵۶-۷۴۰۹", ltr: true },
  { icon: "clock", title: "ساعات کاری", text: "شنبه تا پنجشنبه، ۹ صبح تا ۸ شب" },
];

function ContactSection() {
  return (
    <section id="contact" className="mx-auto max-w-[1180px] px-6 pb-16 scroll-mt-28">
      <div data-reveal="" className="mb-6">
        <Eyebrow>راه‌های ارتباطی</Eyebrow>
        <h2
          id="contact-title"
          className="text-xl font-extrabold md:text-2xl"
          style={{ color: "var(--color-ink)" }}
        >
          سر بزنید یا پیام بدید
        </h2>
      </div>

      <div data-reveal="" className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
        <div className="flex flex-col gap-3">
          {CONTACT_INFO.map((c) => (
            <div
              key={c.title}
              className="flex gap-3 rounded-[18px] p-4"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
              }}
            >
              <Icon
                name={c.icon}
                size={22}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--color-gold)" }}
              />
              <div>
                <b className="block text-[14.5px]" style={{ color: "var(--color-ink)" }}>
                  {c.title}
                </b>
                <span
                  className="text-xs leading-relaxed"
                  dir={c.ltr ? "ltr" : undefined}
                  style={{ color: "var(--color-ink-soft)" }}
                >
                  {c.text}
                </span>
              </div>
            </div>
          ))}
        </div>

        <address
          className="not-italic flex flex-col items-center justify-center gap-3 rounded-[26px] p-8 text-center"
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-line)",
          }}
        >
          <Icon name="pin" size={44} style={{ color: "var(--color-teal)" }} />
          <b className="text-[15px]" style={{ color: "var(--color-ink)" }}>
            پلاسکو گلی
          </b>
          <span className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            ساری، بلوار کشاورز، قبل از مسجد صاحب‌الزمان، مغازه پلاسکو گلی
          </span>
          <div className="mt-2 flex flex-wrap justify-center gap-2.5">
            <a
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold"
              target="_blank"
              rel="noopener"
              href={`https://www.google.com/maps/search/?api=1&query=${MAP_QUERY}`}
              style={{ border: "1px solid var(--color-line-strong)", color: "var(--color-ink)" }}
            >
              <Icon name="pin" size={15} /> گوگل‌مپ
            </a>
            <a
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold"
              target="_blank"
              rel="noopener"
              href={`https://balad.ir/search?query=${MAP_QUERY}`}
              style={{ border: "1px solid var(--color-line-strong)", color: "var(--color-ink)" }}
            >
              <Icon name="truck" size={15} /> مسیریابی با بلد
            </a>
          </div>
        </address>
      </div>
    </section>
  );
}

// ============================================================
// حرف مشتری‌ها — دیدگاه‌های واقعیِ تأییدشده (main.js:642)
// ============================================================
function TestimonialsSection({
  reviews,
}: {
  reviews: { id: number; rating: number; body: string; userName: string; isBuyer: boolean }[];
}) {
  // خالی = مخفی؛ ستونِ تعریفِ خالی اعتماد نمی‌سازد
  if (!reviews.length) return null;

  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-16">
      {/* سرتیتر عیناً مثل index.html:403-410 — یک eyebrow + h2 + یک جملهٔ
          شفاف که این‌ها تبلیغ نیستند، دیدگاه‌های ثبت‌شدهٔ زیر محصولات‌اند. */}
      <div data-reveal="" className="mb-6">
        {/* نقطه‌ی طلاییِ Express یک spanِ CSSی است، نه کاراکتر؛ اگر «●» را
            متن بگذاریم در متنِ رندرشده ظاهر می‌شود و Express نداردش. */}
        <Eyebrow>نظر مشتری‌ها</Eyebrow>
        <h2
          id="testi-title"
          className="text-xl md:text-2xl font-extrabold text-ink mt-1"
        >
          حرف مشتری‌های واقعی پلاسکو گلی
        </h2>
        <p className="text-xs mt-2 text-ink-soft">
          این‌ها دیدگاه‌های ثبت‌شده زیر خود محصولات‌اند؛ نه متن تبلیغاتی.
        </p>
      </div>
      <div data-reveal="" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reviews.map((r) => (
          <figure
            key={r.id}
            className="rounded-[18px] p-5 flex flex-col gap-3"
            style={{ background: "var(--color-surface)" }}
          >
            <StarRow value={r.rating} size={14} />
            <blockquote className="text-xs leading-relaxed text-ink-soft flex-1">
              {r.body}
            </blockquote>
            <figcaption className="flex items-center gap-2 text-[11px]">
              <span className="font-bold" style={{ color: "var(--color-ink)" }}>
                {r.userName || "مشتری"}
              </span>
              {r.isBuyer && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
                >
                  خریدار
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// صفحه اصلی
// ============================================================
export default async function HomePage() {
  const { products, categories, shopInfo, recentReviews } = await getHomepageData();

  return (
    <>
      <StoreJsonLd />
      <WebSiteJsonLd />
      <FAQPageJsonLd />
      <ItemListJsonLd products={products} />
      {/* اطلاعیهٔ فروشگاه این‌جا نیست: نوارِ سراسریِ `AnnouncementBar` در هدر
          نشانش می‌دهد (همتای initShopBar در Express). نمایشش در هیرو هم یعنی
          همان متن دو بار در یک صفحه — و در صفحه‌های دیگر صفر بار. */}
      {/* ترتیب عیناً همان ترتیبِ index.html نسخهٔ Express است:
          هیرو → نوارِ دسته‌ها → محصولات → اخیراً دیده‌شده → بنرِ تخفیف →
          چرا پلاسکو گلی → حرفِ مشتری‌ها → درباره → سوالات متداول →
          پیگیری سفارش → تماس. سه بخشِ آخر (about/faq/contact) و «چرا پلاسکو
          گلی» تا امروز در Next نبودند. */}
      <HeroSection />
      <CategoryStrip categories={categories} />
      <BestSellersSection products={products} />
      <RecentlyViewed />
      {/* بنرِ کد تخفیف — فقط وقتی فروشگاه بنرِ فعالی دارد */}
      {shopInfo?.promoText && (
        <PromoBanner text={shopInfo.promoText} code={shopInfo.promoCode || ""} />
      )}
      <FeaturesSection />
      <TestimonialsSection reviews={recentReviews} />
      <AboutSection />
      <FaqSection />
      <OrderTrackingSection />
      <ContactSection />
    </>
  );
}