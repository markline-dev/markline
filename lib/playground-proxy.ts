/* The Try it proxy's rules, kept pure so they're unit-tested:
 * app/api/playground/route.ts applies them. */

/** The most the proxy reads from an upstream response, after decompression. */
export const MAX_PROXY_RESPONSE_BYTES = 25 * 1024 * 1024;

/** The most it reads of a request: room for a 25 MB upload as base64 in JSON. */
export const MAX_PROXY_REQUEST_BYTES = 35 * 1024 * 1024;

/** How long an upstream gets to answer in full. Generation APIs can take minutes. */
export const UPSTREAM_TIMEOUT_MS = 120_000;

/** The http(s) origins of these URLs. A relative server URL has none, and nor
 *  does a templated one (https://{region}.api.example.com): it parses, but no
 *  request's origin could ever match it. */
export function originsOf(urls: (string | undefined)[]): string[] {
  const origins = new Set<string>();
  for (const url of urls) {
    if (url?.includes("{")) continue;
    try {
      const { origin, protocol } = new URL(url ?? "");
      if (protocol === "http:" || protocol === "https:") origins.add(origin);
    } catch {
      // not absolute
    }
  }
  return [...origins];
}

/** Headers about this request's own connection, or the reader's session on the
 *  docs site, rather than the API call. */
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
  "x-real-ip",
  "via",
]);

/** What to send upstream of the headers Try it asked for. Everything else stays,
 *  including Authorization and an API's own key headers. */
export function forwardableHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const lower = name.toLowerCase();
      return !DROPPED_HEADERS.has(lower) && !lower.startsWith("proxy-") && !lower.startsWith("x-forwarded-");
    }),
  );
}

/**
 * A request's or response's text, or null as soon as it's over `max` bytes. A
 * Content-Length over `max` is taken at its word, and one under it isn't relied
 * on. For a response, the caller should then abort the request: that's what drops
 * the connection, since cancelling a body Next has cloned waits for its other
 * copy, which nothing is reading.
 */
export async function readCapped(res: Pick<Response, "body" | "headers">, max = MAX_PROXY_RESPONSE_BYTES): Promise<string | null> {
  if (!res.body) return "";
  if (Number(res.headers.get("content-length")) > max) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) return null;
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
