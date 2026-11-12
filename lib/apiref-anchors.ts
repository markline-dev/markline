/**
 * Ids for the operations on one API reference page. Pure, so it's unit-tested.
 *
 * Each operation's id is its own slug when that's free. A repeat (two operations
 * with one summary) gets -1, -2, … — skipping any other operation's own slug, and
 * the page's own ids — so the first keeps its id and existing links still land
 * on it. The rule headings follow (`lib/toc`), so "x", "x", "x 1" are x, x-2, x-1.
 */
export function uniqueAnchors(bases: string[], reserved: Iterable<string> = []): string[] {
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
