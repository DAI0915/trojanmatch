"use client";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, string[] | undefined>,
    public status?: number,
  ) {
    super(message);
  }
}

/** Same-origin JSON fetch that surfaces our {error:{code,message,details}} shape. */
export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("NETWORK", "Network error. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    throw new ApiClientError(e?.code ?? "INTERNAL", e?.message ?? "Something went wrong.", e?.details, res.status);
  }
  return body as T;
}
