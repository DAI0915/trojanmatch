import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export { personaPassword } from "./password";

export function newLeaseToken(): string {
  return randomBytes(32).toString("base64url"); // 43 chars
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time comparison of two secrets of arbitrary length. */
export function secretsEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
