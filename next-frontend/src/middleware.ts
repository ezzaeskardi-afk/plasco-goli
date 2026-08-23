import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// مسیرهایی که کاربر حتماً باید وارد شده باشد
const PROTECTED_ROUTES = ["/checkout", "/account"];

// مسیرهایی که کاربر واردشده نباید ببیند
const GUEST_ONLY_ROUTES = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // چک session از cookie
  const hasSession = request.cookies.has("polasco.sid");

  // ریدایرکت برای مسیرهای محافظت‌شده
  if (PROTECTED_ROUTES.some((r) => pathname.startsWith(r)) && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // ریدایرکت کاربر واردشده از صفحهٔ ورود
  if (GUEST_ONLY_ROUTES.some((r) => pathname.startsWith(r)) && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/checkout/:path*",
    "/account/:path*",
    "/login/:path*",
  ],
};