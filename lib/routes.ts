/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_EXACT = new Set(["/", "/sign-in", "/sign-up", "/demo"]);
const PUBLIC_PREFIXES = ["/auth/", "/api/demo/", "/api/health"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Only allow same-site relative redirects (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/spaces"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
