import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { createSpaceSchema } from "@/lib/validation/space";

const searchSchema = z.object({
  type: z.enum(["hackathon", "course"]).optional(),
  q: z.string().trim().max(100).optional(),
});

/** GET /api/spaces?type=&q= — scope-isolated search (RPC enforces visibility). */
export const GET = withAuth(async ({ req, supabase }) => {
  const parsed = searchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) throw new ApiError("INVALID_INPUT", "Invalid search.");
  const { data, error } = await supabase.rpc("search_spaces", {
    p_type: parsed.data.type,
    p_query: parsed.data.q,
    p_limit: 24,
  });
  if (error) throw fromDbError(error);
  return NextResponse.json({ spaces: data });
});

/** POST /api/spaces — create a Space; the RPC enrolls the creator and creates NO team. */
export const POST = withAuth(async ({ req, supabase }) => {
  const payload = await parseJson(req, createSpaceSchema);
  const { data, error } = await supabase.rpc("create_space", { p_payload: payload });
  if (error) throw fromDbError(error);
  const result = data as { space_id: string; slug: string; join_code: string | null };
  // The join code is returned once to the creator; any participant can fetch it later.
  return NextResponse.json({ space: result }, { status: 201 });
});
