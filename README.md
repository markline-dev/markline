# Markline

Open-source, self-hostable documentation framework with first-class OpenAPI, full-text
search, and an interactive API playground. A fully open alternative to Scalar and Mintlify.

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

Your project holds only content + config:

```
my-docs/
├── markline.json      # navigation, theme, branding, API settings
├── docs/              # your pages (*.mdx)
│   ├── index.mdx
│   └── quickstart.mdx
└── api/
    └── openapi.json   # rendered as an interactive API reference
```

## CLI

| Command | Description |
| --- | --- |
| `markline init [dir]` | Scaffold a new docs project. |
| `markline dev` | Start the dev server against `./markline.json`. |
| `markline build` | Build a production Node server bundle (Docker / Vercel). |
| `markline start` | Serve a production build. |
| `markline export` | Build a static HTML site into `./out` (any CDN / GitHub Pages / S3). |

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
Mintlify-style projects). `theme.appearance` sets the default color scheme —
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
    "cta": { "label": "Get started", "href": "/quickstart" }
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
    "playground": { "enabled": true, "proxy": "auto" }
  },
  "editUrl": "https://github.com/me/repo/edit/main",
  "analytics": { "plausible": { "domain": "docs.example.com" } },
  "feedback": { "endpoint": "https://example.com/api/docs-feedback" },
  "seo": { "title": "My API", "description": "..." }
}
```

- **`editUrl`** — adds an "Edit this page" link; the page's content-relative path
  is appended (e.g. `docs/quickstart.mdx`).
- **`analytics`** — opt-in `plausible`, `googleAnalytics` (`measurementId`), or
  `posthog` (`apiKey`, `apiHost`).
- **`feedback.endpoint`** — the "Was this page helpful?" widget POSTs
  `{ answer, reason, comment, path }` here (logs to console when unset).

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
- MDX content with server-side syntax highlighting (Shiki).
- First-class OpenAPI: operation pages, schema tables, sample requests/responses.
- **Interactive API playground** ("Try it") on every endpoint.
- Static full-text search (Pagefind) — zero search infrastructure.
- Dark mode, table of contents, responsive layout.

## Authoring components

Available in any MDX page without an import:

- **Callouts** — `<Note>`, `<Info>`, `<Tip>`, `<Check>`, `<Warning>`, `<Danger>`
- **Layout** — `<Card>`, `<CardGroup cols={2}>`, `<Steps>` / `<Step title>`
- **Interactive** — `<Tabs>` / `<Tab title>`, `<AccordionGroup>` / `<Accordion title>`
- **API** — `<ParamField path|query|header|body type required>`, `<ResponseField>`

```mdx
<Note>Heads up — this is worth knowing.</Note>

<Steps>
  <Step title="Install">Run `npm install @markline/markline`.</Step>
  <Step title="Develop">Run `markline dev`.</Step>
</Steps>
```

## License

MIT
