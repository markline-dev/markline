/**
 * Tag routing for the API reference: which resource page an operation lands
 * on, in what order the pages appear, and which operations are left out.
 *
 * Driven by `api.tags` / `api.tagOrder` / `api.hideExtensions` /
 * `api.showDeprecated` in markline.json, so a third-party or generated spec
 * can be tidied without forking it. Pure (no spec or FS access) so the rules
 * can be unit-tested; scripts/openapi-order.mjs mirrors them for the
 * plain-node build script, and a test keeps the two in step.
 */
import { tagSlug } from "./openapi-tags";

/** Per-tag overrides, keyed by the tag's name in the spec. */
export type TagOverride = {
  /** Sidebar and heading label. The URL keeps the tag's own slug. */
  label?: string;
  /** Replaces the spec's tag description. */
  description?: string;
  /** Drop the tag. An operation then files under its next tag, or is hidden
   *  when it has no other. */
  hidden?: boolean;
  /** File this tag's operations under another tag. The target may be a tag
   *  the spec doesn't declare, which renames the page (and its URL); a slashed
   *  name ("Workspace/Small business") nests it under a group. */
  mergeInto?: string;
};

export type TagOptions = {
  tags?: Record<string, TagOverride>;
  /** Tags listed first, in this order; the rest follow in spec order. */
  tagOrder?: string[];
};

/** Extensions that hide an operation when no `api.hideExtensions` is set. */
export const DEFAULT_HIDE_EXTENSIONS = ["x-hidden", "x-internal"];

/** Own-key lookup, so a tag named "constructor" isn't answered by Object. */
function override(opts: TagOptions | undefined, name: string): TagOverride | undefined {
  const tags = opts?.tags;
  return tags && Object.prototype.hasOwnProperty.call(tags, name) ? tags[name] : undefined;
}

/**
 * The tag a spec tag ends up as after `mergeInto` chains, or null when the tag
 * (or a tag it merges into) is hidden. A merge cycle stops where it repeats.
 */
export function resolveTag(name: string, opts?: TagOptions): string | null {
  const seen = new Set<string>();
  let cur = name;
  while (!seen.has(cur)) {
    seen.add(cur);
    const o = override(opts, cur);
    if (o?.hidden) return null;
    const next = typeof o?.mergeInto === "string" ? o.mergeInto.trim() : "";
    if (!next) break;
    cur = next;
  }
  return cur;
}

/**
 * The resource an operation is filed under: its first tag that survives
 * `resolveTag`. Untagged operations go under "Default" (which can itself be
 * renamed or hidden). Null means the operation has no page.
 */
export function primaryTag(opTags: unknown, opts?: TagOptions): string | null {
  const list = Array.isArray(opTags) && opTags.length ? opTags : ["Default"];
  for (const t of list) {
    if (typeof t !== "string") continue;
    const r = resolveTag(t, opts);
    if (r) return r;
  }
  return null;
}

/** Whether an operation is left out of the reference: a truthy hide
 *  extension, or `deprecated` when deprecated operations are hidden. */
export function isHiddenOperation(
  op: Record<string, unknown>,
  hideExtensions: readonly string[] = DEFAULT_HIDE_EXTENSIONS,
  showDeprecated = true,
): boolean {
  if (!showDeprecated && op.deprecated === true) return true;
  return hideExtensions.some((ext) => !!op[ext]);
}

export type TagCollision = { slug: string; names: string[]; into: string };

export type TagPlan = {
  /** Page tags in sidebar order. */
  order: string[];
  /** Tags whose slug collided with an earlier tag → the tag they merged into. */
  alias: Map<string, string>;
  collisions: TagCollision[];
};

/**
 * Order the resource tags and fold slug collisions together.
 *
 * `used` is every resolved tag that has operations, in operation order;
 * `declared` is the spec's root `tags` order. Tags in `tagOrder` come first,
 * then declared ones, then the rest alphabetically. Two tags with the same slug
 * ("dubbing" / "Dubbing") would share a URL and one would vanish, so the later
 * one merges into the earlier and the collision is reported.
 */
export function planTags(used: string[], declared: string[], opts?: TagOptions): TagPlan {
  const usedSet = new Set(used);
  const resolvedDeclared = declared.map((n) => resolveTag(n, opts)).filter((n): n is string => !!n && usedSet.has(n));
  const pinned = (opts?.tagOrder ?? []).map((n) => resolveTag(n, opts)).filter((n): n is string => !!n && usedSet.has(n));
  const declaredSet = new Set(resolvedDeclared);
  const rest = [...usedSet].filter((n) => !declaredSet.has(n)).sort((a, b) => a.localeCompare(b));
  const pinnedSet = new Set(pinned);
  const ranked = [...new Set([...pinned, ...resolvedDeclared.filter((n) => !pinnedSet.has(n)), ...rest])];

  // Precedence for a collision follows spec order (declared, then first use),
  // not tagOrder, so pinning a tag never changes which name a page keeps.
  const precedence = [...new Set([...resolvedDeclared, ...used])];
  const bySlug = new Map<string, string>();
  const alias = new Map<string, string>();
  const collisions = new Map<string, TagCollision>();
  for (const name of precedence) {
    const slug = tagSlug(name);
    const owner = bySlug.get(slug);
    if (owner === undefined) {
      bySlug.set(slug, name);
      continue;
    }
    alias.set(name, owner);
    const c = collisions.get(slug) ?? { slug, names: [owner], into: owner };
    c.names.push(name);
    collisions.set(slug, c);
  }
  // A pin on a collision's loser pins the page it merged into.
  const order = [...new Set(ranked.map((n) => alias.get(n) ?? n))];
  return { order, alias, collisions: [...collisions.values()] };
}

/** The page a spec tag ends up on, after `mergeInto` and slug collisions. */
function pageOf(name: string, plan: TagPlan, opts?: TagOptions): string | null {
  const r = resolveTag(name, opts);
  return r && (plan.alias.get(r) ?? r);
}

export type SpecTag = { name: string; displayName?: string; description?: string };

/**
 * Each page's label and description, the single rule every output follows.
 * Label: the page tag's own `label`, then a `label` on a tag merged into it,
 * then its `x-displayName`. Description: the page tag's own (config, then
 * spec), then the first merged tag's. No label means the name is derived.
 */
export function describeTags(
  specTags: SpecTag[],
  plan: TagPlan,
  opts?: TagOptions,
): Map<string, { label?: string; description?: string }> {
  const spec = new Map(specTags.map((t) => [t.name, t]));
  const names = [...new Set([...specTags.map((t) => t.name), ...plan.alias.keys(), ...Object.keys(opts?.tags ?? {})])];
  const out = new Map<string, { label?: string; description?: string }>();
  for (const page of plan.order) {
    const merged = names.filter((n) => n !== page && pageOf(n, plan, opts) === page);
    const chain = [page, ...merged];
    const label = chain.map((n) => override(opts, n)?.label?.trim()).find(Boolean) ?? (spec.get(page)?.displayName || undefined);
    const description =
      override(opts, page)?.description ??
      spec.get(page)?.description ??
      merged.map((n) => override(opts, n)?.description ?? spec.get(n)?.description).find((d) => d !== undefined);
    out.set(page, { label, description });
  }
  return out;
}

/**
 * Warnings for names in `api.tags` / `api.tagOrder` that don't do what they
 * look like: a typo otherwise leaves a hidden tag published, or quietly makes
 * a new page. `known` is every tag the spec declares or an operation carries.
 */
export function tagConfigWarnings(known: Set<string>, plan: TagPlan, opts?: TagOptions): string[] {
  const out: string[] = [];
  const isPath = (name: string) => plan.order.some((p) => p === name || p.startsWith(`${name}/`));
  for (const [name, o] of Object.entries(opts?.tags ?? {})) {
    if (!known.has(name) && !isPath(name)) {
      out.push(`[markline] api.tags: "${name}" matches no tag in the spec, so it has no effect. Check the spelling.`);
    }
    const target = typeof o?.mergeInto === "string" ? o.mergeInto.trim() : "";
    if (!target) continue;
    if (mergeCycle(name, opts)) {
      out.push(`[markline] api.tags: "${name}" is part of a mergeInto cycle. Its operations stay where the cycle stops.`);
    } else if (resolveTag(target, opts) === null) {
      out.push(`[markline] api.tags: "${name}" merges into "${target}", which is hidden, so its operations are hidden too.`);
    } else if (!known.has(target) && !override(opts, target)?.mergeInto) {
      // A new name is how a page gets renamed, so only a near miss is worth saying.
      const near = [...known].find((k) => closeName(k, target));
      if (near) {
        out.push(`[markline] api.tags: "${name}" merges into "${target}", which isn't a tag in the spec, so it creates a new page. Did you mean "${near}"?`);
      }
    }
  }
  for (const name of opts?.tagOrder ?? []) {
    const r = resolveTag(name, opts);
    if (!r) continue; // hidden on purpose: there's no page to order
    if (plan.alias.has(r)) {
      out.push(`[markline] api.tagOrder: "${name}" was merged into "${plan.alias.get(r)}". List that name instead.`);
    } else if (!plan.order.includes(r)) {
      out.push(`[markline] api.tagOrder: "${name}" matches no tag with operations, so it has no effect. Check the spelling.`);
    }
  }
  return out;
}

/** Whether a tag's `mergeInto` chain comes back around. */
function mergeCycle(name: string, opts?: TagOptions): boolean {
  const seen = new Set<string>();
  let cur = name;
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = override(opts, cur)?.mergeInto;
    if (typeof next !== "string" || !next.trim()) return false;
    cur = next.trim();
  }
  return true;
}

/** Levenshtein distance, stopping once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/** Whether two tag names look like the same name mistyped: same but for case, or a small slip. */
function closeName(known: string, target: string): boolean {
  const a = known.toLowerCase();
  const b = target.toLowerCase();
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && editDistance(a, b, 2) <= 2;
}

/** Every tag the spec declares or an operation carries ("Default" for untagged). */
export function knownTags(raw: { tags?: { name: string }[]; paths?: Record<string, any> }): Set<string> {
  const known = new Set<string>((Array.isArray(raw.tags) ? raw.tags : []).map((t) => t?.name).filter((n) => typeof n === "string"));
  for (const item of Object.values(raw.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
      const op = item?.[method];
      if (!op) continue;
      if (Array.isArray(op.tags) && op.tags.length) for (const t of op.tags) known.add(t);
      else known.add("Default");
    }
  }
  return known;
}

/** A sidebar section: a caption over the tags listed under it. */
export type TagSection = { title: string; tags: string[] };

export type SectionPlan = {
  /** Sections that kept at least one page, with their pages in order. */
  sections: TagSection[];
  /** Every page: the sections' in order, then the pages in no section. */
  order: string[];
  warnings: string[];
};

/**
 * Sections from `api.sections`, or else the spec's `x-tagGroups`. An `api.sections`
 * array, even an empty one, replaces the spec's groups. Malformed entries are
 * dropped.
 */
export function sectionSource(configured: unknown, specGroups: unknown): { sections: TagSection[]; fromSpec: boolean } {
  const parse = (list: unknown, key: "title" | "name"): TagSection[] =>
    (Array.isArray(list) ? list : [])
      .filter((g) => g && typeof g[key] === "string" && g[key].trim() && Array.isArray(g.tags))
      .map((g) => ({ title: g[key].trim(), tags: g.tags.filter((t: unknown): t is string => typeof t === "string") }));
  if (Array.isArray(configured)) return { sections: parse(configured, "title"), fromSpec: false };
  return { sections: parse(specGroups, "name"), fromSpec: true };
}

/**
 * Put pages under sections. A section lists spec tag names, as `api.tags` does;
 * each resolves to the page it ends up on (after `mergeInto`, hiding and slug
 * collisions), and a name that's a slash-group prefix ("Voices") takes every page
 * under it. A section keeps its own order; a page is in the first section that
 * lists it; pages in no section follow, in their usual order, and stay visible.
 * Sections only order and group pages: no page or URL is added or removed.
 */
export function planSections(sections: TagSection[], plan: TagPlan, known: Set<string>, opts?: TagOptions): SectionPlan {
  const warnings: string[] = [];
  const placedIn = new Map<string, string>();
  const out: TagSection[] = [];
  for (const section of sections) {
    const pages: string[] = [];
    for (const name of section.tags) {
      const resolved = resolveTag(name, opts);
      if (resolved === null) continue; // hidden on purpose
      const page = plan.alias.get(resolved) ?? resolved;
      const matches = plan.order.filter((p) => p === page || p.startsWith(`${page}/`));
      if (!matches.length) {
        const near = [...known].find((k) => closeName(k, name));
        warnings.push(
          `[markline] API sections: "${name}" in "${section.title}" matches no tag with operations, so it has no effect.${near && near !== name ? ` Did you mean "${near}"?` : ""}`,
        );
        continue;
      }
      for (const p of matches) {
        const already = placedIn.get(p);
        if (already === undefined) {
          placedIn.set(p, section.title);
          pages.push(p);
        } else if (already !== section.title) {
          warnings.push(`[markline] API sections: "${name}" is in "${already}" and "${section.title}"; it stays in "${already}".`);
        }
      }
    }
    if (pages.length) out.push({ title: section.title, tags: pages });
    else warnings.push(`[markline] API sections: "${section.title}" has no tags with operations, so it isn't shown.`);
  }
  const placed = out.flatMap((s) => s.tags);
  const rest = plan.order.filter((p) => !placedIn.has(p));
  return { sections: out, order: [...placed, ...rest], warnings };
}

/** Build-time warning text for a slug collision. */
export function collisionWarning(c: TagCollision): string {
  const names = c.names.map((n) => `"${n}"`).join(", ");
  return `[markline] API tags ${names} share the URL /api-reference/${c.slug}; their operations are merged into "${c.into}". Use api.tags (label / mergeInto) in markline.json to rename or merge them explicitly.`;
}
