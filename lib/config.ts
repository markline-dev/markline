import fs from "node:fs";
import path from "node:path";
import { contentRoot } from "./paths";
import { checkTemplateVersions, deepMerge, loadTemplateChain, templateCss, templateOptions } from "./templates";

/**
 * Markline configuration — the single source of truth for branding and
 * navigation, loaded from `docs.json` at the content root (override the path
 * with the `MARKLINE_CONFIG` env var). This is what turns the engine into a
 * framework: a consumer ships a `docs.json` + content and gets their own site
 * with no code changes.
 */

export type ThemeConfig = {
  /**
   * Logo: a small `icon` (shown next to the name) and/or a `text` wordmark, or
   * full `light`/`dark` images. Image paths are served from /public.
   */
  logo?: { light?: string; dark?: string; text?: string; icon?: string };
  /** Brand accent as hex; `primaryDark` is used on dark surfaces. */
  colors?: { primary?: string; primaryDark?: string };
  appearance?: "light" | "dark" | "system";
  /** Favicon path (served from /public). */
  favicon?: string;
  /** Font family overrides (the font must be system-available or self-loaded). */
  font?: {
    sans?: string;
    mono?: string;
    /** Font for page titles and section headings (docs, hub hero, API
     *  reference). Unset, headings use the body font. */
    heading?: string;
  };
  /** Corner radius of buttons (the topbar CTA + primary buttons). Any CSS length,
   *  e.g. "8px", "0.5rem", or "999px" for a full pill. Defaults to a pill. */
  buttonRadius?: string;
  /**
   * Raw CSS custom-property overrides for full palette theming — keyed by var
   * name (e.g. "--c-paper") to a value (RGB triple "247 246 241" for color
   * tokens). Applied to `:root` (light) and the dark selector respectively.
   */
  cssVariables?: { light?: Record<string, string>; dark?: Record<string, string> };
};

export type NavLink = {
  /** Page URL. Optional only on an item that holds `pages` — then the item is
   *  a folder that just opens and closes. */
  href?: string;
  label: string;
  badge?: "new" | "beta";
  method?: string;
  /** A Phosphor icon name, e.g. "book-open" or "BookOpen" (phosphoricons.com). */
  icon?: string;
  /** Child pages, shown nested under this item. Any depth. */
  pages?: NavLink[];
  /** Whether an item with `pages` starts closed. Defaults to true; the branch
   *  holding the current page always opens regardless. */
  collapsed?: boolean;
};

export type NavGroup = {
  group: string;
  pages: NavLink[];
  /** A Phosphor icon name shown before the group title. */
  icon?: string;
  /** Let readers open and close the whole group from its title. */
  collapsible?: boolean;
  /** With `collapsible`, whether the group starts closed. Defaults to false;
   *  a group holding the current page always opens. */
  collapsed?: boolean;
};

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

/**
 * A locale (same shape as a version): first is the default, served unprefixed;
 * others under `/<id>/...` with content in `<root>/<id>/docs` and their own
 * (translated) navigation. Versioning and i18n share the URL-prefix mechanism;
 * a project uses one dimension or the other.
 */
export type Locale = Version;

export type I18nConfig = { locales: Locale[] };

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
  /**
   * Languages shown in the API-reference code rails, in order. Subset of
   * "curl" | "node" | "python" | "go". Defaults to all four. The Node/Python/Go
   * samples are generated SDK-style — set `["curl"]` if you don't ship an SDK,
   * or provide your own per-operation samples via the OpenAPI `x-codeSamples`
   * extension (which override the generated ones).
   */
  codeSamples?: ("curl" | "node" | "python" | "go")[];
  playground?: {
    /**
     * Which "Try it" surfaces to render:
     * - "full"     (default): inline param inputs + rail console + API Explorer modal.
     * - "inline"   : inline param inputs + rail console (no modal).
     * - "explorer" : read-only docs + rail console + API Explorer modal.
     * - "off"      : a static cURL code panel, no interactivity.
     */
    mode?: "full" | "inline" | "explorer" | "off";
    /** Deprecated alias: `enabled: false` === `mode: "off"`. */
    enabled?: boolean;
    /**
     * How the playground reaches the API:
     * - "never":  always a direct browser fetch (required for static export).
     * - "always": always route through the /api/playground server proxy.
     * - "auto":   direct first, fall back to the proxy on CORS/network failure.
     */
    proxy?: "auto" | "always" | "never";
  };
  /** Webhook/async-event presentation. */
  events?: {
    /**
     * How event status dots are colored:
     * - "palette" (default): a distinct, stable color per event drawn from
     *   `palette` — colors by identity, not status, so every event is separable.
     * - "status": green/amber/neutral inferred from the event name
     *   (success / failure-or-terminal / neutral).
     * - "none": no color (all neutral).
     */
    dots?: "status" | "palette" | "none";
    /**
     * Colors for `dots: "palette"`, any CSS color or `var(--token)`. An event is
     * mapped to one entry by a stable hash of its name. Defaults to the brand
     * palette (`--c-purple`, `--c-cyan`, …).
     */
    palette?: string[];
  };
};

/** Resolve the effective playground mode (honors the deprecated `enabled` flag). */
export function playgroundMode(api: ApiConfig): "full" | "inline" | "explorer" | "off" {
  const pg = api.playground;
  if (pg?.mode) return pg.mode;
  if (pg?.enabled === false) return "off";
  return "full";
}

/* ── AI (BYOK) — see _docs/AI-BYOK-DESIGN.md ──────────────────────────────
   Opt-in "Ask AI" assistant. The operator key is a SERVER-side secret
   (MARKLINE_AI_KEY env), never in markline.json, never NEXT_PUBLIC_*. With no
   `ai` (or enabled:false), aiConfig() returns null and every AI UI renders
   nothing — the framework is byte-for-byte unchanged. */

export type AiProvider =
  | "openai"
  | "openrouter"
  | "together"
  | "groq"
  | "fireworks"
  | "local"
  | "openai-compatible";

/** Preset provider → OpenAI-compatible base URL. */
export const AI_PROVIDER_PRESETS: Record<Exclude<AiProvider, "openai-compatible">, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  groq: "https://api.groq.com/openai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  local: "http://localhost:11434/v1",
};

export type AiConfig = {
  /** Explicit opt-in; default false. */
  enabled?: boolean;
  provider?: AiProvider;
  /** Override base URL (required for "openai-compatible"). */
  baseUrl?: string;
  model?: string;
  /**
   * - "proxy": operator key on the server (built-in /api/ai route).
   * - "byok":  reader supplies their own key in the browser (localStorage),
   *            calling the provider directly — safe for pure-static hosting.
   */
  mode?: "proxy" | "byok";
  /** External proxy URL (operator-hosted worker) for pure-static + proxy mode. */
  endpoint?: string;
  /** UI affordance label. */
  label?: string;
  /** Optional system-prompt override for docs Q&A. */
  systemPrompt?: string;
  /**
   * Whether the model accepts image attachments (multimodal). When unset, it's
   * inferred from the model name (known vision models). Set explicitly to force
   * the paperclip on/off regardless of the heuristic.
   */
  vision?: boolean;
  /**
   * Opt-in: generate per-page Ask-AI starter questions at build time (on the
   * operator's key) into public/ai-suggestions.json. Cached by content hash,
   * so only changed pages re-call the provider on rebuilds.
   */
  suggestions?: boolean;
  maxTokens?: number;
  /** Per-IP abuse limits for the proxy route. */
  rateLimit?: { perMinute?: number; perDay?: number };
};

/** Sanitized AI config safe to send to the browser (never a key). */
export type AiPublicConfig = {
  mode: "proxy" | "byok";
  provider: AiProvider;
  providerLabel: string;
  model: string;
  label: string;
  /** Where the client POSTs: the built-in route, an external endpoint, or the
   *  provider directly (byok). Never carries a key. */
  endpoint: string | null;
  maxTokens: number;
  /** Whether the composer should offer image attachments. */
  vision: boolean;
};

/** Known vision-capable model families (substring match on the model id). */
const VISION_MODEL_PATTERNS = [
  "gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-4-vision", "o1", "o3", "o4-mini", "chatgpt-4o",
  "claude-3", "claude-4", "claude-opus", "claude-sonnet", "claude-haiku",
  "gemini", "llava", "bakllava", "llama-3.2", "llama-4", "pixtral",
  "-vl", "vision", "internvl", "molmo", "grok-2-vision", "grok-vision", "qwen2-vl", "qwen2.5-vl",
];

/** Resolve whether image attachments are supported: explicit override wins,
 *  else infer from the model id. */
export function modelSupportsVision(model: string | undefined, override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const m = (model ?? "").toLowerCase();
  return VISION_MODEL_PATTERNS.some((p) => m.includes(p));
}

const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  together: "Together",
  groq: "Groq",
  fireworks: "Fireworks",
  local: "Local",
  "openai-compatible": "OpenAI-compatible",
};

/** Resolve the OpenAI-compatible base URL for a provider (honors override). */
export function resolveAiBaseUrl(ai: AiConfig): string {
  if (ai.baseUrl) return ai.baseUrl.replace(/\/$/, "");
  const provider = ai.provider ?? "openai";
  if (provider === "openai-compatible") return ""; // requires explicit baseUrl
  return AI_PROVIDER_PRESETS[provider];
}

/**
 * The single availability resolver. Returns null when AI is unavailable — all
 * AI UI must render nothing. (Mirrors the design doc §3.)
 */
export function aiConfig(): AiPublicConfig | null {
  const ai = loadConfig().ai;
  if (!ai?.enabled) return null; // not opted in
  const provider = ai.provider ?? "openai";
  const mode = ai.mode ?? "proxy";
  if (mode === "proxy") {
    const hasServerKey = !!process.env.MARKLINE_AI_KEY; // server runtime
    const hasExternal = !!ai.endpoint; // static + external proxy
    if (!hasServerKey && !hasExternal) return null; // can't proxy → hide
  }
  // byok needs a reachable provider base URL.
  if (mode === "byok" && !resolveAiBaseUrl(ai)) return null;
  return {
    mode,
    provider,
    providerLabel: AI_PROVIDER_LABELS[provider],
    model: ai.model ?? "gpt-4o-mini",
    label: ai.label ?? "Ask AI",
    endpoint:
      mode === "byok"
        ? `${resolveAiBaseUrl(ai)}/chat/completions`
        : (ai.endpoint ?? "/api/ai"),
    maxTokens: ai.maxTokens ?? 1024,
    vision: modelSupportsVision(ai.model ?? "gpt-4o-mini", ai.vision),
  };
}

/**
 * Feedback availability. Returns the endpoint config to use, or null when the
 * widgets should render nothing at all. Rules: `enabled:false` hides; `enabled:true`
 * always shows (console-logs without an endpoint); otherwise show only when an
 * endpoint is set.
 */
export function feedbackConfig(): { endpoint?: string } | null {
  const fb = loadConfig().feedback;
  if (fb?.enabled === false) return null;
  if (fb?.enabled === true || fb?.endpoint) return { endpoint: fb?.endpoint };
  return null;
}

export type AnalyticsConfig = {
  plausible?: { domain: string; src?: string };
  googleAnalytics?: { measurementId: string };
  posthog?: { apiKey: string; apiHost?: string };
};

/** Page structure, as opposed to `theme`'s colours and fonts. Templates can
 *  set these too. */
export type LayoutConfig = {
  /** "single": logo, tabs and actions on one row (default). "stacked": logo,
   *  search and actions on top, the tabs on a row of their own underneath. */
  header?: "single" | "stacked";
  /** Where the search box lives: in the docs sidebar (default) or the header. */
  search?: "sidebar" | "header";
  /** The page column between the sidebar and "On this page": "fluid"
   *  (default) stretches to fill it; "centered" is a fixed width
   *  (--content-width, 880px) centred in it. */
  content?: "fluid" | "centered";
};

export type MarklineConfig = {
  name: string;
  layout: LayoutConfig;
  /**
   * A template to start from: a built-in name ("paper"), a folder relative to
   * markline.json ("./templates/acme"), or an npm package
   * ("@acme/markline-template"). It supplies defaults for `theme` and the
   * topbar widths; anything set here in markline.json still wins.
   */
  template?: string;
  theme: ThemeConfig;
  topbar: {
    links: TopbarLink[];
    /** Extra header nav links shown next to the doc tabs (e.g. marketing anchors). */
    navLinks?: TopbarLink[];
    cta?: TopbarLink;
    badge?: string;
    /** Topbar layout on docs + API reference: "full" (edge-to-edge, default) or
     *  "contained" (centered max-width, aligned to page content). */
    width?: "full" | "contained";
    /** Topbar layout on the homepage ("/") — independent from `width`. Defaults
     *  to "full" (edge-to-edge); set "contained" for a centered marketing nav
     *  that aligns with a hero. */
    homeWidth?: "full" | "contained";
  };
  navigation: { tabs: NavTab[] };
  seo: SeoConfig;
  api: ApiConfig;
  /** Base URL for "Edit this page" links; the page's content-relative path is appended. */
  editUrl?: string;
  analytics?: AnalyticsConfig;
  /**
   * Reader-feedback widgets ("Was this helpful?"). Hidden unless feedback is on:
   *  - `enabled: false`  → always hidden;
   *  - `enabled: true`   → always shown (logs to the console when no endpoint);
   *  - default (omitted) → shown only when an `endpoint` is set.
   */
  feedback?: { enabled?: boolean; endpoint?: string };
  /** Documentation versions. First is the default (unprefixed). */
  versions?: Version[];
  /** Localizations. First locale is the default (unprefixed). */
  i18n?: I18nConfig;
  /** Opt-in "Ask AI" assistant (BYOK). Omit to disable entirely. */
  ai?: AiConfig;
};

const DEFAULT_CONFIG: MarklineConfig = {
  name: "Docs",
  theme: {
    appearance: "system",
    colors: { primary: "#3C87F0", primaryDark: "#6E86FA" },
  },
  layout: { header: "single", search: "sidebar", content: "fluid" },
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
    template: user.template,
    layout: { ...base.layout, ...user.layout },
    // Fully recursive, so a user can override one cssVariables entry without
    // wiping out the rest of a template's palette.
    theme: deepMerge(base.theme, user.theme),
    topbar: {
      links: user.topbar?.links ?? base.topbar.links,
      navLinks: user.topbar?.navLinks ?? base.topbar.navLinks,
      cta: user.topbar?.cta ?? base.topbar.cta,
      badge: user.topbar?.badge ?? base.topbar.badge,
      width: user.topbar?.width ?? base.topbar.width ?? "full",
      homeWidth: user.topbar?.homeWidth ?? base.topbar.homeWidth ?? "full",
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
    i18n: user.i18n ?? base.i18n,
    ai: user.ai ?? base.ai,
  };
}

/** Non-default version ids (those served under a path prefix). */
export function nonDefaultVersionIds(config: MarklineConfig): string[] {
  if (!config.versions || config.versions.length <= 1) return [];
  return config.versions.slice(1).map((v) => v.id);
}

/** Non-default locale ids (those served under a path prefix). */
export function nonDefaultLocaleIds(config: MarklineConfig): string[] {
  if (!config.i18n?.locales || config.i18n.locales.length <= 1) return [];
  return config.i18n.locales.slice(1).map((l) => l.id);
}

/** All non-default content prefix ids (versions + locales). */
export function contentPrefixIds(config: MarklineConfig): string[] {
  return [...nonDefaultVersionIds(config), ...nonDefaultLocaleIds(config)];
}

/**
 * Resolve the config file path. Honors MARKLINE_CONFIG, else prefers a branded
 * `markline.json`, falling back to `docs.json` (Mintlify-compatible). Returns
 * the `markline.json` path even if neither exists (so a default still boots).
 */
export function resolveConfigPath(): string {
  const configured = process.env.MARKLINE_CONFIG;
  if (configured) return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  const root = contentRoot();
  const branded = path.join(root, "markline.json");
  if (fs.existsSync(branded)) return branded;
  const legacy = path.join(root, "docs.json");
  if (fs.existsSync(legacy)) return legacy;
  return branded;
}

let _cache: MarklineConfig | undefined;
let _templateCss = "";

/** Built-in templates ship inside lib/, which the CLI stages next to the app. */
function builtinTemplatesDir(): string {
  return path.join(process.cwd(), "lib", "templates");
}

function frameworkVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Apply a template's defaults under the user's config. Throws when the
 * template can't be found: a typo should fail the build, not quietly render
 * the default look.
 */
function withTemplate(base: MarklineConfig, user: Partial<MarklineConfig>, configDir: string): MarklineConfig {
  _templateCss = "";
  const spec = user.template;
  if (!spec) return base;
  const chain = loadTemplateChain(spec, configDir, builtinTemplatesDir());
  checkTemplateVersions(chain, frameworkVersion());
  const opts = templateOptions(chain);
  // primary and primaryDark are a pair. If the user sets either, drop the
  // template's colours entirely, or a blue `primary` would sit next to the
  // template's orange `primaryDark` the moment someone switches to dark mode.
  if (user.theme?.colors && opts.theme) {
    const { colors: _ignored, ...rest } = opts.theme;
    opts.theme = rest;
  }
  _templateCss = templateCss(chain);
  return {
    ...base,
    theme: deepMerge(base.theme, opts.theme),
    layout: { ...base.layout, ...opts.layout },
    topbar: { ...base.topbar, ...opts.topbar },
  };
}

/** The active template's stylesheet (and those it extends), or "". */
export function loadTemplateCss(): string {
  loadConfig();
  return _templateCss;
}

export function loadConfig(): MarklineConfig {
  if (_cache) return _cache;
  const file = resolveConfigPath();

  let user: Partial<MarklineConfig> = {};
  try {
    user = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<MarklineConfig>;
  } catch {
    // No config file (or invalid) — fall back to defaults so the app still boots.
  }
  const base = withTemplate(DEFAULT_CONFIG, user, path.dirname(file));
  _cache = mergeConfig(base, user);
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
