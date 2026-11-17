/** Dev-only: prints what Smart Formation / Grow return for a demo persona (local DB). */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { personaEmail } from "../lib/demo/personas";
import { personaPassword } from "../lib/demo/password";

config({ path: ".env.local", quiet: true });
const [persona = "jordan", mode = "form", slotArg = "1"] = process.argv.slice(2);

async function main() {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const email = personaEmail(persona, Number(slotArg));
  const { error } = await c.auth.signInWithPassword({ email, password: personaPassword(process.env.DEMO_PERSONA_SECRET!, email) });
  if (error) throw error;
  const { data: spaces } = await c.rpc("search_spaces", { p_query: "AI@USC" });
  const space = spaces![0];
  const { loadPool, formProposal, recommendMembers, matchParamsSchema } = await import("../lib/matching/service");
  if (mode === "form") {
    const pool = await loadPool(c as never, space.id);
    const t0 = performance.now();
    const r = formProposal(pool, matchParamsSchema.parse({ team_size: 4 }));
    console.log(`status=${r.status} ${Math.round(performance.now() - t0)}ms`, r.funnel, r.search);
    for (const t of r.proposals) {
      console.log(`\n${t.band} ${t.score}`, t.members.map((m) => `${m.name}[${m.role ?? "-"}]`).join(", "));
      for (const d of t.dimensions) console.log(`  ${d.label.padEnd(22)} ${d.score.toFixed(2)} ×${d.weight}  ${d.summary}`);
      console.log("  windows:", t.schedule.windows.join(", "), "| gaps:", t.gaps.join(" "));
    }
    console.log("\nbaseline", r.baseline?.score, r.baseline?.team.members.map((m) => `${m.name}[${m.role ?? "-"}]`).join(", "), "roleCoverage", r.baseline?.roleCoverage, "vs", r.comparison);
    console.log("reasons:", r.proposals[0]?.members.map((m) => `${m.name}: ${m.reasons.join("; ")}`).join("\n         "));
  } else {
    const { data: tm } = await c.from("team_members").select("team_id").eq("space_id", space.id).eq("status", "active").limit(50);
    const { data: me } = await c.auth.getUser();
    const { data: mine } = await c.from("team_members").select("team_id").eq("space_id", space.id).eq("user_id", me.user!.id);
    void tm;
    const pool = await loadPool(c as never, space.id, mine![0].team_id);
    const r = recommendMembers(pool, matchParamsSchema.parse({ team_id: mine![0].team_id }));
    console.log(r.team, "open", r.open_slots, r.missing, "current", r.current.score);
    for (const x of r.candidates) console.log(`  +${x.gain.toFixed(3)} → ${x.score_after}  ${x.candidate.name} fills=${x.fills_roles.map((f) => f.role)} adds=${x.adds_skills} hours=${x.shared_hours_after}`);
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
