/**
 * Keeps credentials out of the code Try it shows (the rail's cURL and the
 * explorer's cURL / Node / Python / Go), while the request itself sends them.
 * Pure, so the masking is unit-tested; components/docs/api/playground.tsx uses it.
 */

/** Where the operation's API keys go, from its security schemes. */
export type Secrets = {
  /** `Authorization: Bearer …` is in use. */
  bearer: boolean;
  /** API-key headers (names compared case-insensitively). */
  headers: string[];
  /** API-key query parameters. */
  query: string[];
  /** API-key cookies, inside a `Cookie` header. */
  cookies: string[];
};

/** What a hidden value is shown as: "<api-key>" in the rail, "••••" in the explorer. */
export type Mask = { key: string; bearer: string };

export const RAIL_MASK: Mask = { key: "<api-key>", bearer: "Bearer <token>" };
export const CODE_MASK: Mask = { key: "••••", bearer: "Bearer ••••" };

/** The secrets of a Try it spec. */
export function secretsOf(spec: { bearer: boolean; apiKeyHeaders: { name: string }[]; apiKeyQuery?: string[]; apiKeyCookies?: string[] }): Secrets {
  return {
    bearer: spec.bearer,
    headers: spec.apiKeyHeaders.map((h) => h.name),
    query: spec.apiKeyQuery ?? [],
    cookies: spec.apiKeyCookies ?? [],
  };
}

const lower = (list: string[]) => new Set(list.map((n) => n.toLowerCase()));

/** One header's value as shown: a key or token masked, anything else as is. */
export function maskHeader(name: string, value: string, secrets: Secrets, mask: Mask): string {
  const n = name.toLowerCase();
  if (n === "authorization" && secrets.bearer) return mask.bearer;
  if (lower(secrets.headers).has(n)) return mask.key;
  if (n === "cookie" && secrets.cookies.length) return maskCookie(value, secrets, mask);
  return value;
}

/** A `Cookie` header with the API-key cookies' values masked. */
export function maskCookie(value: string, secrets: Secrets, mask: Mask): string {
  const names = new Set(secrets.cookies);
  return value
    .split(";")
    .map((part) => {
      const at = part.indexOf("=");
      const name = (at < 0 ? part : part.slice(0, at)).trim();
      return names.has(name) ? `${part.slice(0, part.indexOf(name))}${name}=${mask.key}` : part;
    })
    .join(";");
}

/** Headers in order, as shown. */
export function maskHeaders(headers: Record<string, string>, secrets: Secrets, mask: Mask): [string, string][] {
  return Object.entries(headers).map(([k, v]) => [k, maskHeader(k, v, secrets, mask)]);
}

/** Query fields as shown: an API-key parameter's value masked. */
export function maskQuery(fields: [string, string][], secrets: Secrets, mask: Mask): [string, string][] {
  const names = new Set(secrets.query);
  return fields.map(([k, v]) => [k, names.has(k) ? mask.key : v]);
}

/** A URL as shown: an API-key parameter's value in its query string masked. */
export function maskUrl(url: string, secrets: Secrets, mask: Mask): string {
  if (!secrets.query.length) return url;
  const q = url.indexOf("?");
  if (q < 0) return url;
  const hash = url.indexOf("#", q);
  const query = url.slice(q + 1, hash < 0 ? undefined : hash);
  const names = new Set(secrets.query);
  const shown = query
    .split("&")
    .map((pair) => {
      const at = pair.indexOf("=");
      const name = decodeComponent(at < 0 ? pair : pair.slice(0, at));
      // Display text, not a request: the mask is shown as is.
      return names.has(name) ? `${pair.slice(0, at < 0 ? pair.length : at)}=${mask.key}` : pair;
    })
    .join("&");
  return url.slice(0, q + 1) + shown + (hash < 0 ? "" : url.slice(hash));
}

function decodeComponent(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}
