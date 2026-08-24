// ============================================================
// ردیفِ ستاره — یک‌جا برای همه‌ی نقاطِ سایت
// ============================================================
// همتای `starRow` در frontend/js/product.js:481. نسخه‌ی Express از اسپرایتِ
// `#i-star` استفاده می‌کرد که در مبدأِ Next وجود ندارد، پس SVG درون‌خطی است —
// مثل بقیه‌ی آیکون‌های کامپوننت‌های Next.
//
// همان قاعده‌ی گِردکردنِ Express: `i < Math.round(v)` روشن است. یعنی ۴٫۵ پنج
// ستاره‌ی روشن می‌دهد، ۴٫۴ چهار تا. عمداً عوض نشده تا عددی که کنارِ ستاره‌ها
// نوشته می‌شود با تصویرش در دو فرانت‌اند یکی باشد.

export function StarRow({
  value,
  size = 14,
  label,
}: {
  value: number;
  size?: number;
  /** اگر داده شود، کلِ ردیف یک تصویرِ معنادار برای صفحه‌خوان می‌شود */
  label?: string;
}) {
  const on = Math.round(value);
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 20 20"
          fill={i < on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          style={{
            color: i < on ? "var(--color-gold)" : "var(--color-line-control)",
            flex: "none",
          }}
        >
          <path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
        </svg>
      ))}
    </span>
  );
}
