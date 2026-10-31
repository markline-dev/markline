import fs from "node:fs";
import path from "node:path";

/**
 * Templates — named bundles of option defaults, layered between Markline's
 * built-in defaults and the user's markline.json:
 *
 *   built-in defaults → template (and whatever it `extends`) → user config
 *
 * A template is a folder holding `template.json`, an optional `template.css`
 * and an optional `starter/` that `markline init --template` scaffolds. It is
 * data only — no JavaScript — so trying someone else's template can't run code
 * at build time, and templates don't break when Markline's internals change.
 *
 * `template` in markline.json resolves three ways:
 *  - "./path" or "../path" → a folder relative to markline.json
 *  - "@scope/name" or "markline-template-*" → an npm package in the project
 *  - any other bare name → a built-in under lib/templates/<name>
 *
 * Pure (no app imports) so it can be unit-tested directly.
 */

/** What a template may set: theme, layout and the topbar widths. Navigation,
 *  SEO, API and AI settings stay the user's: a template that could set
 *  `ai.endpoint` could route readers' questions elsewhere. */
export type TemplateOptions = {
  theme?: Record<string, unknown>;
  layout?: { header?: "single" | "stacked"; search?: "sidebar" | "header"; related?: "off" | "collection" };
  topbar?: { width?: "full" | "contained"; homeWidth?: "full" | "contained" };
};

export type TemplateManifest = TemplateOptions & {
  name?: string;
  /** Another template to start from; its options apply first. */
  extends?: string;
  /** Markline versions this template is tested against, e.g. ">=0.2.0". */
  markline?: string;
};

export type ResolvedTemplate = {
  /** The spec as written, for error messages. */
  spec: string;
  dir: string;
  manifest: TemplateManifest;
  /** Contents of template.css, or "" when the template ships none. */
  css: string;
};

const MAX_DEPTH = 8;

/** Where a template spec points, without touching the filesystem beyond npm
 *  resolution. `configDir` is the folder holding markline.json; `builtinDir`
 *  is lib/templates. */
export function resolveTemplateDir(spec: string, configDir: string, builtinDir: string): string {
  if (spec.startsWith("./") || spec.startsWith("../") || path.isAbsolute(spec)) {
    return path.resolve(configDir, spec);
  }
  if (spec.startsWith("@") || spec.startsWith("markline-template-")) {
    // Walk up node_modules from the project, as Node's resolver would. Done by
    // hand rather than with createRequire, which webpack tries (and fails) to
    // rewrite when this runs inside the Next server bundle.
    for (let dir = configDir; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", ...spec.split("/"));
      if (fs.existsSync(path.join(candidate, "template.json"))) return fs.realpathSync(candidate);
      if (path.dirname(dir) === dir) break;
    }
    throw new Error(`[markline] template "${spec}" is not installed — run \`npm install ${spec}\`.`);
  }
  return path.join(builtinDir, spec);
}

function readTemplate(spec: string, configDir: string, builtinDir: string): ResolvedTemplate {
  const dir = resolveTemplateDir(spec, configDir, builtinDir);
  const file = path.join(dir, "template.json");
  if (!fs.existsSync(file)) {
    const builtins = fs.existsSync(builtinDir) ? fs.readdirSync(builtinDir).join(", ") : "none";
    throw new Error(`[markline] template "${spec}" not found (looked for ${file}). Built-in templates: ${builtins}.`);
  }
  let manifest: TemplateManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`[markline] template "${spec}" has an invalid template.json: ${(err as Error).message}`);
  }
  const cssFile = path.join(dir, "template.css");
  const css = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf8") : "";
  return { spec, dir, manifest, css };
}

/**
 * The template and everything it extends, base first. A template's own
 * `extends` resolves relative to that template's folder, so a local template
 * can extend a sibling with "./other".
 */
export function loadTemplateChain(spec: string, configDir: string, builtinDir: string): ResolvedTemplate[] {
  const chain: ResolvedTemplate[] = [];
  const seen = new Set<string>();
  let next: { spec: string; from: string } | undefined = { spec, from: configDir };
  while (next) {
    const t = readTemplate(next.spec, next.from, builtinDir);
    if (seen.has(t.dir)) {
      const cycle = [...chain.map((c) => c.spec), t.spec].reverse().join(" → ");
      throw new Error(`[markline] template extends cycle: ${cycle}`);
    }
    if (chain.length >= MAX_DEPTH) {
      throw new Error(`[markline] template "${spec}" extends more than ${MAX_DEPTH} levels deep.`);
    }
    seen.add(t.dir);
    chain.unshift(t);
    next = t.manifest.extends ? { spec: t.manifest.extends, from: t.dir } : undefined;
  }
  return chain;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursive merge for option objects: objects merge key by key, anything
 *  else (strings, numbers, arrays) in `over` replaces `base`. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Only the keys a template is allowed to set. Anything else is dropped with a
 *  warning rather than silently honoured. */
export function pickTemplateOptions(m: TemplateManifest, warn: (msg: string) => void = console.warn): TemplateOptions {
  const allowed = new Set(["name", "extends", "markline", "theme", "layout", "topbar"]);
  for (const k of Object.keys(m)) {
    if (!allowed.has(k)) warn(`[markline] template "${m.name ?? "?"}" sets "${k}", which templates can't change — ignored.`);
  }
  const out: TemplateOptions = {};
  if (isPlainObject(m.theme)) out.theme = m.theme;
  if (isPlainObject(m.layout)) out.layout = m.layout;
  if (isPlainObject(m.topbar)) {
    const t: NonNullable<TemplateOptions["topbar"]> = {};
    if (m.topbar.width) t.width = m.topbar.width;
    if (m.topbar.homeWidth) t.homeWidth = m.topbar.homeWidth;
    for (const k of Object.keys(m.topbar)) {
      if (k !== "width" && k !== "homeWidth") warn(`[markline] template "${m.name ?? "?"}" sets "topbar.${k}", which templates can't change — ignored.`);
    }
    out.topbar = t;
  }
  return out;
}

/** The chain's options folded together, base first. */
export function templateOptions(chain: ResolvedTemplate[], warn?: (msg: string) => void): TemplateOptions {
  return chain.reduce<TemplateOptions>((acc, t) => deepMerge(acc, pickTemplateOptions(t.manifest, warn)), {});
}

/** The chain's stylesheets, base first, each labelled for debugging. */
export function templateCss(chain: ResolvedTemplate[]): string {
  return chain.filter((t) => t.css.trim()).map((t) => `/* template: ${t.spec} */\n${t.css}`).join("\n");
}

/**
 * Whether `version` satisfies `range`. Deliberately small: supports an exact
 * version, ">=x.y.z" and "^x.y.z". Returns null for anything else, so the
 * caller can say the range wasn't checked rather than guess.
 */
export function satisfiesVersion(version: string, range: string): boolean | null {
  const parse = (v: string) => {
    const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const v = parse(version);
  if (!v) return null;
  const r = range.trim();
  if (r.startsWith(">=")) {
    const min = parse(r.slice(2));
    return min ? cmp(v, min) >= 0 : null;
  }
  if (r.startsWith("^")) {
    const min = parse(r.slice(1));
    if (!min) return null;
    // ^0.y.z only allows patch bumps within 0.y; ^x.y.z (x>0) any x.*.*.
    const sameLine = min[0] === 0 ? v[0] === 0 && v[1] === min[1] : v[0] === min[0];
    return sameLine && cmp(v, min) >= 0;
  }
  const exact = parse(r);
  return exact && /^\d+\.\d+\.\d+$/.test(r) ? cmp(v, exact) === 0 : null;
}

/** Warn when a template declares a Markline range this version is outside of. */
export function checkTemplateVersions(chain: ResolvedTemplate[], version: string, warn: (msg: string) => void = console.warn): void {
  for (const t of chain) {
    const range = t.manifest.markline;
    if (!range) continue;
    const ok = satisfiesVersion(version, range);
    if (ok === false) warn(`[markline] template "${t.spec}" is built for Markline ${range}; this is ${version}. It may not render as intended.`);
    if (ok === null) warn(`[markline] template "${t.spec}" declares Markline "${range}", a range this version can't check.`);
  }
}

/**
 * Make CSS safe to inline in a <style> element. A literal `</style>` in the
 * text would close the element early and let whatever follows run as HTML —
 * a template's stylesheet or a cssVariables value could inject a <script>.
 * Every `<` becomes the CSS escape `\3c `, which can't end the element and
 * still reads as `<` inside CSS strings, comments and url()s.
 */
export function escapeStyleText(css: string): string {
  return css.replace(/</g, "\\3c ");
}

