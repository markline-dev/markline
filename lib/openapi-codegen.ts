import type { JSONSchema, OpenAPIDoc, OpenAPIOperation, OpenAPIParameter } from "./openapi";
import { resolveSchema, sampleFromSchema } from "./openapi";
import { apiKeyWord, formFieldArg, formFileArg, formText, headerWord, sampleUrl, shellWord } from "./openapi-curl";
import { bodyKind, describeMediaType, flattenObject, isBinarySchema, isJsonMediaType, nonNullSchema } from "./openapi-media";
import { apiKeyHeaders } from "./openapi-samples";

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
const C = (t: string) => `<span class="c">${esc(t)}</span>`;

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

function primitiveSample(raw: JSONSchema | undefined, root: unknown): unknown {
  const schema = nonNullSchema(raw);
  if (!schema) return "value";
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.enum?.length) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  if (type === "integer" || type === "number") return schema.minimum ?? 100;
  if (type === "boolean") return true;
  if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
  return "value";
}


type BodyField = { name: string; value: unknown; required: boolean; binary?: boolean };

function schemaType(s: JSONSchema | undefined): string | undefined {
  return Array.isArray(s?.type) ? s.type[0] : s?.type;
}

/** Sample for one body field: a primitive, or a whole object/array sample. */
function fieldSample(s: JSONSchema | undefined, root: unknown): unknown {
  const r = flattenObject(s);
  if (!r) return "value";
  // A real union samples as its first member, whatever shape that is.
  const members = r.oneOf ?? r.anyOf;
  if (members?.length && r.example === undefined && !r.examples && r.default === undefined) {
    return fieldSample(members.find((m) => m?.type !== "null") ?? members[0], root);
  }
  const t = schemaType(r);
  const structured = t === "object" || t === "array" || !!r.properties || !!r.allOf;
  if (structured && r.example === undefined) return sampleFromSchema(r, root);
  return primitiveSample(r, root);
}

/**
 * Top-level body fields used to populate the samples: every required field and
 * every file field, in spec order, then optional fields until there are `max`,
 * so a sample shows what else goes in the body.
 */
function bodyFields(op: OpenAPIOperation, root: unknown, max = 4): BodyField[] {
  const schema = flattenObject(op.requestBody?.schema ? resolveSchema(op.requestBody.schema, root) : undefined);
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);
  const must = (name: string, s: JSONSchema) => required.has(name) || isBinarySchema(s);
  const room = Math.max(0, max - entries.filter(([n, s]) => must(n, s)).length);
  const optional = new Set(entries.filter(([n, s]) => !must(n, s)).slice(0, room).map(([n]) => n));
  return entries
    .filter(([n, s]) => must(n, s) || optional.has(n))
    .map(([name, s]) => ({
      name,
      value: isBinarySchema(s) ? `path/to/${name}` : fieldSample(s, root),
      required: required.has(name),
      binary: isBinarySchema(s) || undefined,
    }));
}

/** A raw body's sample: strings as written, XML as a stub rather than JSON. */
function rawBodySample(ct: string, sample: unknown): string {
  if (typeof sample === "string") return sample;
  return /[/+]xml\b/i.test(ct) ? "<example/>" : formText(sample);
}

function requiredQuery(op: OpenAPIOperation, root: unknown): BodyField[] {
  return op.parameters.query
    .filter((q) => q.required)
    .map((q) => ({ name: q.name, value: primitiveSample(q.schema, root), required: true }));
}

/* ── SDK naming ────────────────────────────────────────────────────────── */

function clientVar(doc: OpenAPIDoc): string {
  const first = (doc.info.title || "api").trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  return /^[a-z]/.test(first) ? first : "client";
}

/** Singular resource accessor name from a tag ("projects" → "project"). */
function singular(tag: string): string {
  return tag.replace(/ies$/, "y").replace(/s$/, "");
}

/** Keywords that would make a generated sample invalid in JS, Python or Go.
 *  Kept small on purpose: the words most likely to surface as a singularized API tag. */
const RESERVED_WORDS = new Set([
  // Go
  "break", "case", "chan", "const", "continue", "default", "defer", "else",
  "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
  "map", "package", "range", "return", "select", "struct", "switch", "type", "var",
  // Python
  "and", "as", "assert", "async", "await", "class", "def", "del", "elif",
  "except", "finally", "false", "from", "global", "in", "is", "lambda", "none",
  "nonlocal", "not", "or", "pass", "raise", "true", "try", "while", "with", "yield",
  // JS/TS
  "abstract", "boolean", "byte", "catch", "char", "class", "const", "debugger",
  "delete", "do", "double", "enum", "export", "extends", "final", "finally",
  "float", "function", "implements", "instanceof", "int", "interface", "let",
  "long", "native", "new", "null", "package", "private", "protected", "public",
  "return", "short", "static", "super", "synchronized", "this", "throw",
  "throws", "transient", "typeof", "var", "void", "volatile", "with", "yield",
  // Not keywords, but syntax errors as a `const` name in a module, which the
  // samples are (they use top-level await).
  "eval", "arguments",
]);

/** Valid result-variable name for a tag ("tools/fx" → "fx", "payment-methods" → "paymentMethod").
 *  Tags may contain "/", "-" or spaces, none of which can appear in an identifier
 *  in the generated JS, Python or Go samples. Words reserved in any of those
 *  languages get a "Result" suffix ("types" → "typeResult"). */
function resultVar(tag: string): string {
  const last = tag.split("/").filter(Boolean).pop() ?? "";
  const pascalized = singular(last).replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase());
  const alnum = pascalized.replace(/[^a-zA-Z0-9]/g, "");
  if (!alnum) return "result";
  const camel = alnum[0].toLowerCase() + alnum.slice(1);
  const base = /^[0-9]/.test(camel) ? `r${camel}` : camel;
  return RESERVED_WORDS.has(base) ? `${base}Result` : base;
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

/** Words of an identifier-ish name: `text_to_speech`, `textToSpeech`, `text-to-speech` → text, to, speech. */
function words(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap1 = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
/** Prefix a digit-leading name so it stays a valid identifier. */
const safeId = (s: string, fallback: string) => (!s ? fallback : /^[0-9]/.test(s) ? `_${s}` : s);

const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else",
  "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
  "or", "pass", "raise", "return", "try", "while", "with", "yield", "None", "True", "False",
]);

export function snakeId(s: string, fallback = "resource"): string {
  const id = safeId(words(s).join("_"), fallback);
  return PY_KEYWORDS.has(id) ? `${id}_` : id;
}
export function camelId(s: string, fallback = "resource"): string {
  const w = words(s);
  return safeId(w.map((x, i) => (i ? cap1(x) : x)).join(""), fallback);
}
/** An exported Go name: `_3d` wouldn't be exported, so digits take an `X`. */
export function pascalId(s: string, fallback = "Resource"): string {
  const id = words(s).map(cap1).join("") || fallback;
  return /^[0-9]/.test(id) ? `X${id}` : id;
}

/** The raw (un-normalized) operation object, for vendor extensions. */
function rawOperation(op: OpenAPIOperation, root: unknown): Record<string, unknown> | undefined {
  return (root as { paths?: Record<string, Record<string, unknown>> })?.paths?.[op.path]?.[op.method] as
    | Record<string, unknown>
    | undefined;
}

/**
 * Fern's SDK naming extensions: `x-fern-sdk-group-name` (a string, or an array
 * for nested groups) and `x-fern-sdk-method-name`. Null unless the method name
 * is present.
 */
export function fernSdkName(op: OpenAPIOperation, root: unknown): { groups: string[]; method: string } | null {
  const raw = rawOperation(op, root);
  const method = raw?.["x-fern-sdk-method-name"];
  if (typeof method !== "string" || !method.trim()) return null;
  const g = raw?.["x-fern-sdk-group-name"];
  const groups = (Array.isArray(g) ? g : typeof g === "string" ? [g] : []).filter(
    (x): x is string => typeof x === "string" && !!x.trim(),
  );
  return { groups, method };
}

/** How SDK calls are named in the generated samples (`api.sdkNaming`). */
export type SdkNaming = "auto" | "off";

type SdkCall = { node: string; python: string; go: string; fern: boolean };

/** The call expression (`client.textToSpeech.convert`) per language. */
function sdkCall(op: OpenAPIOperation, root: unknown, ns: string, fn: string, cv: string, naming: SdkNaming): SdkCall {
  const fern = naming === "off" ? null : fernSdkName(op, root);
  if (fern) {
    const node = [...fern.groups.map((x) => camelId(x)), F(camelId(fern.method, "call"))];
    const python = [...fern.groups.map((x) => snakeId(x)), F(snakeId(fern.method, "call"))];
    const go = [...fern.groups.map((x) => pascalId(x)), F(pascalId(fern.method, "Call"))];
    return {
      node: ["client", ...node].join("."),
      python: ["client", ...python].join("."),
      go: ["client", ...go].join("."),
      fern: true,
    };
  }
  const id = safeId(ns, "resource");
  return {
    node: `${esc(cv)}.${esc(id)}.${F(fn)}`,
    // `del` is a Python keyword.
    python: `${esc(cv)}.${esc(id)}.${F(fn === "del" ? "delete" : fn)}`,
    go: `client.${esc(pascalId(id))}.${F(pascal(fn))}`,
    fern: false,
  };
}

/* ── literals ──────────────────────────────────────────────────────────── */

const isIdent = (k: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);
const isPyKeyword = (k: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !PY_KEYWORDS.has(k);

/** A JS string in single quotes, on one line. */
const jsStr = (v: string) => `'${JSON.stringify(v).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
const jsKey = (k: string) => esc(isIdent(k) ? k : jsStr(k));

function jsLit(v: unknown): string {
  if (v === null || v === undefined) return K("null");
  if (typeof v === "number") return N(v);
  if (typeof v === "boolean") return K(String(v));
  if (typeof v === "string") return S(jsStr(v));
  if (Array.isArray(v)) return PUN("[") + v.map(jsLit).join(PUN(", ")) + PUN("]");
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) return PUN("{}");
  return `${PUN("{")} ${entries.map(([k, x]) => `${jsKey(k)}: ${jsLit(x)}`).join(PUN(", "))} ${PUN("}")}`;
}

function pyLit(v: unknown): string {
  if (v === null || v === undefined) return K("None");
  if (typeof v === "number") return N(v);
  if (typeof v === "boolean") return K(v ? "True" : "False");
  if (typeof v === "string") return S(JSON.stringify(v));
  if (Array.isArray(v)) return PUN("[") + v.map(pyLit).join(PUN(", ")) + PUN("]");
  const entries = Object.entries(v as Record<string, unknown>);
  return PUN("{") + entries.map(([k, x]) => `${S(JSON.stringify(k))}${PUN(":")} ${pyLit(x)}`).join(PUN(", ")) + PUN("}");
}

function goLit(v: unknown, cv: string): string {
  if (typeof v === "number") return `${esc(cv)}.${F(Number.isInteger(v) ? "Int" : "Float64")}(${N(v)})`;
  if (typeof v === "boolean") return `${esc(cv)}.${F("Bool")}(${K(String(v))})`;
  if (typeof v === "string") return `${esc(cv)}.${F("String")}(${S(JSON.stringify(v))})`;
  return K("nil");
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
  const raw = rawOperation(op, root);
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
  opts: { sdkNaming?: SdkNaming } = {},
): CodeRail {
  const custom = customSamples(op, root);
  if (custom) return { tabs: custom };

  const query = requiredQuery(op, root);
  const url = sampleUrl(
    baseUrl,
    op.path,
    (name) => primitiveSample(op.parameters.path.find((x) => x.name === name)?.schema, root),
    query,
  );
  const hasBearer = op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer");
  const fields = bodyFields(op, root);
  const ns = op.tag.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cv = clientVar(doc);
  const rv = resultVar(op.tag);
  const fn = fnName(op);

  const kind = bodyKind(op.requestBody?.contentType);
  const call = sdkCall(op, root, ns, fn, cv, opts.sdkNaming ?? "auto");
  const pathArgs = op.parameters.path.map((p) => ({ name: p.name, value: primitiveSample(p.schema, root) }));
  // Query params ride along in the call's options object, as SDKs usually take
  // them. A name the path already passes isn't sent twice.
  const objFields: BodyField[] = [...fields, ...query].filter((f) => !pathArgs.some((p) => p.name === f.name));
  const placeholder = (f: BodyField) => String(f.value);

  /* cURL */
  const curlLines: string[] = [];
  const urlSpan = S(shellWord(url));
  const reqSchema = op.requestBody?.schema ? resolveSchema(op.requestBody.schema, root) : undefined;
  const hasBody = !!reqSchema && op.method !== "get";
  let head = `${F("curl")} `;
  // A body implies POST to curl; anything else needs -X.
  if (op.method !== "get" && (op.method !== "post" || !hasBody)) head += `-X ${esc(op.method.toUpperCase())} `;
  curlLines.push(head + urlSpan);
  if (hasBearer) curlLines.push(`  -H ${S('"Authorization: Bearer sk_live_••••"')}`);
  // apiKey-in-header schemes (e.g. `xi-api-key`) read from the operation's security.
  const keyHeaders = apiKeyHeaders(op);
  for (const name of keyHeaders) curlLines.push(`  -H ${S(apiKeyWord(name))}`);
  for (const h of op.parameters.header ?? []) {
    if (!h.required || keyHeaders.some((k) => k.toLowerCase() === h.name.toLowerCase())) continue;
    curlLines.push(`  -H ${S(headerWord(h.name, String(primitiveSample(h.schema, root))))}`);
  }
  if (hasBody) {
    const ct = op.requestBody?.contentType ?? "application/json";
    const flagName = { form: "-F", "form-string": "--form-string", "data-urlencode": "--data-urlencode", "data-raw": "--data-raw" } as const;
    if (kind === "json") {
      const sample = fields.length ? Object.fromEntries(fields.map((f) => [f.name, f.value])) : sampleFromSchema(reqSchema, root);
      curlLines.push(`  -H ${S(headerWord("Content-Type", ct))}`);
      curlLines.push(`  -d ${S(shellWord(JSON.stringify(sample, null, 2)))}`);
    } else if (kind === "multipart" || kind === "form") {
      // curl sets the Content-Type itself (for multipart, with its boundary).
      const parts: BodyField[] = fields.length ? fields : [{ name: "field", value: "value", required: false }];
      for (const f of parts) {
        const arg = f.binary ? formFileArg(f.name, placeholder(f)) : formFieldArg(kind, f.name, f.value);
        curlLines.push(`  ${flagName[arg.flag]} ${S(arg.word)}`);
      }
    } else {
      curlLines.push(`  -H ${S(headerWord("Content-Type", ct))}`);
      if (isBinarySchema(reqSchema)) curlLines.push(`  --data-binary ${S("@path/to/file")}`);
      else curlLines.push(`  --data-raw ${S(shellWord(rawBodySample(ct, sampleFromSchema(reqSchema, root))))}`);
    }
  }
  const curl = curlLines.join(" \\\n");

  // Fern-named SDKs camelCase their Node option keys (`model_id` → `modelId`).
  const nodeKey = (k: string) => (call.fern ? camelId(k, k) : k);
  const nodeVal = (f: BodyField) => (f.binary ? `fs.${F("createReadStream")}(${S(jsStr(placeholder(f)))})` : jsLit(f.value));
  const pyVal = (f: BodyField) => (f.binary ? `${F("open")}(${S(JSON.stringify(placeholder(f)))}, ${S('"rb"')})` : pyLit(f.value));

  /* Node */
  const nodeArgs = pathArgs.map((p) => jsLit(String(p.value)));
  if (fields.length) {
    const body = objFields.map((f) => `  ${jsKey(nodeKey(f.name))}: ${nodeVal(f)},`).join("\n");
    nodeArgs.push(`{\n${body}\n}`);
  } else if (objFields.length) {
    nodeArgs.push(`{ ${objFields.map((f) => `${jsKey(nodeKey(f.name))}: ${nodeVal(f)}`).join(", ")} }`);
  }
  const node = `${K("const")} ${esc(rv)} = ${K("await")} ${call.node}(${nodeArgs.join(", ")})`;

  /* Python */
  // Fern's Python SDK takes every argument by keyword; otherwise path params are positional.
  const pyPath = pathArgs.map((p) => (call.fern ? `${esc(snakeId(p.name, p.name))}=${pyLit(String(p.value))}` : pyLit(String(p.value))));
  // A name Python can't take as a keyword (`from`, `$top`) travels in a dict.
  const pyNamed = objFields.filter((f) => isPyKeyword(f.name));
  const pyDict = objFields.filter((f) => !isPyKeyword(f.name));
  const pyKw = [
    ...pyNamed.map((f) => `${esc(f.name)}=${pyVal(f)}`),
    ...(pyDict.length
      ? [`${PUN("**{")}${pyDict.map((f) => `${S(JSON.stringify(f.name))}${PUN(":")} ${pyVal(f)}`).join(PUN(", "))}${PUN("}")}`]
      : []),
  ];
  let python: string;
  if (fields.length) {
    python = `${esc(rv)} = ${call.python}(\n${[...pyPath, ...pyKw].map((a) => `    ${a},`).join("\n")}\n)`;
  } else {
    python = `${esc(rv)} = ${call.python}(${[...pyPath, ...pyKw].join(", ")})`;
  }

  /* Go */
  const goParams = pascalId(singular(op.tag)) + "Params";
  const goArgs = [`ctx`, ...pathArgs.map((p) => S(JSON.stringify(String(p.value))))];
  const goPre: string[] = [];
  if (objFields.length && fields.length) {
    const body = objFields
      .map((f) => {
        if (f.binary) {
          const v = camelId(f.name, "file");
          goPre.push(`${esc(v)}, _ := os.${F("Open")}(${S(JSON.stringify(placeholder(f)))})`);
          return `    ${esc(pascalId(f.name))}: ${esc(v)},`;
        }
        return `    ${esc(pascalId(f.name))}: ${goLit(f.value, cv)},`;
      })
      .join("\n");
    goArgs.push(`&amp;${esc(cv)}.${esc(goParams)}{\n${body}\n}`);
  } else if (!pathArgs.length) {
    goArgs.push(K("nil"));
  }
  const go = [...goPre, `${esc(rv)}, err := ${call.go}(${goArgs.join(", ")})`].join("\n");

  const all = { curl, node, python, go };
  const order = langs.length ? langs : (["curl"] as const);
  const tabs: CodeTab[] = order
    .map((l) => GENERATED.find((g) => g.field === l))
    .filter((g): g is (typeof GENERATED)[number] => !!g)
    .map((g) => ({ key: g.key, label: g.label, html: all[g.field] }));
  return { tabs: tabs.length ? tabs : [{ key: "curl", label: "cURL", html: curl }] };
}

/* ── responses ─────────────────────────────────────────────────────────── */

/** A non-JSON body (audio, zip, CSV, …) is documented by its media type. */
function isMediaOnly(r: OpenAPIOperation["responses"][number]): boolean {
  return !r.schema && r.example == null && !!r.contentType && !isJsonMediaType(r.contentType);
}

/** Response-panel body for a non-JSON response: "Returns audio/mpeg (binary)" + its Content-Type. */
export function mediaResponseHtml(contentType: string): string {
  return `${C(`// ${describeMediaType(contentType)}`)}\n${KEY("Content-Type")}${PUN(":")} ${S(contentType)}`;
}

function responseHtml(r: OpenAPIOperation["responses"][number], root: unknown): string {
  if (isMediaOnly(r)) return mediaResponseHtml(r.contentType!);
  if (!r.schema && r.example == null) return C("// No response body");
  return colorizeJson(r.example ?? sampleFromSchema(r.schema!, root));
}

/** Pick the first success (2xx) response with a JSON schema, else a 2xx binary/text one. */
export function successResponse(
  op: OpenAPIOperation,
  root: unknown,
): { status: string; label: string; html: string } | null {
  const ok =
    op.responses.find((r) => /^2/.test(r.status) && r.schema) ??
    op.responses.find((r) => /^2/.test(r.status) && isMediaOnly(r)) ??
    op.responses.find((r) => r.schema);
  if (!ok || (!ok.schema && !isMediaOnly(ok))) return null;
  return {
    status: ok.status,
    label: `${ok.status} ${ok.description ?? statusText(ok.status)}`.trim(),
    html: responseHtml(ok, root),
  };
}

/**
 * Every documented response — success first, then errors — for the code card's
 * status-code switcher. Each carries a tone (2xx → green, anything else → red)
 * and a colorized sample, a "Returns audio/mpeg (binary)" note for non-JSON
 * bodies, or "No response body".
 */
export function allResponses(
  op: OpenAPIOperation,
  root: unknown,
): { status: string; label: string; tone: "g" | "r"; html: string }[] {
  return op.responses
    .map((r) => ({
      status: r.status,
      label: `${r.status} ${r.description ?? statusText(r.status)}`.trim(),
      tone: (/^2/.test(r.status) ? "g" : "r") as "g" | "r",
      html: responseHtml(r, root),
    }))
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
