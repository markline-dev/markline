/**
 * Markline reader feedback — reference Cloudflare Worker (D1-backed sink).
 *
 * Markline's feedback widgets ("Was this page/section helpful?") POST a small
 * JSON blob to `config.feedback.endpoint`. This Worker is one ready-made sink:
 * it validates the payload, rate-limits, stores a row in D1, and (optionally)
 * forwards a line to Slack. The framework doesn't depend on it — point
 * `feedback.endpoint` at this Worker's URL and you're done. Swap it for your own
 * collector (Sheet, webhook, DB) any time; the contract is just the POST body.
 *
 * Payload (from components/docs/feedback.tsx):
 *   { answer: "yes"|"no"|null, scope: "page"|"section", target: string|null,
 *     path: string|null, reason?: string|null, comment?: string, ts: number }
 *
 * Setup:
 *   wrangler d1 create markline-feedback
 *   # put the returned database_id in wrangler.toml, then:
 *   wrangler d1 execute markline-feedback --file schema.sql
 *   wrangler deploy
 *   # optional Slack forward:
 *   wrangler secret put MARKLINE_SLACK_WEBHOOK
 */

export interface Env {
  /** D1 database binding (see wrangler.toml). */
  DB: D1Database;
  /** Comma-separated docs origin(s) allowed to call this Worker. "*" allows any. */
  MARKLINE_ALLOWED_ORIGIN?: string;
  /** Max submissions per IP per minute (default 30). */
  MARKLINE_RATE_PER_MIN?: string;
  /** Optional Slack Incoming Webhook URL — set as a secret to forward feedback. */
  MARKLINE_SLACK_WEBHOOK?: string;
}

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

/** Hash the caller IP so we can spot dupes/abuse without storing raw IPs. */
async function ipHash(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`markline:${ip}`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin");
    const allow = allowedOrigin(origin, env);
    const cors = corsHeaders(allow);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
    // Reject disallowed browser origins; non-browser callers (no Origin) pass.
    if (origin && !allow) return new Response("Forbidden origin", { status: 403 });

    const ip = req.headers.get("cf-connecting-ip") ?? "anon";
    if (rateLimited(ip, Number(env.MARKLINE_RATE_PER_MIN) || 30)) {
      return new Response("Rate limit exceeded", { status: 429, headers: cors });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response("Bad request", { status: 400, headers: cors });
    }

    const answer = body.answer === "yes" || body.answer === "no" ? body.answer : null;
    const scope = body.scope === "section" ? "section" : "page";
    const target = str(body.target, 200);
    const path = str(body.path, 400);
    const reason = str(body.reason, 200);
    const comment = str(body.comment, 4000);
    if (!answer && !comment) return new Response("Empty feedback", { status: 400, headers: cors });

    try {
      await env.DB.prepare(
        `INSERT INTO feedback (answer, scope, target, path, reason, comment, origin, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(answer, scope, target, path, reason, comment, origin ?? null, await ipHash(ip))
        .run();
    } catch {
      return new Response("Store failed", { status: 500, headers: cors });
    }

    // Optional Slack forward — fire-and-forget, never blocks the response.
    if (env.MARKLINE_SLACK_WEBHOOK) {
      const emoji = answer === "yes" ? ":+1:" : answer === "no" ? ":-1:" : ":speech_balloon:";
      const text =
        `${emoji} *${scope}* feedback on \`${path ?? "?"}\`${target ? ` (${target})` : ""}` +
        `${reason ? `\n• ${reason}` : ""}${comment ? `\n> ${comment}` : ""}`;
      void fetch(env.MARKLINE_SLACK_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    }

    return new Response(null, { status: 204, headers: cors });
  },
};
