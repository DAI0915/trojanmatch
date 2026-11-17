import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ApiError, retryAfterSeconds } from "@/lib/api/errors";
import { isAllowedOrigin } from "@/lib/api/origin";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type AuthedContext<P> = {
  req: NextRequest;
  user: User;
  supabase: ServerClient;
  params: P;
};

export function errorResponse(err: unknown) {
  const apiErr = err instanceof ApiError ? err : new ApiError("INTERNAL", "Something went wrong.");
  if (!(err instanceof ApiError)) console.error("[api] unexpected error", err);
  const retryAfter = retryAfterSeconds(apiErr.details);
  return NextResponse.json(
    { error: { code: apiErr.code, message: apiErr.message, details: apiErr.details } },
    { status: apiErr.status, headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined },
  );
}

/**
 * Route Handler wrapper: Origin check (CSRF) → verified user (getUser) →
 * handler. The actor id ALWAYS comes from the session, never from the body.
 */
export function withAuth<P = Record<string, string>>(
  handler: (ctx: AuthedContext<P>) => Promise<Response>,
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      if (!isAllowedOrigin(req.method, req.headers, publicEnv.NEXT_PUBLIC_APP_URL)) {
        throw new ApiError("FORBIDDEN_ORIGIN", "Cross-origin request rejected.");
      }
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new ApiError("NOT_AUTHENTICATED", "Sign in required.");
      const params = await segment.params;
      return await handler({ req, user, supabase, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Parse a JSON body against a Zod schema, mapping failures to INVALID_INPUT. */
export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("INVALID_INPUT", "Body must be JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError("INVALID_INPUT", "Invalid input.", z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}
