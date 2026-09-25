import Link from "next/link";

// ============================================================
// پیامِ «این بخش برای تو نیست»
// ============================================================
// چرا یک صفحه‌ی کامل و نه یک کادرِ خطا کنارِ بقیه‌ی پنل: قبلاً مشتریِ
// واردشده‌شده به `/admin` می‌رسید، نوارِ پنل را با هفت تب می‌دید و هر تب یک
// کادرِ «دسترسی به پنل مدیریت ندارید» نشان می‌داد. هفت بار یک پیام، و هیچ‌جا
// نگفته بود که مسئله کلِ پنل است، نه آن یک تب.
//
// دو چیز عمدی است:
//
//  ۱. **نوارِ پنل اصلاً رندر نمی‌شود.** اگر رندر شود، کاربر فکر می‌کند شاید با
//     یک کلیکِ دیگر باز شود — و همان هفت کادرِ قبلی برمی‌گردد.
//  ۲. **حسابِ واردشده نشان داده می‌شود.** بیشترِ این موارد یک اشتباهِ ساده است:
//     با شماره‌ی خودش وارد شده نه با شماره‌ی مغازه. بدونِ گفتنِ شماره، کاربر
//     نمی‌فهمد چرا و فقط فکر می‌کند سایت خراب است.
//
// این کامپوننت هیچ تصمیمی نمی‌گیرد: تصمیم در `middleware.ts` گرفته شده و
// به‌صورت هدر به اینجا می‌رسد. اینجا فقط می‌گویدش.

export type PanelAccess = "full" | "orders" | "none" | "unknown";
export type PanelRole = "admin" | "staff" | "customer" | "unknown";

export function NoAccess({ role, phone }: { role: PanelRole; phone: string }) {
  const staff = role === "staff";

  return (
    <div className="mx-auto max-w-[680px] px-4 py-10 sm:px-6 sm:py-16">
      <div
        className="rounded-[26px] p-6 sm:p-8"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
      >
        <h1 className="text-xl font-extrabold mb-3" style={{ color: "var(--color-ink)" }}>
          {staff
            ? "دسترسیِ شما فقط بخشِ سفارش‌هاست"
            : "پنل مدیریت برای این حساب باز نیست"}
        </h1>

        {staff ? (
          <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--color-ink-soft)" }}>
            حسابِ شما نقشِ «کارمند» دارد. کارمندها فقط به بخشِ سفارش‌ها راه دارند —
            قیمت‌ها، انبار، مشتری‌ها، تخفیف‌ها و تنظیماتِ فروشگاه فقط برای مدیرِ
            فروشگاه باز است. این محدودیت عمدی است، نه نقصِ سایت.
          </p>
        ) : (
          <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--color-ink-soft)" }}>
            این بخش برای مدیرِ فروشگاه و کارمندانش است. حسابِ شما یک حسابِ مشتریِ
            معمولی است و دسترسیِ مدیریتی ندارد. حسابِ شما هیچ مشکلی ندارد — سفارش‌ها،
            آدرس‌ها و علاقه‌مندی‌هایتان همه سرِ جای خودشان هستند.
          </p>
        )}

        {phone && (
          <p
            className="rounded-[14px] px-3 py-2 text-[11px] mb-4"
            style={{ background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }}
          >
            وارد شده‌اید با شماره‌ی{" "}
            <span dir="ltr" style={{ color: "var(--color-ink-soft)" }}>
              {phone}
            </span>
            {!staff && (
              <>
                {" "}
                — اگر این شماره نباید اینجا باشد، از منوی بالا خارج شوید و با شماره‌ی
                مدیرِ فروشگاه وارد شوید.
              </>
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {staff && (
            <Link
              href="/admin/orders"
              className="rounded-full px-4 py-2 text-xs font-bold"
              style={{ background: "var(--color-teal)", color: "#04211B" }}
            >
              رفتن به سفارش‌ها
            </Link>
          )}
          <Link
            href="/account"
            className="rounded-full px-4 py-2 text-xs font-bold"
            style={{
              background: staff ? "var(--color-surface-2)" : "var(--color-teal)",
              color: staff ? "var(--color-ink-soft)" : "#04211B",
            }}
          >
            حساب کاربریِ من
          </Link>
          <Link
            href="/"
            className="rounded-full px-4 py-2 text-xs font-bold"
            style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
          >
            بازگشت به فروشگاه
          </Link>
        </div>

        <p className="text-[10px] leading-relaxed mt-5" style={{ color: "var(--color-ink-dim)" }}>
          {staff
            ? "بخش‌های دیگرِ پنل را نمی‌بینی چون هر درخواستی که به سرور می‌رود، خودش نقش را چک می‌کند. اگر به بخشِ دیگری هم نیاز داری، باید مدیرِ فروشگاه شماره‌ات را به‌عنوان مدیر ثبت کند."
            : "اگر فکر می‌کنی باید دسترسی داشته باشی، با مدیرِ فروشگاه تماس بگیر تا شماره‌ات را به‌عنوان مدیر یا کارمند ثبت کند."}
        </p>
      </div>
    </div>
  );
}
