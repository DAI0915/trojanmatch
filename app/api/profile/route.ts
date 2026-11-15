import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { profileCompleteness, profileSchema } from "@/lib/validation/profile";

const COLUMNS =
  "id, scope, display_name, university, bio, skills, roles, interests, experience, working_style, availability, timezone, onboarded, is_synthetic";

/** GET /api/profile — the caller's own global profile (RLS-bound). */
export const GET = withAuth(async ({ supabase, user }) => {
  const { data, error } = await supabase.from("profiles").select(COLUMNS).eq("id", user.id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError("NOT_FOUND", "Profile not found.");
  return NextResponse.json({ profile: data });
});

/** PUT /api/profile — update own editable fields (column grants + RLS enforce ownership). */
export const PUT = withAuth(async ({ req, supabase, user }) => {
  const input = await parseJson(req, profileSchema);
  const { complete } = profileCompleteness(input);
  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: input.display_name,
      university: input.university || null,
      bio: input.bio || null,
      skills: input.skills,
      roles: input.roles,
      interests: input.interests,
      experience: input.experience as "beginner" | "intermediate" | "advanced" | null,
      working_style: input.working_style,
      availability: input.availability,
      timezone: input.timezone,
      onboarded: complete,
    })
    .eq("id", user.id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError("NOT_FOUND", "Profile not found.");
  return NextResponse.json({ profile: data });
});
