import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedOrigin } from "@/lib/api/origin";
import { publicEnv } from "@/lib/env";

/** POST-only sign out (Origin-checked) so links/prefetch can't log users out. */
export async function POST(request: NextRequest) {
  if (!isAllowedOrigin("POST", request.headers, publicEnv.NEXT_PUBLIC_APP_URL)) {
    return NextResponse.json({ error: { code: "FORBIDDEN_ORIGIN", message: "Rejected." } }, { status: 403 });
  }
  const supabase = await createClient();
  // Sign out THIS device only. supabase-js defaults to scope 'global', which
  // would also revoke the user's sessions on every other device.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
