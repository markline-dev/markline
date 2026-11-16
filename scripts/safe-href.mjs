// The links markline renders: a path or #anchor on the site, or an http:,
// https:, mailto: or tel: URL. Anything else (javascript:, data:, file:, …)
// is shown as its text, with a warning. One rule for links in pages, in
// components and in markline.json, shared by the pages and the build.

/** How the allowed links are described in warnings and the docs. */
export const ALLOWED_LINKS = "a path, a #anchor, or an http:, https:, mailto: or tel: URL";

/** `url` as written if markline renders it as a link, else undefined. */
export function safeHref(url) {
  if (typeof url !== "string") return undefined;
  const u = url.trim();
  if (!u) return undefined;
  // Relative: /a, #x, ?q, ./a, ../a, or a/b with no scheme before the first / ? #.
  if (/^[/#?.]/.test(u) || /^[^:/?#]+([/?#]|$)/.test(u)) return u;
  return /^(https?:|mailto:|tel:)/i.test(u) ? u : undefined;
}

/** A link as quoted in a warning: as written, cut to 60 characters. */
export function quoteHref(url) {
  const u = String(url).trim();
  return JSON.stringify(u.length > 60 ? `${u.slice(0, 57)}…` : u);
}
