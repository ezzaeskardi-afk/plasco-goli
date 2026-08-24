import { getProductReviews } from "@/lib/api";
import { StarRow } from "@/components/StarRow";
import { ReviewForm } from "@/components/ReviewForm";

// ============================================================
// دیدگاه خریداران
// ============================================================
// همتای بخشِ «دیدگاه خریداران» در frontend/js/product.js:480. در نسخه‌ی Next
// این بخش کاملاً غایب بود: نه دیده می‌شد، نه راهی برای ثبتش بود، هرچند دو
// endpointِ سرور (`GET/POST /api/products/:id/reviews`) سرِ جایشان بودند.
//
// خلاصه و لیست عمداً سمتِ سرور رندر می‌شوند: هم متنِ دیدگاه‌ها در HTMLِ اولیه
// هست (گوگل لازم دارد) و هم جای بخش از اول رزرو می‌شود و صفحه نمی‌پرد. فقط
// فرم کلاینتی است، چون به نشستِ کاربر بسته است — توضیحش در ReviewForm.

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

// createdAt از SQLite به شکل «YYYY-MM-DD HH:MM:SS» و به وقتِ UTC می‌آید، پس
// باید به ISO تبدیل و به‌عنوان UTC خوانده شود — همان کاری که Express می‌کرد
// (product.js:513). منطقه‌ی زمانی صریحاً تهران است، نه پیش‌فرضِ سرور: این صفحه
// استاتیک ساخته می‌شود و اگر سرورِ بیلد روی UTC باشد، تاریخِ شب‌ها یک روز
// عقب نشان داده می‌شود.
function faDate(sqliteUtc: string): string {
  const d = new Date(`${sqliteUtc.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" });
}

export async function ProductReviews({ productId }: { productId: number }) {
  // بخشِ دیدگاه اختیاری است؛ اگر سرور جواب نداد کلِ صفحه‌ی محصول را نمی‌خواباند
  // — عیناً همان `catch { return; }` نسخه‌ی Express.
  const data = await getProductReviews(productId).catch(() => null);
  if (!data) return null;

  return (
    // id لازم است: امتیازِ بالای صفحه‌ی محصول به #reviews لینک می‌دهد.
    <section id="reviews" className="mt-16 scroll-mt-24">
      <h2 className="text-xl font-extrabold mb-6" style={{ color: "var(--color-ink)" }}>
        دیدگاه خریداران
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* خلاصه‌ی امتیاز */}
        <aside
          className="rounded-[18px] p-5 text-center self-start"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="text-4xl font-extrabold" style={{ color: "var(--color-ink)" }}>
            {data.count ? toFa(data.avg) : "—"}
          </div>
          <div className="mt-2 flex justify-center">
            <StarRow value={data.count ? data.avg : 0} size={18} />
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--color-ink-soft)" }}>
            {data.count
              ? `از ${toFa(data.count)} دیدگاه تأییدشده`
              : "هنوز دیدگاهی ثبت نشده — اولین نفر باشید!"}
          </p>
        </aside>

        {/* لیست + فرم */}
        <div className="md:col-span-2 space-y-3">
          {data.items.map((r) => (
            <article
              key={r.id}
              className="rounded-[18px] p-4"
              style={{ background: "var(--color-surface)" }}
            >
              <header className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className="text-sm font-bold inline-flex items-center gap-1.5"
                  style={{ color: "var(--color-ink)" }}
                >
                  {r.userName}
                  {r.isBuyer && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        background: "var(--color-teal-tint)",
                        color: "var(--color-teal)",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 10.5l4 4 8-9" />
                      </svg>
                      خریدار
                    </span>
                  )}
                </span>
                <StarRow value={r.rating} label={`${toFa(r.rating)} ستاره`} />
              </header>
              {r.body && (
                <p
                  className="text-sm mt-2 leading-relaxed whitespace-pre-line"
                  style={{ color: "var(--color-ink-soft)" }}
                >
                  {r.body}
                </p>
              )}
              <time
                dateTime={r.createdAt.replace(" ", "T") + "Z"}
                className="text-[11px] mt-2 block"
                style={{ color: "var(--color-ink-dim)" }}
              >
                {faDate(r.createdAt)}
              </time>
            </article>
          ))}

          <ReviewForm productId={productId} />
        </div>
      </div>
    </section>
  );
}
