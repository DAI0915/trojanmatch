/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer)
 * must match the app origin. Safe methods are not checked.
 */
export function isAllowedOrigin(
  method: string,
  headers: { get(name: string): string | null },
  appUrl: string,
): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return true;
  const expected = new URL(appUrl).origin;
  const origin = headers.get("origin");
  if (origin) return origin === expected;
  const referer = headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return false;
}
