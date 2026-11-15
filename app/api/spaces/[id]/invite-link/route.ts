import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { fromDbError } from "@/lib/api/errors";
import { spaceIdParam } from "@/lib/api/params";
import { publicEnv } from "@/lib/env";

/** GET /api/spaces/:id/invite-link — participants only (any participant, not just the creator). */
export const GET = withAuth<{ id: string }>(async ({ supabase, params }) => {
  const { data, error } = await supabase.rpc("get_invite_link", { p_space_id: spaceIdParam(params) });
  if (error) throw fromDbError(error);
  const { slug, join_code } = data as { slug: string; join_code: string | null };
  return NextResponse.json(
    { url: `${publicEnv.NEXT_PUBLIC_APP_URL}/s/${slug}`, join_code },
    { headers: { "cache-control": "no-store" } },
  );
});
