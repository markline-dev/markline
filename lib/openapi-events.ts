/**
 * Webhook / async-event extraction from an OpenAPI document.
 *
 * Normalizes the four sources into {@link OpenAPIEvent}: root `webhooks`
 * (OpenAPI 3.1), root `x-webhooks` (Redoc), per-operation `callbacks`, and the
 * `x-events` extension (tag- or operation-level). Pure + dependency-free (only
 * type imports), so it's unit-testable in isolation.
 */
import type { JSONSchema, OpenAPIEvent, OpenAPIOperation } from "./openapi";

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

/** DOM-safe anchor id for an event name (`card.created` → `event-card-created`). */
export function eventAnchor(name: string): string {
  return `event-${name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** Minimal local `$ref` resolver (kept pure so this module has no runtime deps). */
function resolveRef(node: any, root: any, seen = new Set<string>()): any {
  if (!node || typeof node !== "object") return node;
  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return {};
    seen.add(node.$ref);
    const parts = node.$ref.replace(/^#\//, "").split("/");
    let cur: any = root;
    for (const p of parts) cur = cur?.[p];
    return resolveRef(cur, root, seen);
  }
  return node;
}

function firstMethodOp(pathItem: any, raw: any): any {
  const item = resolveRef(pathItem, raw) ?? {};
  for (const m of METHODS) if (item[m]) return item[m];
  return undefined;
}

function guideOf(def: any): string | undefined {
  for (const k of ["guide", "guideHref", "href"]) if (typeof def?.[k] === "string") return def[k];
  return undefined;
}

function eventFromOpLike(name: string, opLike: any, raw: any): OpenAPIEvent {
  const op = resolveRef(opLike, raw) ?? {};
  return {
    name,
    summary: op.summary,
    description: op.description,
    tags: Array.isArray(op.tags) ? op.tags : [],
    payloadSchema: op.requestBody?.content?.["application/json"]?.schema as JSONSchema | undefined,
  };
}

/** Root-level events: OpenAPI 3.1 `webhooks` or the Redoc `x-webhooks` extension. */
export function parseWebhooks(raw: any): OpenAPIEvent[] {
  const src = raw?.webhooks ?? raw?.["x-webhooks"];
  if (!src || typeof src !== "object") return [];
  const out: OpenAPIEvent[] = [];
  for (const [name, pathItem] of Object.entries<any>(src)) {
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
export function parseXEvents(xe: unknown, tags: string[] = []): OpenAPIEvent[] {
  if (Array.isArray(xe)) {
    return xe.filter((n): n is string => typeof n === "string").map((name) => ({ name, tags }));
  }
  if (!xe || typeof xe !== "object") return [];
  return Object.entries(xe as Record<string, any>).map(([name, def]) => ({
    name,
    summary: typeof def?.summary === "string" ? def.summary : undefined,
    description: typeof def?.description === "string" ? def.description : undefined,
    tags,
    payloadSchema: (def?.payload ?? def?.schema ?? def?.requestBody?.content?.["application/json"]?.schema) as JSONSchema | undefined,
    guideHref: guideOf(def),
  }));
}

/**
 * Events an operation emits: standard `callbacks` + the `x-events` extension.
 * Both inherit the operation's tags so they group onto its resource.
 */
export function parseOperationEvents(op: any, raw: any): OpenAPIEvent[] {
  const inherit = Array.isArray(op.tags) ? op.tags : [];
  const out: OpenAPIEvent[] = parseXEvents(op["x-events"], inherit);

  const cbs = op.callbacks;
  if (cbs && typeof cbs === "object") {
    for (const [name, cbObj] of Object.entries<any>(cbs)) {
      const resolved = resolveRef(cbObj, raw) ?? {};
      const pathItem = Object.values<any>(resolved)[0];
      const opLike = pathItem ? firstMethodOp(pathItem, raw) : undefined;
      const ev = opLike ? eventFromOpLike(name, opLike, raw) : { name, tags: [] as string[] };
      if (!ev.tags.length) ev.tags = inherit;
      out.push(ev);
    }
  }
  return out;
}

/** Merge tag-level and per-operation events for a tag, deduped by name, sorted. */
export function mergeTagEvents(operations: OpenAPIOperation[], tagEvents?: OpenAPIEvent[]): OpenAPIEvent[] {
  const map = new Map<string, OpenAPIEvent>();
  for (const e of tagEvents ?? []) map.set(e.name, e);
  for (const op of operations) {
    for (const e of op.events ?? []) {
      const prev = map.get(e.name);
      map.set(
        e.name,
        prev ? { ...e, ...prev, guideHref: e.guideHref ?? prev.guideHref, payloadSchema: e.payloadSchema ?? prev.payloadSchema } : e,
      );
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
