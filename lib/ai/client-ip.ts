/**
 * Which address the AI route's per-IP limits count a reader by.
 *
 * Proxies append the address they see to x-forwarded-for, so the entries on the
 * right come from the proxies a site runs, and anything to their left came with
 * the request. By default the right-most entry is used (one proxy in front);
 * `trustedProxies` says how many there are. `ipHeader` names a header the host
 * sets itself instead, such as cf-connecting-ip, and then only that is read.
 *
 * Next sets x-forwarded-for only when a request arrives without one, so with no
 * proxy in front the header is whatever the request carried. That's why the
 * docs say to run behind a proxy or set `ipHeader`.
 */

export type ClientIpOptions = { trustedProxies?: number; ipHeader?: string };

/** What every reader shares when there's no usable address. */
export const UNKNOWN = "unknown";

export function clientIp(headers: Headers, { trustedProxies = 1, ipHeader }: ClientIpOptions = {}): string {
  if (ipHeader) return headers.get(ipHeader)?.split(",")[0]?.trim() || UNKNOWN;
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - trustedProxies]?.toLowerCase() || UNKNOWN;
}

/** The most proxies `trustedProxies` may name. */
export const MAX_PROXIES = 10;

/** Headers a site's host never sets to the reader's address. */
const NOT_AN_ADDRESS = new Set(["host", "cookie", "authorization", "origin", "referer", "user-agent", "content-type", "content-length", "x-forwarded-for"]);

/** A header name `ipHeader` may be: a plain token that isn't one of those. */
export function validIpHeader(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const name = v.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(name) && !NOT_AN_ADDRESS.has(name) ? name : undefined;
}

export function validProxies(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_PROXIES ? v : undefined;
}
