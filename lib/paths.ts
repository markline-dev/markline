import path from "node:path";

/**
 * Root directory that holds docs content (the `docs/` and `api/` subtrees).
 *
 * Configurable via the `MARKLINE_CONTENT` env var, which may be absolute or
 * relative to the process cwd. Defaults to `<cwd>/content` for backwards
 * compatibility.
 *
 * This is what lets the public framework live in the git repo while a
 * consumer's (private) content lives outside it — e.g. `../_docs`.
 */
export function contentRoot(): string {
  const configured = process.env.MARKLINE_CONTENT;
  if (configured && configured.length > 0) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "content");
}
