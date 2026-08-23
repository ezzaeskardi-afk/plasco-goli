import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiBase } from "@/lib/site";

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

async function isLoggedIn(request: NextRequest): Promise<boolean> {
  const cookie = request.headers.get("cookie");

  // بدونِ کوکیِ نشست قطعاً وارد نشده — بی‌خود به بک‌اند درخواست نمی‌زنیم.
  if (!cookie || !cookie.includes("polasco.sid")) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${apiBase()}/api/auth/me`, {
      headers: { cookie },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { user?: unknown };
    return Boolean(data.user);
  } catch {
    // بک‌اند خواب است یا کند: «وارد نشده» فرض می‌کنیم. یعنی کاربر به صفحه‌ی
    // ورود می‌رود (قابل فهم) و نه به یک صفحه‌ی شکسته.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const guestOnly = GUEST_ONLY_ROUTES.some((r) => pathname.startsWith(r));
  if (!needsAuth && !guestOnly) return NextResponse.next();

  const loggedIn = await isLoggedIn(request);

  if (needsAuth && !loggedIn) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (guestOnly && loggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/checkout/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/login/:path*",
  ],
};

// /admin در اینجا فقط «واردشده بودن» را چک می‌کند، نه ادمین بودن. مجوزِ
// واقعیِ ادمین سمتِ Express اعمال می‌شود و از اینجا قابل دور زدن نیست؛
// این لایه صرفاً برای این است که کاربرِ عادی صفحه‌ی خالی نبیند.
