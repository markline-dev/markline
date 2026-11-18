// The links markline won't render: javascript:, data:, vbscript: and file:
// URLs, read as a browser reads them. Every other link (a path, #anchor,
// http(s):, mailto:, tel:, an app's own scheme such as vscode:) is kept as
// written. One rule for links in pages, in components and in markline.json,
// shared by the pages and the build. A dropped link is shown as its text.

const BLOCKED = new Set(["javascript", "data", "vbscript", "file"]);

/** How the rule is described in warnings and the docs. */
export const BLOCKED_LINKS = "javascript:, data:, vbscript: or file: URLs";

/** The scheme a URL has as a browser reads it: leading spaces and control
 *  characters dropped, tabs and newlines removed anywhere. */
function schemeOf(url) {
  const read = url.replace(/^[\u0000- ]+/, "").replace(/[\t\n\r]/g, "");
  return read.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
}

/** `url` trimmed, unless markline won't link to it; else undefined. The
 *  scheme is read from what's returned, the string the browser gets: trim()
 *  also drops no-break spaces, a BOM and other Unicode spaces. */
export function safeHref(url) {
  if (typeof url !== "string") return undefined;
  const u = url.trim();
  if (!u) return undefined;
  const scheme = schemeOf(u);
  return scheme && BLOCKED.has(scheme) ? undefined : u;
}

/** A link as quoted in a warning: as written, cut to 60 characters. */
export function quoteHref(url) {
  const u = String(url).trim();
  return JSON.stringify(u.length > 60 ? `${u.slice(0, 57)}…` : u);
}
