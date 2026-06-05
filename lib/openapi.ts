import fs from "node:fs";
import path from "node:path";
import { contentRoot } from "./paths";
import { mergeTagEvents, parseOperationEvents, parseWebhooks, parseXEvents } from "./openapi-events";

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
  description?: string;
  operations: OpenAPIOperation[];
  /** Aggregated `x-events` from the tag and its operations. */
  events: OpenAPIEvent[];
};

export type OpenAPIDoc = {
  info: { title: string; version: string; description?: string };
  servers: { url: string; description?: string }[];
  tags: OpenAPITag[];
  operationsById: Record<string, OpenAPIOperation>;
  securitySchemes: Record<string, SecurityScheme>;
  /** Root-level events (OpenAPI 3.1 `webhooks` / Redoc `x-webhooks`). */
  webhooks: OpenAPIEvent[];
};

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

// Parsed-spec cache, keyed by version id ("" = the default/unprefixed version).
const _cache = new Map<string, OpenAPIDoc>();

const EMPTY_DOC: OpenAPIDoc = {
  info: { title: "", version: "" },
  servers: [],
  tags: [],
  operationsById: {},
  securitySchemes: {},
  webhooks: [],
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
  const doc = normalize(raw);
  _cache.set(key, doc);
  return doc;
}

export function normalize(raw: any): OpenAPIDoc {
  const components = raw.components ?? {};
  const securitySchemes: Record<string, SecurityScheme> = components.securitySchemes ?? {};

  const tagMeta: Record<string, { description?: string; events?: OpenAPIEvent[] }> = {};
  for (const t of raw.tags ?? []) {
    tagMeta[t.name] = {
      description: t.description,
      events: parseXEvents(t["x-events"]),
    };
  }

  const tagsMap = new Map<string, OpenAPIOperation[]>();
  const byId: Record<string, OpenAPIOperation> = {};

  for (const [pathStr, pathItem] of Object.entries<any>(raw.paths ?? {})) {
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      const operationId =
        op.operationId ?? slugifyOpId(method, pathStr);
      const tag = op.tags?.[0] ?? "Default";

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
      for (const s of secList) {
        for (const name of Object.keys(s)) {
          const scheme = securitySchemes[name];
          if (scheme) security.push({ name, scheme });
        }
      }

      const operation: OpenAPIOperation = {
        operationId,
        method,
        path: pathStr,
        tag,
        summary: op.summary,
        description: op.description,
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

  const tagOrder = (raw.tags ?? []).map((t: any) => t.name as string);
  const tags: OpenAPITag[] = [...tagsMap.keys()]
    .sort((a, b) => {
      const ia = tagOrder.indexOf(a);
      const ib = tagOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map((name) => ({
      name,
      description: tagMeta[name]?.description,
      operations: tagsMap.get(name)!,
      events: mergeTagEvents(tagsMap.get(name)!, tagMeta[name]?.events),
    }));

  return {
    info: raw.info ?? { title: "", version: "" },
    servers: raw.servers ?? [],
    tags,
    operationsById: byId,
    securitySchemes,
    webhooks: parseWebhooks(raw),
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
  if (resolved.oneOf?.[0]) return sampleFromSchema(resolved.oneOf[0], root);
  if (resolved.anyOf?.[0]) return sampleFromSchema(resolved.anyOf[0], root);

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
