import fs from "node:fs";
import path from "node:path";

/**
 * Whether URL segments are safe to join onto a folder. Route handlers get their
 * params decoded, so `/..%2fprivate.md` arrives with a literal `..` in it.
 */
export function isSafeSlug(slug: string[]): boolean {
  return slug.every((s) => s !== "." && s !== ".." && !/[/\\\0]/.test(s));
}

/**
 * A page route's slug as the file it names. Next gives page routes their
 * segments still percent-encoded ("Getting%20Started", "caf%C3%A9"); route
 * handlers get them decoded, so this is for pages only. Each segment is
 * decoded and NFC-normalised, then checked like any other slug, so an encoded
 * ".." or "/" is refused as the plain one is. `null` means no such page;
 * `undefined` is the root.
 */
export function pageSlug(segments: string[] | undefined): string[] | undefined | null {
  if (!segments) return undefined;
  let decoded: string[];
  try {
    decoded = segments.map((s) => decodeURIComponent(s).normalize("NFC"));
  } catch {
    return null;
  }
  return isSafeSlug(decoded) ? decoded : null;
}

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
