/**
 * P5 invitations, requests, acceptance and activation. Every RPC is called
 * DIRECTLY through PostgREST as real users (anon key + user JWT); fixtures and
 * clock changes go through the owner DB connection.
 *
 * Covers: send (re-validation, capacity incl. pending, duplicates, all-or-nothing),
 * respond (authorization, accept/decline, auto-activation, expiry), one team per
 * Space (concurrent competing accepts), capacity races, requests (reserved seats),
 * cancel/withdraw, finalize (owner only, min size, deadline, closed Space,
 * concurrent finalize vs accept), solo-draft handover, Find a Team search,
 * demo/prod isolation and direct-write denial.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { anonClient, createTestUser, dbClient, deleteTestUsers, insertSpace, type TestUser } from "./helpers";

const HOURS = [20, 21, 22, 23, 44, 45, 46, 47];

let db: pg.Client;
const U: Record<string, TestUser> = {};
const NAMES = ["o1", "o2", "o3", "o4", "rec", "a", "b", "c", "d", "e", "f", "g", "hidden", "outsider", "demo"] as const;
type Name = (typeof NAMES)[number];
const spaces: string[] = [];

type R<T = Record<string, unknown>> = { data: T; error: { code?: string; message: string } | null };
const rpc = async <T = Record<string, unknown>>(u: TestUser | null, fn: string, args: Record<string, unknown> = {}) =>
  ((u ? u.client : anonClient()).rpc(fn as never, args as never) as unknown) as Promise<R<T>>;
const code = (r: R<unknown>) => (r.error ? /^([A-Z_]+)/.exec(r.error.message)?.[1] ?? r.error.code ?? r.error.message : null);
const ok = <T,>(r: R<T>): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

type Consent = Partial<Record<"visible_to_members" | "accept_invites" | "smart_match_opt_in" | "looking_for_team", boolean>>;
async function join(space: string, who: Name, consent: Consent = {}, roles = ["frontend"]) {
  const c = { visible_to_members: true, accept_invites: true, smart_match_opt_in: true, looking_for_team: true, ...consent };
  await db.query(
    `insert into public.participations (space_id, user_id, goal, desired_roles, visible_to_members, accept_invites, smart_match_opt_in, looking_for_team, setup_completed)
     values ($1, $2, 'build', $3, $4, $5, $6, $7, true)
     on conflict (space_id, user_id) do update set visible_to_members = excluded.visible_to_members, accept_invites = excluded.accept_invites,
       smart_match_opt_in = excluded.smart_match_opt_in, looking_for_team = excluded.looking_for_team`,
    [space, U[who].id, roles, c.visible_to_members, c.accept_invites, c.smart_match_opt_in, c.looking_for_team],
  );
}

/** A fresh prod Space (2–4 by default) with the given participants. */
async function newSpace(members: Name[], opts: { max?: number; min?: number } = {}) {
  const id = await insertSpace(db, { scope: "prod" });
  spaces.push(id);
  if (opts.max || opts.min) {
    await db.query(`update public.matching_spaces set min_team_size = $2, max_team_size = $3 where id = $1`, [id, opts.min ?? 2, opts.max ?? 4]);
  }
  for (const m of members) await join(id, m);
  return id;
}
async function team(owner: Name, space: string, open = 3, name = `Team ${owner}`) {
  // Fixture only: the same test owners create many teams across scenarios.
  await db.query(`delete from private.api_events where subject = $1 and kind = 'create_team'`, [U[owner].id]);
  return ok(await rpc<{ team_id: string }>(U[owner], "create_team", { p_space_id: space, p_payload: { name, open_positions: open } })).team_id;
}
const invite = (by: Name, teamId: string, who: Name[], message?: string) =>
  rpc<{ team_status: string; sent: { invitation_id: string; user_id: string }[] }>(U[by], "send_invitations", {
    p_team_id: teamId, p_user_ids: who.map((w) => U[w].id), p_message: message,
  });
const respond = (who: Name, invitationId: string, accept: boolean, leaveSolo = false) =>
  rpc<{ outcome: string; team_status: string; activated: boolean; reason?: string }>(U[who], "respond_invitation", {
    p_invitation_id: invitationId, p_accept: accept, p_leave_solo_draft: leaveSolo,
  });
const inviteId = async (teamId: string, who: Name) =>
  (await db.query(`select id from public.invitations where team_id = $1 and user_id = $2 order by created_at desc limit 1`, [teamId, U[who].id])).rows[0]?.id as string;
const teamRow = async (teamId: string) =>
  (await db.query(
    `select t.status, t.recruiting, t.activation_mode, t.target_size,
            (select count(*)::int from public.team_members m where m.team_id = t.id and m.status = 'active') members,
            (select count(*)::int from public.invitations i where i.team_id = t.id and i.status = 'pending') pending
     from public.teams t where t.id = $1`, [teamId])).rows[0] as {
    status: string; recruiting: boolean; activation_mode: string | null; target_size: number; members: number; pending: number;
  };
const invStatus = async (id: string) =>
  (await db.query(`select status, status_reason from public.invitations where id = $1`, [id])).rows[0] as { status: string; status_reason: string | null };
const activeTeams = async (space: string, who: Name) =>
  (await db.query(`select count(*)::int n from public.team_members where space_id = $1 and user_id = $2 and status = 'active'`, [space, U[who].id])).rows[0].n as number;

beforeAll(async () => {
  db = await dbClient();
  const made = await Promise.all(
    NAMES.map((n) =>
      createTestUser({
        displayName: n === "hidden" ? "Hidden Student" : `P5 ${n.toUpperCase()}`,
        appMetadata: n === "demo" ? { scope: "demo:0", is_synthetic: true } : undefined,
      }),
    ),
  );
  NAMES.forEach((n, i) => (U[n] = made[i]));
  await db.query(`update public.profiles set skills = '{react}', roles = '{frontend}', interests = '{education}', availability = $2 where id = any($1)`, [
    made.map((u) => u.id), HOURS,
  ]);
});

afterAll(async () => {
  if (spaces.length) await db.query(`delete from public.matching_spaces where id = any($1)`, [spaces]);
  const ids = Object.values(U).map((u) => u.id);
  await db.query(`delete from private.api_events where subject = any($1)`, [ids]);
  await deleteTestUsers(Object.values(U));
  await db?.end();
});

describe("send_invitations", () => {
  let space: string;
  let t1: string;
  beforeAll(async () => {
    space = await newSpace(["o1", "o2", "rec", "a", "b", "c", "d", "outsider"]);
    await join(space, "hidden", { visible_to_members: false });
    t1 = await team("o1", space, 3);
  });

  it("is an explicit action: creating a team or loading a pool sends nothing", async () => {
    const pool = ok(await rpc<{ candidates: { id: string }[] }>(U.o1, "get_match_pool", { p_space_id: space, p_team_id: t1 }));
    expect(pool.candidates.length).toBeGreaterThan(0);
    expect((await teamRow(t1)).pending).toBe(0);
    expect((await teamRow(t1)).status).toBe("draft");
  });

  it("sends pending invitations with an expiry and moves the team to forming", async () => {
    const r = ok(await invite("o1", t1, ["a", "b"], "Join us!"));
    expect(r.sent).toHaveLength(2);
    expect(r.team_status).toBe("forming");
    const rows = (await db.query(`select status, kind, actor_id, message, expires_at > now() + interval '47 hours' fresh from public.invitations where team_id = $1 order by user_id`, [t1])).rows;
    expect(rows.every((x) => x.status === "pending" && x.kind === "invite" && x.actor_id === U.o1.id && x.message === "Join us!" && x.fresh)).toBe(true);
  });

  it("invitees with a pending invitation leave the pool", async () => {
    const pool = ok(await rpc<{ candidates: { id: string }[] }>(U.o1, "get_match_pool", { p_space_id: space, p_team_id: t1 }));
    const ids = pool.candidates.map((c) => c.id);
    expect(ids).not.toContain(U.a.id);
    expect(ids).not.toContain(U.b.id);
  });

  it("rejects a duplicate pending invitation", async () => {
    expect(code(await invite("o1", t1, ["a"]))).toBe("DUPLICATE_PENDING");
  });

  it("counts pending invitations against capacity (accepted + pending + new ≤ target)", async () => {
    // target 4: 1 accepted + 2 pending → only 1 seat left
    const r = await invite("o1", t1, ["c", "d"]);
    expect(code(r)).toBe("TEAM_FULL");
    expect(r.error!.message).toContain("Only 1 open position left");
  });

  it("re-validates consent at send time and is all-or-nothing", async () => {
    await join(space, "c", { accept_invites: false });
    const before = (await teamRow(t1)).pending;
    const r = await invite("o1", t1, ["c"]);
    expect(code(r)).toBe("INVITE_NO_LONGER_VALID");
    expect(r.error!.message).toContain("P5 C");
    expect((await teamRow(t1)).pending).toBe(before);
    await join(space, "c", { accept_invites: true });
  });

  it("never reveals a hidden student's name in errors", async () => {
    const r = await invite("o1", t1, ["hidden"]);
    expect(code(r)).toBe("INVITE_NO_LONGER_VALID");
    expect(r.error!.message).not.toContain("Hidden Student");
  });

  it("rejects people outside the Space, yourself, and empty lists", async () => {
    const other = await newSpace(["g"]);
    void other;
    expect(code(await invite("o1", t1, ["g"]))).toBe("INVITE_NO_LONGER_VALID");
    expect(code(await invite("o1", t1, ["o1"]))).toBe("INVALID_INPUT");
    expect(code(await rpc(U.o1, "send_invitations", { p_team_id: t1, p_user_ids: [] }))).toBe("INVALID_INPUT");
  });

  it("only the owner or a delegated recruiter may invite", async () => {
    expect(code(await invite("outsider", t1, ["c"]))).toBe("NOT_RECRUITER");
    expect(code(await invite("o2", t1, ["c"]))).toBe("NOT_RECRUITER");
    const anon = await rpc(null, "send_invitations", { p_team_id: t1, p_user_ids: [U.c.id] });
    expect(anon.error).not.toBeNull();
    // delegated recruiter (accepted member with can_recruit) may invite
    await db.query(`insert into public.team_members (team_id, space_id, user_id, role, can_recruit) values ($1, $2, $3, 'member', true)`, [t1, space, U.rec.id]);
    // target 4: o1 + rec accepted + a, b pending → full now
    expect(code(await invite("rec", t1, ["c"]))).toBe("TEAM_FULL");
  });

  it("direct table writes are denied (RPC-only)", async () => {
    const ins = await U.o1.client.from("invitations").insert({
      space_id: space, team_id: t1, kind: "invite", user_id: U.c.id, actor_id: U.o1.id, expires_at: new Date(Date.now() + 3600e3).toISOString(),
    } as never);
    expect(ins.error).not.toBeNull();
    const id = await inviteId(t1, "a");
    const upd = await U.a.client.from("invitations").update({ status: "accepted" } as never).eq("id", id);
    expect(upd.error).not.toBeNull();
    expect((await invStatus(id)).status).toBe("pending");
    const mem = await U.a.client.from("team_members").insert({ team_id: t1, space_id: space, user_id: U.a.id } as never);
    expect(mem.error).not.toBeNull();
  });

  it("RLS: invitee and team members see the invitation, others don't", async () => {
    const id = await inviteId(t1, "a");
    expect((await U.a.client.from("invitations").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await U.rec.client.from("invitations").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await U.b.client.from("invitations").select("id").eq("id", id)).data).toHaveLength(0);
    expect((await U.outsider.client.from("invitations").select("id").eq("id", id)).data).toHaveLength(0);
  });
});

describe("respond_invitation, auto-activation and expiry", () => {
  let space: string;
  let t: string;
  beforeAll(async () => {
    space = await newSpace(["o1", "a", "b", "c", "d"]);
    t = await team("o1", space, 3);
    ok(await invite("o1", t, ["a", "b", "c"]));
  });

  it("only the invitee can respond to an invitation", async () => {
    const id = await inviteId(t, "a");
    expect(code(await respond("b", id, true))).toBe("NOT_FOUND");
    expect(code(await rpc(U.o1, "respond_invitation", { p_invitation_id: id, p_accept: true }))).toBe("NOT_FOUND");
    expect(code(await rpc(null, "respond_invitation", { p_invitation_id: id, p_accept: true }))).not.toBeNull();
  });

  it("accepting adds the member but does NOT activate while invitations are pending", async () => {
    const r = ok(await respond("a", await inviteId(t, "a"), true));
    expect(r.outcome).toBe("accepted");
    expect(r.team_status).toBe("forming");
    expect(r.activated).toBe(false);
    expect(await teamRow(t)).toMatchObject({ status: "forming", members: 2, pending: 2 });
  });

  it("a second response to the same invitation is rejected", async () => {
    expect(code(await respond("a", await inviteId(t, "a"), false))).toBe("INVITE_NO_LONGER_VALID");
  });

  it("an expired invitation can never be accepted", async () => {
    const id = await inviteId(t, "c");
    await db.query(`update public.invitations set expires_at = now() - interval '1 minute' where id = $1`, [id]);
    const r = ok(await respond("c", id, true));
    expect(r.outcome).toBe("expired");
    expect(await invStatus(id)).toEqual({ status: "expired", status_reason: "ttl" });
    expect(code(await respond("c", id, true))).toBe("INVITE_NO_LONGER_VALID");
    expect(await activeTeams(space, "c")).toBe(0);
  });

  it("declining preserves accepted members; with nothing pending the team auto-activates", async () => {
    const r = ok(await respond("b", await inviteId(t, "b"), false));
    expect(r.outcome).toBe("declined");
    expect(r.team_status).toBe("active");
    expect(r.activated).toBe(true);
    expect(await teamRow(t)).toMatchObject({ status: "active", activation_mode: "auto", members: 2, pending: 0, recruiting: true });
  });

  it("someone who declined is not suggested to (or re-invited by) that team again", async () => {
    const pool = ok(await rpc<{ candidates: { id: string }[] }>(U.o1, "get_match_pool", { p_space_id: space, p_team_id: t }));
    const ids = pool.candidates.map((c) => c.id);
    expect(ids).not.toContain(U.b.id);
    expect(ids).toContain(U.c.id); // expired ≠ declined
    expect(code(await invite("o1", t, ["b"]))).toBe("INVITE_NO_LONGER_VALID");
  });

  it("an active team keeps growing: inviting a replacement and accepting fills it", async () => {
    ok(await invite("o1", t, ["d"]));
    expect((await teamRow(t)).status).toBe("active");
    ok(await respond("d", await inviteId(t, "d"), true));
    expect(await teamRow(t)).toMatchObject({ status: "active", members: 3 });
  });

  it("refresh_invitations lazily expires stale pending invitations the caller can see", async () => {
    ok(await invite("o1", t, ["c"]));
    const id = await inviteId(t, "c");
    await db.query(`update public.invitations set expires_at = now() - interval '1 minute' where id = $1`, [id]);
    expect(ok(await rpc<number>(U.c, "refresh_invitations"))).toBe(1);
    expect((await invStatus(id)).status).toBe("expired");
  });
});

describe("one accepted team per Space and capacity under concurrency", () => {
  it("two competing acceptances by the same student: exactly one wins", async () => {
    const space = await newSpace(["o1", "o2", "c"]);
    const t1 = await team("o1", space, 2);
    const t2 = await team("o2", space, 2);
    ok(await invite("o1", t1, ["c"]));
    ok(await invite("o2", t2, ["c"]));
    const [i1, i2] = [await inviteId(t1, "c"), await inviteId(t2, "c")];
    const results = await Promise.all([respond("c", i1, true), respond("c", i2, true)]);
    const accepted = results.filter((r) => !r.error && r.data.outcome === "accepted");
    expect(accepted).toHaveLength(1);
    expect(await activeTeams(space, "c")).toBe(1);
    const statuses = [(await invStatus(i1)).status, (await invStatus(i2)).status].sort();
    expect(statuses).toEqual(["accepted", "expired"]);
    const loser = (await invStatus(i1)).status === "expired" ? i1 : i2;
    expect((await invStatus(loser)).status_reason).toBe("joined_other_team");
  });

  it("accepting one invitation expires the student's other pending invitations and requests", async () => {
    const space = await newSpace(["o1", "o2", "o3", "d"]);
    const t1 = await team("o1", space, 2);
    const t2 = await team("o2", space, 2);
    const t3 = await team("o3", space, 2);
    ok(await invite("o1", t1, ["d"]));
    ok(await invite("o2", t2, ["d"]));
    const req = ok(await rpc<{ invitation_id: string }>(U.d, "request_to_join", { p_team_id: t3 }));
    ok(await respond("d", await inviteId(t1, "d"), true));
    expect(await invStatus(await inviteId(t2, "d"))).toEqual({ status: "expired", status_reason: "joined_other_team" });
    expect(await invStatus(req.invitation_id)).toEqual({ status: "expired", status_reason: "joined_other_team" });
    // t2 lost its only pending invite → back to draft (owner alone)
    expect((await teamRow(t2)).status).toBe("draft");
  });

  it("concurrent request acceptances never exceed capacity", async () => {
    const space = await newSpace(["o1", "rec", "e", "f"]);
    const t = await team("o1", space, 1); // target 2: one seat
    await db.query(`update public.team_members set can_recruit = true where team_id = $1`, [t]);
    const re = ok(await rpc<{ invitation_id: string }>(U.e, "request_to_join", { p_team_id: t }));
    const rf = ok(await rpc<{ invitation_id: string }>(U.f, "request_to_join", { p_team_id: t }));
    const results = await Promise.all([
      rpc<{ outcome: string }>(U.o1, "respond_invitation", { p_invitation_id: re.invitation_id, p_accept: true }),
      rpc<{ outcome: string }>(U.o1, "respond_invitation", { p_invitation_id: rf.invitation_id, p_accept: true }),
    ]);
    expect(results.filter((r) => !r.error && r.data.outcome === "accepted")).toHaveLength(1);
    expect(results.filter((r) => r.error).map(code)[0]).toMatch(/TEAM_FULL|INVITE_NO_LONGER_VALID/);
    const row = await teamRow(t);
    expect(row.members).toBe(2);
    expect(row).toMatchObject({ status: "active", recruiting: false, pending: 0 });
  });
});

describe("join requests", () => {
  let space: string;
  let t: string;
  beforeAll(async () => {
    space = await newSpace(["o1", "o2", "rec", "a", "b", "e"]);
    t = await team("o1", space, 2); // target 3
  });

  it("a participant requests to join; duplicates are rejected", async () => {
    ok(await rpc(U.a, "request_to_join", { p_team_id: t, p_message: "I do frontend" }));
    expect(code(await rpc(U.a, "request_to_join", { p_team_id: t }))).toBe("DUPLICATE_PENDING");
    expect((await teamRow(t)).status).toBe("draft"); // requests don't change the team
  });

  it("the team can't invite someone with a pending request (review it instead)", async () => {
    const r = await invite("o1", t, ["a"]);
    expect(code(r)).toBe("DUPLICATE_PENDING");
    expect(r.error!.message).toContain("asked to join");
  });

  it("only recruiters can answer a request; the requester can't accept their own", async () => {
    const id = await inviteId(t, "a");
    expect(code(await respond("a", id, true))).toBe("NOT_FOUND");
    expect(code(await rpc(U.o2, "respond_invitation", { p_invitation_id: id, p_accept: true }))).toBe("NOT_FOUND");
  });

  it("pending invitations reserve seats: a request can't take a reserved seat", async () => {
    // target 3: owner + 2 pending invites → no free seat
    ok(await invite("o1", t, ["b", "e"]));
    expect(code(await rpc(U.rec, "request_to_join", { p_team_id: t }))).toBe("TEAM_FULL");
    const r = await rpc(U.o1, "respond_invitation", { p_invitation_id: await inviteId(t, "a"), p_accept: true });
    expect(code(r)).toBe("TEAM_FULL");
    ok(await rpc(U.o1, "cancel_invitation", { p_invitation_id: await inviteId(t, "e") }));
    expect(await invStatus(await inviteId(t, "e"))).toEqual({ status: "cancelled", status_reason: "cancelled_by_team" });
  });

  it("the owner accepts the request; the requester becomes a member", async () => {
    const r = ok(await rpc<{ outcome: string; team_status: string }>(U.o1, "respond_invitation", { p_invitation_id: await inviteId(t, "a"), p_accept: true }));
    expect(r.outcome).toBe("accepted");
    expect(r.team_status).toBe("forming"); // b's invite still pending
    expect(await activeTeams(space, "a")).toBe(1);
  });

  it("members can't request another team; requesters can withdraw; teams can't withdraw requests", async () => {
    const t2 = await team("o2", space, 2);
    expect(code(await rpc(U.a, "request_to_join", { p_team_id: t2 }))).toBe("ALREADY_IN_TEAM");
    const r = ok(await rpc<{ invitation_id: string }>(U.rec, "request_to_join", { p_team_id: t2 }));
    expect(code(await rpc(U.o2, "cancel_invitation", { p_invitation_id: r.invitation_id }))).toBe("NOT_FOUND");
    ok(await rpc(U.rec, "cancel_invitation", { p_invitation_id: r.invitation_id }));
    expect(await invStatus(r.invitation_id)).toEqual({ status: "cancelled", status_reason: "withdrawn" });
  });

  it("non-participants can't request (same answer as a missing team)", async () => {
    expect(code(await rpc(U.outsider, "request_to_join", { p_team_id: t }))).toBe("NOT_FOUND");
    expect(code(await rpc(U.outsider, "request_to_join", { p_team_id: crypto.randomUUID() }))).toBe("NOT_FOUND");
  });
});

describe("finalize_team", () => {
  let space: string;
  let t: string;
  beforeAll(async () => {
    space = await newSpace(["o1", "rec", "a", "b", "c"], { min: 3, max: 4 });
    t = await team("o1", space, 3);
    await db.query(`insert into public.team_members (team_id, space_id, user_id, role, can_recruit) values ($1, $2, $3, 'member', true)`, [t, space, U.rec.id]);
    ok(await invite("o1", t, ["a", "b"]));
  });

  it("a delegated recruiter (not owner) gets NOT_OWNER; others too", async () => {
    expect(code(await rpc(U.rec, "finalize_team", { p_team_id: t }))).toBe("NOT_OWNER");
    expect(code(await rpc(U.a, "finalize_team", { p_team_id: t }))).toBe("NOT_OWNER");
  });

  it("below the Space minimum → BELOW_MIN_SIZE", async () => {
    const r = await rpc(U.o1, "finalize_team", { p_team_id: t });
    expect(code(r)).toBe("BELOW_MIN_SIZE");
    expect(r.error!.message).toContain("at least 3");
  });

  it("closed Space and past deadline are rejected", async () => {
    ok(await respond("a", await inviteId(t, "a"), true)); // 3 accepted, b pending
    await db.query(`update public.matching_spaces set status = 'closed' where id = $1`, [space]);
    expect(code(await rpc(U.o1, "finalize_team", { p_team_id: t }))).toBe("SPACE_CLOSED");
    await db.query(`update public.matching_spaces set status = 'open', team_deadline_at = now() - interval '1 minute' where id = $1`, [space]);
    expect(code(await rpc(U.o1, "finalize_team", { p_team_id: t }))).toBe("DEADLINE_PASSED");
    expect(code(await respond("b", await inviteId(t, "b"), true))).toBe("DEADLINE_PASSED");
    await db.query(`update public.matching_spaces set team_deadline_at = null where id = $1`, [space]);
  });

  it("activates early, cancels pending invitations; the cancelled invitee can't accept", async () => {
    const r = ok(await rpc<{ team_status: string; cancelled_invitations: number; recruiting: boolean }>(U.o1, "finalize_team", { p_team_id: t }));
    expect(r).toMatchObject({ team_status: "active", cancelled_invitations: 1, recruiting: true });
    expect(await teamRow(t)).toMatchObject({ status: "active", activation_mode: "finalized", members: 3, pending: 0 });
    const id = await inviteId(t, "b");
    expect(await invStatus(id)).toEqual({ status: "cancelled", status_reason: "team_finalized" });
    expect(code(await respond("b", id, true))).toBe("INVITE_NO_LONGER_VALID");
    expect(code(await rpc(U.o1, "finalize_team", { p_team_id: t }))).toBe("INVALID_INPUT");
  });

  it("concurrent finalize and accept always end consistent", async () => {
    const s2 = await newSpace(["o2", "a", "b", "c"], { min: 2, max: 4 });
    const t2 = await team("o2", s2, 3);
    ok(await invite("o2", t2, ["a", "b"]));
    ok(await respond("a", await inviteId(t2, "a"), true)); // 2 accepted (min met), b pending
    const [fin, acc] = await Promise.all([
      rpc(U.o2, "finalize_team", { p_team_id: t2 }),
      respond("b", await inviteId(t2, "b"), true),
    ]);
    // Exactly one side may lose: if the accept wins, the team auto-activates
    // (3 accepted, nothing pending) and finalize correctly refuses.
    expect(!!fin.error && !!acc.error).toBe(false);
    if (fin.error) expect(code(fin)).toBe("INVALID_INPUT");
    const row = await teamRow(t2);
    expect(row.status).toBe("active");
    expect(row.pending).toBe(0);
    expect(row.members).toBeLessThanOrEqual(row.target_size);
    const b = await invStatus(await inviteId(t2, "b"));
    if (acc.error) {
      expect(code(acc)).toBe("INVITE_NO_LONGER_VALID");
      expect(b).toEqual({ status: "cancelled", status_reason: "team_finalized" });
      expect(row.members).toBe(2);
    } else {
      expect(b.status).toBe("accepted");
      expect(row.members).toBe(3);
    }
  });
});

describe("start_team_with_invitations and the solo-draft handover", () => {
  it("creates the team and sends invitations atomically (nothing left behind on failure)", async () => {
    const space = await newSpace(["o4", "a", "b"]);
    await join(space, "b", { looking_for_team: false });
    const before = (await db.query(`select count(*)::int n from public.teams where space_id = $1`, [space])).rows[0].n;
    const bad = await rpc(U.o4, "start_team_with_invitations", {
      p_space_id: space, p_team: { name: "Atomic", open_positions: 3 }, p_user_ids: [U.a.id, U.b.id],
    });
    expect(code(bad)).toBe("INVITE_NO_LONGER_VALID");
    expect((await db.query(`select count(*)::int n from public.teams where space_id = $1`, [space])).rows[0].n).toBe(before);
    const good = ok(await rpc<{ team_id: string; team_status: string; created_team: boolean }>(U.o4, "start_team_with_invitations", {
      p_space_id: space, p_team: { name: "Atomic", open_positions: 3 }, p_user_ids: [U.a.id],
    }));
    expect(good).toMatchObject({ team_status: "forming", created_team: true });
    expect(await teamRow(good.team_id)).toMatchObject({ members: 1, pending: 1, target_size: 4 });
  });

  it("accepting while owning a solo draft team requires explicit confirmation, then closes it", async () => {
    const space = await newSpace(["o1", "f", "g"]);
    const t = await team("o1", space, 2);
    ok(await invite("o1", t, ["f"]));
    const id = await inviteId(t, "f");
    // f was invited while team-less, then started an own team (still alone, one pending invite)
    const tf = await team("f", space, 2);
    ok(await invite("f", tf, ["g"]));
    const first = await respond("f", id, true);
    expect(code(first)).toBe("OWN_DRAFT_TEAM");
    expect(await activeTeams(space, "f")).toBe(1);
    const r = ok(await respond("f", id, true, true));
    expect(r.outcome).toBe("accepted");
    expect((await teamRow(tf)).status).toBe("archived");
    expect(await invStatus(await inviteId(tf, "g"))).toEqual({ status: "cancelled", status_reason: "team_closed" });
    const mine = (await db.query(`select team_id from public.team_members where space_id = $1 and user_id = $2 and status = 'active'`, [space, U.f.id])).rows;
    expect(mine).toEqual([{ team_id: t }]);
  });

  it("someone on a real team (with members) can't accept another team's invitation", async () => {
    const space = await newSpace(["o1", "o2", "a", "b"]);
    const t1 = await team("o1", space, 2);
    ok(await invite("o1", t1, ["a"]));
    ok(await respond("a", await inviteId(t1, "a"), true));
    const t2 = await team("o2", space, 2);
    // a is on t1 → not eligible to be invited
    expect(code(await invite("o2", t2, ["a"]))).toBe("INVITE_NO_LONGER_VALID");
  });
});

describe("find_teams", () => {
  let space: string;
  let tFront: string;
  let tData: string;
  beforeAll(async () => {
    space = await newSpace(["o1", "o2", "o3", "a", "b", "c"]);
    await join(space, "hidden", { visible_to_members: false });
    tFront = ok(await rpc<{ team_id: string }>(U.o1, "create_team", {
      p_space_id: space,
      p_payload: { name: "Frontend Folks", description: "Accessible web apps", open_positions: 2, requirements: { must_roles: ["frontend"], skills: ["react"], topics: ["accessibility"], goal: "build" } },
    })).team_id;
    tData = ok(await rpc<{ team_id: string }>(U.o2, "create_team", {
      p_space_id: space,
      p_payload: { name: "Data Crew", open_positions: 1, requirements: { must_roles: ["data"], skills: ["sql"], goal: "competitive" } },
    })).team_id;
    // a full team is never listed
    const full = await team("o3", space, 1);
    ok(await invite("o3", full, ["c"]));
    // hidden (no visibility) member on Data Crew: counted, but no features returned
    await db.query(`update public.teams set target_size = 3 where id = $1`, [tData]);
    await db.query(`insert into public.team_members (team_id, space_id, user_id, role) values ($1, $2, $3, 'member')`, [tData, space, U.hidden.id]);
  });

  type Found = { teams: { id: string; name: string; open_positions: number; hidden_members: number; member_profiles: { id: string; skills: string[] }[]; shared_hours: number | null; my_request: unknown }[]; on_team: boolean; total_recruiting: number };
  const find = (who: Name, filters: Record<string, unknown> = {}) => rpc<Found>(U[who], "find_teams", { p_space_id: space, p_filters: filters });

  it("lists recruiting teams with free seats only (not full or own team)", async () => {
    const r = ok(await find("a"));
    expect(r.teams.map((t) => t.name).sort()).toEqual(["Data Crew", "Frontend Folks"]);
    expect(r.on_team).toBe(false);
    const own = ok(await find("o1"));
    expect(own.teams.map((t) => t.name)).toEqual(["Data Crew"]);
    expect(own.on_team).toBe(true);
  });

  it("filters by text, roles, skills, interests, goal and shared hours in SQL", async () => {
    const names = async (f: Record<string, unknown>) => ok(await find("a", f)).teams.map((t) => t.name).sort();
    expect(await names({ q: "crew" })).toEqual(["Data Crew"]);
    expect(await names({ q: "accessible" })).toEqual(["Frontend Folks"]);
    expect(await names({ roles: ["frontend"] })).toEqual(["Frontend Folks"]);
    expect(await names({ skills: ["sql"] })).toEqual(["Data Crew"]);
    expect(await names({ topics: ["accessibility"] })).toEqual(["Frontend Folks"]);
    expect(await names({ topics: ["education"] })).toEqual(["Data Crew", "Frontend Folks"]); // members' interests
    expect(await names({ goal: "competitive" })).toEqual(["Data Crew"]);
    expect(await names({ min_shared_hours: 8 })).toEqual(["Data Crew", "Frontend Folks"]);
    expect(await names({ min_shared_hours: 9 })).toEqual([]);
    expect(code(await find("a", { roles: "frontend" }))).toBe("INVALID_INPUT");
  });

  it("returns only consenting members' features and counts hidden ones", async () => {
    const data = ok(await find("a")).teams.find((t) => t.id === tData)!;
    expect(data.hidden_members).toBe(1);
    expect(data.member_profiles.map((m) => m.id)).toEqual([U.o2.id]);
    expect(JSON.stringify(ok(await find("a")))).not.toContain(U.hidden.id);
    expect(data.shared_hours).toBe(HOURS.length);
  });

  it("shows my pending request", async () => {
    ok(await rpc(U.b, "request_to_join", { p_team_id: tFront }));
    const r = ok(await find("b"));
    expect(r.teams.find((t) => t.id === tFront)!.my_request).not.toBeNull();
    expect(r.teams.find((t) => t.id === tData)!.my_request).toBeNull();
  });

  it("non-participants, other scopes and anon are refused", async () => {
    expect(code(await find("outsider"))).toBe("NOT_PARTICIPANT");
    expect(code(await find("demo"))).toBe("NOT_FOUND");
    expect((await rpc(null, "find_teams", { p_space_id: space })).error).not.toBeNull();
  });
});

describe("demo / production isolation", () => {
  it("a demo persona can't invite, request or respond across scopes", async () => {
    const space = await newSpace(["o1", "a"]);
    const t = await team("o1", space, 2);
    ok(await invite("o1", t, ["a"]));
    const id = await inviteId(t, "a");
    expect(code(await rpc(U.demo, "request_to_join", { p_team_id: t }))).toBe("NOT_FOUND");
    expect(code(await rpc(U.demo, "respond_invitation", { p_invitation_id: id, p_accept: true }))).toBe("NOT_FOUND");
    expect(code(await rpc(U.demo, "cancel_invitation", { p_invitation_id: id }))).toBe("NOT_FOUND");
    expect(code(await rpc(U.demo, "send_invitations", { p_team_id: t, p_user_ids: [U.a.id] }))).toBe("NOT_RECRUITER");
    expect(code(await rpc(U.demo, "finalize_team", { p_team_id: t }))).toBe("NOT_OWNER");
    expect((await U.demo.client.from("invitations").select("id").eq("id", id)).data).toHaveLength(0);
  });
});
