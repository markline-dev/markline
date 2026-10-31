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
  return { order: ranked.filter((n) => !alias.has(n)), alias, collisions: [...collisions.values()] };
}

/** Build-time warning text for a slug collision. */
export function collisionWarning(c: TagCollision): string {
  const names = c.names.map((n) => `"${n}"`).join(", ");
  return `[markline] API tags ${names} share the URL /api-reference/${c.slug}; their operations are merged into "${c.into}". Use api.tags (label / mergeInto) in markline.json to rename or merge them explicitly.`;
}
