/**
 * Ids for the operations and WebSocket channels on one API reference page: the
 * one copy of the rule, which the pages (lib/apiref-view.ts) and the build's
 * search records and llms files (asyncapi-build.mjs) both use, so a link the
 * build writes lands on the id the page renders.
 *
 * Each item's id is its own slug when that's free. A repeat (two operations with
 * one summary) gets -1, -2, … — skipping any other item's own slug, and the
 * page's own ids — so the first keeps its id and existing links still land on
 * it. The rule headings follow (`lib/toc`), so "x", "x", "x 1" are x, x-2, x-1.
 */

/** A name as an id: lowercase, runs of other characters as "-" (the same as tagSlug). */
export const anchorSlug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function uniqueAnchors(bases, reserved = []) {
  const own = new Set(bases);
  const used = new Set(reserved);
  return bases.map((base) => {
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    for (let n = 1; ; n++) {
      const id = `${base}-${n}`;
      if (used.has(id) || own.has(id)) continue;
      used.add(id);
      return id;
    }
  });
}

/**
 * The ids on the page for resource `pageSlug`: its operations' (in page order),
 * then its channels'. The page's own ids are never taken: the resource, its
 * object, its endpoint list, and `eventIds` (its events' anchors).
 */
export function pageAnchors(pageSlug, operations, channels = [], eventIds = []) {
  const reserved = [pageSlug, `${pageSlug}-object`, `ep-panels-${pageSlug}`, ...eventIds];
  const bases = [
    ...operations.map((o) => anchorSlug(o.summary ?? o.operationId) || o.operationId),
    ...channels.map((c) => anchorSlug(c.title ?? c.address) || "channel"),
  ];
  const ids = uniqueAnchors(bases, reserved);
  return { operations: ids.slice(0, operations.length), channels: ids.slice(operations.length) };
}
