/* The Try it proxy's rules, kept pure so they're unit-tested:
 * app/api/playground/route.ts applies them. */

/** The most the proxy reads from an upstream response, after decompression. */
export const MAX_PROXY_RESPONSE_BYTES = 25 * 1024 * 1024;

/** The most it reads of a request: room for a 25 MB upload as base64 in JSON. */
export const MAX_PROXY_REQUEST_BYTES = 35 * 1024 * 1024;

/** The largest upload (a request's bytes, once decoded from base64) it forwards. */
export const MAX_PROXY_UPLOAD_BYTES = 25 * 1024 * 1024;

/** The most it sends back. JSON can make text far bigger: a control character takes
 *  six bytes. This allows ordinary JSON text at the response cap. */
export const MAX_PROXY_REPLY_BYTES = 40 * 1024 * 1024;

/** The most it holds across all the requests in progress, so a few large ones at
 *  once can't exhaust a small server. Fits two responses at the cap. */
export const MAX_PROXY_BUFFERED_BYTES = 60 * 1024 * 1024;

/** How long an upstream gets to answer in full. Generation APIs can take minutes. */
export const UPSTREAM_TIMEOUT_MS = 120_000;

/** How long a client gets to send its request. */
export const REQUEST_READ_TIMEOUT_MS = 60_000;

/** Headers about this request's own connection or route, the reader's session on
 *  the docs site, or who the reader is. */
const DROPPED_HEADERS = new Set([
  "host",
  "cookie",
  "content-length",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded",
  "x-real-ip",
  "true-client-ip",
  "x-client-ip",
  "cf-connecting-ip",
  "x-cluster-client-ip",
  "via",
  "x-original-url",
  "x-rewrite-url",
  "x-envoy-original-path",
  "x-http-method-override",
  "x-matched-path",
  "rsc",
  "next-action",
]);
const DROPPED_PREFIXES = ["proxy-", "x-forwarded-", "x-middleware-", "x-nextjs-", "x-invoke-"];

/** What to send upstream of the headers Try it asked for. Everything else stays,
 *  including Authorization and an API's own key headers. */
export function forwardableHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const lower = name.toLowerCase();
      return !DROPPED_HEADERS.has(lower) && !DROPPED_PREFIXES.some((p) => lower.startsWith(p));
    }),
  );
}

/** `bodyBase64` carries a binary body (an encoded multipart form, a file) as base64. */
export type ProxyPayload = { url: string; method: string; headers: Record<string, string>; body?: string; bodyBase64?: string };

/** How many bytes a strict, padded base64 string decodes to, or null if it isn't one. */
export function base64Size(s: string): number | null {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return (s.length / 4) * 3 - pad;
}

const REFUSED_METHODS = new Set(["CONNECT", "TRACE", "TRACK"]);

/** A request's JSON as a call to make, or why it can't be. Messages never repeat
 *  the input, which may hold a token. */
export function parsePayload(raw: string): ProxyPayload | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON payload" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { error: "Invalid JSON payload" };
  const { url, method = "GET", headers = {}, body, bodyBase64 } = data as Record<string, unknown>;
  if (!url) return { error: "Missing url" };
  if (typeof url !== "string") return { error: "url must be a string" };
  if (typeof method !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)) return { error: "method must be an HTTP method" };
  const upper = method.toUpperCase();
  if (REFUSED_METHODS.has(upper)) return { error: `${upper} isn't allowed` };
  if (typeof headers !== "object" || headers === null || Array.isArray(headers) || !Object.values(headers).every((v) => typeof v === "string")) {
    return { error: "headers must be an object of strings" };
  }
  try {
    new Headers(headers as Record<string, string>);
  } catch {
    return { error: "A header has an invalid name or value" };
  }
  if (body !== undefined && body !== null && typeof body !== "string") return { error: "body must be a string" };
  if (bodyBase64 === undefined || bodyBase64 === null) {
    return { url, method: upper, headers: headers as Record<string, string>, body: (body as string | null) ?? undefined };
  }
  if (body !== undefined && body !== null) return { error: "Send body or bodyBase64, not both" };
  if (typeof bodyBase64 !== "string") return { error: "bodyBase64 must be a string" };
  const size = base64Size(bodyBase64);
  if (size === null) return { error: "bodyBase64 isn't valid base64" };
  if (size > MAX_PROXY_UPLOAD_BYTES) return { error: `The upload is larger than the ${MAX_PROXY_UPLOAD_BYTES / (1024 * 1024)} MB the proxy forwards.` };
  return { url, method: upper, headers: headers as Record<string, string>, bodyBase64 };
}

/** A browser request from another site. The browser's own Sec-Fetch-Site answers
 *  that when it's there, as Origin can't be compared behind a proxy that rewrites
 *  Host. With neither header it's not a browser's, so a command-line tool still works. */
export function isCrossSite(headers: Headers): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return false;
  if (fetchSite === "cross-site") return true;
  const origin = headers.get("origin");
  if (origin === null) return false;
  const hosts = [headers.get("host"), ...(headers.get("x-forwarded-host") ?? "").split(",").map((h) => h.trim())];
  try {
    return !hosts.includes(new URL(origin).host);
  } catch {
    return true;
  }
}

/** Bytes held for one request, against a shared limit. */
export class BufferBudget {
  private held = 0;
  private pool: { bytes: number };
  private max: number;
  constructor(pool: { bytes: number }, max = MAX_PROXY_BUFFERED_BYTES) {
    this.pool = pool;
    this.max = max;
  }
  take(bytes: number): boolean {
    if (this.pool.bytes + bytes > this.max) return false;
    this.pool.bytes += bytes;
    this.held += bytes;
    return true;
  }
  release() {
    this.pool.bytes -= this.held;
    this.held = 0;
  }
}

export const OVER_BUDGET = Symbol("over budget");

/**
 * A request's or response's text, null as soon as it's over `max` bytes, or
 * OVER_BUDGET if the server is holding too much already. A Content-Length over `max`
 * is taken at its word, and one under it isn't relied on. The caller should then
 * abort the request: that's what drops the connection, since cancelling a body Next
 * has cloned waits for its other copy, which nothing is reading.
 */
export async function readCapped(
  res: Pick<Response, "body" | "headers">,
  max = MAX_PROXY_RESPONSE_BYTES,
  budget?: BufferBudget,
): Promise<string | null | typeof OVER_BUDGET> {
  const bytes = await readCappedBytes(res, max, budget);
  return bytes instanceof Uint8Array ? new TextDecoder().decode(bytes) : bytes;
}

/** readCapped's bytes, undecoded: for audio, images and other binary bodies. */
export async function readCappedBytes(
  res: Pick<Response, "body" | "headers">,
  max = MAX_PROXY_RESPONSE_BYTES,
  budget?: BufferBudget,
): Promise<Uint8Array | null | typeof OVER_BUDGET> {
  if (!res.body) return new Uint8Array(0);
  if (Number(res.headers.get("content-length")) > max) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) return null;
    if (budget && !budget.take(value.byteLength)) return OVER_BUDGET;
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/** Whether `text` as a JSON string, in UTF-8, stays within `max` bytes. Stops at
 *  the limit, and doesn't build the string to find out. */
export function jsonFits(text: string, max = MAX_PROXY_REPLY_BYTES): boolean {
  let size = 2;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x22 || c === 0x5c || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) size += 2;
    else if (c < 0x20) size += 6;
    else if (c < 0x80) size += 1;
    else if (c < 0x800 || (c >= 0xd800 && c <= 0xdfff)) size += 2; // a surrogate pair is 4
    else size += 3;
    if (size > max) return false;
  }
  return true;
}

/** `work`'s result, or a rejection as soon as `signal` aborts. */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    work.then(resolve, reject);
  });
}
