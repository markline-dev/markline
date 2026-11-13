// A site path as a URL: "/Getting Started" → "/Getting%20Started",
// "/café" → "/caf%C3%A9". Each segment is decoded first, so a path that's
// already encoded comes out the same, not encoded twice. A query or #hash is
// kept as written, and anything that isn't a path on this site (https://…,
// mailto:, #top) is returned unchanged. Shared by the build (sitemap, llms.txt,
// search) and the pages' links.

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function pathHref(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const [p, rest] = cut < 0 ? [href, ""] : [href.slice(0, cut), href.slice(cut)];
  return p.split("/").map((s) => encodeURIComponent(decode(s).normalize("NFC"))).join("/") + rest;
}
