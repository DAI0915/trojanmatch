import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe for deploy verification. Exposes no configuration. */
export function GET() {
  return NextResponse.json({ ok: true, service: "trojanmatch" });
}
