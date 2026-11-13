// A site path, as written from its file's name, as a URL: "/Getting Started"
// → "/Getting%20Started", "/café" → "/caf%C3%A9". The name is encoded as it
// is, never decoded first: a file named "a%2F.mdx" is the page "/a%252F". A
// query or #hash is kept as written, and anything that isn't a path on this
// site (https://…, mailto:, #top) is returned unchanged. Shared by the build
// (sitemap, llms.txt, search) and the pages' links.

export function pathHref(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const [p, rest] = cut < 0 ? [href, ""] : [href.slice(0, cut), href.slice(cut)];
  return p.split("/").map((s) => encodeURIComponent(s.normalize("NFC"))).join("/") + rest;
}

/**
 * A site path an author wrote (markline.json navigation, frontmatter
 * `related`/`crumbs`) as the file-name form pathHref takes: each segment
 * decoded, so "/Getting Started" and "/Getting%20Started" are the same page,
 * and NFC. A bad escape is kept as written. A query or #hash, and anything that
 * isn't a path on this site, are left alone.
 */
export function hrefAsPath(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const [p, rest] = cut < 0 ? [href, ""] : [href.slice(0, cut), href.slice(cut)];
  const decode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return p.split("/").map((s) => decode(s).normalize("NFC")).join("/") + rest;
}
