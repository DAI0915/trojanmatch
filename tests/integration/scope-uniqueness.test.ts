/**
 * Regression: Space identity + hackathon URL/edition uniqueness is per SCOPE.
 * Production and demo sandboxes must never collide, while duplicates inside one
 * scope are rejected. Each test runs in a transaction that is rolled back.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { dbClient, insertSpace } from "./helpers";

let db: pg.Client;

beforeAll(async () => {
  db = await dbClient();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
});
afterEach(async () => {
  await db.query("rollback");
});

const URL_NORM = "https://treehacks.com";

async function insertHackathonDetails(spaceId: string, scope: string, year = 2027, url: string | null = URL_NORM) {
  await db.query(
    `insert into public.space_hackathon_details
       (space_id, scope, edition_year, official_url, official_url_normalized, starts_at, ends_at, timezone, format)
     values ($1, $2, $3, $4, $5, '2027-02-14T17:00:00Z', '2027-02-16T20:00:00Z', 'America/Los_Angeles', 'in_person')`,
    [spaceId, scope, year, url, url],
  );
}

async function expectPgError(run: () => Promise<unknown>, code: string, constraint?: string) {
  await db.query("savepoint sp");
  try {
    await run();
    throw new Error(`expected ${code} but the statement succeeded`);
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    expect(e.code).toBe(code);
    if (constraint) expect(e.constraint).toBe(constraint);
  } finally {
    await db.query("rollback to savepoint sp");
  }
}

describe("hackathon official URL + edition year", () => {
  it("allows the same URL+year once in prod AND once in a demo sandbox", async () => {
    const prod = await insertSpace(db, { scope: "prod" });
    const demo = await insertSpace(db, { scope: "demo:1" });
    await insertHackathonDetails(prod, "prod");
    await insertHackathonDetails(demo, "demo:1"); // must NOT collide with prod
    const { rows } = await db.query(
      `select count(*)::int as n from public.space_hackathon_details where official_url_normalized = $1`,
      [URL_NORM],
    );
    expect(rows[0].n).toBe(2);
  });

  it("rejects a second prod Space with the same URL+year", async () => {
    const a = await insertSpace(db, { scope: "prod" });
    const b = await insertSpace(db, { scope: "prod" });
    await insertHackathonDetails(a, "prod");
    await expectPgError(() => insertHackathonDetails(b, "prod"), "23505", "space_hackathon_details_scope_url_year_uq");
  });

  it("allows the same URL for a different edition year (TreeHacks 2026 vs 2027)", async () => {
    const y26 = await insertSpace(db, { scope: "prod" });
    const y27 = await insertSpace(db, { scope: "prod" });
    await insertHackathonDetails(y26, "prod", 2026);
    await insertHackathonDetails(y27, "prod", 2027);
  });

  it("allows multiple Spaces without an official URL", async () => {
    const a = await insertSpace(db, { scope: "prod" });
    const b = await insertSpace(db, { scope: "prod" });
    await insertHackathonDetails(a, "prod", 2027, null);
    await insertHackathonDetails(b, "prod", 2027, null);
  });

  it("rejects detail rows whose scope differs from their Space (composite FK)", async () => {
    const prod = await insertSpace(db, { scope: "prod" });
    await expectPgError(() => insertHackathonDetails(prod, "demo:1"), "23503", "space_hackathon_details_space_fk");
  });
});

describe("Space identity key", () => {
  it("is unique within a scope", async () => {
    await insertSpace(db, { scope: "prod", identityKey: "h|treehacks|2027" });
    await expectPgError(() => insertSpace(db, { scope: "prod", identityKey: "h|treehacks|2027" }), "23505",
      "matching_spaces_scope_identity_key",
    );
  });

  it("may repeat across scopes (prod vs demo vs another demo slot)", async () => {
    await insertSpace(db, { scope: "prod", identityKey: "h|treehacks|2027" });
    await insertSpace(db, { scope: "demo:0", identityKey: "h|treehacks|2027" });
    await insertSpace(db, { scope: "demo:1", identityKey: "h|treehacks|2027" });
  });

  it("rejects malformed scopes", async () => {
    for (const bad of ["production", "demo", "demo:x", "demo:123", "DEMO:1"]) {
      await expectPgError(() => insertSpace(db, { scope: bad }), "23514");
    }
  });
});
