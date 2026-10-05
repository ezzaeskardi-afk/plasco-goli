// ============================================================
// برچسبِ کوچکِ بالای عنوانِ بخش‌ها — همتای `span.eyebrow` در Express
// ============================================================
// پیش از این یک نسخه‌ی محلی در `app/page.tsx` بود؛ ولی سه جای دیگر هم
// (`RecentlyViewed`، `PromoBanner` و صفحه‌ی محصول) به همین شکل نیاز داشتند و
// کپی‌کردنِ دوباره‌ی آن یعنی سه نقطه‌ی واگراییِ تازه در متنِ کاربرمحور.
//
// نکته‌ی ریزِ مهم: نقطهٔ طلاییِ Express یک `span` با استایل است، نه کاراکترِ
// «●»؛ اگر متن بگذاریم در متنِ رندرشده ظاهر می‌شود و Express نداردش.

export function Eyebrow({ children }: { children: React.ReactNode }) {
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
