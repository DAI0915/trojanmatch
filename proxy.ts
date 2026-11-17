import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { carryCookies, updateSession } from "@/lib/supabase/proxy-session";
import { isPublicPath } from "@/lib/routes";
import { LEASE_COOKIE, parseLeaseCookie } from "@/lib/demo/personas";

/**
 * Next.js 16 Proxy (formerly middleware). UX-level gate only: every Route
 * Handler, Server Action and RPC re-checks authorization itself.
 *
 * Demo sessions: a signed-in DEMO persona must also hold the current presenter
 * lease. If it was replaced (a new start) or expired, the session is signed out
 * via the supported Auth API. Production users are unaffected.
 */
export async function proxy(request: NextRequest) {
  const { user, supabase, getResponse } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const scope = (user?.app_metadata as { scope?: string } | undefined)?.scope;
  if (user && typeof scope === "string" && scope.startsWith("demo:") && !isPublicPath(pathname)) {
    const lease = parseLeaseCookie(request.cookies.get(LEASE_COOKIE)?.value);
    let valid = false;
    if (lease) {
      const hash = createHash("sha256").update(lease.token).digest("hex");
      const { data } = await supabase.rpc("demo_lease_valid", { p_token_hash: hash });
      valid = data === true;
    }
    if (!valid) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      const out = isApi
        ? NextResponse.json(
            { error: { code: "DEMO_LEASE_INVALID", message: "This demo session has ended." } },
            { status: 401 },
          )
        : NextResponse.redirect(new URL("/demo?expired=1", request.url));
      carryCookies(getResponse(), out);
      out.cookies.delete(LEASE_COOKIE);
      return out;
    }
  }

  if (!user && !isPublicPath(pathname)) {
    // A demo visitor whose session ended (idle/expired, or a concurrent request already
    // signed it out) goes back to the demo page, never to the sign-in form. /demo then
    // offers "Resume your demo" if the sandbox lease is still valid, or a fresh start.
    if (!isApi && parseLeaseCookie(request.cookies.get(LEASE_COOKIE)?.value)) {
      const out = NextResponse.redirect(new URL("/demo?expired=1", request.url));
      carryCookies(getResponse(), out);
      return out;
    }
    if (isApi) {
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

  return getResponse();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
