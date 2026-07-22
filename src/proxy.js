import { NextResponse } from "next/server";

import { SESSION_COOKIE, isPasswordConfigured, isValidSession } from "@/lib/auth";

/**
 * Guards every page and API route behind the shared password.
 *
 * One exception: VoiceToText posts finished meetings to POST /api/meetings and
 * has no way to log in. Blocking it would break recording uploads, so ingest
 * stays open while everything that *reads* data is closed. A recorder that can
 * only add meetings is a far smaller exposure than transcripts anyone can read.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Fail open when unconfigured, rather than locking the owner out of a site
  // whose environment variables they can only set from outside it. The settings
  // page says loudly when this is the case.
  if (!isPasswordConfigured()) return NextResponse.next();

  const isLogin = pathname === "/login" || pathname.startsWith("/api/auth/");
  const isIngest = pathname === "/api/meetings" && request.method === "POST";
  if (isLogin || isIngest) return NextResponse.next();

  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // An API client wants a status code, not a login page it cannot render.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
