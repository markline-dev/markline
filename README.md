# Markline

Open-source, self-hostable documentation framework with first-class OpenAPI, full-text
search, and an interactive API playground. A fully open alternative to Scalar and Mintlify.

[![npm](https://img.shields.io/npm/v/@markline/markline.svg)](https://www.npmjs.com/package/@markline/markline)
[![CI](https://github.com/markline-dev/markline/actions/workflows/ci.yml/badge.svg)](https://github.com/markline-dev/markline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**[markline.dev](https://markline.dev)** — built with Markline. The full
documentation lives there; this README is the short version.

## Quickstart

```bash
npm create @markline@latest my-docs   # scaffold a new project
cd my-docs
npm install
npm run dev                           # preview at http://localhost:3000
```

Or add Markline to an existing project:

```bash
npm install @markline/markline
npx markline init      # scaffold markline.json + sample content in the current dir
npx markline dev
```

To start from a [template](https://markline.dev/templates) (`classic`, `paper`,
`product-docs` or `help-center`):

```bash
npm create @markline@latest my-docs -- --template help-center
```

Your project holds only content + config:

```
my-docs/
├── markline.json      # navigation, theme, branding, API settings
├── .gitignore         # ignores node_modules/, .markline/ and out/
├── docs/              # your pages (*.mdx)
│   ├── index.mdx
│   └── quickstart.mdx
└── api/
    └── openapi.json   # rendered as an interactive API reference
```

## CLI

| Command | Description |
| --- | --- |
| `markline init [dir]` | Scaffold a new docs project. `--template <name>` (or `-t`) starts from a template. |
| `markline dev` | Start the dev server against `./markline.json`. |
| `markline build` | Build a production Node server bundle (Docker / Vercel). |
| `markline start` | Serve a production build. |
| `markline export` | Build a static HTML site into `./out` (any CDN / GitHub Pages / S3). |
| `markline version` | Print the Markline version (also `-v`, `--version`). |
| `markline help` | List the commands (also `-h`, `--help`). |

`dev`, `build` and `start` pass extra flags on to Next, so `markline dev -p 3001`
serves on port 3001. The CLI reads `MARKLINE_AI_KEY`, `MARKLINE_SITE_URL`,
`MARKLINE_BASE_PATH` and `NEXT_PUBLIC_*` from `.env` files beside
`markline.json`; anything else comes from the shell. See the
[CLI docs](https://markline.dev/cli).

## Hosting

`markline init` scaffolds ready-to-use deploy configs (`Dockerfile`, `netlify.toml`,
`.github/workflows/deploy.yml`).

### Static (any CDN / GitHub Pages / Netlify / S3)

```bash
markline export   # → ./out
```

Upload `out/` to any static host. The API playground runs in direct-fetch mode (set
`api.playground.proxy` to `"never"` if your API lacks CORS).

- **GitHub Pages** — the scaffolded workflow exports and deploys on push to `main`.
  Project sites are served under `/<repo>`, so it builds with
  `MARKLINE_BASE_PATH=/<repo>`. For a user/org root site or custom domain, remove that env.
- **Netlify** — `netlify.toml` sets `command = "npm install && npx markline export"`
  and `publish = "out"`.
- **Sub-path hosting** — set `MARKLINE_BASE_PATH=/prefix` so assets and the search bundle
  resolve correctly.

### Node server (Docker / Vercel — full features)

```bash
markline build && markline start   # serves on :3000
```

Enables the playground's server-side proxy for APIs without CORS. The scaffolded
`Dockerfile` builds and serves the site:

```bash
docker build -t my-docs . && docker run -p 3000:3000 my-docs
```

## Configuration (`markline.json`)

Config is read from `markline.json` (a `docs.json` is also accepted, for
Mintlify-style projects). The [configuration reference](https://markline.dev/configuration)
lists every key; the highlights are below. `theme.appearance` sets the default color scheme —
`"dark"`, `"light"`, or `"system"` (follows the OS; the default).

```jsonc
{
  "name": "My API",
  "theme": {
    "logo": { "light": "/logo-light.svg", "dark": "/logo-dark.svg", "text": "My API" },
    "colors": { "primary": "#4f46e5", "primaryDark": "#818cf8" },
    "appearance": "system"
  },
  "topbar": {
    "links": [{ "label": "GitHub ↗", "href": "https://github.com/me/repo" }],
    "cta": { "label": "Get started", "href": "/quickstart" },
    "width": "full",        // docs + API reference topbar: "full" (edge-to-edge) | "contained" (centered max-width)
    "homeWidth": "contained" // homepage topbar — independent (defaults to "full")
  },
  "navigation": {
    "tabs": [
      { "id": "docs", "label": "Documentation", "href": "/", "match": ["__default__"],
        "groups": [{ "group": "Get started", "pages": [{ "href": "/", "label": "Intro" }] }] },
      { "id": "api", "label": "API reference", "href": "/api-reference",
        "match": ["/api-reference"], "openapi": true }
    ]
  },
  "api": {
    "baseUrl": "https://api.example.com",
    "playground": { "mode": "full", "proxy": "auto" }
  },
  "editUrl": "https://github.com/me/repo/edit/main",
  "analytics": { "plausible": { "domain": "docs.example.com" } },
  "feedback": { "endpoint": "https://example.com/api/docs-feedback" },
  "seo": { "title": "My API", "description": "..." }
}
```

- **`topbar.width`** / **`topbar.homeWidth`** — topbar layout: `"full"` spans
  edge-to-edge; `"contained"` centers it to the content max-width. `width`
  governs docs + the API reference (default `"full"`); `homeWidth` governs the
  homepage independently (default `"full"`; `"contained"` lines the marketing
  nav up with a centered hero).
- **`api.playground.mode`** — the "Try it" experience: `"full"` (inline param
  inputs + live console + API Explorer modal), `"inline"` (Mintlify-style, no
  modal), `"explorer"` (read-only docs + console + Explorer modal, Stripe-style),
  or `"off"` (static cURL panel).

### Ask AI (BYOK)

Opt-in AI assistant for the API reference — a docked chat panel with "Ask about
this section" and source citations. **Bring your own key**; Markline never ships
one. Omit the `ai` block (or set `enabled: false`) and there is no AI route, no
client weight, and no UI — the framework is unchanged.

```jsonc
"ai": {
  "enabled": true,
  "provider": "openrouter",          // openai · openrouter · together · groq · fireworks · local · openai-compatible
  "baseUrl": null,                   // required for "openai-compatible"
  "model": "anthropic/claude-3.5-sonnet",
  "mode": "proxy",                   // "proxy" (operator key, server) | "byok" (reader key, browser)
  "label": "Ask AI",
  "maxTokens": 1024,
  "rateLimit": { "perMinute": 10 }
}
```

- **`mode: "proxy"`** (Node/Docker/Vercel) — the key lives only on the server in
  `MARKLINE_AI_KEY` (never `markline.json`, never `NEXT_PUBLIC_*`). Requests go
  through the built-in `/api/ai` route, which is dropped in static export.
  ⚠️ A public site with a proxy is an open relay to your paid LLM — the route
  ships with origin checks and a per-IP rate limit, but **enabling proxy mode on
  a public site spends your budget**; tune `rateLimit` and `maxTokens`.
- **`mode: "byok"`** — the reader pastes their own key (stored in their browser)
  and calls the provider directly. Works on pure-static hosting; the operator
  spends nothing.
- One transport speaks the OpenAI `/chat/completions` shape, so any
  OpenAI-compatible vendor works via the `provider` preset or a `baseUrl`.

### API reference content (MDX overlays)

The reference is generated from `api/openapi.json`, but you can layer authored
MDX on top — full components (callouts, tables, tabs) included:

```
api/
├── openapi.json
├── introduction.mdx              # replaces the auto API landing page
├── sections/<tag>.mdx            # rich summary for an OpenAPI tag/resource
└── operations/<operationId>.mdx  # extra prose on a single operation page
```

- **`sections/<tag>.mdx`** renders as the resource intro on the reference
  landing (Stripe-style), overriding the OpenAPI tag `description`. The filename
  is the slugified tag (e.g. `Payment Methods` → `payment-methods.mdx`).
- **`operations/<operationId>.mdx`** renders between the endpoint path and the
  auto-generated parameters on that operation's page.
- **`editUrl`** — adds an "Edit this page" link; the page's content-relative path
  is appended (e.g. `docs/quickstart.mdx`).
- **`analytics`** — opt-in `plausible`, `googleAnalytics` (`measurementId`), or
  `posthog` (`apiKey`, `apiHost`).
- **`feedback.endpoint`** — the "Was this page helpful?" widget POSTs
  `{ answer, reason, comment, path }` here. The widget only shows once this is
  set, or with `feedback.enabled: true`. See [Feedback](https://markline.dev/feedback).

### Versioning

Declare multiple versions to get a version switcher in the topbar. The first
version is the default and is served unprefixed; others are served under their
id and read content from `<id>/docs/`.

```jsonc
"versions": [
  { "id": "v2", "label": "v2 (latest)" },
  {
    "id": "v1",
    "label": "v1",
    "navigation": { "tabs": [ /* hrefs prefixed with /v1 */ ] }
  }
]
```

```
my-docs/
├── docs/            # v2 (default)  -> /quickstart
└── v1/
    └── docs/        # v1            -> /v1/quickstart
```

### Localization (i18n)

Identical mechanism to versioning, via `i18n.locales`. The first locale is the
default (unprefixed); others are served under their id with content in
`<id>/docs/` and their own (translated) navigation. A topbar language switcher
appears automatically. A project uses versions **or** locales (not both).

```jsonc
"i18n": {
  "locales": [
    { "id": "en", "label": "English" },
    { "id": "es", "label": "Español", "navigation": { "tabs": [ /* /es hrefs */ ] } }
  ]
}
```

```
my-docs/
├── docs/            # en (default)  -> /quickstart
└── es/
    └── docs/        # es            -> /es/quickstart
```

## Features

- Config-driven navigation, theming, and branding — no code to fork.
  Nested sidebars with icons, a topbar with dropdowns, banner and buttons, and a footer.
- **[Templates](https://markline.dev/templates)** — `classic`, `paper`,
  `product-docs` and `help-center`, or your own as a folder or npm package.
- Page layouts: docs, full-width **landing** pages and a help-center **hub** with a search hero.
- MDX content with server-side syntax highlighting (Shiki).
- First-class OpenAPI: operation pages, schema tables, sample requests/responses.
- **Interactive API playground** ("Try it") on every endpoint.
- Static full-text search (Pagefind) — zero search infrastructure.
- **[Ask AI](https://markline.dev/ai)** on your own LLM key (BYOK), off by default.
- **[LLM files](https://markline.dev/llm-files)** — `llms.txt`, `llms-full.txt` and a `.md` copy of every page.
- **[Page actions](https://markline.dev/llm-files#page-actions)** — Copy for LLM and View as Markdown on every docs page.
- **[Changelog](https://markline.dev/configuration#changelog)** pages from a `changelog/` folder, with RSS.
- **[Versions and languages](https://markline.dev/versions)** with a switcher.
- **[Reader feedback](https://markline.dev/feedback)** ("Was this helpful?") to your own endpoint.
- SEO metadata, `sitemap.xml`, `robots.txt` and analytics (Plausible, Google Analytics, PostHog).
- Dark mode, table of contents, responsive layout.

## Authoring components

Available in any MDX page without an import:

- **Callouts** — `<Note>`, `<Info>`, `<Tip>`, `<Check>`, `<Warning>`, `<Danger>`, `<Callout tone>`
- **Layout** — `<Card>` / `<CardGroup>` (also `variant="tile"`), `<LinkList>` / `<LinkItem>`,
  `<Steps>` / `<Step title>`, `<Paths>` / `<Path>`
- **Media** — `<Image>` (captions, zoom, light/dark), `<Video>`, `<Audio>` / `<AudioGroup>`
- **Interactive** — `<Tabs>` / `<Tab title>`, `<AccordionGroup>` / `<Accordion title>`,
  `<CodeGroup>` (synced code tabs)
- **Text** — `<MenuPath>` for UI routes like **Settings → API keys**
- **API** — `<ParamField path|query|header|body type required>`, `<ResponseField>`, `<EndpointList>`
- **Landing pages** — `<Hero>`, `<CTAButton>`, `<FeatureGrid>` / `<Feature>`, `<CTASection>`,
  `<SectionHead>`, `<StatStrip>` / `<Stat>`, `<Bento>` / `<BentoCard>`, `<CodeShowcase>`

See [Components](https://markline.dev/components) for examples.

```mdx
<Note>Heads up — this is worth knowing.</Note>

<Steps>
  <Step title="Install">Run `npm install @markline/markline`.</Step>
  <Step title="Develop">Run `markline dev`.</Step>
</Steps>
```

## License

MIT
