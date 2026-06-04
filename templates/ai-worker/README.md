# Markline Ask AI — Cloudflare Worker

A tiny, open-source proxy that lets you run Markline's **Ask AI** assistant on a
**pure-static** docs site (GitHub Pages, S3, Netlify, any CDN) using **your own
provider key** — without ever shipping that key to the browser.

It's the static-hosting counterpart to Markline's built-in `/api/ai` route
(which only runs on a Node/Vercel server). The key lives as a Cloudflare Worker
secret on the edge; the browser talks only to your Worker.

## Deploy (about 2 minutes)

```bash
# from this folder
npm install

# 1) put your provider key on the edge (never committed, never in the browser)
npx wrangler secret put MARKLINE_AI_KEY        # paste e.g. an OpenRouter key

# 2) edit wrangler.toml [vars] — provider, model, and your docs origin:
#    MARKLINE_AI_PROVIDER   = "openrouter"
#    MARKLINE_AI_MODEL      = "deepseek/deepseek-v4-flash"
#    MARKLINE_ALLOWED_ORIGIN = "https://your-docs.example"

# 3) ship it
npm run deploy                                  # → https://markline-ai.<account>.workers.dev
```

## Point your site at it

In `markline.json`, set `mode: "proxy"` and `endpoint` to the Worker URL:

```jsonc
"ai": {
  "enabled": true,
  "mode": "proxy",
  "provider": "openrouter",
  "model": "deepseek/deepseek-v4-flash",
  "endpoint": "https://markline-ai.<account>.workers.dev"
}
```

Because `endpoint` is set, Markline shows the Ask AI UI even in a static export.
Rebuild and redeploy your docs — the assistant now runs on your key.

## Configuration (wrangler.toml `[vars]`)

| var | meaning |
|---|---|
| `MARKLINE_AI_PROVIDER` | `openai` · `openrouter` · `together` · `groq` · `fireworks` · `local` · `openai-compatible` |
| `MARKLINE_AI_BASE_URL` | base URL override (required for `openai-compatible`) |
| `MARKLINE_AI_MODEL` | model id, e.g. `deepseek/deepseek-v4-flash` |
| `MARKLINE_AI_MAX_TOKENS` | response token cap (default 1024) |
| `MARKLINE_ALLOWED_ORIGIN` | comma-separated docs origin(s) allowed to call the Worker; `*` allows any (not recommended) |
| `MARKLINE_RATE_PER_MIN` | per-IP requests/min (default 10) |
| `MARKLINE_AI_SYSTEM_PROMPT` | optional system-prompt override |
| `MARKLINE_AI_KEY` | **secret** — set with `wrangler secret put`, never in this file |

## Cost & abuse

A public `/api/ai` is an open relay to your paid LLM. This Worker ships with an
**origin allow-list** (`MARKLINE_ALLOWED_ORIGIN`), a **per-IP rate limit**, and a
**token cap** — tune them for your traffic. The rate limit is per-isolate
in-memory; for strict global limits, back it with Workers KV or a Durable Object.
