/**
 * Behavioral RLS/permission probe against a HOSTED project, through PostgREST
 * with the anon key and real user sessions (no service role). Read-only:
 * every write it attempts MUST be rejected.
 *
 * Usage: DEV_TEST_PASSWORD=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *        npx tsx scripts/verify-cloud.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = process.env.DEV_TEST_PASSWORD!;
if (!url || !anonKey || !password) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / DEV_TEST_PASSWORD");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function signedIn(email: string) {
  const c = createClient(url, anonKey, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { c, id: data.user.id };
}

async function main() {
  console.log(`Target: ${new URL(url).host}\n`);
  const anon = createClient(url, anonKey, opts);
  const a = await signedIn("dev1@trojanmatch.test");
  const b = await signedIn("dev2@trojanmatch.test");
  check("confirmed dev accounts can sign in", true);

  const own = await a.c.from("profiles").select("id, scope").eq("id", a.id);
  check("user reads own profile", !own.error && own.data?.length === 1 && own.data[0].scope === "prod");

  const other = await a.c.from("profiles").select("id").eq("id", b.id);
  check("user cannot read another profile without a shared Space", !other.error && other.data?.length === 0);

  const anonProfiles = await anon.from("profiles").select("id");
  check("anon cannot read profiles", (anonProfiles.data ?? []).length === 0);

  const scopeEsc = await a.c.from("profiles").update({ scope: "demo:0" } as never).eq("id", a.id);
  check("user cannot change own scope", scopeEsc.error?.code === "42501", scopeEsc.error?.code);

  const synth = await a.c.from("profiles").update({ is_synthetic: true } as never).eq("id", a.id);
  check("user cannot change own synthetic flag", synth.error?.code === "42501", synth.error?.code);

  const insSpace = await a.c.from("matching_spaces").insert({
    scope: "prod", type: "hackathon", title: "Probe", title_normalized: "probe", slug: "probe-should-fail",
    identity_key: "h|probe|2027", visibility: "public", join_policy: "open",
  } as never);
  check("direct Space insert denied", insSpace.error?.code === "42501", insSpace.error?.code);

  const insTeam = await a.c.from("teams").insert({ space_id: crypto.randomUUID(), owner_id: a.id, name: "Probe", target_size: 3 } as never);
  check("direct team insert denied", insTeam.error?.code === "42501", insTeam.error?.code);

  const insInv = await a.c.from("invitations").insert({
    space_id: crypto.randomUUID(), team_id: crypto.randomUUID(), kind: "invite", user_id: b.id,
    actor_id: a.id, expires_at: new Date().toISOString(),
  } as never);
  check("direct invitation insert denied", insInv.error?.code === "42501", insInv.error?.code);

  const secrets = await a.c.from("space_secrets").select("*");
  check("join codes unreadable", secrets.error?.code === "42501", secrets.error?.code);

  for (const fn of ["current_scope", "is_participant", "rls_auto_enable", "handle_new_user"]) {
    for (const [who, client] of [["anon", anon], ["authenticated", a.c]] as const) {
      const r = await client.rpc(fn as never);
      check(`rpc ${fn} not callable by ${who}`, r.error !== null, r.error?.code);
    }
  }

  const priv = await a.c.schema("private" as never).from("demo_slots").select("*");
  check("private schema not exposed", priv.error !== null, priv.error?.code);

  // P2 Space RPCs: anon may search/read public metadata only; writes need a session.
  const search = await anon.rpc("search_spaces" as never, { p_type: "hackathon" } as never);
  check("anon can search public Spaces (prod scope only)", !search.error, search.error?.code);
  for (const fn of ["create_space", "join_space", "get_invite_link", "check_space_duplicates"]) {
    const r = await anon.rpc(fn as never, {} as never);
    check(`rpc ${fn} not callable by anon`, r.error !== null, r.error?.code);
  }
  const badJoin = await a.c.rpc("join_space" as never, { p_space_id: crypto.randomUUID() } as never);
  check("join_space on an unknown Space is refused", /^NOT_FOUND/.test(badJoin.error?.message ?? ""), badJoin.error?.message?.split(":")[0]);
  const badLink = await a.c.rpc("get_invite_link" as never, { p_space_id: crypto.randomUUID() } as never);
  check("get_invite_link refuses non-participants", /^NOT_PARTICIPANT/.test(badLink.error?.message ?? ""), badLink.error?.message?.split(":")[0]);

  const spaces = await anon.from("matching_spaces").select("id");
  check("anon Space read works (prod public only)", !spaces.error, `${spaces.data?.length ?? 0} rows`);

  await a.c.auth.signOut();
  await b.c.auth.signOut();
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Probe error:", e.message);
  process.exit(1);
});
