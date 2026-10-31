const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

// Plain-JS mirror of lib/openapi-tag-config.ts for the build script, which
// runs under plain node. test/openapi-normalize.test.ts checks that the two
// agree, so change both together.

const DEFAULT_HIDE_EXTENSIONS = ["x-hidden", "x-internal"];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function override(api, name) {
  const tags = api?.tags;
  return tags && Object.prototype.hasOwnProperty.call(tags, name) ? tags[name] : undefined;
}

/** A spec tag after `api.tags` mergeInto chains; null when hidden. */
export function resolveTag(name, api) {
  const seen = new Set();
  let cur = name;
  while (!seen.has(cur)) {
    seen.add(cur);
    const o = override(api, cur);
    if (o?.hidden) return null;
    const next = typeof o?.mergeInto === "string" ? o.mergeInto.trim() : "";
    if (!next) break;
    cur = next;
  }
  return cur;
}

function primaryTag(opTags, api) {
  const list = Array.isArray(opTags) && opTags.length ? opTags : ["Default"];
  for (const t of list) {
    if (typeof t !== "string") continue;
    const r = resolveTag(t, api);
    if (r) return r;
  }
  return null;
}

/** Whether an operation is left out of the reference (`api.hideExtensions`,
 *  `api.showDeprecated: false`). */
export function isHiddenOperation(op, api) {
  if (api?.showDeprecated === false && op.deprecated === true) return true;
  return (api?.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS).some((ext) => !!op[ext]);
}

/**
 * Every operation that gets a page, with the resource tag it files under —
 * mirroring normalize() in lib/openapi.ts, so llms.txt, search and the sitemap
 * never link to a page that doesn't exist. Tags whose slugs collide are folded
 * into the first one, and reported in `collisions`.
 */
export function resourcePlan(spec, api) {
  const ops = [];
  const used = [];
  for (const [pathStr, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op || isHiddenOperation(op, api)) continue;
      const tag = primaryTag(op.tags, api);
      if (!tag) continue;
      ops.push({ method, path: pathStr, op, tag });
      if (!used.includes(tag)) used.push(tag);
    }
  }

  const usedSet = new Set(used);
  const declared = (spec.tags ?? []).map((t) => resolveTag(t.name, api)).filter((n) => n && usedSet.has(n));
  const pinned = (api?.tagOrder ?? []).map((n) => resolveTag(n, api)).filter((n) => n && usedSet.has(n));
  const declaredSet = new Set(declared);
  const rest = used.filter((n) => !declaredSet.has(n)).sort((a, b) => a.localeCompare(b));
  const pinnedSet = new Set(pinned);
  const ranked = [...new Set([...pinned, ...declared.filter((n) => !pinnedSet.has(n)), ...rest])];

  const bySlug = new Map();
  const alias = new Map();
  const collisions = new Map();
  for (const name of new Set([...declared, ...used])) {
    const s = slug(name);
    const owner = bySlug.get(s);
    if (owner === undefined) {
      bySlug.set(s, name);
      continue;
    }
    alias.set(name, owner);
    const c = collisions.get(s) ?? { slug: s, names: [owner], into: owner };
    c.names.push(name);
    collisions.set(s, c);
  }
  for (const o of ops) o.tag = alias.get(o.tag) ?? o.tag;
  return { tags: ranked.filter((n) => !alias.has(n)), ops, collisions: [...collisions.values()] };
}

/** The resources that get a page, in sidebar order. */
export function orderedResourceTags(spec, api) {
  return resourcePlan(spec, api).tags;
}
