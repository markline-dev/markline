/**
 * Webhook / async-event extraction from an OpenAPI document.
 *
 * Normalizes the four sources into {@link OpenAPIEvent}: root `webhooks`
 * (OpenAPI 3.1), root `x-webhooks` (Redoc), per-operation `callbacks`, and the
 * `x-events` extension (tag- or operation-level). Pure and dependency-free, so
 * it's unit-testable in isolation. Plain JS so the build script uses the same
 * rules as the pages (pageEvents: which events land on each page).
 */

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

/** DOM-safe anchor id for an event name (`card.created` → `event-card-created`). */
export function eventAnchor(name) {
  return `event-${name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** Minimal local `$ref` resolver (kept pure so this module has no runtime deps). */
function resolveRef(node, root, seen = new Set()) {
  if (!node || typeof node !== "object") return node;
  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return {};
    seen.add(node.$ref);
    const parts = node.$ref.replace(/^#\//, "").split("/");
    let cur = root;
    for (const p of parts) cur = cur?.[p];
    return resolveRef(cur, root, seen);
  }
  return node;
}

function firstMethodOp(pathItem, raw) {
  const item = resolveRef(pathItem, raw) ?? {};
  for (const m of METHODS) if (item[m]) return item[m];
  return undefined;
}

function guideOf(def) {
  for (const k of ["guide", "guideHref", "href"]) if (typeof def?.[k] === "string") return def[k];
  return undefined;
}

function eventFromOpLike(name, opLike, raw) {
  const op = resolveRef(opLike, raw) ?? {};
  return {
    name,
    summary: op.summary,
    description: op.description,
    tags: Array.isArray(op.tags) ? op.tags : [],
    payloadSchema: op.requestBody?.content?.["application/json"]?.schema,
  };
}

/** Root-level events: OpenAPI 3.1 `webhooks` or the Redoc `x-webhooks` extension. */
export function parseWebhooks(raw) {
  const src = raw?.webhooks ?? raw?.["x-webhooks"];
  if (!src || typeof src !== "object") return [];
  const out = [];
  for (const [name, pathItem] of Object.entries(src)) {
    const opLike = firstMethodOp(pathItem, raw);
    out.push(opLike ? eventFromOpLike(name, opLike, raw) : { name, tags: [] });
  }
  return out;
}

/**
 * The `x-events` extension: a `name → { summary, description, payload, guide }`
 * map, or an array of event names referencing definitions elsewhere. Used at the
 * tag level (no inherited tags) and the operation level.
 */
export function parseXEvents(xe, tags = []) {
  if (Array.isArray(xe)) {
    return xe.filter((n) => typeof n === "string").map((name) => ({ name, tags }));
  }
  if (!xe || typeof xe !== "object") return [];
  return Object.entries(xe).map(([name, def]) => ({
    name,
    summary: typeof def?.summary === "string" ? def.summary : undefined,
    description: typeof def?.description === "string" ? def.description : undefined,
    tags,
    payloadSchema: (def?.payload ?? def?.schema ?? def?.requestBody?.content?.["application/json"]?.schema),
    guideHref: guideOf(def),
  }));
}

/**
 * Events an operation emits: standard `callbacks` + the `x-events` extension.
 * Both inherit the operation's tags so they group onto its resource.
 */
export function parseOperationEvents(op, raw) {
  const inherit = Array.isArray(op.tags) ? op.tags : [];
  const out = parseXEvents(op["x-events"], inherit);

  const cbs = op.callbacks;
  if (cbs && typeof cbs === "object") {
    for (const [name, cbObj] of Object.entries(cbs)) {
      const resolved = resolveRef(cbObj, raw) ?? {};
      const pathItem = Object.values(resolved)[0];
      const opLike = pathItem ? firstMethodOp(pathItem, raw) : undefined;
      const ev = opLike ? eventFromOpLike(name, opLike, raw) : { name, tags: [] };
      if (!ev.tags.length) ev.tags = inherit;
      out.push(ev);
    }
  }
  return out;
}

/**
 * Two sources' versions of one event, merged. The first source to name an event
 * wins each field it gives; a later one only fills in what it lacks (a payload, a
 * guide, a summary). Sources come in a fixed order (pageEvents), so which one wins
 * never depends on anything else.
 */
export function mergeEvent(first, later) {
  const out = { ...later };
  for (const [k, v] of Object.entries(first)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * Every event on each resource page, merged: the one rule for which events a page
 * shows, used by the pages (normalize → buildResourceEvents, its anchors) and by
 * the build (its links to the page's channels). Give it the spec with hidden parts
 * already pruned (pruneSpec), so hidden webhooks, callbacks and x-events are gone.
 *
 * `tags`: the spec's tag objects; `ops`: the page each kept operation is on, in
 * the page's order; `pageOf`: a tag name to its page (after api.tags and slug
 * collisions), or null when hidden. A page's events come from, in this order: its
 * tags' `x-events` (in the spec's tag order, so a tag merged in later only fills
 * gaps), its operations' callbacks and `x-events` (in the page's operation order),
 * then the webhooks tagged for it. When several give one event, the first wins
 * each field it has (mergeEvent). Sorted by name.
 */
export function pageEvents(raw, { tags, ops, pageOf }) {
  const pages = new Map();
  const add = (map, e) => map.set(e.name, map.has(e.name) ? mergeEvent(map.get(e.name), e) : e);
  const on = (page) => {
    if (!pages.has(page)) pages.set(page, new Map());
    return pages.get(page);
  };
  for (const t of tags) {
    const page = pageOf(t.name);
    if (!page) continue;
    for (const e of parseXEvents(t["x-events"])) add(on(page), e);
  }
  for (const { page, op } of ops) {
    const map = on(page);
    for (const e of parseOperationEvents(op, raw)) add(map, e);
  }
  for (const wh of parseWebhooks(raw)) {
    const whPages = [...new Set(wh.tags.map(pageOf).filter((p) => !!p))];
    const resolved = { ...wh, tags: wh.tags.map(pageOf).filter((p) => !!p) };
    for (const page of whPages) add(on(page), resolved);
  }
  return new Map([...pages].map(([page, map]) => [page, [...map.values()].sort((a, b) => a.name.localeCompare(b.name))]));
}

