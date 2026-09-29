// ============================================================
// کادرِ خوش‌آمد (دعوت به ثبت‌نام) — همتای `initWelcomePrompt`
// ============================================================
// این کادر عمداً «سرِ ورود» باز نمی‌شود. منطقش در نسخه‌ی Express (common.js:722)
// سه لایه دارد و هر سه اینجا هم آمده، چون بدونِ هرکدام یکی از این اتفاق‌ها
// می‌افتد:
//
//   • بدونِ «اول محصولات را ببیند» → کسی که تازه رسیده، قبل از دیدنِ یک کالا
//     یک کادرِ ثبت‌نام می‌بیند و می‌رود.
//   • بدونِ «فقط مهمان» → مشتریِ وارد‌شده هر صفحه‌ی اصلی دوباره دعوت می‌شود.
//   • بدونِ «یک بار در عمر» → همان کادر در هر بازدیدِ صفحه‌ی اصلی برمی‌گردد.
//
// اعداد و کلیدها عیناً همان‌های نسخه‌ی اصلی‌اند و عمداً در یک ماژولِ خالص
// بیرون‌اند تا در Vitest سنجیدنی باشند — نه داخلِ یک `useEffect` گم شوند.

/** «این کادر را دیده‌ام» — همان کلیدِ `localStorage` نسخه‌ی Express. */
export const WELCOME_SEEN_KEY = "pg_welcomed";

/** اگر کاربر محصولات را دید و هیچ‌کدام از شرط‌های دیگر نرسید، این مدت بعد. */
export const WELCOME_DELAY_MS = 25_000;

/** «علاقه‌ی واقعی» (افزودن به سبد) → این‌قدر صبر، تا روی توستِ «اضافه شد» نیفتد. */
export const WELCOME_INTENT_DELAY_MS = 2_200;

/** اگر کاربر وسطِ کارِ دیگری بود (مودالِ باز) این‌قدر بعد دوباره امتحان کن. */
export const WELCOME_BUSY_RETRY_MS = 4_000;

/** کسرِ دیدنیِ بخشِ محصولات که «دیده شد» حساب می‌شود. */
export const WELCOME_PRODUCTS_THRESHOLD = 0.15;

/** اسکرول تا نصفِ صفحه = «دارد می‌گردد». */
export const WELCOME_SCROLL_FRACTION = 0.5;

/** رویدادی که افزودن به سبد می‌فرستد — همان نامِ نسخه‌ی Express. */
export const WELCOME_INTENT_EVENT = "pg:intent";

/** کادر فقط در صفحه‌ی اصلی می‌آید (نه محصول، نه سبد، نه حساب). */
export function welcomePageEligible(pathname: string): boolean {
  return pathname === "/";
}

/** آیا قبلاً دیده شده؟ (خواندنِ `localStorage` در حالتِ خصوصی استثنا می‌دهد.) */
export function hasSeenWelcome(): boolean {
  try {
    return Boolean(localStorage.getItem(WELCOME_SEEN_KEY));
  } catch {
    return false;
  }
}

/**
 * علامت‌گذاریِ «دیده شد».
 *
 * سه جا صدا زده می‌شود، نه فقط سرِ بستن: با دکمه‌ی بستن، با «فعلاً نگاه
 * می‌کنم»، با کلیکِ لنگرِ ورود، و مهم‌تر از همه **وقتی کاربر وارد شده است** —
 * مشتری‌ای که ثبت‌نام کرده دیگر هرگز نباید دعوت به ثبت‌نام ببیند.
 */
export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // حالتِ خصوصیِ بعضی مرورگرها: کادر فقط برای همین بازدید نشان داده نمی‌شود
    // (state داخلی)، ولی در بازدیدِ بعد ممکن است برگردد — بهتر از شکستنِ صفحه.
  }
}

/**
 * «تا نصفِ صفحه اسکرول کرده» — حسابِ خالص و بدونِ وابستگی به `window`.
 * مخرج `scrollHeight` است نه `innerHeight`، چون ارتفاعِ صفحه با محتوایش عوض
 * می‌شود (محصولاتِ لودشده) و باید همیشه به لحظه‌ی سنجش نگاه کند.
 */
export function welcomeScrolledEnough(
  scrollY: number,
  innerHeight: number,
  scrollHeight: number,
): boolean {
  return scrollY + innerHeight >= scrollHeight * WELCOME_SCROLL_FRACTION;
}

/**
 * آیا کاربر وسطِ یک کارِ دیگر است؟
 *
 * در نسخه‌ی Express سه چیز بررسی می‌شد (`qv-lock`، `no-scroll`، و مودال‌های
 * باز). از آن سه، فقط یکی در Next معادل دارد: دیالوگ‌های واقعی. تفاوتِ
 * بامعنی‌اش هم همین است — `document.body.classList.contains('no-scroll')` در
 * Next هیچ‌وقت true نمی‌شود، پس نوشتنش یعنی کدِ مرده‌ای که خودش را چک‌شده
 * جا می‌زند. هرچه اینجا سنجیده می‌شود واقعاً وجود دارد.
 */
export function hasBusyOverlay(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'),
  );
}
