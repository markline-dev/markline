const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

/**
 * The resources that get a page, in sidebar order — mirroring normalize() in
 * lib/openapi.ts, so llms.txt and the sitemap never link to a page that
 * doesn't exist:
 *
 *  - An operation is filed under its *first* tag only, and untagged
 *    operations under "Default". A tag that's only ever a second tag, or
 *    declared at the root but used by no operation, gets no page.
 *  - Order: tags declared at the document root first, in declared order, then
 *    the rest alphabetically.
 */
export function orderedResourceTags(spec) {
  const withPages = new Set();
  for (const item of Object.values(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (op) withPages.add(op.tags?.[0] ?? "Default");
    }
  }

  const declared = (spec.tags ?? []).map((tag) => tag.name).filter((name) => withPages.has(name));
  const declaredSet = new Set(declared);
  const rest = [...withPages].filter((name) => !declaredSet.has(name)).sort((a, b) => a.localeCompare(b));
  return [...new Set(declared), ...rest];
}
