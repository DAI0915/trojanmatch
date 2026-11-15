/** Stable error codes shared by Route Handlers, RPCs (raised as messages) and UI. */
export const ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "FORBIDDEN_ORIGIN",
  "INVALID_INPUT",
  "NOT_FOUND",
  "NOT_PARTICIPANT",
  "NOT_OWNER",
  "NOT_RECRUITER",
  "SPACE_CLOSED",
  "DEADLINE_PASSED",
  "TEAM_FULL",
  "BELOW_MIN_SIZE",
  "ALREADY_IN_TEAM",
  "CONFLICT_OTHER_TEAM",
  "DUPLICATE_PENDING",
  "DUPLICATE_SPACE",
  "INVITE_NO_LONGER_VALID",
  "INVALID_CODE",
  "RATE_LIMITED",
  "NO_MATCH",
  "SIGNUP_DISABLED",
  "DEMO_DISABLED",
  "DEMO_BUSY",
  "DEMO_LEASE_INVALID",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Partial<Record<ErrorCode, number>> = {
  NOT_AUTHENTICATED: 401,
  DEMO_LEASE_INVALID: 401,
  FORBIDDEN_ORIGIN: 403,
  NOT_PARTICIPANT: 403,
  NOT_OWNER: 403,
  NOT_RECRUITER: 403,
  SIGNUP_DISABLED: 403,
  DEMO_DISABLED: 404,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_CODE: 400,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get status(): number {
    return STATUS[this.code] ?? 409;
  }
}

/**
 * RPCs raise `RAISE EXCEPTION 'CODE: human message'`. Map a Postgres/PostgREST
 * error message to an ApiError without leaking internals.
 */
export function fromDbError(err: { message?: string; code?: string } | null | undefined): ApiError {
  const msg = err?.message ?? "";
  const match = /^([A-Z_]+)(?::\s*(.*))?$/.exec(msg);
  if (match && (ERROR_CODES as readonly string[]).includes(match[1])) {
    return new ApiError(match[1] as ErrorCode, match[2] || match[1]);
  }
  if (err?.code === "42501") return new ApiError("NOT_PARTICIPANT", "Not allowed.");
  return new ApiError("INTERNAL", "Something went wrong.");
}
