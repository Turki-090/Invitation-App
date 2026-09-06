import { NextResponse, type NextRequest } from "next/server";
import {
  pathnameLocale,
  preferredLocale,
  localizePathname,
} from "./i18n/routing";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname) ||
    pathnameLocale(pathname)
  ) {
    return NextResponse.next();
  }

  const locale = preferredLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = localizePathname(pathname, locale);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
