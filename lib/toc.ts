/* "On this page", built from a page's own ## and ### headings when its
 * frontmatter doesn't list them. Pure, so it's unit-tested. The heading ids
 * here and in components/docs/mdx.tsx both come from slugify(), so the links
 * land. */

export type TocItem = { id: string; label: string; depth?: 2 | 3 };

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Inline markdown in a heading → its visible text. */
export function headingText(md: string): string {
  // Code spans are lifted out first and put back last: their content is literal,
  // so `create <volume>` must keep "<volume>" (the rendered heading does), and
  // `__x__` must not be read as emphasis.
  const code: string[] = [];
  return md
    .replace(/`([^`]*)`/g, (_, c: string) => `\u0000${code.push(c) - 1}\u0000`) // code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/<[^>]+>/g, "") // inline JSX / HTML
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2") // emphasis
    .replace(/\s+#+\s*$/, "") // closing #s
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => code[Number(i)])
    .trim();
}

/** The page's ## and ### headings, in order, skipping fenced code. */
export function extractToc(body: string): TocItem[] {
  const items: TocItem[] = [];
  let fence: string | null = null;
  for (const line of body.split("\n")) {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    if (!h) continue;
    const label = headingText(h[2]);
    const id = slugify(label);
    if (label && id) items.push({ id, label, depth: h[1].length as 2 | 3 });
  }
  return items;
}
