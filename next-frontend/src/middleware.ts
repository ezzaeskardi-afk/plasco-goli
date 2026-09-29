import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiBase } from "@/lib/site";
import { isLegacyHtmlPath, legacyRedirect } from "@/lib/legacyUrls";

// ============================================================
// نگهبانِ مسیرها
// ============================================================
// نکته‌ی مهمی که قبلاً اشتباه بود: وجودِ کوکیِ `polasco.sid` به هیچ وجه
// یعنی «کاربر وارد شده». Express همان کوکی را برای یک بازدیدکننده‌ی کاملاً
// ناشناس هم می‌سازد — کافی است چیزی به سبد اضافه کند. نتیجه‌ی آن اشتباه:
//
//   ۱) کاربرِ ناشناسی که سبد دارد، وقتی روی «ورود» می‌زد به صفحه‌ی اصلی
//      پرت می‌شد. یعنی هرکس چیزی در سبد داشت، دیگر هیچ‌وقت نمی‌توانست
//      وارد شود و در نتیجه هیچ‌وقت نمی‌توانست سفارش ثبت کند.
//   ۲) همان کاربر بدونِ ورود به /checkout و /account راه داده می‌شد و
//      صفحه‌ی خالی/خطا می‌دید.
//
// پس تنها مرجعِ درست، خودِ بک‌اند است: /api/auth/me. این درخواست فقط برای
// همین چهار مسیر زده می‌شود، نه برای همه‌ی صفحات.

const PROTECTED_ROUTES = ["/checkout", "/account", "/admin"];
const GUEST_ONLY_ROUTES = ["/login"];

/**
 * کاربرِ نشست — همان چیزی که `/api/auth/me` برمی‌گرداند (`publicUser`).
 *
 * این تابع قبلاً فقط یک بولین برمی‌گرداند و همین باعث دو کارِ تکراری می‌شد:
 * middleware برای دانستنِ «وارد شده یا نه» یک درخواست می‌زد و پوسته‌ی پنل برای
 * دانستنِ «ادمین یا نه» باید دوباره می‌پرسید. حالا خودِ شیءِ کاربر برمی‌گردد و
 * نقش هم از همان یک درخواست می‌آید.
 */
type SessionUser = { isAdmin: boolean; isStaff: boolean; phone: string };
type Session = { kind: "user"; user: SessionUser } | { kind: "anon" };

async function readSession(request: NextRequest): Promise<Session> {
  const cookie = request.headers.get("cookie");

  // بدونِ کوکیِ نشست قطعاً وارد نشده — بی‌خود به بک‌اند درخواست نمی‌زنیم.
  if (!cookie || !cookie.includes("polasco.sid")) return { kind: "anon" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${apiBase()}/api/auth/me`, {
      headers: { cookie },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { kind: "anon" };
    const data = (await res.json()) as { user?: SessionUser | null };
    if (!data.user) return { kind: "anon" };
    return {
      kind: "user",
      user: {
        isAdmin: Boolean(data.user.isAdmin),
        isStaff: Boolean(data.user.isStaff),
        // فقط ارقام: مقدارِ هدرِ HTTP باید ASCII باشد و در نامِ فارسی
        // (`fullName`) سرور یا مرورگر خطا می‌دهد. شماره برای پیامِ «با این
        // حساب وارد شده‌اید» کافی است.
        phone: String(data.user.phone || ""),
      },
    };
  } catch {
    // بک‌اند خواب است یا کند: «وارد نشده» فرض می‌کنیم. یعنی کاربر به صفحه‌ی
    // ورود می‌رود (قابل فهم) و نه به یک صفحه‌ی شکسته.
    return { kind: "anon" };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// مرزِ دسترسیِ پنل مدیریت
// ============================================================
// **این یک سدِ امنیتی نیست.** سدِ واقعی سمتِ Express است (`routes/admin.js:68`)
// و هیچ‌چیز اینجا آن را شل نمی‌کند: هر درخواستِ API مستقیم به Express می‌رود و
// خودش نقش را چک می‌کند. کاری که اینجا می‌شود، **گفتنِ درست** به کاربر است.
//
// دلیلِ وجودش: بدونِ این، مشتریِ واردشده‌شده به `/admin` می‌رسید، نوارِ پنل را
// با هفت تب می‌دید، و هر تب یک کادرِ «دسترسی به پنل مدیریت ندارید» نشان می‌داد.
// یعنی هفت بار یک پیام، و هیچ‌جا نگفته بود که کلِ پنل برای او نیست.
//
// قاعده عیناً همان قاعده‌ی Express است (‏`router.use` در خط ۱۳۲): مسیرهای
// سفارش برای کارمند باز است، بقیه فقط ادمین. اگر روزی آن قاعده عوض شد، همین
// تابع باید عوض شود — و تنها همین یک جا است.
function panelAccess(pathname: string, user: SessionUser): "full" | "orders" | "none" {
  if (user.isAdmin) return "full";
  if (user.isStaff && /^\/admin\/orders(\/|$)/.test(pathname)) return "orders";
  return "none";
}

/**
 * هدرهایی که پوسته‌ی پنل (`app/admin/layout.tsx`) می‌خواند.
 *
 * چرا هدر و نه یک درخواستِ دوم در پوسته: پوسته نمی‌تواند مسیرِ جاری را بداند
 * و middleware هم نمی‌تواند صفحه رندر کند. این هدرها همان تصمیمِ گرفته‌شده را
 * به پوسته می‌رسانند، بدونِ یک `/api/auth/me` دوم برای هر بازدیدِ پنل.
 *
 * ⚠️ مقدارِ هدر باید ASCII باشد — پس نقش و مسیر اینجا رمزگذاری می‌شوند و
 * نامِ فارسی هرگز در هدر نمی‌رود.
 */
const PANEL_HEADERS = ["x-panel-access", "x-panel-role", "x-panel-phone"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // هدرهای `x-panel-*` را **همیشه** دور می‌ریزیم، حتی وقتی کاری با پنل نداریم.
  // بدونِ این، یک کاربر می‌توانست `x-panel-access: full` را خودش بفرستد و در
  // مسیری که ما مقدار نمی‌گذاریم، مقدارِ خودش را به پوسته برساند. (امروز چنین
  // مسیری وجود ندارد، ولی این یک باگِ خفته است که یک خط جلوگیری می‌کند.)
  const requestHeaders = new Headers(request.headers);
  for (const h of PANEL_HEADERS) requestHeaders.delete(h);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  // ============================================================
  // نشانی‌های عصرِ Express
  // ============================================================
  // این باید **قبل از** هر کار دیگری بیاید: نه به بک‌اند درخواست می‌زنیم و نه
  // وارد منطقِ ورود می‌شویم — این مسیرها فقط باید به معادلِ امروزی‌شان برسند.
  // ریدایرکت عمدی است (نه rewrite): یک نشانیِ کانونیکال می‌ماند، نه دو نسخه‌ی
  // همان صفحه در نوار آدرس و در ایندکسِ گوگل. قطعه‌ی URL (`#products`) را خودِ
  // مرورگر روی مقصد نگه می‌دارد، چون `Location` قطعه ندارد.
  const legacy = legacyRedirect(pathname, request.nextUrl.search);
  if (legacy) return NextResponse.redirect(new URL(legacy, request.url), 307);

  // و هر `*.html` **دیگری** که نگاشت ندارد اصلاً وارد منطقِ ورود نمی‌شود.
  // داستانِ این سه خط (باگِ واقعی، نه احتیاطِ نظری): مچر شاملِ `/:page.html`
  // است و `/admin.html` هم از نظرِ رشته‌ای با `/admin` شروع می‌شود، پس در
  // `PROTECTED_ROUTES` می‌افتاد و کاربر را به `/login?redirect=/admin.html`
  // می‌برد. یعنی مرورگر پیامِ «رد شد، اجازه ندارید» می‌داد و یک صفحه‌ی ورود
  // نشان می‌داد — برای نشانی‌ای که در نسخه‌ی Express عمداً ۴۰۴ است. نتیجه‌اش
  // هم این بود که نگهبانِ `panel-retired` نمی‌توانست این تفاوت را بگیرد.
  //
  // `/offline.html` هم از همین خط رد می‌شود و همان چیزی است که می‌خواهیم:
  // فایلِ واقعیِ `public/` است و باید سرو شود، نه ریدایرکت.
  if (isLegacyHtmlPath(pathname)) return pass();

  const needsAuth = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const guestOnly = GUEST_ONLY_ROUTES.some((r) => pathname.startsWith(r));

  if (!needsAuth && !guestOnly) return pass();

  const session = await readSession(request);
  const loggedIn = session.kind === "user";

  if (needsAuth && !loggedIn) {
    const url = new URL("/login", request.url);
    // کوئری‌استرینگ هم با مسیر می‌رود. قبلاً فقط `pathname` می‌رفت و نتیجه این
    // بود که پیوندی مثل `/admin/crm?customer=12` بعد از ورود به خودِ `/admin/crm`
    // می‌رسید — یعنی مدیر مشتری را پیدا می‌کرد، لینک را می‌زد، وارد می‌شد و
    // به داشبوردِ CRM می‌رسید. خودِ پرونده گم می‌شد بدونِ هیچ پیامی.
    //
    // امن است چون سمتِ گیرنده `safeRedirectPath` (lib/redirect.ts) هر چیزی
    // جز یک مسیرِ نسبیِ هم‌مبدأ را دور می‌ریزد؛ کوئری هم عمداً حفظ می‌شود.
    url.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (guestOnly && loggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // فقط اینجا — یعنی بعد از اینکه ورود *تأیید شد* — نقش را به پوسته می‌گوییم.
  // مسیرهای `/admin` در `PROTECTED_ROUTES` هستند، پس کاربرِ بی‌نشست هرگز به
  // این خط نمی‌رسد و همیشه اول به صفحه‌ی ورود می‌رود.
  if (pathname.startsWith("/admin") && session.kind === "user") {
    const access = panelAccess(pathname, session.user);
    requestHeaders.set("x-panel-access", access);
    requestHeaders.set(
      "x-panel-role",
      session.user.isAdmin ? "admin" : session.user.isStaff ? "staff" : "customer",
    );
    if (session.user.phone) requestHeaders.set("x-panel-phone", session.user.phone);
  }

  return pass();
}

export const config = {
  matcher: [
    // هر `/چیزی.html` — نشانی‌های عصرِ Express. پوششِ اینجا و نه در
    // `next.config.ts` عمدی است: یک جا، و قابلِ سنجش در Vitest.
    // (`/offline.html` را نگاشت ریدایرکت نمی‌کند و از فایلِ واقعیِ `public/`
    // سرو می‌شود.)
    "/:page.html",
    "/checkout/:path*",
    "/account/:path*",
    "/admin",
    // `/admin/:path*` با صفر بخش هم `/admin` را می‌گیرد، ولی صریح نوشتنش
    // یک مزیت دارد: پیشخوانِ پنل (`admin/page.tsx`) تنها صفحه‌ای است که خودِ
    // آدرسش دقیقاً `/admin` است، و اگر روزی نگهبانِ مسیر عوض شود، نباید
    // سرنوشتش به معنای ضمنیِ `*` گره بخورد.
    "/admin/:path*",
    "/login/:path*",
  ],
};

// این لایه دو کار می‌کند و هیچ‌کدام «مجوز» نیست:
//
//   ۱. نگهبانیِ ورود — کاربرِ بی‌نشستِ `/admin` به صفحه‌ی ورود می‌رود
//      (همان کاری که از قبل می‌کرد؛ کاربرِ عادی صفحه‌ی خالی نبیند).
//   ۲. گفتنِ نقش به پوسته‌ی پنل — از `x-panel-access` استفاده می‌کند تا مشتریِ
//      عادی به‌جای هفت کادرِ «دسترسی ندارید» یک پیامِ روشن ببیند.
//
// مجوزِ واقعیِ ادمین سمتِ Express اعمال می‌شود و از اینجا قابل دور زدن نیست:
// حتی اگر کسی هدرها را جعل کند، اولین درخواستِ API سمتِ سرور ۴۰۳ می‌گیرد.
