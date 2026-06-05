# Markline feedback Worker (D1)

A ready-made **sink** for Markline's reader-feedback widgets ("Was this
page/section helpful?"). The widgets POST a small JSON blob to
`config.feedback.endpoint`; this Worker validates it, rate-limits, stores a row
in **Cloudflare D1**, and can forward a line to **Slack**.

Markline does **not** depend on this — it's optional and swappable. The contract
is just the POST body, so you can point `feedback.endpoint` at anything (a
webhook, a Google Sheet via Apps Script, your own API). This is the
batteries-included option for **pure-static** hosting (GitHub Pages, S3, any CDN).

## Payload

```jsonc
{
  "answer": "yes" | "no" | null,
  "scope":  "page" | "section",
  "target": "payments" | null,   // resource/section id (section scope)
  "path":   "/api-reference/payments",
  "reason": "Update this documentation" | null,  // page widget only
  "comment": "free text…",
  "ts": 1733424000000
}
```

## Setup

```bash
npm install

# 0. your real config is gitignored — start from the example
cp wrangler.toml.example wrangler.toml

# 1. create the database, then paste the printed database_id into wrangler.toml
wrangler d1 create markline-feedback

# 2. create the table (--remote targets the deployed DB, not a local one)
wrangler d1 execute markline-feedback --remote --file schema.sql

# 3. lock down who can post (your docs origin) in wrangler.toml [vars]:
#    MARKLINE_ALLOWED_ORIGIN = "https://your-docs.example.com"

# 4. (optional) forward to Slack
wrangler secret put MARKLINE_SLACK_WEBHOOK

# 5. ship
wrangler deploy
```

Then wire it up in `markline.json`:

```jsonc
"feedback": { "endpoint": "https://<your-worker>.workers.dev" }
```

Put it on your own domain with a [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
(or the commented `routes` block in `wrangler.toml`) to hide the `workers.dev` URL.

## Reading feedback

```bash
wrangler d1 execute markline-feedback \
  --command "SELECT created_at, answer, scope, target, path, reason, comment FROM feedback ORDER BY id DESC LIMIT 50"
```

## Notes

- **CORS** is enforced for browsers via `MARKLINE_ALLOWED_ORIGIN` — but it's not a
  security boundary (a script can forge the `Origin`). The **rate limit** is your
  abuse control; for a hard cap back it with KV/Durable Objects or a Cloudflare
  WAF rule.
- Raw IPs are **never stored** — only a short hash, for spotting dupes/abuse.
- `comment` is free text and may contain **PII**; treat the table accordingly.
