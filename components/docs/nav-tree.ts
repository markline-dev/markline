/* Walking the docs sidebar tree. No app imports, so it can be unit-tested. */

import type { DocSection, DocLink } from "./nav";

/** Where a page sits in the sidebar: its group and the chain of items from
 *  the top of that group down to the page itself. */
export function findNavTrail(
  sections: DocSection[],
  pathname: string,
): { section: DocSection; chain: DocLink[] } | undefined {
  const walk = (links: DocLink[], chain: DocLink[]): DocLink[] | undefined => {
    for (const l of links) {
      const here = [...chain, l];
      if (l.href === pathname) return here;
      const found = walk(l.children ?? [], here);
      if (found) return found;
    }
    return undefined;
  };
  for (const section of sections) {
    const chain = walk(section.links, []);
    if (chain) return { section, chain };
  }
  return undefined;
}

/** Every page in sidebar order, depth first — nested pages included, folders
 *  (items with no `href`) skipped. */
export function flattenLinks(links: DocLink[]): { href: string; label: string }[] {
  return links.flatMap((l) => [
    ...(l.href ? [{ href: l.href, label: l.label }] : []),
    ...flattenLinks(l.children ?? []),
  ]);
}

/**
 * The other pages in the same sidebar folder as `pathname` (its "collection"),
 * in sidebar order, for `layout.relatedArticles: "collection"`. A page that
 * sits directly in a named group gets that group's pages instead; one at the
 * top of an unnamed group (a lone "Home") gets none.
 */
export function collectionLinks(
  sections: DocSection[],
  pathname: string,
  limit = 5,
): { href: string; label: string }[] {
  const trail = findNavTrail(sections, pathname);
  if (!trail) return [];
  const parent = trail.chain.at(-2);
  const pool = parent ? flattenLinks(parent.children ?? []) : trail.section.title ? flattenLinks(trail.section.links) : [];
  return pool.filter((l) => l.href !== pathname).slice(0, limit);
}
