import Link from "next/link";
import type { Metadata } from "next";
import { WholesaleForm } from "@/components/WholesaleForm";
import { WebPageJsonLd } from "@/components/JsonLd";

// معادلِ frontend/wholesale.html — متن و فیلدها از همان صفحه برداشته شده‌اند.

export const metadata: Metadata = {
  title: "خرید عمده",
  description:
    "درخواست قیمت و خرید عمده لوازم پلاستیکی خانه از پلاسکو گلی. برای فروشگاه‌ها، مراکز پخش و خرید سازمانی.",
  alternates: { canonical: "/wholesale" },
  openGraph: {
    title: "خرید عمده | پلاسکو گلی",
    description:
      "درخواست قیمت و خرید عمده لوازم پلاستیکی خانه از پلاسکو گلی. برای فروشگاه‌ها، مراکز پخش و خرید سازمانی.",
  },
};

const POINTS = [
  "قیمت پلکانی: هرچه تعداد بیشتر، قیمت واحد کمتر",
  "ارسال بار به سراسر کشور",
  "ضمانت اصالت جنس و بازگشت کالا",
  "مشاوره‌ی صادقانه قبل از خرید",
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

            <ul className="flex flex-col gap-3">
              {POINTS.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2.5 text-sm text-ink-soft"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-teal)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 mt-1"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* فرم */}
          <WholesaleForm />
        </div>
      </div>
    </>
  );
}
