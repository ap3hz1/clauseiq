import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CLAUSEIQ_ACCESS_COOKIE } from "@/lib/authCookies";

/**
 * All UI routes require a session cookie. APIs are left to each route (JSON 401),
 * so fetches are never redirected to HTML login.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const loggedIn = Boolean(request.cookies.get(CLAUSEIQ_ACCESS_COOKIE)?.value);

  if (pathname === "/login") {
    if (loggedIn) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!loggedIn) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all pathnames except Next internals and common static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|txt)$).*)"
  ]
};
