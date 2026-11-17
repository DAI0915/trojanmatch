import { describe, expect, it } from "vitest";
import { ApiError, fromDbError } from "@/lib/api/errors";

describe("fromDbError", () => {
  it("maps 'CODE: message' raised by RPCs", () => {
    const e = fromDbError({ message: "TEAM_FULL: This team has no open slots." });
    expect(e.code).toBe("TEAM_FULL");
    expect(e.message).toBe("This team has no open slots.");
    expect(e.status).toBe(409);
  });
  it("maps insufficient_privilege to a 403 without leaking details", () => {
    const e = fromDbError({ message: "permission denied for table teams", code: "42501" });
    expect(e.code).toBe("NOT_PARTICIPANT");
    expect(e.status).toBe(403);
  });
  it("hides unknown database errors", () => {
    const e = fromDbError({ message: 'duplicate key value violates unique constraint "x"', code: "23505" });
    expect(e.code).toBe("INTERNAL");
    expect(e.message).not.toContain("constraint");
  });
  it("uses explicit statuses", () => {
    expect(new ApiError("NOT_AUTHENTICATED", "x").status).toBe(401);
    expect(new ApiError("RATE_LIMITED", "x").status).toBe(429);
  });
});

describe("Retry-After", () => {
  it("is the whole seconds until details.retry_at, at least 1, and absent otherwise", async () => {
    const { retryAfterSeconds } = await import("@/lib/api/errors");
    const now = Date.parse("2026-11-17T22:00:00Z");
    expect(retryAfterSeconds({ retry_at: "2026-11-17T22:10:00.400Z" }, now)).toBe(601);
    expect(retryAfterSeconds({ retry_at: "2026-11-17T21:59:00Z" }, now)).toBe(1);
    expect(retryAfterSeconds({ retry_at: null }, now)).toBeNull();
    expect(retryAfterSeconds({ reason: "TOO_MANY_SESSIONS" }, now)).toBeNull();
    expect(retryAfterSeconds(undefined, now)).toBeNull();
    expect(retryAfterSeconds({ retry_at: "not a date" }, now)).toBeNull();
  });
});
