/**
 * Catalog-level security audit (docs/IMPLEMENTATION_PLAN.md §G2).
 * Runs against the real local database and fails if ANY function or table
 * drifts from the rules — so every later migration is covered automatically.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { anonClient, createTestUser, dbClient, deleteTestUsers, type TestUser } from "./helpers";

// Functions anon may execute.
const ANON_EXECUTE_ALLOWLIST: string[] = ["public.get_space", "public.search_spaces"];

// Functions authenticated may execute. Private helpers are executable (RLS needs
// them) but unreachable over HTTP because `private` is not an exposed schema.
const AUTHENTICATED_EXECUTE_ALLOWLIST = [
  "public.check_space_duplicates",
  "public.create_space",
  "public.get_invite_link",
  "public.get_space",
  "public.join_space",
  "public.search_spaces",
  "private.can_recruit",
  "private.current_scope",
  "private.is_active_member",
  "private.is_participant",
  "private.participation_visible",
  "private.profile_visible",
  "private.team_is_active",
  "private.team_visible",
  "private.valid_hours",
];

// Our own (non-extension) callable functions in public/private. Event-trigger
// functions are excluded: Postgres refuses direct calls to them and PostgREST
// never exposes them (e.g. Supabase's platform-managed public.rls_auto_enable,
// which auto-enables RLS on new tables in hosted projects).
const OWN_FUNCTIONS_SQL = `
  select p.oid, n.nspname || '.' || p.proname as name, p.prosecdef, p.proconfig, p.proacl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prorettype <> 'event_trigger'::regtype
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
`;

let db: pg.Client;

beforeAll(async () => {
  db = await dbClient();
});
afterAll(async () => {
  await db?.end();
});

describe("functions", () => {
  it("every SECURITY DEFINER function pins search_path to ''", async () => {
    const { rows } = await db.query(OWN_FUNCTIONS_SQL);
    const definers = rows.filter((r) => r.prosecdef);
    expect(definers.length).toBeGreaterThan(0);
    const unpinned = definers
      .filter((r) => !(r.proconfig ?? []).includes('search_path=""'))
      .map((r) => r.name);
    expect(unpinned).toEqual([]);
  });

  it("every function pins search_path (invoker functions too)", async () => {
    const { rows } = await db.query(OWN_FUNCTIONS_SQL);
    const unpinned = rows
      .filter((r) => !(r.proconfig ?? []).some((c: string) => c.startsWith("search_path=")))
      .map((r) => r.name);
    expect(unpinned).toEqual([]);
  });

  it("PUBLIC has EXECUTE on no function (no NULL/default ACLs)", async () => {
    const { rows } = await db.query(`
      with f as (${OWN_FUNCTIONS_SQL})
      select f.name from f
      where f.proacl is null
         or exists (select 1 from aclexplode(f.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    `);
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("anon can execute only allowlisted functions", async () => {
    const { rows } = await db.query(`
      with f as (${OWN_FUNCTIONS_SQL})
      select f.name from f where has_function_privilege('anon', f.oid, 'EXECUTE') order by 1
    `);
    expect(rows.map((r) => r.name)).toEqual(ANON_EXECUTE_ALLOWLIST);
  });

  it("authenticated can execute only allowlisted functions", async () => {
    const { rows } = await db.query(`
      with f as (${OWN_FUNCTIONS_SQL})
      select f.name from f where has_function_privilege('authenticated', f.oid, 'EXECUTE') order by 1
    `);
    expect(rows.map((r) => r.name).sort()).toEqual([...AUTHENTICATED_EXECUTE_ALLOWLIST].sort());
  });

  // Migrations run as `postgres`, so only postgres's default ACLs apply to our
  // objects (supabase_admin's defaults cover objects supabase_admin creates).
  it("postgres's default privileges grant nothing to anon/authenticated on future functions, tables or sequences", async () => {
    const { rows } = await db.query(`
      select n.nspname, d.defaclobjtype as kind, d.defaclacl::text as acl
      from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
      where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname in ('public', 'private')
    `);
    for (const r of rows) {
      expect(r.acl, `${r.nspname} default ACL (${r.kind})`).not.toMatch(/(^|[{,])anon=/);
      expect(r.acl, `${r.nspname} default ACL (${r.kind})`).not.toMatch(/(^|[{,])authenticated=/);
    }
  });

  it("a table created later is closed to anon/authenticated until granted", async () => {
    await db.query("begin");
    try {
      await db.query("create table public.tmp_future_table (id int)");
      for (const role of ["anon", "authenticated"]) {
        const { rows } = await db.query(
          `select has_table_privilege($1, 'public.tmp_future_table', 'SELECT,INSERT,UPDATE,DELETE') as ok`,
          [role],
        );
        expect(rows[0].ok, role).toBe(false);
      }
    } finally {
      await db.query("rollback");
    }
  });
});

describe("tables", () => {
  it("every table in public and private has RLS enabled", async () => {
    const { rows } = await db.query(`
      select n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("anon/authenticated cannot write to RPC-only tables", async () => {
    const rpcOnly = [
      "matching_spaces",
      "space_hackathon_details",
      "space_course_details",
      "space_secrets",
      "teams",
      "team_members",
      "invitations",
      "match_runs",
    ];
    for (const role of ["anon", "authenticated"]) {
      for (const t of rpcOnly) {
        for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          const { rows } = await db.query(`select has_table_privilege($1, $2, $3) as ok`, [
            role,
            `public.${t}`,
            priv,
          ]);
          expect(rows[0].ok, `${role} ${priv} on ${t}`).toBe(false);
        }
      }
    }
  });

  it("nobody but the owner/service role can read join codes or private tables", async () => {
    const targets = ["public.space_secrets", "private.app_config", "private.api_events", "private.demo_slots"];
    for (const role of ["anon", "authenticated"]) {
      for (const t of targets) {
        const { rows } = await db.query(`select has_table_privilege($1, $2, 'SELECT') as ok`, [role, t]);
        expect(rows[0].ok, `${role} SELECT ${t}`).toBe(false);
      }
    }
  });

  it("users cannot update their own scope or synthetic flag (column grants)", async () => {
    for (const col of ["scope", "is_synthetic", "id"]) {
      const { rows } = await db.query(
        `select has_column_privilege('authenticated', 'public.profiles', $1, 'UPDATE') as ok`,
        [col],
      );
      expect(rows[0].ok, `UPDATE profiles.${col}`).toBe(false);
    }
    for (const col of ["space_id", "user_id"]) {
      const { rows } = await db.query(
        `select has_column_privilege('authenticated', 'public.participations', $1, 'UPDATE') as ok`,
        [col],
      );
      expect(rows[0].ok, `UPDATE participations.${col}`).toBe(false);
    }
  });

  it("course instructions_url is not directly readable", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query(
        `select has_column_privilege($1, 'public.space_course_details', 'instructions_url', 'SELECT') as ok`,
        [role],
      );
      expect(rows[0].ok, role).toBe(false);
    }
  });
});

describe("the private schema is not reachable over the API", () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUsers([user]);
  });

  it("private helpers cannot be invoked as RPCs (anon or authenticated)", async () => {
    for (const client of [anonClient(), user.client]) {
      const { error } = await client.rpc("current_scope" as never);
      expect(error).not.toBeNull();
      expect(error!.code).toBe("PGRST202"); // function not found in exposed schemas
    }
  });

  it("private tables cannot be queried via a schema switch", async () => {
    for (const client of [anonClient(), user.client]) {
      const { error } = await client.schema("private" as never).from("demo_slots").select("*");
      expect(error).not.toBeNull();
    }
  });
});
