import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { fromDbError } from "@/lib/api/errors";
import { createSpaceSchema } from "@/lib/validation/space";

/** POST /api/spaces/check-duplicates — exact/URL/similar matches before creating. */
export const POST = withAuth(async ({ req, supabase }) => {
  const payload = await parseJson(req, createSpaceSchema);
  const { data, error } = await supabase.rpc("check_space_duplicates", { p_payload: payload });
  if (error) throw fromDbError(error);
  return NextResponse.json({ matches: data ?? [] });
});
