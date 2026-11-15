/**
 * Auth trigger + RLS, exercised DIRECTLY through PostgREST with real JWTs
 * (not through Next.js routes).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  adminClient,
  anonClient,
  createTestUser,
  dbClient,
  deleteTestUsers,
  insertSpace,
  type TestUser,
} from "./helpers";

let db: pg.Client;
let alice: TestUser;
let bob: TestUser;
let demoUser: TestUser;
const spaceIds: string[] = [];

beforeAll(async () => {
  db = await dbClient();
  alice = await createTestUser({ displayName: "Alice Prod" });
  bob = await createTestUser({ displayName: "Bob Prod" });
  demoUser = await createTestUser({
    displayName: "Synthetic Sam",
    appMetadata: { scope: "demo:0", is_synthetic: true },
  });
});

afterAll(async () => {
  if (spaceIds.length) await db.query(`delete from public.matching_spaces where id = any($1)`, [spaceIds]);
  await deleteTestUsers([alice, bob, demoUser]);
  await db?.end();
});

describe("handle_new_user trigger", () => {
  it("creates a prod profile with the display name", async () => {
    const { rows } = await db.query(`select scope, display_name, is_synthetic from public.profiles where id = $1`, [alice.id]);
    expect(rows[0]).toEqual({ scope: "prod", display_name: "Alice Prod", is_synthetic: false });
  });

  it("takes scope/synthetic only from service-set app_metadata", async () => {
    const { rows } = await db.query(`select scope, is_synthetic from public.profiles where id = $1`, [demoUser.id]);
    expect(rows[0]).toEqual({ scope: "demo:0", is_synthetic: true });
  });

  it("ignores scope smuggled through user-controlled sign-up metadata", async () => {
    const email = `it-signup-${randomUUID().slice(0, 8)}@trojanmatch.test`;
    const { data, error } = await anonClient().auth.signUp({
      email,
      password: "Test-Password-1234!",
      options: { data: { display_name: "Sneaky", scope: "demo:0", is_synthetic: true } },
    });
    expect(error).toBeNull();
    const id = data.user!.id;
    try {
      const { rows } = await db.query(`select scope, is_synthetic from public.profiles where id = $1`, [id]);
      expect(rows[0]).toEqual({ scope: "prod", is_synthetic: false });
    } finally {
      await adminClient().auth.admin.deleteUser(id);
    }
  });

  it("never moves a user who already has Space data across scopes", async () => {
    const victim = await createTestUser({ displayName: "Has Data" });
    const space = await insertSpace(db, { scope: "prod" });
    spaceIds.push(space);
    try {
      await db.query(`insert into public.participations (space_id, user_id) values ($1, $2)`, [space, victim.id]);
      const { error } = await adminClient().auth.admin.updateUserById(victim.id, {
        app_metadata: { scope: "demo:0" },
      });
      expect(error).not.toBeNull(); // SCOPE_LOCKED raised by the sync trigger
      const { rows } = await db.query(`select scope from public.profiles where id = $1`, [victim.id]);
      expect(rows[0].scope).toBe("prod");
    } finally {
      await deleteTestUsers([victim]);
    }
  });

  it("enforces the email-domain allowlist for self sign-up (reserved test TLDs exempt)", async () => {
    await db.query(`update private.app_config set value = '["usc.edu"]' where key = 'allowed_email_domains'`);
    const created: string[] = [];
    try {
      const blocked = await anonClient().auth.signUp({
        email: `it-${randomUUID().slice(0, 8)}@gmail.com`,
        password: "Test-Password-1234!",
      });
      expect(blocked.error).not.toBeNull();

      const allowed = await anonClient().auth.signUp({
        email: `it-${randomUUID().slice(0, 8)}@usc.edu`,
        password: "Test-Password-1234!",
      });
      expect(allowed.error).toBeNull();
      if (allowed.data.user) created.push(allowed.data.user.id);

      const reserved = await createTestUser({ displayName: "Reserved TLD" }); // @trojanmatch.test
      created.push(reserved.id);
    } finally {
      await db.query(`update private.app_config set value = '[]' where key = 'allowed_email_domains'`);
      for (const id of created) await adminClient().auth.admin.deleteUser(id);
    }
  });

  it("does not store email in profiles", async () => {
    const { rows } = await db.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name='profiles'`,
    );
    expect(rows.map((r) => r.column_name)).not.toContain("email");
  });
});

describe("profiles RLS", () => {
  it("a user can read their own profile", async () => {
    const { data, error } = await alice.client.from("profiles").select("id, display_name").eq("id", alice.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a user cannot read another user's profile without a shared Space", async () => {
    const { data, error } = await alice.client.from("profiles").select("id").eq("id", bob.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("anon cannot read profiles", async () => {
    const { data, error } = await anonClient().from("profiles").select("id");
    expect(data ?? []).toEqual([]);
    expect(error?.code ?? "42501").toBe("42501");
  });

  it("a user can update editable fields of their own profile", async () => {
    const { error } = await alice.client.from("profiles").update({ university: "USC" }).eq("id", alice.id);
    expect(error).toBeNull();
  });

  it("a user cannot change their own scope or synthetic flag", async () => {
    for (const patch of [{ scope: "demo:0" }, { is_synthetic: true }]) {
      const { error } = await alice.client.from("profiles").update(patch as never).eq("id", alice.id);
      expect(error?.code).toBe("42501");
    }
    const { rows } = await db.query(`select scope, is_synthetic from public.profiles where id = $1`, [alice.id]);
    expect(rows[0]).toEqual({ scope: "prod", is_synthetic: false });
  });

  it("a user cannot update someone else's profile", async () => {
    const { data } = await alice.client.from("profiles").update({ university: "Hacked" }).eq("id", bob.id).select("id");
    expect(data ?? []).toEqual([]);
    const { rows } = await db.query(`select university from public.profiles where id = $1`, [bob.id]);
    expect(rows[0].university).toBeNull();
  });
});

describe("Space visibility by scope and participation", () => {
  let prodPublic: string, prodUnlistedByAlice: string, demoPublic: string;

  beforeAll(async () => {
    prodPublic = await insertSpace(db, { scope: "prod", visibility: "public", title: "Prod Public Hack" });
    // Alice "created" this unlisted Space but never joined: created_by must grant nothing.
    prodUnlistedByAlice = await insertSpace(db, {
      scope: "prod",
      visibility: "unlisted",
      title: "Prod Unlisted Course",
      createdBy: alice.id,
    });
    demoPublic = await insertSpace(db, { scope: "demo:0", visibility: "public", title: "Demo Public Hack" });
    spaceIds.push(prodPublic, prodUnlistedByAlice, demoPublic);
  });

  const visibleIds = async (client: ReturnType<typeof anonClient>) => {
    const { data, error } = await client
      .from("matching_spaces")
      .select("id")
      .in("id", [prodPublic, prodUnlistedByAlice, demoPublic]);
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.id).sort();
  };

  it("anon sees only prod public Spaces", async () => {
    expect(await visibleIds(anonClient())).toEqual([prodPublic]);
  });

  it("a prod user sees prod public Spaces, never demo ones", async () => {
    expect(await visibleIds(bob.client)).toEqual([prodPublic]);
  });

  it("a Space creator gets no visibility from created_by alone", async () => {
    expect(await visibleIds(alice.client)).toEqual([prodPublic]);
  });

  it("a demo user sees only their own demo scope", async () => {
    expect(await visibleIds(demoUser.client)).toEqual([demoPublic]);
  });

  it("joining (participation) makes an unlisted Space visible to that user only", async () => {
    await db.query(`insert into public.participations (space_id, user_id) values ($1, $2)`, [
      prodUnlistedByAlice,
      bob.id,
    ]);
    expect(await visibleIds(bob.client)).toEqual([prodPublic, prodUnlistedByAlice].sort());
    expect(await visibleIds(alice.client)).toEqual([prodPublic]);
  });
});

describe("direct writes to RPC-only tables are denied", () => {
  it("authenticated cannot insert Spaces, teams, members or invitations directly", async () => {
    const attempts = [
      alice.client.from("matching_spaces").insert({
        scope: "prod", type: "hackathon", title: "Direct insert", title_normalized: "direct insert",
        slug: "direct-insert-xx", identity_key: "h|direct|2027", visibility: "public", join_policy: "open",
      }),
      alice.client.from("teams").insert({ space_id: randomUUID(), owner_id: alice.id, name: "Direct", target_size: 3 }),
      alice.client.from("team_members").insert({ team_id: randomUUID(), space_id: randomUUID(), user_id: alice.id }),
      alice.client.from("invitations").insert({
        space_id: randomUUID(), team_id: randomUUID(), kind: "invite", user_id: bob.id,
        actor_id: alice.id, expires_at: new Date().toISOString(),
      }),
    ];
    for (const a of attempts) {
      const { error } = await a;
      expect(error?.code).toBe("42501");
    }
  });

  it("authenticated cannot read join codes", async () => {
    const { error } = await alice.client.from("space_secrets").select("*");
    expect(error?.code).toBe("42501");
  });
});
