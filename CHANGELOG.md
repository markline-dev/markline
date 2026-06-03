# Changelog

All notable changes to `@markline/markline` and `@markline/create`.

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
