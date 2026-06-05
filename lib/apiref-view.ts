import type { JSONSchema, OpenAPIDoc, OpenAPIEvent, OpenAPIOperation, OpenAPITag } from "./openapi";
import { eventAnchor, resolveSchema } from "./openapi";
import { codeSamples, colorizeJson, successResponse, type CodeRail } from "./openapi-codegen";
import { buildPlaygroundSpec } from "./playground-spec";
import type { PlaygroundSpec } from "@/components/docs/api/playground";
import { loadConfig, playgroundMode } from "./config";
import { tagSlug, parseOpenApiTag, buildTagTree, segmentDisplayName, type TagTreeNode } from "./openapi-tags";

// Re-export so existing imports (`@/lib/apiref-view`) keep resolving tagSlug.
export { tagSlug, parseOpenApiTag, segmentDisplayName } from "./openapi-tags";

/**
 * Builds the serializable view-model consumed by the API reference
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
  /** Drives the live proxy explorer (PlaygroundProvider) on write endpoints. */
  playground?: PlaygroundSpec;
  /** Events this endpoint emits — chips that link up to the resource catalog. */
  triggers: { name: string; id: string }[];
};

export type NavOp = { id: string; verb: string | null; name: string; opId: string };

/** A routable resource (a leaf tag). When active, `ops` carries its in-page jumps. */
export type NavResource = { kind: "resource"; name: string; slug: string; active: boolean; ops: NavOp[] };
/** A nav-only accordion grouping nested tags (e.g. "Tools"). May itself be a real
 *  tag (then `tag` is set and the header links to its page) when a prefix is also
 *  tagged. `expanded` is true when it contains — or is — the active resource. */
export type NavParent = {
  kind: "group";
  name: string;
  slug: string;
  tag?: string;
  active: boolean;
  expanded: boolean;
  children: NavTreeNode[];
};
export type NavTreeNode = NavResource | NavParent;

export type ObjectView = { name: string; attrs: AttrView[]; sampleHtml: string };

export type EventView = {
  id: string;
  name: string;
  summary?: string;
  description?: string;
  guideHref?: string;
  attrs: AttrView[];
  sampleHtml: string;
  /** Endpoints in this resource that emit the event (title + section anchor). */
  emittedBy: { title: string; id: string }[];
};

export type ResourceView = {
  name: string;
  slug: string;
  /** Parent group display names for the header breadcrumb, e.g. ["Tools"]. */
  crumbs: string[];
  lead?: string;
  /** Endpoint-list card rows. */
  endpoints: { title: string; verb: string; path: string; id: string }[];
  /** Webhook / async events for this resource (`x-events`). */
  events: EventView[];
  object?: ObjectView;
  sections: EndpointView[];
};

export type SearchEntry = {
  title: string;
  crumbs: string[];
  snippet: string;
  verb?: string;
  href: string;
};

export type VersionEntry = {
  label: string;
  sub?: string;
  href?: string;
  current?: boolean;
  latest?: boolean;
};

export type ApiRefView = {
  title: string;
  version: string;
  versionLabel: string;
  /** Route base for all api-reference links: "/api-reference" for the default
   *  version, "/api-reference/<id>" for a non-default version. */
  base: string;
  servers: string[];
  nav: NavTreeNode[];
  resource: ResourceView;
  /** Command-palette index across all resources. */
  search: SearchEntry[];
  /** Version selector entries (spec version, or config versions when present). */
  versions: VersionEntry[];
};

const VERB: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DEL",
};

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

function buildEndpoint(
  op: OpenAPIOperation,
  doc: OpenAPIDoc,
  root: unknown,
  baseUrl: string,
  langs: ReadonlyArray<"curl" | "node" | "python" | "go">,
  interactive: boolean,
  base = "/api-reference",
): EndpointView {
  const groups = paramGroups(op, root);
  const code = codeSamples(op, doc, root, baseUrl, langs);
  const response = successResponse(op, root) ?? undefined;
  const hasBearer = op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer");
  // Every operation gets an interactive "Try it" modal (unless the playground is
  // off); `explorer` still flags writes, which historically rendered inline.
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
    baseUrl,
    lead: op.description,
    groups,
    explorer,
    code,
    response,
    field,
    hasBearer,
    playground: interactive ? buildPlaygroundSpec(op, doc, root, base) : undefined,
    triggers: [...new Map(op.events.map((e) => [e.name, e])).values()].map((e) => ({
      name: e.name,
      id: eventAnchor(e.name),
    })),
  };
}

function sampleString(attr: AttrView): string {
  if (attr.enums?.length) return attr.enums[0];
  if (attr.type.startsWith("integer") || attr.type.startsWith("number")) return "100";
  if (attr.type.startsWith("boolean")) return "true";
  return "value";
}

/** Whether a nav subtree contains — or is — the active resource. */
function navContainsActive(n: NavTreeNode): boolean {
  return n.kind === "resource" ? n.active : n.active || n.children.some(navContainsActive);
}

export function buildApiRefView(doc: OpenAPIDoc, root: unknown, activeSlug?: string, variantId?: string): ApiRefView {
  const activeTag =
    doc.tags.find((t) => tagSlug(t.name) === activeSlug) ?? doc.tags[0];

  // All api-reference links hang off this base: "/api-reference" for the default
  // version, "/api-reference/<id>" for a non-default version.
  const base = variantId ? `/api-reference/${variantId}` : "/api-reference";

  // Base URL for samples/URL bars: explicit config wins, then the spec's first
  // server, then a placeholder. Languages: config, else all four generated.
  const api = loadConfig().api;
  const baseUrl = api.baseUrl ?? doc.servers[0]?.url ?? "https://api.example.com";
  const langs = api.codeSamples ?? ["curl", "node", "python", "go"];
  const interactive = playgroundMode(api) !== "off";

  // Nested sidebar derived from slash-separated tags. Each leaf tag stays a
  // routable resource; shared prefixes become nav-only accordion groups. Only
  // the active leaf carries its in-page operation jumps.
  const activeSlug2 = activeTag ? tagSlug(activeTag.name) : "";
  const activeParsed = activeTag ? parseOpenApiTag(activeTag.name) : undefined;
  // Full event catalog for the active resource (tag events + matching root
  // webhooks, with emittedBy). Shared by the nav jumps and the Events tab.
  const events = buildResourceEvents(activeTag, doc, root);
  const activeOps: NavOp[] = activeTag
    ? [
        { id: tagSlug(activeTag.name), verb: null, name: activeParsed!.displayName, opId: "" },
        ...activeTag.operations.map((op) => ({
          id: anchorFor(op),
          verb: VERB[op.method] ?? op.method.toUpperCase(),
          name: op.summary ?? op.operationId,
          opId: op.operationId,
        })),
        ...events.map((ev) => ({ id: ev.id, verb: null, name: ev.name, opId: "" })),
      ]
    : [];

  const toNav = (node: TagTreeNode): NavTreeNode => {
    if (node.type === "leaf") {
      const active = !!node.tag && tagSlug(node.tag) === activeSlug2;
      return { kind: "resource", name: node.name, slug: node.slug, active, ops: active ? activeOps : [] };
    }
    const children = node.children.map(toNav);
    const selfActive = !!node.tag && tagSlug(node.tag) === activeSlug2;
    return {
      kind: "group",
      name: node.name,
      slug: node.slug,
      tag: node.tag,
      active: selfActive,
      expanded: selfActive || children.some(navContainsActive),
      children,
    };
  };
  const nav: NavTreeNode[] = buildTagTree(doc.tags.map((t) => t.name)).map(toNav);

  const objSchema = activeTag ? pickObjectSchema(activeTag.operations, root) : undefined;
  const objAttrs = attrsFromSchema(objSchema, root);
  const object: ObjectView | undefined =
    objAttrs.length && objSchema
      ? {
          name: `The ${singularDisplay(activeParsed!.leaf)} object`,
          attrs: objAttrs,
          sampleHtml: colorizeJson(objectSample(objSchema, root)),
        }
      : undefined;

  const resource: ResourceView = {
    name: activeParsed ? activeParsed.displayName : "API",
    slug: tagSlug(activeTag?.name ?? ""),
    crumbs: activeParsed?.parentDisplayNames ?? [],
    lead: activeTag?.description,
    endpoints: (activeTag?.operations ?? []).map((op) => ({
      title: op.summary ?? op.operationId,
      verb: VERB[op.method] ?? op.method.toUpperCase(),
      path: op.path,
      id: anchorFor(op),
    })),
    events,
    object,
    sections: (activeTag?.operations ?? []).map((op) => buildEndpoint(op, doc, root, baseUrl, langs, interactive, base)),
  };

  return {
    title: doc.info.title || "API reference",
    version: doc.info.version,
    versionLabel: versionPillLabel(doc.info.version),
    base,
    servers: doc.servers.map((s) => s.url),
    nav,
    resource,
    search: buildSearchIndex(doc, base),
    versions: buildVersions(doc, variantId),
  };
}

/** Full-reference command-palette index (every resource + operation). */
function buildSearchIndex(doc: OpenAPIDoc, base = "/api-reference"): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const tag of doc.tags) {
    const parsed = parseOpenApiTag(tag.name);
    const slug = parsed.slug;
    const name = parsed.displayName;
    const groupCrumbs = ["API", ...parsed.parentDisplayNames];
    out.push({
      title: name,
      crumbs: groupCrumbs,
      snippet: tag.description || `${name} resource and its endpoints.`,
      href: `${base}/${slug}#${slug}`,
    });
    for (const op of tag.operations) {
      out.push({
        title: op.summary ?? op.operationId,
        crumbs: [...groupCrumbs, name],
        snippet: op.description || `${op.method.toUpperCase()} ${op.path}`,
        verb: (VERB[op.method] ?? op.method.toUpperCase()).toLowerCase(),
        href: `${base}/${slug}#${anchorFor(op)}`,
      });
    }
    for (const ev of tag.events ?? []) {
      out.push({
        title: ev.name,
        crumbs: [...groupCrumbs, name, "Events"],
        snippet: ev.summary || ev.description || `Webhook event ${ev.name}`,
        href: `${base}/${slug}#${eventAnchor(ev.name)}`,
      });
    }
  }
  return out;
}

function buildEventView(ev: OpenAPIEvent, root: unknown): EventView {
  const schema = ev.payloadSchema ? resolveSchema(ev.payloadSchema, root) : undefined;
  return {
    id: eventAnchor(ev.name),
    name: ev.name,
    summary: ev.summary,
    description: ev.description,
    guideHref: ev.guideHref,
    attrs: attrsFromSchema(schema, root),
    sampleHtml: colorizeJson(objectSample(schema, root)),
    emittedBy: [],
  };
}

/**
 * The resource's full event catalog: the tag's merged `x-events`/`callbacks`
 * (already on `tag.events`) plus any root `webhooks`/`x-webhooks` tagged for this
 * resource, with `emittedBy` back-links derived from each operation's events.
 */
function buildResourceEvents(activeTag: OpenAPITag | undefined, doc: OpenAPIDoc, root: unknown): EventView[] {
  if (!activeTag) return [];

  const merged = new Map<string, OpenAPIEvent>();
  for (const ev of activeTag.events) merged.set(ev.name, ev);
  for (const wh of doc.webhooks) {
    if (!wh.tags.includes(activeTag.name)) continue;
    const prev = merged.get(wh.name);
    merged.set(
      wh.name,
      prev ? { ...wh, ...prev, payloadSchema: prev.payloadSchema ?? wh.payloadSchema, guideHref: prev.guideHref ?? wh.guideHref } : wh,
    );
  }

  // Which operations emit each event (from per-operation events).
  const emittedBy = new Map<string, { title: string; id: string }[]>();
  for (const op of activeTag.operations) {
    for (const ev of op.events) {
      const id = anchorFor(op);
      const list = emittedBy.get(ev.name) ?? [];
      if (!list.some((e) => e.id === id)) list.push({ title: op.summary ?? op.operationId, id });
      emittedBy.set(ev.name, list);
    }
  }

  return [...merged.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((ev) => ({ ...buildEventView(ev, root), emittedBy: emittedBy.get(ev.name) ?? [] }));
}

/**
 * Version-pill label. For numeric-major semver ("1.4.2") it shows the major as
 * "v1"; for anything else — notably a date-style version like "2025-06-01" — it
 * uses the version verbatim, so we never render the redundant "v2025-06-01".
 */
export function versionPillLabel(version?: string): string {
  if (!version) return "v1";
  const major = version.split(".")[0];
  return /^\d+$/.test(major) ? `v${major}` : version;
}

function buildVersions(doc: OpenAPIDoc, variantId?: string): VersionEntry[] {
  const cfg = loadConfig();
  if (cfg.versions && cfg.versions.length > 1) {
    return cfg.versions.map((v, i) => {
      const isDefault = i === 0;
      const active = isDefault ? !variantId : v.id === variantId;
      return {
        label: v.label ?? v.id,
        sub: isDefault ? "Default" : undefined,
        href: isDefault ? "/api-reference" : `/api-reference/${v.id}`,
        current: active,
        latest: isDefault,
      };
    });
  }
  const label = versionPillLabel(doc.info.version);
  // Only carry a sub-line when it adds information (semver → "v1 · 1.4.2"); a
  // date version is shown once, never as "2025-06-01 · 2025-06-01".
  const sub = doc.info.version && doc.info.version !== label ? doc.info.version : undefined;
  return [{ label, sub, current: true, latest: true }];
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
