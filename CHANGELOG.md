# Changelog

All notable changes to `@markline/markline` and `@markline/create`.

## 0.1.4

### Fixed
- **Ask AI renders Markdown tables.** Answers containing a GFM table were shown
  as raw `| pipe |` text; they now render as real tables (inline bold/code in
  cells and surrounding text preserved), in both the docs and API reference.
- **Ask AI no longer flickers on navigation.** With the panel docked open,
  changing pages no longer animates the content / tables / code shrinking — the
  panel stays open and the layout holds steady. Only an explicit open/close
  animates, and a reload with the panel open paints already-shrunk.
- **Sidebar keeps the active link in view.** Navigating to a page whose nav link
  sat below the fold no longer leaves it scrolled off-screen.
- **Docs-only sites: `/` resolves.** The root path redirects to the first nav
  entry instead of 404ing when there is no index page; every other missing path
  still 404s, and static-export sites serving `public/index.html` are unaffected.
- **404 page is centered**, with its heading in the display font.

### Changed
- Ask AI panel header is borderless and aligned with the site nav.
- Removed the "Grounded in this page" scope label — answers draw on the full
  docs context, so the per-page label was misleading.

## 0.1.3

### Added
- **Webhooks & async events in the API reference.** Markline parses events from
  all four OpenAPI sources — root `webhooks` (3.1), `x-webhooks` (Redoc),
  per-operation `callbacks`, and the `x-events` extension — and surfaces them
  per resource: an **Events** tab, collapsible event cards (payload table +
  example), a **Triggers** chip on each emitting endpoint, and an **Emitted by**
  back-link on each event. Hidden when a resource emits nothing.
- **Event dot colors** — `api.events.dots`: `palette` (default; a distinct,
  stable color per event from a configurable `api.events.palette`), `status`
  (green/amber/neutral by name), or `none`.
- **Nested OpenAPI tag navigation** — slash-separated tags (`store/orders`)
  become a nested sidebar automatically; URLs and per-resource MDX overlays are
  unchanged.
- **Multi-version API reference** — per-version `openapi.json` served at
  `/api-reference/<id>`, with an in-header version selector.
- **Reader feedback** — page- and section-level "Was this helpful?", gated on
  config, plus a reference Cloudflare Worker → D1 `feedback-worker` template.
- **Ask AI (BYOK)** — a docked assistant on the docs and API reference, plus an
  `ai-worker` Cloudflare template and an AI docs page.
- **`llms.txt` + `llms-full.txt`** generated at build time.
- **Response status-code switcher** (success + error bodies), **"More
  attributes"** batching for long attribute lists, **light response panels**,
  and a height-capped, inner-scrolling code rail on the API reference.
- Config: `api.events`, `theme.favicon`, `theme.buttonRadius`, configurable
  topbar width (full vs. contained, separately for the homepage), and
  `api.codeSamples` to pick the generated rail languages.

### Changed
- Styling rebuilt in **plain CSS on the design tokens** (Tailwind removed);
  home, docs, and the API reference unified into one site with instant
  navigation.
- Brand refresh — wordmark lockup, blue accent, new favicon.
- npm package trimmed to essentials; example spec/tag data neutralized.

### Fixed
- MDX callouts (`Note`/`Tip`/`Warning`) now styled inside API-reference section
  and operation overlays.
- Enum / event-value chips always render on their own line under the
  description (consistent spacing).
- `feedback-worker` surfaces the underlying D1 error instead of a bare
  "Store failed".
- Removed stray status-dot glows (triggers, accordion headers, response
  switcher, version selector).
- Page feedback now shows sentiment-specific reason options — "what worked"
  for 👍 vs. "what to improve" for 👎 — instead of the same list for both.

## 0.1.2

### Added
- **Interactive API playground modes** — `api.playground.mode`: `full` (inline
  param inputs + live console + API Explorer modal), `inline` (Mintlify-style),
  `explorer` (Stripe-style read-only docs + centered Explorer), or `off`.
- **API Explorer** — a centered, searchable request workbench rendered through a
  portal, with an endpoint switcher, live cURL, and status-code response tabs.
- **Inline playground** — parameter docs double as the request form; state is
  shared across the inline inputs, the rail console, and the Explorer.
- Markline's own site (`site/`) now ships a live API reference demo.

### Changed
- The framework repo serves its own `site/` (docs + landing) by default when
  `MARKLINE_CONTENT` is unset.
- Authorizations are offered whenever the spec *defines* a bearer/apiKey scheme,
  not only when an operation declares it (fixes specs that under-declare auth).
- Config is read from `markline.json` (falling back to `docs.json`).

### Fixed
- CLI: resolve the hoisted `next` binary via module resolution, and run the app
  from a `.markline/` workdir so Next compiles outside `node_modules`.
- Static export of docs-only sites (empty API reference) no longer fails.
- Consumer `public/` assets (logos, favicons) are served.
- Theme `cssVariables` no longer leak the light palette into dark mode.
- The Explorer modal no longer renders beneath the sticky header.

## 0.1.1

- URL/metadata fixes for the initial publish.

## 0.1.0

- Initial public release: config-driven docs, OpenAPI reference, static search
  (Pagefind), CLI (`init`/`dev`/`build`/`start`/`export`), theming, versioning,
  i18n, and deploy recipes.
