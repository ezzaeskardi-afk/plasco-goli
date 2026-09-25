// ============================================================
// مقصدِ بازگشت پس از ورود — فقط مسیرِ هم‌مبدأ
// ============================================================
// `LoginForm` بعد از ورودِ موفق کاربر را به `?redirect=` می‌فرستد، و این مقدار
// مستقیماً از آدرسِ صفحه می‌آید. بدونِ بررسی، هر کسی می‌توانست یک لینک بسازد
// که «ورود به پلاسکو گلی» را نشان می‌دهد ولی کاربر را بعد از ورود به دامنه‌ی
// خودش می‌برد:
//
//     /login?redirect=https://evil.example
//
// این بدترین شکلش نیست (کاربر رمزش را به ما می‌دهد نه به آن‌ها)، ولی یک ابزارِ
// فیشینگِ آماده است: لینک از دامنه‌ی ما شروع می‌شود، پس قابلِ اعتماد به نظر
// می‌رسد، و مقصدش جای دیگری است. نسخه‌ی Express اصلاً پارامترِ redirect
// نداشت؛ این در مهاجرت به Next اضافه شد.
//
// چرا «لیستِ سیاه» ننوشتم: هر بار که یک دور زدنِ تازه پیدا می‌شود باید لیست
// بلندتر شود (`javascript:`، `//host`، `/\host`، `\t//host`، `%09//host`…).
// اینجا فقط یک شکل قبول می‌شود — مسیری که با یک `/` شروع شود و به همان مبدأ
// برسد — و هر چیزِ دیگر رد می‌شود. پس چیزی که «تأیید» می‌شود همیشه از نظرِ
// ساختاری همان چیزی است که انتظار داریم، نه چیزی که هنوز کسی دورش نزده.

/**
 * پایه‌ی ساختگی برای تحلیلِ نسبیِ آدرس.
 *
 * `.invalid` تضمین‌شده هرگز resolve نمی‌شود (RFC 2606)، تا اگر روزی کدِ این
 * فایل جایی به شبکه رفت، اشتباهاً به یک دامنه‌ی واقعی درخواست نرود.
 */
const SAFE_BASE = "http://same-origin.invalid";

/** سقفِ بلندی — یک مسیرِ واقعیِ سایت اینقدر نمی‌شود؛ بقیه حتماً دستکاری است. */
const MAX_LENGTH = 512;

/**
 * فقط مسیرِ هم‌مبدأ را برمی‌گرداند؛ در غیر این صورت `null`.
 *
 * @example
 *   safeRedirectPath("/checkout")                     // "/checkout"
 *   safeRedirectPath("/order-success?orderId=12")      // "/order-success?orderId=12"
 *   safeRedirectPath("/account#wishlist")              // "/account#wishlist"
 *   safeRedirectPath("https://evil.example")           // null
 *   safeRedirectPath("//evil.example")                 // null
 *   safeRedirectPath("/\\evil.example")                // null
 *   safeRedirectPath("javascript:alert(1)")            // null
 */
export function safeRedirectPath(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  // مرورگرها فاصله و کاراکترهای کنترلیِ دو سرِ URL را خودشان حذف می‌کنند
  // (مثلاً `\t//evil.example` را `//evil.example` می‌بینند). اگر ما نکنیم،
  // همان دور زدن از فیلترِ پایین رد می‌شود — پس عیناً همان کار را می‌کنیم تا
  // «چیزی که ما می‌سنجیم» و «چیزی که مرورگر اجرا می‌کند» یکی باشد.
  const value = raw.trim();
  if (!value) return null;
  if (value.length > MAX_LENGTH) return null;

  // هر کاراکترِ کنترلیِ باقی‌مانده (در میانِ رشته) — در URL معنای مشروع ندارد.
  // ‏`\u007f` را جدا نوشتم چون `\u0000-\u001f` شاملش نمی‌شود.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  // باید یک `\` تکی در ابتدا باشد. `//host` یک آدرسِ پروتکل‌نسبی است و
  // مرورگر آن را `https://host` می‌خواند — یعنی همان دامنه‌ی مهاجم.
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;

  // بک‌اسلش: در طرح‌های «خاص» (http/https) مرورگر `\` را مثل `/` می‌بیند، پس
  // `/\evil.example` عملاً `//evil.example` است. عمداً هیچ بک‌اسلشی را قبول
  // نمی‌کنیم؛ در مسیرِ واقعیِ این سایت هیچ‌جا لازم نیست.
  if (value.includes("\\")) return null;

  try {
    const url = new URL(value, SAFE_BASE);
    // لایه‌ی دومِ اطمینان: اگر چیزی از بالا رد شد ولی آدرس مبدأ را عوض کرد،
    // اینجا نوشته می‌شود. (با قواعدِ بالا غیرقابل‌دسترس است، و همین خوب است.)
    if (url.origin !== SAFE_BASE) return null;

    // search و hash حفظ می‌شوند چون خودِ برنامه به آن‌ها تکیه می‌کند:
    // `/order-success?orderId=…` و `/account#wishlist` هر دو واقعاً ساخته می‌شوند.
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
