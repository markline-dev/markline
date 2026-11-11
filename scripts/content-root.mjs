// Where the build reads a site's content from, the same as lib/paths.ts
// contentRoot(): MARKLINE_CONTENT if it's set (the CLI always sets it), else the
// repo's own site/ when it has a markline.json, else content/.

import fs from "node:fs";
import path from "node:path";

export function contentRootFrom(configured, cwd = process.cwd()) {
  if (configured && configured.length > 0) return path.isAbsolute(configured) ? configured : path.join(cwd, configured);
  const site = path.join(cwd, "site");
  if (fs.existsSync(path.join(site, "markline.json"))) return site;
  return path.join(cwd, "content");
}
