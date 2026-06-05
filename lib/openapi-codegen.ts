import type { JSONSchema, OpenAPIDoc, OpenAPIOperation, OpenAPIParameter } from "./openapi";
import { resolveSchema, sampleFromSchema } from "./openapi";

/**
 * Server-side code-sample + JSON colorizer for the API reference
 * (the dark code rails). Every function returns a pre-colorized HTML string
 * whose spans use the design's token classes (.k/.s/.f/.n/.key/.pun) — see
 * app/api-reference.css. Input is the project's own OpenAPI doc (trusted), and
 * all interpolated text is HTML-escaped, so the output is safe to inject.
 */

export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const S = (t: string) => `<span class="s">${esc(t)}</span>`;
const N = (t: unknown) => `<span class="n">${esc(t)}</span>`;
const K = (t: string) => `<span class="k">${esc(t)}</span>`;
const F = (t: string) => `<span class="f">${esc(t)}</span>`;
const KEY = (t: string) => `<span class="key">${esc(t)}</span>`;
const PUN = (t: string) => `<span class="pun">${esc(t)}</span>`;

/* ── JSON ──────────────────────────────────────────────────────────────── */

/** Pretty-print a value as colorized JSON HTML (2-space indent). */
export function colorizeJson(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const pad1 = "  ".repeat(indent + 1);
  if (value === null || value === undefined) return K("null");
  if (typeof value === "string") return S(`"${value}"`);
  if (typeof value === "number") return N(value);
  if (typeof value === "boolean") return K(String(value));
  if (Array.isArray(value)) {
    if (value.length === 0) return PUN("[]");
    const items = value
      .map((v) => pad1 + colorizeJson(v, indent + 1))
      .join(PUN(",") + "\n");
    return PUN("[") + "\n" + items + "\n" + pad + PUN("]");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return PUN("{}");
    const body = entries
      .map(([k, v]) => `${pad1}${KEY(`"${k}"`)}${PUN(":")} ${colorizeJson(v, indent + 1)}`)
      .join(PUN(",") + "\n");
    return PUN("{") + "\n" + body + "\n" + pad + PUN("}");
  }
  return esc(String(value));
}

/* ── value helpers ─────────────────────────────────────────────────────── */

function primitiveSample(schema: JSONSchema | undefined, root: unknown): unknown {
  if (!schema) return "value";
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "integer" || type === "number") return schema.minimum ?? 100;
  if (type === "boolean") return true;
  if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
  return "value";
}

/** Fill `{param}` placeholders in a path with sample values. */
function fillPath(p: string, pathParams: OpenAPIParameter[], root: unknown): string {
  return p.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const param = pathParams.find((x) => x.name === name);
    return String(primitiveSample(param?.schema, root) ?? `:${name}`);
  });
}

type BodyField = { name: string; value: unknown; required: boolean };

/** Top-level body fields (required first) used to populate SDK call samples. */
function bodyFields(op: OpenAPIOperation, root: unknown, max = 4): BodyField[] {
  const schema = op.requestBody?.schema ? resolveSchema(op.requestBody.schema, root) : undefined;
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);
  const sorted = entries.sort((a, b) => Number(required.has(b[0])) - Number(required.has(a[0])));
  return sorted.slice(0, max).map(([name, s]) => ({
    name,
    value: primitiveSample(s, root),
    required: required.has(name),
  }));
}

function requiredQuery(op: OpenAPIOperation, root: unknown): BodyField[] {
  return op.parameters.query
    .filter((q) => q.required)
    .map((q) => ({ name: q.name, value: primitiveSample(q.schema, root), required: true }));
}

/* ── SDK naming ────────────────────────────────────────────────────────── */

function clientVar(doc: OpenAPIDoc): string {
  const first = (doc.info.title || "api").trim().split(/\s+/)[0].toLowerCase();
  return first.replace(/[^a-z0-9]/g, "") || "client";
}

/** Singular resource accessor name from a tag ("projects" → "project"). */
function singular(tag: string): string {
  return tag.replace(/ies$/, "y").replace(/s$/, "");
}

/** SDK method name from HTTP method + path cardinality. */
function fnName(op: OpenAPIOperation): string {
  const hasPathParam = /\{[^}]+\}/.test(op.path);
  switch (op.method) {
    case "post":
      return "create";
    case "put":
    case "patch":
      return "update";
    case "delete":
      return "del";
    case "get":
    default:
      return hasPathParam ? "retrieve" : "list";
  }
}

function pascal(s: string): string {
  return s.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase());
}

/* ── code rails ────────────────────────────────────────────────────────── */

export type CodeTab = { key: string; label: string; html: string };
export type CodeRail = { tabs: CodeTab[] };

const GENERATED: { key: string; label: string; field: "curl" | "node" | "python" | "go" }[] = [
  { key: "curl", label: "cURL", field: "curl" },
  { key: "js", label: "Node", field: "node" },
  { key: "py", label: "Python", field: "python" },
  { key: "go", label: "Go", field: "go" },
];

function langSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "sample";
}

/** Author-provided samples via the OpenAPI `x-codeSamples` (or `x-code-samples`)
 *  extension on the raw operation — these take precedence over generated ones. */
function customSamples(op: OpenAPIOperation, root: unknown): CodeTab[] | null {
  const raw = (root as { paths?: Record<string, Record<string, unknown>> })?.paths?.[op.path]?.[op.method] as
    | Record<string, unknown>
    | undefined;
  const list = (raw?.["x-codeSamples"] ?? raw?.["x-code-samples"]) as
    | { lang?: string; label?: string; source?: string }[]
    | undefined;
  if (!Array.isArray(list) || !list.length) return null;
  return list.map((s, i) => ({
    key: langSlug(s.lang ?? s.label ?? `sample-${i}`),
    label: s.label ?? s.lang ?? "Sample",
    html: esc(s.source ?? ""),
  }));
}

export function codeSamples(
  op: OpenAPIOperation,
  doc: OpenAPIDoc,
  root: unknown,
  baseUrl: string,
  langs: ReadonlyArray<"curl" | "node" | "python" | "go"> = ["curl", "node", "python", "go"],
): CodeRail {
  const custom = customSamples(op, root);
  if (custom) return { tabs: custom };

  const filledPath = fillPath(op.path, op.parameters.path, root);
  const query = requiredQuery(op, root);
  const queryStr = query.length ? "?" + query.map((q) => `${q.name}=${q.value}`).join("&") : "";
  const hasBearer = op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer");
  const fields = bodyFields(op, root);
  const ns = op.tag.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cv = clientVar(doc);
  const rv = singular(op.tag) || "result";
  const fn = fnName(op);

  /* cURL */
  const curlLines: string[] = [];
  const urlSpan = `${esc(baseUrl)}${S(filledPath + queryStr)}`;
  let head = `${F("curl")} `;
  if (op.method !== "get" && op.method !== "post") head += `-X ${op.method.toUpperCase()} `;
  curlLines.push(head + urlSpan);
  if (hasBearer) curlLines.push(`  -H ${S('"Authorization: Bearer sk_live_••••"')}`);
  for (const f of fields) {
    const v = typeof f.value === "number" ? N(f.value) : esc(String(f.value));
    curlLines.push(`  -d ${KEY(f.name)}=${v}`);
  }
  const curl = curlLines.join(" \\\n");

  /* Node */
  let node: string;
  if (fields.length) {
    const body = fields
      .map((f) => `  ${esc(f.name)}: ${typeof f.value === "number" ? N(f.value) : S(`'${f.value}'`)},`)
      .join("\n");
    node = `${K("const")} ${esc(rv)} = ${K("await")} ${esc(cv)}.${esc(ns)}.${F(fn)}({\n${body}\n})`;
  } else if (op.parameters.path.length) {
    node = `${K("const")} ${esc(rv)} = ${K("await")} ${esc(cv)}.${esc(ns)}.${F(fn)}(${S(`'${primitiveSample(op.parameters.path[0].schema, root)}'`)})`;
  } else {
    const args = query.map((q) => `${esc(q.name)}: ${typeof q.value === "number" ? N(q.value) : S(`'${q.value}'`)}`).join(", ");
    node = `${K("const")} ${esc(rv)} = ${K("await")} ${esc(cv)}.${esc(ns)}.${F(fn)}(${args ? `{ ${args} }` : ""})`;
  }

  /* Python */
  let python: string;
  if (fields.length) {
    const body = fields
      .map((f) => `    ${esc(f.name)}=${typeof f.value === "number" ? N(f.value) : S(`"${f.value}"`)},`)
      .join("\n");
    python = `${esc(rv)} = ${esc(cv)}.${esc(ns)}.${F(fn)}(\n${body}\n)`;
  } else if (op.parameters.path.length) {
    python = `${esc(rv)} = ${esc(cv)}.${esc(ns)}.${F(fn)}(${S(`"${primitiveSample(op.parameters.path[0].schema, root)}"`)})`;
  } else {
    const args = query.map((q) => `${esc(q.name)}=${typeof q.value === "number" ? N(q.value) : S(`"${q.value}"`)}`).join(", ");
    python = `${esc(rv)} = ${esc(cv)}.${esc(ns)}.${F(fn)}(${args})`;
  }

  /* Go */
  const goParams = pascal(singular(op.tag)) + "Params";
  let go: string;
  if (fields.length) {
    const body = fields
      .map((f) => {
        const key = pascal(f.name);
        const val = typeof f.value === "number"
          ? `${esc(cv)}.${F("Int")}(${N(f.value)})`
          : `${esc(cv)}.${F("String")}(${S(`"${f.value}"`)})`;
        return `    ${esc(key)}: ${val},`;
      })
      .join("\n");
    go = `${esc(rv)}, err := client.${esc(pascal(ns))}.${F(pascal(fn))}(ctx, &amp;${esc(cv)}.${esc(goParams)}{\n${body}\n})`;
  } else if (op.parameters.path.length) {
    go = `${esc(rv)}, err := client.${esc(pascal(ns))}.${F(pascal(fn))}(ctx, ${S(`"${primitiveSample(op.parameters.path[0].schema, root)}"`)})`;
  } else {
    go = `${esc(rv)}, err := client.${esc(pascal(ns))}.${F(pascal(fn))}(ctx, ${K("nil")})`;
  }

  const all = { curl, node, python, go };
  const order = langs.length ? langs : (["curl"] as const);
  const tabs: CodeTab[] = order
    .map((l) => GENERATED.find((g) => g.field === l))
    .filter((g): g is (typeof GENERATED)[number] => !!g)
    .map((g) => ({ key: g.key, label: g.label, html: all[g.field] }));
  return { tabs: tabs.length ? tabs : [{ key: "curl", label: "cURL", html: curl }] };
}

/* ── responses ─────────────────────────────────────────────────────────── */

/** Pick the first success (2xx) response that carries a JSON schema. */
export function successResponse(
  op: OpenAPIOperation,
  root: unknown,
): { status: string; label: string; html: string } | null {
  const ok = op.responses.find((r) => /^2/.test(r.status) && r.schema) ?? op.responses.find((r) => r.schema);
  if (!ok?.schema) return null;
  const sample = ok.example ?? sampleFromSchema(ok.schema, root);
  return {
    status: ok.status,
    label: `${ok.status} ${ok.description ?? statusText(ok.status)}`.trim(),
    html: colorizeJson(sample),
  };
}

/**
 * Every documented response with a renderable body — success first, then errors —
 * for the code card's status-code switcher. Each carries a tone (2xx → green,
 * anything else → red) and a colorized sample. Responses without a schema/example
 * are dropped; if none qualify, returns an empty list.
 */
export function allResponses(
  op: OpenAPIOperation,
  root: unknown,
): { status: string; label: string; tone: "g" | "r"; html: string }[] {
  return op.responses
    .filter((r) => r.schema || r.example != null)
    .map((r) => {
      const sample = r.example ?? sampleFromSchema(r.schema!, root);
      return {
        status: r.status,
        label: `${r.status} ${r.description ?? statusText(r.status)}`.trim(),
        tone: (/^2/.test(r.status) ? "g" : "r") as "g" | "r",
        html: colorizeJson(sample),
      };
    })
    .sort((a, b) => (a.tone === b.tone ? a.status.localeCompare(b.status) : a.tone === "g" ? -1 : 1));
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    "200": "OK",
    "201": "Created",
    "202": "Accepted",
    "204": "No Content",
    "400": "Bad Request",
    "401": "Unauthorized",
    "402": "Payment Required",
    "403": "Forbidden",
    "404": "Not Found",
    "409": "Conflict",
    "422": "Unprocessable Entity",
    "429": "Too Many Requests",
    "500": "Server Error",
  };
  return map[status] ?? "";
}
