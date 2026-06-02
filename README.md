# Markline

Open-source, self-hostable documentation framework with first-class OpenAPI, full-text
search, and an interactive API playground. A fully open alternative to Scalar and Mintlify.

## Quickstart

```bash
npm install markline
npx markline init      # scaffold docs.json + sample content in the current dir
npx markline dev       # preview at http://localhost:3000
```

Your project holds only content + config:

```
my-docs/
├── docs.json          # navigation, theme, branding, API settings
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
| `markline dev` | Start the dev server against `./docs.json`. |
| `markline build` | Build a production Node server bundle (Docker / Vercel). |
| `markline start` | Serve a production build. |
| `markline export` | Build a static HTML site into `./out` (any CDN / GitHub Pages / S3). |

## Hosting

- **Static** — `markline export` → upload `out/` anywhere. The API playground runs in
  direct-fetch mode (set `api.playground.proxy` to `"never"`).
- **Node / Docker** — `markline build && markline start`. Enables the playground's
  server-side proxy for APIs that don't send CORS headers.
- **Vercel / Netlify** — build with `markline build`.

## Configuration (`docs.json`)

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
  "seo": { "title": "My API", "description": "..." }
}
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
  <Step title="Install">Run `npm install markline`.</Step>
  <Step title="Develop">Run `markline dev`.</Step>
</Steps>
```

## License

MIT
