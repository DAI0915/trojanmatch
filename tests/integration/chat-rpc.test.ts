/**
 * P6 Team chat + kickoff briefs: PostgreSQL permissions (RLS + triggers) and
 * Supabase Realtime delivery, exercised as real users through PostgREST and the
 * Realtime websocket.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { anonClient, createTestUser, dbClient, deleteTestUsers, insertSpace, type TestUser } from "./helpers";

let db: pg.Client;
const U: Record<string, TestUser> = {};
const NAMES = ["owner", "member", "pending", "declined", "otherTeam", "creator", "outsider", "demo"] as const;
type Name = (typeof NAMES)[number];
let space: string;
let team: string;
let otherTeamId: string;

type R<T = unknown> = { data: T; error: { code?: string; message: string } | null };
const rpc = async <T = Record<string, unknown>>(u: TestUser, fn: string, args: Record<string, unknown>) =>
  (u.client.rpc(fn as never, args as never) as unknown) as Promise<R<T>>;
const ok = <T,>(r: R<T>): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const join = (who: Name) =>
  db.query(
    `insert into public.participations (space_id, user_id, goal, desired_roles, visible_to_members, accept_invites, smart_match_opt_in, looking_for_team, setup_completed)
     values ($1, $2, 'build', '{frontend}', true, true, true, true, true)`,
    [space, U[who].id],
  );
const send = (who: Name, body: string, clientId: string = randomUUID(), teamId = team) =>
  U[who].client.from("messages").insert({ team_id: teamId, body, client_id: clientId } as never).select("id, author_id, body").single() as unknown as Promise<
    R<{ id: string; author_id: string; body: string }>
  >;
const read = async (who: Name, teamId = team) => (await U[who].client.from("messages").select("id").eq("team_id", teamId)).data ?? [];
const inviteId = async (who: Name) =>
  (await db.query(`select id from public.invitations where team_id = $1 and user_id = $2`, [team, U[who].id])).rows[0].id as string;

beforeAll(async () => {
  db = await dbClient();
  const made = await Promise.all(
    NAMES.map((n) => createTestUser({ displayName: `Chat ${n}`, appMetadata: n === "demo" ? { scope: "demo:0", is_synthetic: true } : undefined })),
  );
  NAMES.forEach((n, i) => (U[n] = made[i]));
  space = await insertSpace(db, { scope: "prod", createdBy: U.creator.id });
  for (const n of ["owner", "member", "pending", "declined", "otherTeam", "creator"] as Name[]) await join(n);

  team = ok(await rpc<{ team_id: string }>(U.owner, "create_team", { p_space_id: space, p_payload: { name: "Chatters", open_positions: 3 } })).team_id;
  otherTeamId = ok(await rpc<{ team_id: string }>(U.otherTeam, "create_team", { p_space_id: space, p_payload: { name: "Others", open_positions: 1 } })).team_id;
  ok(await rpc(U.owner, "send_invitations", { p_team_id: team, p_user_ids: [U.member.id, U.declined.id] }));
});

afterAll(async () => {
  await db.query(`delete from public.matching_spaces where id = $1`, [space]);
  const ids = Object.values(U).map((u) => u.id);
  await db.query(`delete from private.api_events where subject = any($1)`, [ids]);
  await deleteTestUsers(Object.values(U));
  await db?.end();
});

describe("chat requires an ACTIVE team", () => {
  it("accepted members can't chat while the team is still forming", async () => {
    ok(await rpc(U.member, "respond_invitation", { p_invitation_id: await inviteId("member"), p_accept: true }));
    expect((await db.query(`select status from public.teams where id = $1`, [team])).rows[0].status).toBe("forming");
    expect((await send("member", "too early")).error).not.toBeNull();
    expect((await send("owner", "too early")).error).not.toBeNull();
  });

  it("the team activates once the last invitee declines; then members chat", async () => {
    ok(await rpc(U.declined, "respond_invitation", { p_invitation_id: await inviteId("declined"), p_accept: false }));
    expect((await db.query(`select status from public.teams where id = $1`, [team])).rows[0].status).toBe("active");
    // A new pending invitee while the team is active (it keeps recruiting).
    ok(await rpc(U.owner, "send_invitations", { p_team_id: team, p_user_ids: [U.pending.id] }));
    const r = ok(await send("member", "  Hello team!  "));
    expect(r.body).toBe("Hello team!"); // trimmed by trigger
    expect(r.author_id).toBe(U.member.id);
    ok(await send("owner", "Hi!"));
    expect(await read("owner")).toHaveLength(2);
    expect(await read("member")).toHaveLength(2);
  });
});

describe("nobody else can read or write", () => {
  for (const who of ["pending", "declined", "otherTeam", "creator", "outsider", "demo"] as Name[]) {
    it(`${who}: no rows, insert denied`, async () => {
      expect(await read(who)).toHaveLength(0);
      const r = await send(who, `intrusion by ${who}`);
      expect(r.error).not.toBeNull();
    });
  }

  it("anon gets nothing", async () => {
    const { data } = await anonClient().from("messages").select("id").eq("team_id", team);
    expect(data ?? []).toHaveLength(0);
  });

  it("members of another team can't read this team, and this team can't post there", async () => {
    expect((await send("owner", "wrong team", randomUUID(), otherTeamId)).error).not.toBeNull();
  });
});

describe("integrity", () => {
  it("messages are append-only (no update/delete) and the author can't be spoofed", async () => {
    const [m] = await read("member");
    const upd = await U.member.client.from("messages").update({ body: "edited" } as never).eq("id", m.id);
    expect(upd.error).not.toBeNull();
    const del = await U.member.client.from("messages").delete().eq("id", m.id).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const spoof = await U.member.client.from("messages").insert({ team_id: team, body: "spoof", author_id: U.owner.id } as never);
    expect(spoof.error).not.toBeNull();
  });

  it("the same client_id can't be stored twice (idempotent retries)", async () => {
    const cid = randomUUID();
    ok(await send("member", "once", cid));
    const dup = await send("member", "once", cid);
    expect(dup.error?.code).toBe("23505");
    expect((await db.query(`select count(*)::int n from public.messages where client_id = $1`, [cid])).rows[0].n).toBe(1);
  });

  it("rejects empty, whitespace-only and over-long bodies", async () => {
    expect((await send("member", "")).error).not.toBeNull();
    expect((await send("member", "   ")).error).not.toBeNull();
    expect((await send("member", "x".repeat(2001))).error).not.toBeNull();
  });

  it("rate-limits a single author (20 per minute)", async () => {
    const before = (await db.query(`select count(*)::int n from public.messages where author_id = $1 and created_at > now() - interval '1 minute'`, [U.owner.id])).rows[0].n;
    for (let i = before; i < 20; i++) ok(await send("owner", `burst ${i}`));
    const r = await send("owner", "one too many");
    expect(r.error?.message).toMatch(/^RATE_LIMITED/);
  });
});

describe("kickoff briefs", () => {
  const brief = { version: 1, source: "template", content: { goal_summary: "x" } };
  it("members can store a brief (author forced to caller); others can't read or write", async () => {
    const r = await U.member.client.from("kickoff_briefs").insert({ team_id: team, brief, source: "template" } as never).select("generated_by").single();
    expect(r.error).toBeNull();
    expect((r.data as unknown as { generated_by: string }).generated_by).toBe(U.member.id);
    for (const who of ["pending", "declined", "otherTeam", "creator", "outsider"] as Name[]) {
      expect((await U[who].client.from("kickoff_briefs").select("id").eq("team_id", team)).data ?? []).toHaveLength(0);
      expect((await U[who].client.from("kickoff_briefs").insert({ team_id: team, brief, source: "template" } as never)).error).not.toBeNull();
    }
  });

  it("is limited to 6 per team per hour", async () => {
    for (let i = 1; i < 6; i++) expect((await U.owner.client.from("kickoff_briefs").insert({ team_id: team, brief, source: "template" } as never)).error).toBeNull();
    const r = await U.owner.client.from("kickoff_briefs").insert({ team_id: team, brief, source: "template" } as never);
    expect(r.error?.message).toMatch(/^RATE_LIMITED/);
  });
});

describe("Realtime delivery (two authenticated users)", () => {
  async function subscribe(who: Name, received: string[]): Promise<RealtimeChannel> {
    const c = U[who].client;
    const { data } = await c.auth.getSession();
    await c.realtime.setAuth(data.session!.access_token);
    return new Promise((resolve, reject) => {
      const ch = c
        .channel(`it-${who}-${randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `team_id=eq.${team}` }, (p) =>
          received.push((p.new as { body: string }).body),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") resolve(ch);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`${who}: ${status}`));
        });
    });
  }

  it("a member's message reaches the other member live; outsiders and pending invitees receive nothing", async () => {
    // Fresh author budget for this test.
    await db.query(`delete from public.messages where author_id = $1`, [U.member.id]);
    const got: Record<string, string[]> = { owner: [], pending: [], outsider: [], otherTeam: [] };
    const channels = await Promise.all((Object.keys(got) as Name[]).map((n) => subscribe(n, got[n])));
    await new Promise((r) => setTimeout(r, 3000)); // let postgres_changes subscriptions register
    const text = `realtime ${randomUUID()}`;
    ok(await send("member", text));
    const deadline = Date.now() + 10_000;
    while (!got.owner.includes(text) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    expect(got.owner).toContain(text);
    await new Promise((r) => setTimeout(r, 1500));
    expect(got.pending).toEqual([]);
    expect(got.outsider).toEqual([]);
    expect(got.otherTeam).toEqual([]);
    for (const [i, n] of (Object.keys(got) as Name[]).entries()) await U[n].client.removeChannel(channels[i]);
  }, 30_000);
});
