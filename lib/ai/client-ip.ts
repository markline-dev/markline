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

/**
 * One address as a reader's key: without "[…]" around an IPv6 address or a
 * ":port" after one (some proxies write "1.2.3.4:5678"), lowercase, so one
 * reader on several connections counts once.
 */
export function normalizeIp(entry: string): string {
  const s = entry.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracketed) return bracketed[1].toLowerCase();
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(s);
  return (v4 ? v4[1] : s).toLowerCase();
}

/** The entry `fromRight` places from the right of a comma list, normalised. */
function fromRight(value: string | null, fromRight: number): string {
  const entries = (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const entry = entries[entries.length - fromRight];
  return entry ? normalizeIp(entry) || UNKNOWN : UNKNOWN;
}

export function clientIp(headers: Headers, { trustedProxies = 1, ipHeader }: ClientIpOptions = {}): string {
  // A host's own header has one address; if it's a list, the right-most entry
  // is the one the host added, as with x-forwarded-for.
  if (ipHeader) return fromRight(headers.get(ipHeader), 1);
  return fromRight(headers.get("x-forwarded-for"), trustedProxies);
}

/** The most proxies `trustedProxies` may name. */
export const MAX_PROXIES = 10;

/** Headers a site's host never sets to the reader's address. */
const NOT_AN_ADDRESS = new Set([
  "host", "cookie", "set-cookie", "authorization", "proxy-authorization", "origin", "referer", "user-agent",
  "x-forwarded-for",
  // Its own syntax ("for=…;proto=…"), which isn't read here.
  "forwarded",
]);

/** A header name `ipHeader` may be: a plain token that isn't one of those. */
export function validIpHeader(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const name = v.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(name) && !NOT_AN_ADDRESS.has(name) && !name.startsWith("content-") ? name : undefined;
}

export function validProxies(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_PROXIES ? v : undefined;
}
