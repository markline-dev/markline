import fs from "node:fs";
import path from "node:path";
import { contentRoot } from "./paths";
import { mergeTagEvents, parseOperationEvents, parseWebhooks, parseXEvents } from "./openapi-events";
import { tagLabels, tagSlug, type TagLabels } from "./openapi-tags";
import { isJsonMediaType, pickMediaType } from "./openapi-media";
import {
  collisionWarning,
  describeTags,
  isHiddenOperation,
  knownTags,
  planSections,
  planTags,
  sectionSource,
  primaryTag,
  resolveTag,
  tagConfigWarnings,
  DEFAULT_HIDE_EXTENSIONS,
  type TagOptions,
  type TagSection,
} from "./openapi-tag-config";
import { pruneSpec } from "./openapi-prune";
import { attachChannels, hideChannelFields, WEBSOCKETS_TAG, type AsyncChannel } from "./asyncapi";
import { asyncApiFile, channelExtras, readApiSpec, type ChannelExtras } from "@/scripts/asyncapi-build.mjs";
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
  /** JSON body schema (only set for JSON media types). */
  schema?: JSONSchema;
  example?: unknown;
  /** The documented media type (`application/json`, `audio/mpeg`, …), if any. */
  contentType?: string;
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
  /** Marked public with an explicit `security: []`: Try it offers no key field. */
  public?: boolean;
  /** Explicit position within the tag (`x-nav-order`); unordered ops keep spec order after ordered ones. */
  navOrder?: number;
  /** Streams its reply: a 2xx `text/event-stream` (beside any other type), or `x-fern-streaming`. */
  streaming?: boolean;
  parameters: {
    path: OpenAPIParameter[];
    query: OpenAPIParameter[];
    header: OpenAPIParameter[];
  };
  requestBody?: {
    required?: boolean;
    description?: string;
    schema?: JSONSchema;
    /** The body's media type: `application/json` when offered, else the first
     *  listed (`multipart/form-data`, `application/x-www-form-urlencoded`, …). */
    contentType?: string;
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
  /** WebSocket channels from the AsyncAPI document that file under this resource. */
  channels?: AsyncChannel[];
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
  /** Sidebar sections, each with the pages under it; empty when there are none. */
  sections: TagSection[];
  /** Problems found while normalizing (e.g. tag slug collisions). */
  warnings: string[];
};

/** markline.json `api` settings that shape the normalized reference. */
export type NormalizeOptions = TagOptions & {
  /** `api.sections`; when absent, the spec's `x-tagGroups` are used. */
  sections?: TagSection[];
  /** Extensions that hide an operation (default `x-hidden`, `x-internal`). */
  hideExtensions?: string[];
  /** `false` leaves deprecated operations out. Default true. */
  showDeprecated?: boolean;
  /** Auth the spec doesn't declare: replaces its security schemes. */
  auth?: { type?: "apiKey" | "bearer"; header?: string; description?: string };
  /** What an AsyncAPI document adds: pages only its channels make, its tag groups, tag names it makes known. */
  extras?: ChannelExtras;
};

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

/** No AsyncAPI document: nothing added to the plan. */
const NO_EXTRAS: ChannelExtras = { pages: [], known: [], labels: {}, warnings: [] };

// Parsed-spec cache, keyed by version id ("" = the default/unprefixed version).
const _cache = new Map<string, OpenAPIDoc>();
const _roots = new Map<string, unknown>();

const EMPTY_DOC: OpenAPIDoc = {
  info: { title: "", version: "" },
  servers: [],
  tags: [],
  sections: [],
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

/** Whether a version has an API reference: an OpenAPI spec, an AsyncAPI document, or both. */
export function hasApiReference(variantId?: string): boolean {
  return hasOpenApiSpec(variantId) || fs.existsSync(asyncApiFile(variantDir(variantId), loadConfig().api));
}

const variantDir = (variantId?: string) => (variantId ? path.join(contentRoot(), variantId) : contentRoot());

export function loadOpenApi(variantId?: string): OpenAPIDoc {
  const key = variantId ?? "";
  const hit = _cache.get(key);
  if (hit) return hit;
  const api = loadConfig().api;
  // The spec, or (a version with only an AsyncAPI document) one with no operations.
  const raw = readApiSpec(variantDir(variantId), api);
  if (!raw) {
    _cache.set(key, EMPTY_DOC);
    return EMPTY_DOC;
  }
  // The AsyncAPI document beside it, read once: what it adds to the plan, then its channels.
  const { read, extras } = channelExtras(variantDir(variantId), raw, api);
  const doc = normalize(raw, {
    tags: api.tags,
    tagOrder: api.tagOrder,
    sections: api.sections,
    hideExtensions: api.hideExtensions,
    showDeprecated: api.showDeprecated,
    auth: api.auth,
    extras,
  });
  if (read) placeChannels(doc, read, api);
  // A build prints these once, from scripts/build-search.mjs; its page workers
  // would each repeat them.
  if (process.env.NODE_ENV !== "production") warnOnce(doc.warnings);
  _cache.set(key, doc);
  return doc;
}

export { WEBSOCKETS_TAG };

/**
 * Put the AsyncAPI document's channels on the reference's resources: a channel
 * joins its tag's resource, or the one its path shares most with, or a
 * "WebSockets" resource after the rest. URLs of existing pages don't change.
 * scripts/asyncapi-build.mjs makes the same choice for the sitemap.
 */
export function placeChannels(
  doc: OpenAPIDoc,
  read: NonNullable<ReturnType<typeof channelExtras>["read"]>,
  api: Pick<NormalizeOptions, "tags" | "hideExtensions">,
) {
  const hideExtensions = api.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS;
  doc.warnings.push(...read.warnings);
  const channels = read.channels.map((c) => hideChannelFields(c, hideExtensions));
  const opts: TagOptions = { tags: api.tags };
  const { byResource, rest } = attachChannels(
    channels,
    doc.tags.map((t) => ({ name: t.name, paths: t.operations.map((o) => o.path) })),
    (tag) => resolveTag(tag, opts),
  );
  for (const tag of doc.tags) {
    const mine = byResource.get(tag.name);
    if (mine?.length) tag.channels = mine;
  }
  // The rest go on the WebSockets page normalize() planned for them, where api.tags put it
  // (renamed, merged into another page, or hidden with its channels).
  const home = rest.length ? resolveTag(WEBSOCKETS_TAG, opts) : null;
  if (home) {
    const page = doc.tags.find((t) => t.name === home) ?? doc.tags.find((t) => tagSlug(t.name) === tagSlug(home));
    if (page) page.channels = [...(page.channels ?? []), ...rest];
  }
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

/**
 * The raw spec `$ref`s resolve against, with everything `api.hideExtensions`
 * hides already removed. Pass this, not the file on disk, as `root`.
 */
export function loadOpenApiRoot(variantId?: string): any {
  const key = variantId ?? "";
  if (_roots.has(key)) return _roots.get(key);
  const file = apiSpecPath(variantId);
  const root = fs.existsSync(file)
    ? pruneSpec(JSON.parse(fs.readFileSync(file, "utf8")), loadConfig().api.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS)
    : {};
  _roots.set(key, root);
  return root;
}

export function normalize(input: any, opts: NormalizeOptions = {}): OpenAPIDoc {
  const raw = pruneSpec(input, opts.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS);
  // A spec's tag list can hold anything; only named entries mean a tag.
  const specTags: any[] = (Array.isArray(raw.tags) ? raw.tags : []).filter((t: any) => typeof t?.name === "string");
  const components = raw.components ?? {};
  const authScheme = opts.auth ? configuredScheme(opts.auth) : undefined;
  const securitySchemes: Record<string, SecurityScheme> = authScheme
    ? { markline: authScheme }
    : (components.securitySchemes ?? {});
  const hideExtensions = opts.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS;
  const warnings: string[] = [];

  // Events declared on a spec tag, folded onto the tag it resolves to.
  const tagEvents: Record<string, OpenAPIEvent[]> = Object.create(null);
  for (const t of specTags) {
    const name = resolveTag(t.name, opts);
    if (name) tagEvents[name] = [...(tagEvents[name] ?? []), ...parseXEvents(t["x-events"])];
  }

  const tagsMap = new Map<string, OpenAPIOperation[]>();
  const byId: Record<string, OpenAPIOperation> = {};

  for (const [pathStr, pathItem] of Object.entries<any>(raw.paths ?? {})) {
    for (const method of METHODS) {
      const op = pathItem?.[method];
      if (!op) continue;
      if (isHiddenOperation(op, hideExtensions, opts.showDeprecated ?? true)) continue;
      const tag = primaryTag(op.tags, opts);
      if (!tag) continue;
      const operationId =
        op.operationId ?? slugifyOpId(method, pathStr);

      const params: OpenAPIOperation["parameters"] = { path: [], query: [], header: [] };
      for (const p of [...(pathItem.parameters ?? []), ...(op.parameters ?? [])]) {
        const resolved = resolveRef(p, raw) as OpenAPIParameter | undefined;
        if (!resolved) continue;
        if (resolved.in === "path") params.path.push(resolved);
        else if (resolved.in === "query") params.query.push(resolved);
        else if (resolved.in === "header") params.header.push(resolved);
      }

      const reqBody = op.requestBody ? resolveRef(op.requestBody, raw) : undefined;
      const reqType = pickMediaType(reqBody?.content);
      const requestBody = reqBody
        ? {
            required: reqBody.required,
            description: reqBody.description,
            schema: reqType ? reqBody.content[reqType]?.schema : undefined,
            contentType: reqType,
          }
        : undefined;

      const responses: OpenAPIResponse[] = [];
      for (const [status, r] of Object.entries<any>(op.responses ?? {})) {
        const resp = resolveRef(r, raw);
        const type = pickMediaType(resp?.content);
        // Only JSON bodies carry a schema/example sample; other media types
        // (audio, zip, text) are documented by their content type alone.
        const json = type && isJsonMediaType(type) ? resp.content[type] : undefined;
        responses.push({
          status,
          description: resp?.description,
          schema: json?.schema,
          example: json?.example ?? json?.examples?.default?.value,
          contentType: type,
        });
      }

      const security: OpenAPIOperation["security"] = [];
      const secList = op.security ?? raw.security ?? [];
      // `api.auth` covers every operation, except one the spec marks public
      // with an explicit empty `security: []`.
      const isPublic = Array.isArray(op.security) && op.security.length === 0;
      if (authScheme && !isPublic) {
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
        security.flatMap((x) => {
          if (x.scheme.type === "http") return ["authorization"];
          return x.scheme.type === "apiKey" && x.scheme.in === "header" && x.scheme.name ? [x.scheme.name.toLowerCase()] : [];
        }),
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
        public: isPublic || undefined,
        navOrder: typeof op["x-nav-order"] === "number" ? op["x-nav-order"] : undefined,
        streaming: isStreaming(op, raw) || undefined,
        parameters: params,
        requestBody,
        responses,
        security,
        events: parseOperationEvents(op, raw),
      };

      // Two operations with one operationId: the per-operation page (and anything
      // looked up by id) gets the last; the resource page still shows both.
      const earlier = byId[operationId];
      if (earlier) {
        warnings.push(
          `[markline] operationId "${operationId}" is used by both ${earlier.method.toUpperCase()} ${earlier.path} and ${method.toUpperCase()} ${pathStr}. Its page, /api-reference/${operationId}, shows the second; give each operation its own operationId.`,
        );
      }
      byId[operationId] = operation;
      if (!tagsMap.has(tag)) tagsMap.set(tag, []);
      tagsMap.get(tag)!.push(operation);
    }
  }

  // Order the pages and fold tags whose slugs collide ("dubbing" / "Dubbing")
  // into one, so neither page silently loses its operations.
  // Pages only WebSocket channels make ("WebSockets") are planned like any other, after the rest.
  const extras = opts.extras ?? NO_EXTRAS;
  for (const page of extras.pages) if (!tagsMap.has(page)) tagsMap.set(page, []);
  const plan = planTags([...tagsMap.keys()], specTags.map((t) => t.name as string), opts, extras.pages);
  const known = new Set([...knownTags(input), ...extras.known]);
  const extraLabels = Object.entries(extras.labels)
    .filter(([name]) => !specTags.some((t) => t.name === name))
    .map(([name, label]) => ({ name, displayName: label }));
  for (const c of plan.collisions) warnings.push(collisionWarning(c));
  warnings.push(...tagConfigWarnings(known, plan, opts), ...(extras.warnings ?? []));
  // Sections only reorder and group the pages: every page keeps its URL.
  const sectioned = planSections(sectionSource(opts.sections, raw["x-tagGroups"], extras.groups).sections, plan, known, opts);
  warnings.push(...sectioned.warnings);
  for (const [from, into] of plan.alias) {
    for (const op of tagsMap.get(from)!) op.tag = into;
    tagsMap.get(into)!.push(...tagsMap.get(from)!);
    tagsMap.delete(from);
    tagEvents[into] = [...(tagEvents[into] ?? []), ...(tagEvents[from] ?? [])];
  }

  const specLabel = (t: any) => (typeof t["x-displayName"] === "string" ? t["x-displayName"].trim() : "");
  const described = describeTags(
    [...specTags.map((t) => ({ name: t.name, displayName: specLabel(t), description: t.description })), ...extraLabels],
    plan,
    opts,
  );

  const tags: OpenAPITag[] = sectioned.order.map((name) => {
    // Stable sort: `x-nav-order` ops first (ascending), the rest keep spec order.
    const operations = [...tagsMap.get(name)!].sort(
      (a, b) => (a.navOrder ?? Infinity) - (b.navOrder ?? Infinity),
    );
    return {
      name,
      displayName: described.get(name)?.label,
      description: described.get(name)?.description,
      operations,
      events: mergeTagEvents(operations, tagEvents[name]),
    };
  });

  // Labels for every tag path: spec `x-displayName`s (incl. nav-only group
  // tags) and config labels on group paths ("Workspace"), then each page's own.
  const labelEntries: { name: string; displayName?: string }[] = [
    ...specTags.map((t) => ({ name: t.name as string, displayName: specLabel(t) || undefined })),
    ...extraLabels,
    ...Object.entries(opts.tags ?? {}).map(([name, o]) => ({ name, displayName: o?.mergeInto ? undefined : o?.label?.trim() })),
    ...tags.map((t) => ({ name: t.name, displayName: t.displayName })),
  ];

  return {
    info: raw.info ?? { title: "", version: "" },
    servers: raw.servers ?? [],
    tags,
    sections: sectioned.sections,
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
    // Keys beside a `$ref` (description, deprecated…) describe this use of it.
    const { $ref, ...siblings } = schema;
    const local = Object.keys(siblings).length ? resolveSchema(siblings, root, seen) : undefined;
    if (seen.has($ref)) return { type: "object", description: "(recursive)", ...local };
    const next = new Set(seen);
    next.add($ref);
    const target = resolveSchema(resolveRef({ $ref }, root) as JSONSchema, root, next);
    const merged: JSONSchema = { ...target, ...local };
    // Fields beside a `$ref` add to the target's, rather than replacing them.
    if (target?.properties && local?.properties) merged.properties = { ...target.properties, ...local.properties };
    if (target?.required && local?.required) merged.required = [...new Set([...target.required, ...local.required])];
    return merged;
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

  const type = Array.isArray(resolved.type) ? (resolved.type.find((t) => t !== "null") ?? "null") : resolved.type;
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

/** Whether an operation streams its reply, from the spec alone: `x-fern-streaming`,
 *  or a 2xx response offering `text/event-stream`, even beside JSON. */
function isStreaming(op: any, raw: any): boolean {
  if (op?.["x-fern-streaming"]) return true;
  return Object.entries<any>(op?.responses ?? {}).some(([status, r]) => {
    if (!/^2/.test(status)) return false;
    const content = resolveRef(r, raw)?.content;
    return !!content && typeof content === "object" && Object.keys(content).some((ct) => /^text\/event-stream\b/i.test(ct.trim()));
  });
}
