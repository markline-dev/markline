/**
 * Changelog rules shared by the pages and the build script's feed: entry
 * dates, permalinks, heading ids and paging. Pure (no `@/` imports, no fs) so
 * it can be unit-tested.
 *
 * Entries are MDX files in `<content>/changelog/`, one per release, named
 * `YYYY-MM-DD.mdx` (or with a `date:` in frontmatter). They're listed at
 * /changelog, newest first, and each has its own page at /changelog/YYYY/MM/DD.
 */

export const CHANGELOG_PATH = "/changelog";
export const PER_PAGE = 10;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` from frontmatter `date` (a string or a YAML date), else the
 *  file name. Undefined when neither is a valid date. */
export function entryDate(fmDate: unknown, fileName: string): string | undefined {
  const fromFm =
    fmDate instanceof Date && !Number.isNaN(fmDate.getTime())
      ? fmDate.toISOString().slice(0, 10)
      : typeof fmDate === "string"
        ? fmDate.trim().slice(0, 10)
        : undefined;
  const candidates = [fromFm, fileName.replace(/\.mdx?$/, "")];
  return candidates.find((d): d is string => !!d && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)));
}

/** "/changelog/2026/10/26" */
export function entryPath(date: string): string {
  return `${CHANGELOG_PATH}/${date.replace(/-/g, "/")}`;
}

/** The date a changelog slug points at: ["changelog","2026","10","26"] → "2026-10-26". */
export function dateFromSlug(slug: string[]): string | undefined {
  if (slug.length !== 4 || slug[0] !== CHANGELOG_PATH.slice(1)) return undefined;
  const d = slug.slice(1).join("-");
  return DATE.test(d) ? d : undefined;
}

/** The listing page a slug points at: ["changelog"] → 1, ["changelog","page","2"] → 2. */
export function pageFromSlug(slug: string[]): number | undefined {
  if (slug[0] !== CHANGELOG_PATH.slice(1)) return undefined;
  if (slug.length === 1) return 1;
  if (slug.length === 3 && slug[1] === "page" && /^[1-9]\d*$/.test(slug[2])) return Number(slug[2]);
  return undefined;
}

export function pagePath(page: number): string {
  return page <= 1 ? CHANGELOG_PATH : `${CHANGELOG_PATH}/page/${page}`;
}

export function pageCount(total: number, perPage = PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** "October 26, 2026", in UTC so the build machine's timezone can't shift it. */
export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Headings repeat across entries ("All changes"), so each entry's ids are
 *  prefixed with its date: "2026-10-26-all-changes". */
export function headingId(date: string, slug: string): string {
  return slug ? `${date}-${slug}` : date;
}
