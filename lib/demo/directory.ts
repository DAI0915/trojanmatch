/**
 * Who a demo visitor can act as: every synthetic persona of the fixture (the
 * same 44 people in every sandbox). Pure and static. It exposes only fixture
 * keys, names and role labels (no emails, ids or credentials). The server
 * derives the email from the key AND the visitor's own lease slot, so a key
 * can never address another sandbox or a production account.
 */
import { roleLabel } from "@/lib/taxonomy";
import { DEMO_PERSONAS } from "./fixtures";
import { SWITCHABLE_PERSONAS } from "./personas";

export type DirectoryPerson = { key: string; name: string; roles: string; quick: boolean; blurb: string | null };

const QUICK = new Map<string, string>(SWITCHABLE_PERSONAS.map((p) => [p.key, p.blurb]));

export function demoDirectory(): DirectoryPerson[] {
  const quick = SWITCHABLE_PERSONAS.map((p) => DEMO_PERSONAS.find((d) => d.key === p.key)).filter((p) => p !== undefined);
  const rest = DEMO_PERSONAS.filter((p) => !QUICK.has(p.key)).sort((a, b) => a.display_name.localeCompare(b.display_name));
  return [...quick, ...rest].map((p) => ({
    key: p.key,
    name: p.display_name,
    roles: p.roles.map(roleLabel).join(" · "),
    quick: QUICK.has(p.key),
    blurb: QUICK.get(p.key) ?? null,
  }));
}
