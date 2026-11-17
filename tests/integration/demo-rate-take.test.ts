/**
 * Migration 0012: public.demo_rate_take — the atomic demo throttle that reports
 * WHEN a visitor may try again (used for Retry-After on /api/demo/*).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { adminClient, anonClient, createTestUser, dbClient, deleteTestUsers, type TestUser } from "./helpers";

const KIND = "rate_take_test";
const subject = () => `demo:${randomBytes(16).toString("hex")}`;
let db: pg.Client;
let user: TestUser;

beforeAll(async () => {
  db = await dbClient();
  user = await createTestUser({ displayName: "Rate Take" });
});
afterAll(async () => {
  await db.query("delete from private.api_events where kind = $1", [KIND]);
  await deleteTestUsers([user]);
  await db.end();
});

const take = (s: string, max = 3, win = 60) =>
  adminClient().rpc("demo_rate_take", { p_subject: s, p_kind: KIND, p_max: max, p_window_minutes: win });

describe("demo_rate_take", () => {
  it("allows up to max, then refuses with the time the oldest counted event leaves the window", async () => {
    const s = subject();
    for (let i = 0; i < 3; i++) expect((await take(s)).data).toEqual({ ok: true });
    const blocked = (await take(s)).data as { ok: boolean; retry_at: string };
    expect(blocked.ok).toBe(false);
    const { rows } = await db.query("select min(created_at) + interval '60 minutes' as at from private.api_events where subject = $1 and kind = $2", [s, KIND]);
    expect(Date.parse(blocked.retry_at)).toBe(new Date(rows[0].at).getTime());
    // Blocked attempts are not recorded, so retrying never pushes the time back.
    for (let i = 0; i < 3; i++) await take(s);
    expect(((await take(s)).data as { retry_at: string }).retry_at).toBe(blocked.retry_at);
    const { rows: n } = await db.query("select count(*)::int as n from private.api_events where subject = $1 and kind = $2", [s, KIND]);
    expect(n[0].n).toBe(3);
  });

  it("uses the (n - max + 1)-th oldest event when older events exceed the current max", async () => {
    const s = subject();
    await db.query(
      `insert into private.api_events (subject, kind, created_at) values
         ($1, $2, now() - interval '50 minutes'), ($1, $2, now() - interval '40 minutes'), ($1, $2, now() - interval '30 minutes')`,
      [s, KIND],
    );
    const r = (await take(s, 2)).data as { ok: boolean; retry_at: string };
    expect(r.ok).toBe(false);
    const expected = Date.now() + 20 * 60_000; // the 40-minute-old event leaves the 60-minute window in ~20 min
    expect(Math.abs(Date.parse(r.retry_at) - expected)).toBeLessThan(15_000);
  });

  it("is atomic: concurrent requests never exceed max", async () => {
    const s = subject();
    const results = await Promise.all(Array.from({ length: 12 }, () => take(s, 5)));
    expect(results.filter((r) => (r.data as { ok: boolean }).ok)).toHaveLength(5);
    const { rows } = await db.query("select count(*)::int as n from private.api_events where subject = $1 and kind = $2", [s, KIND]);
    expect(rows[0].n).toBe(5);
  });

  it("other subjects are independent", async () => {
    const a = subject();
    for (let i = 0; i < 2; i++) await take(a, 2);
    expect(((await take(a, 2)).data as { ok: boolean }).ok).toBe(false);
    expect((await take(subject(), 2)).data).toEqual({ ok: true });
  });

  it("rejects bad input", async () => {
    expect((await take(subject(), 0)).error?.message).toMatch(/^INVALID_INPUT/);
    expect((await take(subject(), 3, 0)).error?.message).toMatch(/^INVALID_INPUT/);
    expect((await take("x".repeat(200))).error?.message).toMatch(/^INVALID_INPUT/);
  });

  it("is not callable by anon or signed-in users", async () => {
    const args = { p_subject: subject(), p_kind: KIND, p_max: 99, p_window_minutes: 60 };
    expect((await anonClient().rpc("demo_rate_take", args)).error).not.toBeNull();
    expect((await user.client.rpc("demo_rate_take", args)).error).not.toBeNull();
  });
});
