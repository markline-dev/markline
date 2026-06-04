/**
 * Markline Ask AI — reference Cloudflare Worker (operator-key proxy).
 *
 * Deploy this to add the Ask AI assistant to a PURE-STATIC Markline site
 * (GitHub Pages, S3, any CDN) without exposing your provider key. The key lives
 * as a Worker secret on Cloudflare's edge; the browser only ever talks to this
 * Worker, never the provider, and never sees the key.
 *
 * It mirrors Markline's built-in `app/api/ai/route.ts` (origin allow-list,
 * per-IP rate limit, token cap, OpenAI-compatible transport) and adds the CORS
 * handling a cross-origin endpoint needs.
 *
 * Wire it up in markline.json:
 *   "ai": {
 *     "enabled": true,
 *     "mode": "proxy",
 *     "provider": "openrouter",
 *     "model": "deepseek/deepseek-v4-flash",
 *     "endpoint": "https://<your-worker>.workers.dev"
 *   }
 *
 * Configure this Worker:
 *   wrangler secret put MARKLINE_AI_KEY     # the provider key (never committed)
 *   # non-secret knobs live in wrangler.toml [vars]
 */

export interface Env {
  /** Provider API key — set with `wrangler secret put MARKLINE_AI_KEY`. */
  MARKLINE_AI_KEY: string;
  /** openai | openrouter | together | groq | fireworks | local | openai-compatible */
  MARKLINE_AI_PROVIDER?: string;
  /** Base URL override (required for "openai-compatible"). */
  MARKLINE_AI_BASE_URL?: string;
  MARKLINE_AI_MODEL?: string;
  MARKLINE_AI_MAX_TOKENS?: string;
  MARKLINE_AI_SYSTEM_PROMPT?: string;
  /** Comma-separated docs origin(s) allowed to call this Worker. "*" allows any (not recommended). */
  MARKLINE_ALLOWED_ORIGIN?: string;
  MARKLINE_RATE_PER_MIN?: string;
  MARKLINE_SITE_NAME?: string;
}

const PRESETS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  groq: "https://api.groq.com/openai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  local: "http://localhost:11434/v1",
};

const DEFAULT_SYSTEM =
  "You are the documentation assistant for an API reference built with Markline. " +
  "Answer concretely and concisely, grounded in the provided context. Prefer short paragraphs and " +
  "fenced code blocks (```) for example requests. Use **bold** for key terms and `code` for fields, " +
  "endpoints and commands. If the context does not cover the question, say so briefly.";

// Per-isolate rate limit. For multi-region durability, swap for a KV/DO counter.
const HITS = new Map<string, number[]>();
function rateLimited(ip: string, perMinute: number): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) ?? []).filter((t) => t > now - 60_000);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > perMinute;
}

function allowedOrigin(origin: string | null, env: Env): string | null {
  const list = (env.MARKLINE_ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.includes("*")) return origin ?? "*";
  if (origin && list.includes(origin)) return origin;
  return null;
}

function corsHeaders(allow: string | null): Record<string, string> {
  if (!allow) return {};
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin");
    const allow = allowedOrigin(origin, env);
    const cors = corsHeaders(allow);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
    // A browser request from a disallowed origin is rejected; non-browser callers
    // (no Origin header) are allowed through.
    if (origin && !allow) return new Response("Forbidden origin", { status: 403 });
    if (!env.MARKLINE_AI_KEY) return new Response("Worker missing MARKLINE_AI_KEY secret", { status: 503, headers: cors });

    const ip = req.headers.get("cf-connecting-ip") ?? "anon";
    if (rateLimited(ip, Number(env.MARKLINE_RATE_PER_MIN) || 10)) {
      return new Response("Rate limit exceeded", { status: 429, headers: cors });
    }

    let body: { question?: string; context?: string };
    try {
      body = await req.json();
    } catch {
      return new Response("Bad request", { status: 400, headers: cors });
    }
    const question = (body.question ?? "").trim().slice(0, 4000);
    if (!question) return new Response("Empty question", { status: 400, headers: cors });
    const context = body.context?.slice(0, 8000);

    const provider = env.MARKLINE_AI_PROVIDER ?? "openai";
    const baseUrl = (env.MARKLINE_AI_BASE_URL || PRESETS[provider] || "").replace(/\/$/, "");
    if (!baseUrl) return new Response("No provider base URL (set MARKLINE_AI_BASE_URL)", { status: 500, headers: cors });

    const system = (env.MARKLINE_AI_SYSTEM_PROMPT || DEFAULT_SYSTEM) + (context ? `\n\nContext:\n${context}` : "");
    const headers: Record<string, string> = {
      authorization: `Bearer ${env.MARKLINE_AI_KEY}`,
      "content-type": "application/json",
    };
    if (provider === "openrouter") {
      if (origin) headers["HTTP-Referer"] = origin;
      headers["X-Title"] = env.MARKLINE_SITE_NAME ?? "Markline";
    }

    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: env.MARKLINE_AI_MODEL ?? "gpt-4o-mini",
          stream: false,
          max_tokens: Number(env.MARKLINE_AI_MAX_TOKENS) || 1024,
          messages: [
            { role: "system", content: system },
            { role: "user", content: question },
          ],
        }),
      });
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        return new Response(`Provider ${upstream.status}: ${detail.slice(0, 300)}`, { status: 502, headers: cors });
      }
      const data: { choices?: { message?: { content?: string } }[] } = await upstream.json();
      const text = data?.choices?.[0]?.message?.content;
      return new Response(JSON.stringify({ text: typeof text === "string" ? text.trim() : "" }), {
        status: 200,
        headers: { "content-type": "application/json", ...cors },
      });
    } catch {
      return new Response("AI request failed", { status: 502, headers: cors });
    }
  },
};
