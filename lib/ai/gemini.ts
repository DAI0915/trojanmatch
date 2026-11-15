import "server-only";

/**
 * Minimal server-side Gemini client (REST generateContent). The API key never
 * leaves the server: this module is only imported by Route Handlers.
 *
 * Models verified with a live key on 2026-11-14 (both listed as stable and
 * returned by models.list for the key): gemini-3.6-flash answered a small JSON
 * request in ~8 s; gemini-3.5-flash-lite in ~1 s. (gemini-3.8-flash answered
 * correctly but took ~3 minutes, too slow for a 30 s serverless request.)
 * The primary model gets AI_TIMEOUT_MS; on timeout/error the fast fallback
 * model is tried once; then the caller falls back to a deterministic template.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

export function geminiConfig() {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim() ?? DEFAULT_GEMINI_FALLBACK_MODEL;
  const timeoutMs = Math.min(Math.max(Number(process.env.AI_TIMEOUT_MS) || 18000, 2000), 20000);
  return { configured: key.length > 0, key, model, fallbackModel: fallbackModel === "none" ? "" : fallbackModel, timeoutMs, fallbackTimeoutMs: 8000 };
}

export class GeminiError extends Error {
  constructor(public readonly kind: "not_configured" | "timeout" | "http" | "blocked" | "invalid", message: string) {
    super(message);
  }
}

type GenerateArgs = { system: string; user: string; schema: object; temperature?: number };

/** Returns the parsed JSON object from the first candidate. Throws GeminiError. */
export async function generateJson({ system, user, schema, temperature = 0.6 }: GenerateArgs): Promise<{ data: unknown; model: string }> {
  const cfg = geminiConfig();
  if (!cfg.configured) throw new GeminiError("not_configured", "GEMINI_API_KEY is not set.");
  const models = [
    { model: cfg.model, timeoutMs: cfg.timeoutMs },
    ...(cfg.fallbackModel && cfg.fallbackModel !== cfg.model ? [{ model: cfg.fallbackModel, timeoutMs: cfg.fallbackTimeoutMs }] : []),
  ];
  let last: GeminiError | null = null;
  for (const m of models) {
    try {
      return { data: await callModel(cfg.key, m.model, m.timeoutMs, { system, user, schema, temperature }), model: m.model };
    } catch (e) {
      if (!(e instanceof GeminiError) || e.kind === "blocked") throw e;
      last = e;
      console.error("[gemini]", m.model, "failed:", e.kind);
    }
  }
  throw last ?? new GeminiError("http", "Gemini request failed.");
}

async function callModel(key: string, model: string, timeoutMs: number, { system, user, schema, temperature }: Required<GenerateArgs>): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const call = async (withSchema: boolean) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            ...(withSchema ? { responseJsonSchema: schema } : {}),
            temperature,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      const name = (e as Error)?.name;
      throw new GeminiError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "http", "Gemini request failed.");
    }
    return res;
  };

  let res = await call(true);
  // Some models/versions reject a JSON schema; retry once with JSON mode only (output is validated anyway).
  if (res.status === 400) res = await call(false);
  if (!res.ok) {
    // Log status only — never the key or the prompt.
    console.error("[gemini] HTTP", res.status);
    throw new GeminiError("http", `Gemini returned HTTP ${res.status}.`);
  }
  const body = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  } | null;
  if (body?.promptFeedback?.blockReason) throw new GeminiError("blocked", "Gemini blocked the request.");
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError("invalid", "Gemini returned no content.");
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("invalid", "Gemini returned invalid JSON.");
  }
}
