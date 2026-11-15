import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { expiresIn, timeAgo } from "@/lib/format";
import { sortTeams, type FoundTeam } from "@/lib/matching/find";
import { requestToJoinSchema, respondSchema, sendInvitationsSchema } from "@/lib/validation/invitation";
import { ApiError, fromDbError } from "@/lib/api/errors";

const team = (id: string, fit: number | null, open: number, created: string): FoundTeam => ({
  id, name: id, description: null, members: 1, targetSize: 4, openPositions: open, requirements: {}, createdAt: created,
  sharedHours: null, hiddenMembers: 0, people: [], myRequest: null, myInvite: null,
  fit: fit === null ? null : { score: fit, band: "Good", gain: 0, fillsRoles: [], addsSkills: [] },
});

describe("Find a Team ordering", () => {
  const teams = [team("a", 0.6, 1, "2026-11-01"), team("b", null, 3, "2026-11-03"), team("c", 0.8, 2, "2026-11-02")];
  it("recommended: best fit first, teams without a fit score last", () => {
    expect(sortTeams(teams, "recommended").map((t) => t.id)).toEqual(["c", "a", "b"]);
  });
  it("newest and most open positions", () => {
    expect(sortTeams(teams, "newest").map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(sortTeams(teams, "open").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });
  it("is deterministic on ties", () => {
    const tie = [team("y", 0.5, 1, "x"), team("x", 0.5, 1, "x")];
    expect(sortTeams(tie, "recommended").map((t) => t.id)).toEqual(["x", "y"]);
  });
});

describe("invitation input validation", () => {
  it("requires 1–10 uuids and caps the message", () => {
    expect(sendInvitationsSchema.safeParse({ user_ids: [] }).success).toBe(false);
    expect(sendInvitationsSchema.safeParse({ user_ids: ["nope"] }).success).toBe(false);
    expect(sendInvitationsSchema.safeParse({ user_ids: Array.from({ length: 11 }, () => crypto.randomUUID()) }).success).toBe(false);
    expect(sendInvitationsSchema.parse({ user_ids: [crypto.randomUUID()], message: "  " }).message).toBeNull();
    expect(requestToJoinSchema.safeParse({ message: "x".repeat(281) }).success).toBe(false);
  });
  it("respond needs an explicit boolean", () => {
    expect(respondSchema.safeParse({}).success).toBe(false);
    expect(respondSchema.parse({ accept: true })).toEqual({ accept: true, leave_solo_draft: false });
  });
});

describe("P5 error mapping", () => {
  it("maps new RPC codes and lock conflicts", () => {
    expect(fromDbError({ message: "OWN_DRAFT_TEAM: You own “X”." }).code).toBe("OWN_DRAFT_TEAM");
    expect(fromDbError({ message: "INVITE_NO_LONGER_VALID: gone" }).status).toBe(409);
    expect(fromDbError({ message: "deadlock detected", code: "40P01" }).code).toBe("TRY_AGAIN");
    expect(new ApiError("INVITE_EXPIRED", "x").status).toBe(409);
  });
});

describe("expiry formatting", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  it("formats remaining time and elapsed time", () => {
    expect(expiresIn("2026-11-14T11:00:00Z", now)).toBe("expired");
    expect(expiresIn("2026-11-14T12:30:00Z", now)).toBe("in 30 min");
    expect(expiresIn("2026-11-16T11:00:00Z", now)).toBe("in 47 h");
    expect(timeAgo("2026-11-14T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-11-14T09:00:00Z", now)).toBe("3 h ago");
  });
});
