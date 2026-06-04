import type { JSONSchema, OpenAPIDoc, OpenAPIOperation } from "./openapi";
import { resolveSchema } from "./openapi";
import { codeSamples, colorizeJson, successResponse, type CodeRail } from "./openapi-codegen";

/**
 * Builds the serializable view-model consumed by the Stripe-style API reference
 * client component (components/docs/api/reference/markline-apiref.tsx). Pure
 * data — no JSX — so it can cross the server→client boundary. The per-resource
 * MDX summary is rendered separately (in the route) and passed as a node.
 */

export type AttrView = {
  name: string;
  type: string;
  required?: boolean;
  optional?: boolean;
  description?: string;
  enums?: string[];
};

export type ParamGroup = { title: string; attrs: AttrView[] };

export type EndpointView = {
  id: string;
  opId: string;
  summary: string;
  method: string;
  verb: string;
  path: string;
  baseUrl: string;
  lead?: string;
  groups: ParamGroup[];
  /** Write/path endpoints get the interactive explorer; reads get code cards. */
  explorer: boolean;
  code: CodeRail;
  response?: { status: string; label: string; html: string };
  /** First editable field surfaced in the explorer (besides Authorization). */
  field?: { label: string; value: string };
  hasBearer: boolean;
};

export type NavOp = { id: string; verb: string | null; name: string; opId: string };
export type NavGroup = { name: string; slug: string; active: boolean; ops: NavOp[] };

export type ObjectView = { name: string; attrs: AttrView[]; sampleHtml: string };

export type ResourceView = {
  name: string;
  slug: string;
  lead?: string;
  /** Endpoint-list card rows. */
  endpoints: { title: string; verb: string; path: string; id: string }[];
  object?: ObjectView;
  sections: EndpointView[];
};

export type ApiRefView = {
  title: string;
  version: string;
  versionLabel: string;
  servers: string[];
  nav: NavGroup[];
  resource: ResourceView;
};

const VERB: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DEL",
};

export function tagSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function anchorFor(op: OpenAPIOperation): string {
  return tagSlug(op.summary ?? op.operationId) || op.operationId;
}

export function displayName(s: string): string {
  return s
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function describeType(schema?: JSONSchema): string {
  if (!schema) return "any";
  if (schema.enum) return "enum";
  if (schema.type === "array") return `array<${describeType(schema.items)}>`;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (typeof schema.type === "string") {
    return schema.nullable ? `${schema.type} · nullable` : schema.type;
  }
  if (schema.oneOf || schema.anyOf) return "oneOf";
  return "object";
}

function attrsFromSchema(schema: JSONSchema | undefined, root: unknown): AttrView[] {
  const resolved = schema ? resolveSchema(schema, root) : undefined;
  if (!resolved?.properties) return [];
  const required = new Set(resolved.required ?? []);
  return Object.entries(resolved.properties).map(([name, s]) => ({
    name,
    type: describeType(s),
    required: required.has(name),
    optional: !required.has(name),
    description: s.description,
    enums: s.enum?.map((e) => String(e)),
  }));
}

/**
 * Heuristic: the resource's canonical object schema — the richest object among
 * its operations' 2xx responses, unwrapping list envelopes ({ data: [obj] }).
 */
function pickObjectSchema(ops: OpenAPIOperation[], root: unknown): JSONSchema | undefined {
  let best: JSONSchema | undefined;
  let bestCount = 0;
  for (const op of ops) {
    for (const r of op.responses) {
      if (!/^2/.test(r.status) || !r.schema) continue;
      let s = resolveSchema(r.schema, root);
      // unwrap list envelopes
      if (s?.type === "array") s = resolveSchema(s.items, root);
      else if (s?.properties?.data) {
        const data = resolveSchema(s.properties.data, root);
        if (data?.type === "array") s = resolveSchema(data.items, root);
        else if (data?.type === "object") s = data;
      }
      const count = s?.properties ? Object.keys(s.properties).length : 0;
      if (count > bestCount) {
        best = s;
        bestCount = count;
      }
    }
  }
  return best;
}

function paramGroups(op: OpenAPIOperation, root: unknown): ParamGroup[] {
  const groups: ParamGroup[] = [];
  if (op.parameters.path.length) {
    groups.push({
      title: "Path parameters",
      attrs: op.parameters.path.map((p) => ({
        name: p.name,
        type: describeType(p.schema),
        required: true,
        description: p.description,
        enums: p.schema?.enum?.map((e) => String(e)),
      })),
    });
  }
  if (op.requestBody?.schema) {
    const attrs = attrsFromSchema(op.requestBody.schema, root);
    if (attrs.length) groups.push({ title: "Parameters", attrs });
  }
  if (op.parameters.query.length) {
    groups.push({
      title: "Query parameters",
      attrs: op.parameters.query.map((q) => ({
        name: q.name,
        type: describeType(q.schema),
        required: q.required,
        optional: !q.required,
        description: q.description,
        enums: q.schema?.enum?.map((e) => String(e)),
      })),
    });
  }
  return groups;
}

function buildEndpoint(op: OpenAPIOperation, doc: OpenAPIDoc, root: unknown): EndpointView {
  const groups = paramGroups(op, root);
  const code = codeSamples(op, doc, root);
  const response = successResponse(op, root) ?? undefined;
  const hasBearer = op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer");
  // The explorer (interactive Send) goes on write operations; reads show the
  // request/response code cards.
  const explorer = op.method !== "get";

  // First editable field for the explorer: a required body prop, else a query/path param.
  let field: EndpointView["field"];
  const bodyAttrs = op.requestBody?.schema ? attrsFromSchema(op.requestBody.schema, root) : [];
  const firstBody = bodyAttrs.find((a) => a.required) ?? bodyAttrs[0];
  if (firstBody) field = { label: `Body · ${firstBody.name}`, value: sampleString(firstBody) };
  else if (op.parameters.path[0]) field = { label: `Path · ${op.parameters.path[0].name}`, value: "" };
  else if (op.parameters.query[0]) field = { label: `Query · ${op.parameters.query[0].name}`, value: "" };

  return {
    id: anchorFor(op),
    opId: op.operationId,
    summary: op.summary ?? op.operationId,
    method: op.method,
    verb: VERB[op.method] ?? op.method.toUpperCase(),
    path: op.path,
    baseUrl: doc.servers[0]?.url ?? "",
    lead: op.description,
    groups,
    explorer,
    code,
    response,
    field,
    hasBearer,
  };
}

function sampleString(attr: AttrView): string {
  if (attr.enums?.length) return attr.enums[0];
  if (attr.type.startsWith("integer") || attr.type.startsWith("number")) return "100";
  if (attr.type.startsWith("boolean")) return "true";
  return "value";
}

export function buildApiRefView(doc: OpenAPIDoc, root: unknown, activeSlug?: string): ApiRefView {
  const activeTag =
    doc.tags.find((t) => tagSlug(t.name) === activeSlug) ?? doc.tags[0];

  const nav: NavGroup[] = doc.tags.map((tag) => {
    const active = tag === activeTag;
    return {
      name: displayName(tag.name),
      slug: tagSlug(tag.name),
      active,
      ops: active
        ? [
            { id: tagSlug(tag.name), verb: null, name: displayName(tag.name), opId: "" },
            ...tag.operations.map((op) => ({
              id: anchorFor(op),
              verb: VERB[op.method] ?? op.method.toUpperCase(),
              name: op.summary ?? op.operationId,
              opId: op.operationId,
            })),
          ]
        : [],
    };
  });

  const objSchema = activeTag ? pickObjectSchema(activeTag.operations, root) : undefined;
  const objAttrs = attrsFromSchema(objSchema, root);
  const object: ObjectView | undefined =
    objAttrs.length && objSchema
      ? {
          name: `The ${singularDisplay(activeTag!.name)} object`,
          attrs: objAttrs,
          sampleHtml: colorizeJson(objectSample(objSchema, root)),
        }
      : undefined;

  const resource: ResourceView = {
    name: displayName(activeTag?.name ?? "API"),
    slug: tagSlug(activeTag?.name ?? ""),
    lead: activeTag?.description,
    endpoints: (activeTag?.operations ?? []).map((op) => ({
      title: op.summary ?? op.operationId,
      verb: VERB[op.method] ?? op.method.toUpperCase(),
      path: op.path,
      id: anchorFor(op),
    })),
    object,
    sections: (activeTag?.operations ?? []).map((op) => buildEndpoint(op, doc, root)),
  };

  return {
    title: doc.info.title || "API reference",
    version: doc.info.version,
    versionLabel: doc.info.version ? `v${doc.info.version.split(".")[0]}` : "v1",
    servers: doc.servers.map((s) => s.url),
    nav,
    resource,
  };
}

function singularDisplay(tag: string): string {
  const s = tag.replace(/ies$/, "y").replace(/s$/, "");
  return displayName(s);
}

/** Build a representative JSON sample object from the resolved schema. */
function objectSample(schema: JSONSchema | undefined, root: unknown): unknown {
  const resolved = schema ? resolveSchema(schema, root) : undefined;
  if (!resolved?.properties) return {};
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(resolved.properties)) {
    out[k] = leaf(s);
  }
  return out;
}

function leaf(schema: JSONSchema | undefined): unknown {
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "integer":
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
      return "string";
  }
}
