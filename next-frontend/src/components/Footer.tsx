import Link from "next/link";

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>
              پلاسکو گلی
            </h4>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
              فروشگاه اینترنتی محصولات پلاستیکی با کیفیت — ارسال سریع به سراسر کشور
            </p>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>
              دسترسی سریع
            </h4>
            <ul className="text-xs space-y-1.5" style={{ color: "var(--color-ink-soft)" }}>
              <li><Link href="/products" className="hover:text-teal transition-colors">محصولات</Link></li>
              <li><Link href="/cart" className="hover:text-teal transition-colors">سبد خرید</Link></li>
              <li><Link href="/login" className="hover:text-teal transition-colors">ورود</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>
              خدمات
            </h4>
            <ul className="text-xs space-y-1.5" style={{ color: "var(--color-ink-soft)" }}>
              <li><Link href="/terms" className="hover:text-teal transition-colors">قوانین</Link></li>
              <li><Link href="/wholesale" className="hover:text-teal transition-colors">خرید عمده</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>
              نمادها
            </h4>
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-teal)" }}>
                <span className="text-sm leading-none">✓</span> ضمانت اصل
              </span>
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-teal)" }}>
                <span className="text-sm leading-none">✓</span> پرداخت امن
              </span>
            </div>
          </div>
        </div>
        <div
          className="mt-8 pt-6 border-t text-center text-xs"
          style={{
            borderColor: "var(--color-line)",
            color: "var(--color-ink-dim)",
          }}
        >
          © ۱۴۰۴ پلاسکو گلی — تمام حقوق محفوظ است.
        </div>
      </div>
    </footer>
  );
}