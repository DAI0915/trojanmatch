import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SpaceDetail = {
  id: string;
  slug: string;
  title: string;
  type: "hackathon" | "course";
  status: "open" | "closed" | "archived";
  visibility: "public" | "unlisted";
  join_policy: "open" | "code";
  requires_code: boolean;
  verification: string;
  min_team_size: number;
  max_team_size: number;
  team_size_source: "creator_stated" | "app_default";
  team_deadline_at: string | null;
  created_at: string;
  is_member: boolean;
  participant_count: number;
  recruiting_team_count: number;
  hackathon: null | {
    edition_year: number;
    organizer: string | null;
    official_url: string | null;
    starts_at: string;
    ends_at: string;
    timezone: string;
    format: "in_person" | "online" | "hybrid";
    location: string | null;
    rules_url: string | null;
  };
  course: null | {
    university: string;
    term: string;
    course_code: string;
    course_title: string | null;
    allowed_sections: string[];
    assignment_name: string;
    assignment_key: string | null;
    instructions_url: string | null;
  };
};

/** Scope-checked Space lookup by slug (RPC). Deduped per request. */
export const getSpace = cache(async (slug: string): Promise<SpaceDetail | null> => {
  if (!/^[a-z0-9-]{6,80}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_space", { p_slug: slug });
  if (error) throw new Error("Could not load Space");
  return (data as unknown as SpaceDetail) ?? null;
});
