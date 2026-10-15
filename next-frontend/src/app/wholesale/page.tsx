import Link from "next/link";
import type { Metadata } from "next";
import { WholesaleForm } from "@/components/WholesaleForm";
import { WebPageJsonLd } from "@/components/JsonLd";
import { ContactFab } from "@/components/ContactFab";
import { Icon, type IconName } from "@/components/Icon";
import { pageSocial } from "@/lib/social";

// معادلِ frontend/wholesale.html — متن و فیلدها از همان صفحه برداشته شده‌اند.

export const metadata: Metadata = {
  title: "خرید عمده",
  description:
    "درخواست قیمت و خرید عمده لوازم پلاستیکی خانه از پلاسکو گلی. برای فروشگاه‌ها، مراکز پخش و خرید سازمانی.",
  alternates: { canonical: "/wholesale" },
  // متنِ og همان توضیحِ متا است و متنِ twitter کوتاه‌تر — دقیقاً همان تفاوتی
  // که `wholesale.html` داشت.
  ...pageSocial({
    path: "/wholesale",
    title: "خرید عمده | پلاسکو گلی",
    description:
      "درخواست قیمت و خرید عمده لوازم پلاستیکی خانه از پلاسکو گلی. برای فروشگاه‌ها، مراکز پخش و خرید سازمانی.",
    twitterDescription:
      "درخواست قیمت و خرید عمده لوازم پلاستیکی خانه از پلاسکو گلی.",
  }),
};

// چهار قلمِ `ul.ws-points` در `wholesale.html:91-96` — با آیکونِ خودِ هر قلم
// (`i-tag`، `i-truck`، `i-shield`، `i-phone`). پیش از این هر چهار قلم یک
// تیکِ عمومیِ یکسان داشتند: متن یکی بود و شکل نه — و چون فقط متن سنجیده
// می‌شد، هیچ نگهبانی نمی‌گرفت (`oracleLists.test.ts`).
const POINTS: { icon: IconName; text: string }[] = [
  { icon: "tag", text: "قیمت پلکانی: هرچه تعداد بیشتر، قیمت واحد کمتر" },
  { icon: "truck", text: "ارسال بار به سراسر کشور" },
  { icon: "shield", text: "ضمانت اصالت جنس و بازگشت کالا" },
  { icon: "phone", text: "مشاوره‌ی صادقانه قبل از خرید" },
];

export default function WholesalePage() {
  return (
    <>
      <WebPageJsonLd
        name="خرید عمده | پلاسکو گلی"
        description="درخواست قیمت و خرید عمده لوازم پلاستیکی خانه از پلاسکو گلی."
        url="/wholesale"
      />
      <div className="mx-auto max-w-[1180px] px-6 py-8">
        {/* breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-ink-dim mb-6">
          <Link href="/" className="hover:text-teal transition-colors">
            خانه
          </Link>
          <span>/</span>
          <span className="text-ink-soft">خرید عمده</span>
        </div>

        <div className="grid gap-8 md:grid-cols-[1fr_400px] items-start">
          {/* معرفی */}
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold mb-4"
              style={{
                background: "var(--color-teal-tint)",
                color: "var(--color-teal)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--color-teal)" }}
              />
              عمده‌فروشی
            </span>

            <h1 className="text-2xl font-extrabold text-ink mb-4">
              خرید عمده و سازمانی
            </h1>

            <p className="text-sm leading-7 text-ink-soft mb-6">
              برای فروشگاه‌ها، مراکز پخش، عمده‌خرها و خرید سازمانی قیمت ویژه
              داریم. کافی است فرم را پر کنید؛ کارشناس ما در اولین فرصت با شما
              تماس می‌گیرد و قیمت عمده را اعلام می‌کند.
            </p>

            <ul className="ws-points flex flex-col gap-3">
              {POINTS.map((p) => (
                <li
                  key={p.text}
                  className="flex items-start gap-2.5 text-sm text-ink-soft"
                >
                  <Icon
                    name={p.icon}
                    size={18}
                    className="shrink-0 mt-1 text-teal"
                  />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* فرم */}
          <WholesaleForm />
        </div>
      </div>

      {/* دکمهٔ شناورِ تماس — همتای `a.fab` در wholesale.html؛ برای مشتریِ
          عمده که معمولاً قبل از ثبتِ درخواست تماس می‌گیرد. */}
      <ContactFab />
    </>
  );
}
