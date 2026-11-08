import type { JSONSchema } from "./openapi";

/**
 * Media-type helpers shared by spec normalization, the generated code samples
 * and the playground: which request/response body an operation carries, how a
 * sample should send it, and whether a live response is text or bytes. Pure
 * (no `@/` imports) so the client playground and the unit tests can use it.
 */

/** How a request body is sent: drives cURL flags and the playground's encoder. */
export type BodyKind = "json" | "multipart" | "form" | "other";

function base(ct: string | undefined): string {
  return (ct ?? "").split(";")[0].trim().toLowerCase();
}

/** `application/json` and the structured `+json` suffix (`application/problem+json`). */
export function isJsonMediaType(ct: string | undefined): boolean {
  const b = base(ct);
  return b === "application/json" || b.endsWith("+json");
}

export function bodyKind(ct: string | undefined): BodyKind {
  const b = base(ct);
  if (!b || isJsonMediaType(b)) return "json";
  if (b === "multipart/form-data") return "multipart";
  if (b === "application/x-www-form-urlencoded") return "form";
  return "other";
}

/**
 * The media type to document from a `content` map: JSON when offered, then any
 * `+json`, then the first listed (`audio/mpeg`, `multipart/form-data`, …).
 */
export function pickMediaType(content: Record<string, unknown> | undefined | null): string | undefined {
  if (!content || typeof content !== "object") return undefined;
  const keys = Object.keys(content);
  if (!keys.length) return undefined;
  return keys.find((k) => base(k) === "application/json") ?? keys.find((k) => isJsonMediaType(k)) ?? keys[0];
}

/** Whether a body of this type reads as text (JSON, XML, `text/*`, forms) rather than bytes. */
export function isTextualMediaType(ct: string | undefined | null): boolean {
  const b = base(ct ?? undefined);
  if (!b) return true;
  if (b.startsWith("text/")) return true;
  if (isJsonMediaType(b) || b.endsWith("+xml")) return true;
  return [
    "application/xml",
    "application/javascript",
    "application/x-www-form-urlencoded",
    "application/graphql",
    "application/x-ndjson",
    "application/yaml",
  ].includes(b);
}

/** One-line description of a non-JSON body for the response panel. */
export function describeMediaType(ct: string): string {
  const b = base(ct);
  if (b === "text/event-stream") return `Returns ${ct} (event stream)`;
  if (isTextualMediaType(b)) return `Returns ${ct} (text)`;
  return `Returns ${ct} (binary)`;
}

/** The `X` of a nullable `anyOf`/`oneOf: [X, null]`; any other schema unchanged. */
export function nonNullSchema(schema: JSONSchema | undefined): JSONSchema | undefined {
  const list = schema?.anyOf ?? schema?.oneOf;
  if (!list) return schema;
  const rest = list.filter((s) => s?.type !== "null");
  return rest.length === 1 && list.length === 2 ? rest[0] : schema;
}

/**
 * An object schema with its `allOf` parts merged and any nullable wrapper gone,
 * so a form body's fields are found however the spec composes them.
 */
export function flattenObject(schema: JSONSchema | undefined): JSONSchema | undefined {
  const s = nonNullSchema(schema);
  if (!s?.allOf?.length) return s;
  const out: JSONSchema = { ...s, properties: {}, required: [...(s.required ?? [])] };
  delete out.allOf;
  for (const part of s.allOf) {
    const p = flattenObject(part);
    Object.assign(out.properties!, p?.properties ?? {});
    out.required!.push(...(p?.required ?? []));
  }
  Object.assign(out.properties!, s.properties ?? {});
  return out;
}

/** A file field: `format: binary` (or a non-text `contentMediaType`), also inside a nullable union. */
export function isBinarySchema(schema: JSONSchema | undefined): boolean {
  const s = nonNullSchema(schema);
  if (!s) return false;
  if (s.format === "binary") return true;
  const cmt = s.contentMediaType;
  if (typeof cmt === "string" && !isTextualMediaType(cmt)) return true;
  if (s.type === "array" && s.items) return isBinarySchema(s.items);
  return false;
}

/** "12.3 KB" style size for a download link. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** File extension for a downloaded response (`audio/mpeg` → `mp3`). */
export function extensionFor(ct: string | undefined): string {
  const b = base(ct);
  const known: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/flac": "flac",
    "audio/aac": "aac",
    "video/mp4": "mp4",
    "application/zip": "zip",
    "application/x-zip": "zip",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "text/csv": "csv",
  };
  if (known[b]) return known[b];
  const sub = b.split("/")[1] ?? "";
  return /^[a-z0-9]{1,5}$/.test(sub) ? sub : "bin";
}

/**
 * Whether bytes with no Content-Type to go on are binary: a NUL or invalid
 * UTF-8 near the start, which text has neither of.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 4096);
  if (head.includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: true });
    return false;
  } catch {
    return true;
  }
}

/* ── base64 (the proxy's JSON envelope carries bytes this way) ──────────── */

const BASE64_CHUNK = 3 * 256 * 1024;

/** Encode bytes in chunks, yielding between them so a big upload doesn't freeze the tab. */
export async function bytesToBase64(bytes: Uint8Array, pause: () => Promise<void> = () => new Promise((r) => setTimeout(r))): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    let bin = "";
    const end = Math.min(i + BASE64_CHUNK, bytes.length);
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]);
    parts.push(btoa(bin));
    if (end < bytes.length) await pause();
  }
  return parts.join("");
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Live responses, as the playground shows them. */
export type ReadBody = { body: string; blob?: Blob };

/** Read a response as text or as bytes, by Content-Type, else by sniffing the bytes. */
export async function readResponseBody(r: Response, contentType: string): Promise<ReadBody> {
  if (contentType) {
    if (isTextualMediaType(contentType)) return { body: await r.text() };
    return { body: "", blob: await r.blob() };
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  if (looksBinary(buf)) return { body: "", blob: new Blob([buf]) };
  return { body: new TextDecoder().decode(buf) };
}

/** Publish a blob's object URL through `set`; the returned cleanup revokes it. */
export function objectUrlFor(
  blob: Blob,
  set: (url: string) => void,
  urls: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void } = URL,
): () => void {
  const u = urls.createObjectURL(blob);
  set(u);
  return () => urls.revokeObjectURL(u);
}

/** The proxy's JSON envelope back into the same shape. */
export function readProxyBody(data: { body?: unknown; bodyBase64?: unknown; contentType?: unknown }): ReadBody {
  if (typeof data.bodyBase64 === "string") {
    const type = typeof data.contentType === "string" ? data.contentType : "";
    return { body: "", blob: new Blob([base64ToBytes(data.bodyBase64) as BlobPart], { type }) };
  }
  return { body: typeof data.body === "string" ? data.body : JSON.stringify(data.body) };
}
