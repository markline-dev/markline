// Which files in public/ are the site's own, so the build never writes over them:
// its llms.txt, robots.txt, a page's .md and so on.
//
// With the CLI, the build runs on a copy of the project's public/ that's kept
// between runs, so a file there may be one an earlier build wrote. The CLI says
// where the project's own public/ is (MARKLINE_SITE_PUBLIC), and only a file
// there is the site's. Without the CLI (building this repo itself), public/ is
// the site's own folder: a file the last build wrote has been removed by its
// manifest first, so one still there is the site's, unless it's one an older
// Markline wrote before these files were in the manifest.

import fs from "node:fs";
import path from "node:path";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every line of an llms.txt index as a build writes it: our sentences,
 *  section headings and page links. Any other line is someone's own. */
const INDEX_LINE = [
  /^This index lists the documentation\. The full text of every page concatenated into one file is available at \[llms-full\.txt\]\([^)\s]*\)\.$/,
  /^Add `\.md` to any page's URL for its Markdown/,
  /^## \S.*$/,
  /^### \S.*$/, // API reference sections
  /^- \[[^\]\n]*\]\([^)\s]*\)(?:: .*)?$/,
];

/**
 * Whether `text` is exactly what an older build wrote for this top-level file.
 * Narrow on purpose: without the CLI, public/ is the site's own folder, and a
 * wrong guess would write over someone's work. llms-full.txt is all page text,
 * which no pattern can tell from a hand edit, so only an exact match counts
 * for it (see siteFiles).
 */
export function looksGenerated(rel, text, name) {
  switch (rel) {
    case "robots.txt":
      return /^User-agent: \*\nAllow: \/\n(?:\nSitemap: \S+\/sitemap\.xml\n)?$/.test(text);
    case "sitemap.xml":
      return /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n(?:  <url>\n    <loc>[^<\n]*<\/loc>\n    <changefreq>weekly<\/changefreq>\n  <\/url>\n)*<\/urlset>\n$/.test(text);
    case "llms.txt": {
      const head = new RegExp(`^# ${escape(name)}\\n\\n(?:> [^\\n]*\\n\\n)?`).exec(text);
      if (!head || !text.endsWith("\n")) return false;
      const lines = text.slice(head[0].length, -1).split("\n").filter((l) => l !== "");
      return INDEX_LINE[0].test(lines[0] ?? "") && lines.every((l) => INDEX_LINE.some((re) => re.test(l)));
    }
    default:
      return false;
  }
}

/**
 * A check for "is public/<rel> the site's own?", given the `text` the build
 * would write there. `sitePublic` is the project's public/ folder when the CLI
 * gave one (a path that isn't there means the site has none); otherwise
 * `appPublic` itself is the site's, and a file there is ours only if it's what
 * we'd write now or exactly what an older build wrote.
 */
export function siteFiles({ appPublic, sitePublic, name }) {
  return (rel, text) => {
    if (sitePublic !== undefined) return fs.existsSync(path.join(sitePublic, rel));
    const file = path.join(appPublic, rel);
    if (!fs.existsSync(file)) return false;
    try {
      const now = fs.readFileSync(file, "utf8");
      return now !== text && !looksGenerated(rel, now, name);
    } catch {
      return true;
    }
  };
}
