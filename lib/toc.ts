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
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/<[^>]+>/g, "") // inline JSX / HTML
    .replace(/`([^`]*)`/g, "$1") // code
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2") // emphasis
    .replace(/\s+#+\s*$/, "") // closing #s
    .trim();
}

/** A JSX attribute's string value: title="…", title='…' or title={"…"}. */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)\\s*\\})`));
  return m ? (m.slice(1).find((v) => v !== undefined) ?? "") : undefined;
}

/**
 * The page's ## and ### headings, in order, skipping fenced code.
 *
 * Step titles are listed too inside `<Steps toc>`, or in every <Steps> with
 * `steps: true` (frontmatter `toc: steps`). A step sits one level below the
 * ## heading before it, or at the top level when there's none.
 */
export function extractToc(body: string, opts: { steps?: boolean } = {}): TocItem[] {
  const items: TocItem[] = [];
  let fence: string | null = null;
  let inSteps = false;
  let listSteps = false;
  let underH2 = false;
  for (const line of body.split("\n")) {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    // <Steps …> opens a list, </Steps> closes it; each <Step title> is a step.
    for (const tag of line.match(/<\/?Steps?\b(?:[^>"']|"[^"]*"|'[^']*')*>/g) ?? []) {
      if (tag.startsWith("</Steps")) inSteps = false;
      else if (/^<Steps\b/.test(tag)) {
        inSteps = true;
        listSteps = !!opts.steps || /\btoc\b(?!\s*=\s*\{\s*false\s*\})/.test(tag.slice(6));
      } else if (/^<Step\b/.test(tag) && inSteps && listSteps) {
        const label = headingText(attr(tag, "title") ?? "");
        const id = slugify(label);
        if (label && id) items.push({ id, label, depth: underH2 ? 3 : 2 });
      }
    }
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    if (!h) continue;
    const label = headingText(h[2]);
    const id = slugify(label);
    if (h[1].length === 2) underH2 = true;
    if (label && id) items.push({ id, label, depth: h[1].length as 2 | 3 });
  }
  return items;
}
