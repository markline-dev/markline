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

/** Whether `text` is exactly what an older build wrote for this top-level file. */
export function looksGenerated(rel, text, name) {
  const title = `^# ${escape(name)}\\n\\n(?:> [^\\n]*\\n\\n)?`;
  switch (rel) {
    case "robots.txt":
      return /^User-agent: \*\nAllow: \/\n(?:\nSitemap: \S+\/sitemap\.xml\n)?$/.test(text);
    case "sitemap.xml":
      return /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n(?:  <url>\n    <loc>[^<\n]*<\/loc>\n    <changefreq>weekly<\/changefreq>\n  <\/url>\n)*<\/urlset>\n$/.test(text);
    case "llms.txt":
      return new RegExp(`${title}This index lists the documentation\\. The full text of every page concatenated into one file is available at \\[llms-full\\.txt\\]`).test(text);
    case "llms-full.txt":
      return new RegExp(`${title}---\\n\\n# `).test(text);
    default:
      return false;
  }
}

/**
 * A check for "is public/<rel> the site's own?". `sitePublic` is the project's
 * public/ folder when the CLI gave one (a path that isn't there means the site
 * has none); otherwise `appPublic` itself is the site's.
 */
export function siteFiles({ appPublic, sitePublic, name }) {
  return (rel) => {
    if (sitePublic !== undefined) return fs.existsSync(path.join(sitePublic, rel));
    const file = path.join(appPublic, rel);
    if (!fs.existsSync(file)) return false;
    try {
      return !looksGenerated(rel, fs.readFileSync(file, "utf8"), name);
    } catch {
      return true;
    }
  };
}
