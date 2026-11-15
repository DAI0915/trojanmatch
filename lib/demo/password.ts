import { createHmac } from "node:crypto";

/**
 * Demo persona password = HMAC-SHA256(DEMO_PERSONA_SECRET, email), base64url.
 * Derived on the server (route handlers / seed script) and never stored, logged
 * or sent to the browser. Uses node:crypto, so it cannot be bundled client-side.
 */
export function personaPassword(secret: string, email: string): string {
  if (!secret || secret.length < 32) throw new Error("DEMO_PERSONA_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(email).digest("base64url");
}
