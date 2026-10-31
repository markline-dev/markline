import fs from "node:fs";
import path from "node:path";
import { contentRoot } from "./paths";
import { mergeTagEvents, parseOperationEvents, parseWebhooks, parseXEvents } from "./openapi-events";
import { tagLabels, type TagLabels } from "./openapi-tags";
import {
  collisionWarning,
  isHiddenOperation,
  planTags,
  primaryTag,
  resolveTag,
  DEFAULT_HIDE_EXTENSIONS,
  type TagOptions,
} from "./openapi-tag-config";
import { loadConfig } from "./config";
import { sampleMember } from "./openapi-schema";

export { eventAnchor } from "./openapi-events";

export type JSONSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  example?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  default?: unknown;
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, JSONSchema>;
  additionalProperties?: boolean | JSONSchema;
  items?: JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
  maximum?: number;
  minimum?: number;
  [k: string]: unknown;
};

export type OpenAPIParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  deprecated?: boolean;
  description?: string;
  schema?: JSONSchema;
};

export type OpenAPIResponse = {
  status: string;
  description?: string;
  schema?: JSONSchema;
  example?: unknown;
};

export type OpenAPIOperation = {
  operationId: string;
  method: "get" | "post" | "put" | "patch" | "delete" | "options" | "head";
  path: string;
  tag: string;
  summary?: string;
  description?: string;
  /** `deprecated: true` in the spec. */
  deprecated?: boolean;
  /** Explicit position within the tag (`x-nav-order`); unordered ops keep spec order after ordered ones. */
  navOrder?: number;
  parameters: {
    path: OpenAPIParameter[];
    query: OpenAPIParameter[];
    header: OpenAPIParameter[];
  };
  requestBody?: {
    required?: boolean;
    description?: string;
    schema?: JSONSchema;
  };
  responses: OpenAPIResponse[];
  security: { name: string; scheme: SecurityScheme }[];
  /** Async events this operation emits (from its `callbacks` / `x-events`). */
  events: OpenAPIEvent[];
};

/**
 * A normalized webhook / async event — from the root `webhooks` (OpenAPI 3.1) or
 * `x-webhooks` (Redoc), an operation's `callbacks`, or an `x-events` extension.
 */
export type OpenAPIEvent = {
  name: string;
  summary?: string;
  description?: string;
  /** Tags for grouping onto a resource (the emitting op's, or the webhook's own). */
  tags: string[];
  /** The delivered payload schema (unresolved — resolve at sample time). */
  payloadSchema?: JSONSchema;
  /** Optional link to a docs guide section. */
  guideHref?: string;
};

export type SecurityScheme = {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  description?: string;
  in?: string;
  name?: string;
};

export type OpenAPITag = {
  name: string;
  /** Spec-authored label (`x-displayName`), shown instead of the derived name. */
  displayName?: string;
  description?: string;
  operations: OpenAPIOperation[];
  /** Aggregated `x-events` from the tag and its operations. */
  events: OpenAPIEvent[];
};

export type OpenAPIDoc = {
  info: { title: string; version: string; description?: string };
  servers: { url: string; description?: string }[];
  tags: OpenAPITag[];
  /** `x-displayName` labels from every root `tags` entry, including ones that
   *  only name a nav group and carry no operations themselves. */
  tagLabels: TagLabels;
  operationsById: Record<string, OpenAPIOperation>;
  securitySchemes: Record<string, SecurityScheme>;
  /** Root-level events (OpenAPI 3.1 `webhooks` / Redoc `x-webhooks`). */
  webhooks: OpenAPIEvent[];
  /** Problems found while normalizing (e.g. tag slug collisions). */
  warnings: string[];
};

/** markline.json `api` settings that shape the normalized reference. */
export type NormalizeOptions = TagOptions & {
  /** Extensions that hide an operation (default `x-hidden`, `x-internal`). */
  hideExtensions?: string[];
  /** `false` leaves deprecated operations out. Default true. */
  showDeprecated?: boolean;
  /** Auth the spec doesn't declare: replaces its security schemes. */
  auth?: { type?: "apiKey" | "bearer"; header?: string; description?: string };
};

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

// Parsed-spec cache, keyed by version id ("" = the default/unprefixed version).
const _cache = new Map<string, OpenAPIDoc>();

const EMPTY_DOC: OpenAPIDoc = {
  info: { title: "", version: "" },
  servers: [],
  tags: [],
  tagLabels: {},
  operationsById: {},
  securitySchemes: {},
  webhooks: [],
  warnings: [],
};

/**
 * Filesystem path to an OpenAPI spec. The default version lives at
 * `<content>/api/openapi.json`; a named version `id` lives at
 * `<content>/<id>/api/openapi.json` — the same per-id folder convention the
 * docs use (`<content>/<id>/docs`).
 */
export function apiSpecPath(variantId?: string): string {
  return variantId
    ? path.join(contentRoot(), variantId, "api", "openapi.json")
    : path.join(contentRoot(), "api", "openapi.json");
}

/** Whether the content has an OpenAPI spec (docs-only sites don't). Pass a
 *  version id to check that version's spec. */
export function hasOpenApiSpec(variantId?: string): boolean {
  return fs.existsSync(apiSpecPath(variantId));
}

export function loadOpenApi(variantId?: string): OpenAPIDoc {
  const key = variantId ?? "";
  const hit = _cache.get(key);
  if (hit) return hit;
  const file = apiSpecPath(variantId);
  if (!fs.existsSync(file)) {
    _cache.set(key, EMPTY_DOC);
    return EMPTY_DOC;
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const api = loadConfig().api;
  const doc = normalize(raw, {
    tags: api.tags,
    tagOrder: api.tagOrder,
    hideExtensions: api.hideExtensions,
    showDeprecated: api.showDeprecated,
    auth: api.auth,
  });
  warnOnce(doc.warnings);
  _cache.set(key, doc);
  return doc;
}

/** The security scheme `api.auth` stands for. */
function configuredScheme(auth: NonNullable<NormalizeOptions["auth"]>): SecurityScheme {
  if (auth.type === "bearer") return { type: "http", scheme: "bearer", description: auth.description };
  return { type: "apiKey", in: "header", name: auth.header?.trim() || "Authorization", description: auth.description };
}

// Next evaluates this module once per route bundle, so remember what was
// already said for the life of the process.
const g = globalThis as { __marklineSpecWarnings?: Set<string> };
function warnOnce(warnings: string[]) {
  const said = (g.__marklineSpecWarnings ??= new Set());
  for (const w of warnings) {
    if (said.has(w)) continue;
    said.add(w);
    console.warn(w);
  }
}

export function normalize(raw: any, opts: NormalizeOptions = {}): OpenAPIDoc {
  const components = raw.components ?? {};
  const authScheme = opts.auth ? configuredScheme(opts.auth) : undefined;
  const securitySchemes: Record<string, SecurityScheme> = authScheme
    ? { markline: authScheme }
    : (components.securitySchemes ?? {});
  const hideExtensions = opts.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS;
  const warnings: string[] = [];

  // Spec tag metadata, folded onto the tag each one resolves to (so a merged
  // tag keeps its description and events). The first value found wins.
  const tagMeta: Record<string, { displayName?: string; description?: string; events?: OpenAPIEvent[] }> = Object.create(null);
  for (const t of raw.tags ?? []) {
    const name = resolveTag(t.name, opts);
    if (!name) continue;
    const label = typeof t["x-displayName"] === "string" ? t["x-displayName"].trim() : "";
    const meta = (tagMeta[name] ??= {});
    // A tag's own label only names it when it isn't merged elsewhere.
    if (name === t.name && label) meta.displayName = label;
    meta.description ??= t.description;
    meta.events = [...(meta.events ?? []), ...parseXEvents(t["x-events"])];
  }

  const tagsMap = new Map<string, OpenAPIOperation[]>();
  const byId: Record<string, OpenAPIOperation> = {};

  for (const [pathStr, pathItem] of Object.entries<any>(raw.paths ?? {})) {
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      if (isHiddenOperation(op, hideExtensions, opts.showDeprecated ?? true)) continue;
      const tag = primaryTag(op.tags, opts);
      if (!tag) continue;
      const operationId =
        op.operationId ?? slugifyOpId(method, pathStr);

      const params: OpenAPIOperation["parameters"] = { path: [], query: [], header: [] };
      for (const p of [...(pathItem.parameters ?? []), ...(op.parameters ?? [])]) {
        const resolved = resolveRef(p, raw) as OpenAPIParameter;
        if (resolved.in === "path") params.path.push(resolved);
        else if (resolved.in === "query") params.query.push(resolved);
        else if (resolved.in === "header") params.header.push(resolved);
      }

      const requestBody = op.requestBody
        ? {
            required: op.requestBody.required,
            description: op.requestBody.description,
            schema: op.requestBody.content?.["application/json"]?.schema,
          }
        : undefined;

      const responses: OpenAPIResponse[] = [];
      for (const [status, resp] of Object.entries<any>(op.responses ?? {})) {
        const json = resp.content?.["application/json"];
        responses.push({
          status,
          description: resp.description,
          schema: json?.schema,
          example: json?.example ?? json?.examples?.default?.value,
        });
      }

      const security: OpenAPIOperation["security"] = [];
      const secList = op.security ?? raw.security ?? [];
      // `api.auth` covers every operation, except one the spec marks public
      // with an explicit empty `security: []`.
      if (authScheme && !(Array.isArray(op.security) && op.security.length === 0)) {
        security.push({ name: "markline", scheme: authScheme });
      } else for (const s of secList) {
        for (const name of Object.keys(s)) {
          const scheme = securitySchemes[name];
          if (scheme) security.push({ name, scheme });
        }
      }

      // A header the auth scheme already sends isn't a parameter of its own
      // (specs often declare the API-key header on every operation too).
      const authHeaders = new Set(
        security.filter((x) => x.scheme.type === "apiKey" && x.scheme.in === "header" && x.scheme.name).map((x) => x.scheme.name!.toLowerCase()),
      );
      if (authHeaders.size) params.header = params.header.filter((p) => !authHeaders.has(p.name.toLowerCase()));

      const operation: OpenAPIOperation = {
        operationId,
        method,
        path: pathStr,
        tag,
        summary: op.summary,
        description: op.description,
        deprecated: op.deprecated === true || undefined,
        navOrder: typeof op["x-nav-order"] === "number" ? op["x-nav-order"] : undefined,
        parameters: params,
        requestBody,
        responses,
        security,
        events: parseOperationEvents(op, raw),
      };

      byId[operationId] = operation;
      if (!tagsMap.has(tag)) tagsMap.set(tag, []);
      tagsMap.get(tag)!.push(operation);
    }
  }

  // Order the pages and fold tags whose slugs collide ("dubbing" / "Dubbing")
  // into one, so neither page silently loses its operations.
  const plan = planTags([...tagsMap.keys()], (raw.tags ?? []).map((t: any) => t.name as string), opts);
  for (const c of plan.collisions) warnings.push(collisionWarning(c));
  for (const [from, into] of plan.alias) {
    for (const op of tagsMap.get(from)!) op.tag = into;
    tagsMap.get(into)!.push(...tagsMap.get(from)!);
    tagsMap.delete(from);
    const meta = (tagMeta[into] ??= {});
    meta.description ??= tagMeta[from]?.description;
    meta.events = [...(meta.events ?? []), ...(tagMeta[from]?.events ?? [])];
  }
  // Config overrides beat the spec's own label and description.
  const configured = (name: string) =>
    opts.tags && Object.prototype.hasOwnProperty.call(opts.tags, name) ? opts.tags[name] : undefined;

  const tags: OpenAPITag[] = plan.order.map((name) => {
    // Stable sort: `x-nav-order` ops first (ascending), the rest keep spec order.
    const operations = [...tagsMap.get(name)!].sort(
      (a, b) => (a.navOrder ?? Infinity) - (b.navOrder ?? Infinity),
    );
    return {
      name,
      displayName: configured(name)?.label?.trim() || tagMeta[name]?.displayName,
      description: configured(name)?.description ?? tagMeta[name]?.description,
      operations,
      events: mergeTagEvents(operations, tagMeta[name]?.events),
    };
  });

  // Labels for every tag path: spec `x-displayName`s (incl. nav-only group
  // tags), then config labels, which also name group paths ("Workspace").
  const labelEntries: { name: string; displayName?: string }[] = Object.keys(tagMeta).map((name) => ({
    name,
    displayName: tagMeta[name].displayName,
  }));
  for (const [name, o] of Object.entries(opts.tags ?? {})) {
    if (o?.label?.trim()) labelEntries.push({ name: resolveTag(name, opts) ?? name, displayName: o.label.trim() });
  }

  return {
    info: raw.info ?? { title: "", version: "" },
    servers: raw.servers ?? [],
    tags,
    tagLabels: tagLabels(labelEntries),
    operationsById: byId,
    securitySchemes,
    webhooks: parseWebhooks(raw).map((wh) => ({
      ...wh,
      tags: wh.tags.map((t) => resolveTag(t, opts)).map((t) => (t && plan.alias.get(t)) ?? t).filter((t): t is string => !!t),
    })),
    warnings,
  };
}

function slugifyOpId(method: string, pathStr: string) {
  return `${method}_${pathStr.replace(/[^a-zA-Z0-9]+/g, "_")}`.replace(/^_+|_+$/g, "");
}

export function resolveRef(node: any, root: any, seen = new Set<string>()): any {
  if (!node || typeof node !== "object") return node;
  if (node.$ref && typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return { type: "object", description: "(recursive)" };
    seen.add(node.$ref);
    const parts = node.$ref.replace(/^#\//, "").split("/");
    let cur: any = root;
    for (const p of parts) cur = cur?.[p];
    return resolveRef(cur, root, seen);
  }
  return node;
}

/** Recursively resolve all `$ref` nodes inside a schema. Returns a new tree. */
export function resolveSchema(schema: JSONSchema | undefined, root: any, seen = new Set<string>()): JSONSchema | undefined {
  if (!schema) return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { type: "object", description: "(recursive)" };
    const next = new Set(seen);
    next.add(schema.$ref);
    return resolveSchema(resolveRef(schema, root) as JSONSchema, root, next);
  }
  const out: JSONSchema = { ...schema };
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = resolveSchema(v, root, seen) ?? {};
    }
  }
  if (schema.items) out.items = resolveSchema(schema.items, root, seen);
  if (typeof schema.additionalProperties === "object")
    out.additionalProperties = resolveSchema(schema.additionalProperties as JSONSchema, root, seen);
  if (schema.allOf) out.allOf = schema.allOf.map((s) => resolveSchema(s, root, seen)!);
  if (schema.oneOf) out.oneOf = schema.oneOf.map((s) => resolveSchema(s, root, seen)!);
  if (schema.anyOf) out.anyOf = schema.anyOf.map((s) => resolveSchema(s, root, seen)!);
  return out;
}

/** Generate a realistic sample value from a JSONSchema. */
export function sampleFromSchema(schema: JSONSchema | undefined, root?: any): unknown {
  if (!schema) return null;
  const resolved = root ? resolveSchema(schema, root) : schema;
  if (!resolved) return null;
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.enum && resolved.enum.length) return resolved.enum[0];
  if (resolved.default !== undefined) return resolved.default;

  const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
  if (resolved.allOf?.length) {
    const merged: JSONSchema = { type: "object", properties: {}, required: [] };
    for (const s of resolved.allOf) {
      const r = root ? resolveSchema(s, root) : s;
      if (r?.properties) Object.assign(merged.properties!, r.properties);
      if (r?.required) merged.required!.push(...r.required);
    }
    return sampleFromSchema(merged, root);
  }
  // Skip a `{type: "null"}` member: `anyOf: [X, null]` should sample as X.
  if (resolved.oneOf?.length) return sampleFromSchema(sampleMember(resolved.oneOf), root);
  if (resolved.anyOf?.length) return sampleFromSchema(sampleMember(resolved.anyOf), root);

  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(resolved.properties ?? {})) {
        out[k] = sampleFromSchema(v, root);
      }
      return out;
    }
    case "array":
      return [sampleFromSchema(resolved.items, root)];
    case "integer":
    case "number":
      return resolved.minimum ?? 0;
    case "boolean":
      return false;
    case "string":
      if (resolved.format === "date-time") return "2026-01-01T00:00:00.000Z";
      if (resolved.format === "email") return "customer@example.com";
      if (resolved.format === "uri") return "https://example.com";
      return "<string>";
    default:
      return null;
  }
}

export function operationHref(op: OpenAPIOperation, base = "/api-reference") {
  return `${base}/${op.operationId}`;
}
