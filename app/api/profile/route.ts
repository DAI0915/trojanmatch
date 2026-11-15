import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";

/** GET /api/profile — the caller's own global profile (RLS-bound). */
export const GET = withAuth(async ({ supabase, user }) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, scope, display_name, university, bio, skills, roles, interests, experience, working_style, availability, timezone, onboarded, is_synthetic")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError("NOT_FOUND", "Profile not found.");
  return NextResponse.json({ profile: data });
});
