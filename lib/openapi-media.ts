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

/* ── base64 (the proxy's JSON envelope carries bytes this way) ──────────── */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1] ?? "A") << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length && o < out.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length && o < out.length) out[o++] = n & 255;
  }
  return out;
}
