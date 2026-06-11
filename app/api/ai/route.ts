import { loadConfig, resolveAiBaseUrl } from "@/lib/config";
import { buildMessages, chatComplete } from "@/lib/ai/transport";

/**
 * Ask AI server proxy (BYOK, proxy mode). Holds the operator key
 * (MARKLINE_AI_KEY) server-side and forwards to an OpenAI-compatible provider.
 * This is a `.ts` route, auto-dropped in static export — so on a pure-static
 * host aiConfig() returns null and the UI is absent (unless mode:"byok" or an
 * external endpoint is set). See _docs/AI-BYOK-DESIGN.md §5 / §7.
 */
export const dynamic = "force-dynamic";

// Conservative in-memory per-IP rate limit (single-instance; swap for KV at scale).
const HITS = new Map<string, number[]>();
function rateLimited(ip: string, perMinute: number): boolean {
  const now = Date.now();
  const win = now - 60_000;
  const arr = (HITS.get(ip) ?? []).filter((t) => t > win);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > perMinute;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser caller (curl) — allowed
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const cfg = loadConfig();
  const ai = cfg.ai;
  if (!ai?.enabled || (ai.mode ?? "proxy") !== "proxy") {
    return new Response("AI proxy is off", { status: 404 });
  }
  const key = process.env.MARKLINE_AI_KEY;
  if (!key) return new Response("AI not configured (no MARKLINE_AI_KEY)", { status: 503 });

  if (!sameOrigin(req)) return new Response("Forbidden origin", { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip, ai.rateLimit?.perMinute ?? 10)) {
    return new Response("Rate limit exceeded", { status: 429 });
  }

  let body: { question?: string; context?: string; images?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const question = (body.question ?? "").trim().slice(0, 4000);
  if (!question) return new Response("Empty question", { status: 400 });
  // Retrieved grounding context (current page + top docs) — larger than the old
  // section-name hint, so allow more headroom.
  const context = body.context?.slice(0, 16000);
  // Accept up to 4 inline image data URLs (~base64). Drop anything else.
  const images = Array.isArray(body.images)
    ? body.images.filter((u) => typeof u === "string" && /^data:image\//.test(u)).slice(0, 4)
    : undefined;

  const baseUrl = resolveAiBaseUrl(ai);
  try {
    const text = await chatComplete({
      baseUrl,
      model: ai.model ?? "gpt-4o-mini",
      key,
      provider: ai.provider ?? "openai",
      maxTokens: ai.maxTokens ?? 1024,
      messages: buildMessages(ai.systemPrompt, context, question, images),
      referer: req.headers.get("origin") ?? undefined,
      title: cfg.name,
    });
    return Response.json({ text });
  } catch (e) {
    // Log the upstream detail for the operator; never leak provider internals
    // (keys, billing/privacy URLs, model ids) to the reader.
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[markline] AI proxy upstream error:", detail);
    const isRate = /\b429\b|rate.?limit|too many/i.test(detail);
    return new Response(
      isRate ? "Too many requests. Please try again shortly." : "The assistant is temporarily unavailable.",
      { status: isRate ? 429 : 502 },
    );
  }
}
