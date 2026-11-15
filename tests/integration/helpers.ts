import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import type { Database } from "@/lib/database.types";

export const SUPABASE_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } } as const;

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL(), ANON(), noPersist);
}

/** Service role — test fixtures only (supported Auth admin API, no auth.* writes). */
export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL(), SERVICE(), noPersist);
}

/** Direct DB connection as the owner — for catalog audits and constraint tests. */
export async function dbClient(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();
  return c;
}

export type TestUser = { id: string; email: string; client: SupabaseClient<Database> };

const PASSWORD = "Test-Password-1234!";

/** Creates a confirmed user via the admin API and returns a signed-in client. */
export async function createTestUser(opts: {
  displayName?: string;
  appMetadata?: Record<string, unknown>;
} = {}): Promise<TestUser> {
  const email = `it-${randomUUID().slice(0, 12)}@trojanmatch.test`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: opts.displayName ?? "Integration Tester" },
    app_metadata: opts.appMetadata,
  });
  if (error) throw error;
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

export async function deleteTestUsers(users: (TestUser | undefined)[]) {
  const admin = adminClient();
  for (const u of users) if (u) await admin.auth.admin.deleteUser(u.id);
}

/** Insert a Space row directly as the DB owner (fixture; real creation is an RPC in P2). */
export async function insertSpace(
  db: pg.Client,
  s: {
    scope: string;
    visibility?: "public" | "unlisted";
    identityKey?: string;
    title?: string;
    createdBy?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  const title = s.title ?? `Fixture ${id.slice(0, 6)}`;
  await db.query(
    `insert into public.matching_spaces
       (id, scope, type, title, title_normalized, slug, identity_key, created_by, visibility, join_policy)
     values ($1, $2, 'hackathon', $3, lower($3), $4, $5, $6, $7, 'open')`,
    [
      id,
      s.scope,
      title,
      `fixture-${id.slice(0, 8)}`,
      s.identityKey ?? `h|fixture-${id}|2027`,
      s.createdBy ?? null,
      s.visibility ?? "public",
    ],
  );
  return id;
}
