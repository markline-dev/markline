# Changelog

All notable changes to `@markline/markline` and `@markline/create`.

## Unreleased

### Added
- **Breadcrumb and page-action styles.** `layout.breadcrumbs: "chevron"`
  shows breadcrumbs in the body font with `›`, and `layout.breadcrumbsRoot`
  renames the first one (e.g. "All collections"). `layout.pageActions: "menu"`
  turns Copy for LLM, View as Markdown and Ask AI into one button with a
  dropdown, beside the page's last-updated date. The `help-center` template
  uses all three.

## 0.1.6

### Added
- **Templates.** Set `"template"` in `markline.json` to start from a ready-made
  theme and layout, then override anything: your config always wins. Built-ins
  are `classic`, `paper`, `product-docs` and `help-center`; a template can also
  be a folder next to `markline.json` or an npm package, and can `extend`
  another. `markline init --template <name>` scaffolds a project from one,
  starter pages included. Templates are data only (JSON, CSS, MDX), and can't
  change navigation, SEO, API or AI settings.
- **Sidebar icons, nesting and collapsing.** Any page or group can carry a
  Phosphor `icon`, any page can hold its own `pages` to any depth, and nested
  items open and close. The branch holding the current page always opens.
  Icons render at build time and add nothing to the page's JavaScript.
- **Header layout.** `layout.header: "stacked"` puts the tabs on a row of their
  own under the logo; `layout.search: "header"` moves search into the header on
  every page.
- **Hub page layout.** `layout: hub` in a page's frontmatter renders a
  full-width hero with a large search box above the sidebar and page, for a
  help-center home.
- **`theme.font.heading`** sets a separate font for page titles and section
  headings.
- **Mobile navigation.** Below 880px the topbar shows a menu button. On docs
  and API reference pages it opens the sidebar as a slide-in drawer (with the
  top-level tabs pinned at the top); on pages without a sidebar it opens a
  dropdown with the nav links. Esc, the scrim, or following a link closes it.
- **Markdown in OpenAPI descriptions.** Resource and operation intros on the
  API reference render their markdown (bold, code, links, lists, tables),
  sanitized. Per-operation pages also render it in parameter and response
  descriptions.
- **`x-nav-order`** on an operation sets its position within its resource,
  including between operations that share a path, which document order can't.
- **`x-displayName`** on a root `tags[]` entry sets the label a resource shows
  everywhere (sidebar, heading, breadcrumb, title, search, `llms.txt`) without
  changing its URL.

### Changed
- **The docs sidebar collapses at 880px instead of 720px**, matching the API
  reference. Between 721px and 880px it is now reached from the menu button
  rather than shown alongside the page.
- **Breadcrumbs follow the sidebar**: the page's tab, group and each item it
  sits under, instead of a guess from the URL. Frontmatter `crumbs` still wins.
- **The topbar marks the current tab using each tab's `match` rules**, so a tab
  whose `href` is `/` reads as current on its pages, not only the homepage.

### Fixed
- **Markdown on landing pages is laid out.** Headings, paragraphs and lists
  on a `layout: landing` page sat flush against the left edge with browser
  default links. Runs of markdown between landing sections now render in a
  centred column at docs reading width, with the docs text styles. Templates
  can change it through `.ml-landing-prose` or `--landing-prose-width`.
- **Theme colours reach the whole site.** `theme.colors` and
  `theme.cssVariables` now apply to the API reference, the topbar and the page
  background, not just the docs pages.
- **Card bodies render without a hydration error.** A `<Card>` whose body sat
  on its own line produced `<p>`-in-`<p>` markup and a React #418 error.
- **MDX components work outside the docs shell.** Callouts, steps, tabs and
  cards are styled on landing pages and in API operation-page MDX.
- **MDX on API operation pages is styled**, prose and links included.
- **`llms.txt` and the sitemap only list API resources that have a page**, in
  the same order as the site's sidebar.
- **Copy for LLM and View as Markdown keep link targets** from API reference
  intros.
- **A tag named `constructor` (or `toString`, `valueOf`) renders its name**
  instead of `function Object() { [native code] }`.

## 0.1.5

### Fixed
- **Ask AI follows your accent color.** The assistant sparkle, "Used N sources" /
  source icons, loading dots, and the search-palette Ask glyph used a hardcoded
  purple instead of the configured brand accent.
- **Cleaner search snippets.** Result previews no longer leak Markdown table
  syntax (`| --- |`, stray pipes); the indexer strips separator rows and cell
  pipes when extracting plain text.

### Changed
- **Search trigger** has a touch more padding so the `⌘K` hint doesn't crowd the
  right edge.

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
