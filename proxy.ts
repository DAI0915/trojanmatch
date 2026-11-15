import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";
import { isPublicPath } from "@/lib/routes";

/**
 * Next.js 16 Proxy (formerly middleware). UX-level gate only: every Route
 * Handler, Server Action and RPC re-checks authorization itself.
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "NOT_AUTHENTICATED", message: "Sign in required." } },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/spaces";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
