/**
 * Removes everything `api.hideExtensions` hides from a raw spec, so the rest of
 * the pipeline (tables, samples, Try it, events) can't publish it by accident.
 * Pure: returns a pruned copy and leaves the input alone.
 */
const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

/** Values that only look like schemas; left exactly as authored. */
const OPAQUE_KEYS = new Set(["example", "examples", "default", "const", "enum", "x-codeSamples"]);

type Node = Record<string, any>;

const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);

function resolve(node: unknown, root: Node, seen = new Set<string>()): unknown {
  if (!isNode(node) || typeof node.$ref !== "string") return node;
  if (seen.has(node.$ref)) return undefined;
  seen.add(node.$ref);
  let cur: unknown = root;
  for (const part of node.$ref.replace(/^#\//, "").split("/")) cur = isNode(cur) ? cur[part] : undefined;
  return resolve(cur, root, seen);
}

/** A node is hidden when it, or what its `$ref` points at, carries a hide extension. */
function flagged(node: unknown, root: Node, exts: readonly string[]): boolean {
  if (!isNode(node)) return false;
  if (exts.some((e) => !!node[e])) return true;
  const target = resolve(node, root);
  return isNode(target) && exts.some((e) => !!target[e]);
}

const isNull = (s: unknown): boolean =>
  isNode(s) && (s.type === "null" || s.const === null || (Array.isArray(s.type) && s.type.length === 1 && s.type[0] === "null"));

/**
 * Whether nothing visible is left of a schema: it's flagged, its array items
 * are hidden, or every non-null member of its union is.
 */
function schemaGone(s: unknown, root: Node, exts: readonly string[]): boolean {
  if (!isNode(s)) return false;
  if (flagged(s, root, exts)) return true;
  if (s.type === "array" && schemaGone(s.items, root, exts)) return true;
  for (const key of ["anyOf", "oneOf"]) {
    const members = s[key];
    if (!Array.isArray(members)) continue;
    const real = members.filter((m) => !isNull(m));
    if (real.length && real.every((m) => schemaGone(m, root, exts))) return true;
  }
  return false;
}

function pruneValue(value: unknown, root: Node, exts: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => pruneValue(v, root, exts));
  if (!isNode(value)) return value;
  const out: Node = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "properties" && isNode(v)) continue;
    if (OPAQUE_KEYS.has(k)) {
      out[k] = v;
    } else if ((k === "anyOf" || k === "oneOf") && Array.isArray(v)) {
      out[k] = v.filter((m) => !schemaGone(m, root, exts)).map((m) => pruneValue(m, root, exts));
    } else if (k === "parameters" && Array.isArray(v)) {
      // A path parameter is part of the URL, so it stays whatever it's flagged.
      out[k] = v
        .filter((p) => (resolve(p, root) as Node | undefined)?.in === "path" || !flagged(p, root, exts))
        .map((p) => pruneValue(p, root, exts));
    } else if (k === "x-events" && isNode(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v).filter(([, e]) => !flagged(e, root, exts)).map(([name, e]) => [name, pruneValue(e, root, exts)]),
      );
    } else if ((k === "paths" || k === "webhooks" || k === "x-webhooks") && isNode(v)) {
      out[k] = prunePathItems(v, root, exts);
    } else if (k === "callbacks" && isNode(v)) {
      // A callback left with no path items would still list as an event.
      out[k] = Object.fromEntries(
        Object.entries(v)
          .map(([name, cb]) => [name, isNode(cb) ? prunePathItems(cb, root, exts) : cb] as const)
          .filter(([, cb]) => !isNode(cb) || Object.keys(cb).length > 0),
      );
    } else {
      out[k] = pruneValue(v, root, exts);
    }
  }
  // `properties` holds names, not keywords, so a field called "enum" or
  // "parameters" is handled as a field here, not by the loop above.
  if (isNode(value.properties)) {
    const props: Node = {};
    const dropped = new Set<string>();
    for (const [name, schema] of Object.entries(value.properties)) {
      if (schemaGone(schema, root, exts)) dropped.add(name);
      else props[name] = pruneValue(schema, root, exts);
    }
    out.properties = props;
    if (dropped.size && Array.isArray(value.required)) out.required = value.required.filter((r: string) => !dropped.has(r));
  }
  return out;
}

/** A `paths`-shaped map: drops hidden path items and hidden operations in them. */
function prunePathItems(items: Node, root: Node, exts: readonly string[]): Node {
  const out: Node = {};
  for (const [key, item] of Object.entries(items)) {
    if (flagged(item, root, exts)) continue;
    if (!isNode(item)) {
      out[key] = item;
      continue;
    }
    const kept: Node = {};
    for (const [k, v] of Object.entries(item)) {
      if (METHODS.includes(k) && flagged(v, root, exts)) continue;
      kept[k] = v;
    }
    // A webhook or callback whose every operation was hidden goes with them.
    if (METHODS.some((m) => isNode(item[m])) && !METHODS.some((m) => isNode(kept[m]))) continue;
    out[key] = pruneValue(kept, root, exts);
  }
  return out;
}

export function pruneSpec<T>(raw: T, hideExtensions: readonly string[]): T {
  if (!hideExtensions.length || !isNode(raw)) return raw;
  return pruneValue(raw, raw, hideExtensions) as T;
}
