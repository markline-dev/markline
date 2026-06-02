import fs from "node:fs";
import path from "node:path";
import { contentRoot } from "./paths";

/**
 * Markline configuration — the single source of truth for branding and
 * navigation, loaded from `docs.json` at the content root (override the path
 * with the `MARKLINE_CONFIG` env var). This is what turns the engine into a
 * framework: a consumer ships a `docs.json` + content and gets their own site
 * with no code changes.
 */

export type ThemeConfig = {
  /** Logo image paths (served from /public) or a text wordmark fallback. */
  logo?: { light?: string; dark?: string; text?: string };
  /** Brand accent as hex; `primaryDark` is used on dark surfaces. */
  colors?: { primary?: string; primaryDark?: string };
  appearance?: "light" | "dark" | "system";
};

export type NavLink = {
  href: string;
  label: string;
  badge?: "new" | "beta";
  method?: string;
};

export type NavGroup = { group: string; pages: NavLink[] };

export type NavTab = {
  id: string;
  label: string;
  href: string;
  /** Pathname prefixes that activate this tab; use "__default__" for the fallback. */
  match?: string[];
  /** Explicit nav groups. Ignored when `openapi` is true. */
  groups?: NavGroup[];
  /** When true, this tab's sidebar is generated from the OpenAPI spec's tags. */
  openapi?: boolean;
};

export type TopbarLink = { label: string; href: string };

/**
 * A documentation version. The first version in the list is the default and is
 * served unprefixed (e.g. /quickstart). Others are served under their id as a
 * path prefix (e.g. /v1/quickstart) with content in `<root>/<id>/docs`.
 * Provide a per-version `navigation` (with already-prefixed hrefs); it falls
 * back to the top-level navigation otherwise.
 */
export type Version = {
  id: string;
  label: string;
  navigation?: { tabs: NavTab[] };
};

export type SeoConfig = {
  title?: string;
  titleTemplate?: string;
  description?: string;
  metadataBase?: string;
  siteName?: string;
  ogImage?: string;
};

export type ApiConfig = {
  /** Base URL the interactive playground sends requests to (overrides the spec's servers). */
  baseUrl?: string;
  playground?: {
    enabled?: boolean;
    /**
     * How the playground reaches the API:
     * - "never":  always a direct browser fetch (required for static export).
     * - "always": always route through the /api/playground server proxy.
     * - "auto":   direct first, fall back to the proxy on CORS/network failure.
     */
    proxy?: "auto" | "always" | "never";
  };
};

export type AnalyticsConfig = {
  plausible?: { domain: string; src?: string };
  googleAnalytics?: { measurementId: string };
  posthog?: { apiKey: string; apiHost?: string };
};

export type MarklineConfig = {
  name: string;
  theme: ThemeConfig;
  topbar: { links: TopbarLink[]; cta?: TopbarLink };
  navigation: { tabs: NavTab[] };
  seo: SeoConfig;
  api: ApiConfig;
  /** Base URL for "Edit this page" links; the page's content-relative path is appended. */
  editUrl?: string;
  analytics?: AnalyticsConfig;
  /** POST endpoint for the "Was this page helpful?" widget. Logs to console when unset. */
  feedback?: { endpoint?: string };
  /** Documentation versions. First is the default (unprefixed). */
  versions?: Version[];
};

const DEFAULT_CONFIG: MarklineConfig = {
  name: "Docs",
  theme: {
    appearance: "system",
    colors: { primary: "#3C87F0", primaryDark: "#6E86FA" },
  },
  topbar: { links: [] },
  navigation: {
    tabs: [
      { id: "documentation", label: "Documentation", href: "/", match: ["__default__"], groups: [] },
    ],
  },
  seo: {},
  api: { playground: { enabled: true, proxy: "auto" } },
};

/** Deep-ish merge: user config overrides defaults, nested objects merged one level. */
function mergeConfig(base: MarklineConfig, user: Partial<MarklineConfig>): MarklineConfig {
  return {
    name: user.name ?? base.name,
    theme: {
      ...base.theme,
      ...user.theme,
      colors: { ...base.theme.colors, ...user.theme?.colors },
      logo: { ...base.theme.logo, ...user.theme?.logo },
    },
    topbar: {
      links: user.topbar?.links ?? base.topbar.links,
      cta: user.topbar?.cta ?? base.topbar.cta,
    },
    navigation: {
      tabs: user.navigation?.tabs ?? base.navigation.tabs,
    },
    seo: { ...base.seo, ...user.seo },
    api: {
      ...base.api,
      ...user.api,
      playground: { ...base.api.playground, ...user.api?.playground },
    },
    editUrl: user.editUrl ?? base.editUrl,
    analytics: user.analytics ?? base.analytics,
    feedback: { ...base.feedback, ...user.feedback },
    versions: user.versions ?? base.versions,
  };
}

/** Non-default version ids (those served under a path prefix). */
export function nonDefaultVersionIds(config: MarklineConfig): string[] {
  if (!config.versions || config.versions.length <= 1) return [];
  return config.versions.slice(1).map((v) => v.id);
}

let _cache: MarklineConfig | undefined;

export function loadConfig(): MarklineConfig {
  if (_cache) return _cache;
  const configured = process.env.MARKLINE_CONFIG;
  const file = configured
    ? (path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured))
    : path.join(contentRoot(), "docs.json");

  let user: Partial<MarklineConfig> = {};
  try {
    user = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<MarklineConfig>;
  } catch {
    // No docs.json (or invalid) — fall back to defaults so the app still boots.
  }
  _cache = mergeConfig(DEFAULT_CONFIG, user);
  return _cache;
}

/** Convert a hex color (#rgb or #rrggbb) to a space-separated RGB triple for CSS vars. */
export function hexToRgbTriple(hex: string): string | null {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
