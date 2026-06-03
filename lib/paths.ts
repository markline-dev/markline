import fs from "node:fs";
import path from "node:path";

/**
 * Root directory that holds docs content (the `docs/` and `api/` subtrees).
 *
 * Configurable via the `MARKLINE_CONTENT` env var, which may be absolute or
 * relative to the process cwd. The CLI always sets this to the consumer's
 * project. When unset (running the framework repo directly), it defaults to
 * the repo's own site in `site/` — Markline's docs + landing page — so the
 * repo is self-documenting out of the box. Falls back to `content` otherwise.
 *
 * This is also what lets a consumer's (private) content live outside the repo
 * — e.g. `MARKLINE_CONTENT=../_docs`.
 */
export function contentRoot(): string {
  const configured = process.env.MARKLINE_CONTENT;
  if (configured && configured.length > 0) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  const site = path.join(process.cwd(), "site");
  if (fs.existsSync(path.join(site, "markline.json"))) return site;
  return path.join(process.cwd(), "content");
}
