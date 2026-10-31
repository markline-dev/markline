import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import type { MDXComponents } from "mdx/types";
import { mdxComponents, textOf } from "./mdx";
import { prettyCodeOptions } from "./mdx-options";
import { DocsToc } from "./nav";
import { SiteCredit } from "../site-credit";
import { extractToc, slugify, type TocItem } from "@/lib/toc";
import type { ChangelogEntry } from "@/lib/changelog";
import {
  CHANGELOG_PATH, entryPath, formatDate, headingId, pagePath,
} from "@/lib/changelog-core";

/**
 * The changelog (`<content>/changelog/*.mdx`): entries newest first, each with
 * its date in a sticky column on the left and its notes on the right. The list
 * is paged at /changelog, /changelog/page/2, …; each entry also has its own
 * page at /changelog/YYYY/MM/DD. "On this page" lists the dates, with each
 * entry's headings under them.
 */

/** MDX components for one entry: its headings get ids prefixed with its date,
 *  since the same heading ("All changes") repeats from entry to entry. */
function entryComponents(date: string): MDXComponents {
  const id = (children: React.ReactNode) => headingId(date, slugify(textOf(children)));
  return {
    ...mdxComponents,
    h2: ({ children }) => <h3 id={id(children)}>{children}</h3>,
    h3: ({ children }) => <h3 id={id(children)}>{children}</h3>,
  };
}

/** The date, then the entry's own headings under it. */
export function changelogToc(entries: ChangelogEntry[]): TocItem[] {
  return entries.flatMap((e) => [
    { id: e.date, label: formatDate(e.date), depth: 2 as const },
    ...extractToc(e.body).map((h) => ({ id: headingId(e.date, h.id), label: h.label, depth: 3 as const })),
  ]);
}

/** The site's basePath: plain links (the feed is a file, not a page) don't
 *  get it from next/link. */
const BASE = process.env.NEXT_PUBLIC_MARKLINE_BASE_PATH ?? "";

const RssIcon = (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
    <circle cx="5" cy="19" r="1.2" fill="currentColor" />
  </svg>
);

function Entry({ entry, linkDate = true }: { entry: ChangelogEntry; linkDate?: boolean }) {
  const date = formatDate(entry.date);
  return (
    <article className="cl-entry" id={entry.date}>
      <div className="cl-side">
        {linkDate ? (
          <Link className="cl-date" href={entryPath(entry.date)}>{date}</Link>
        ) : (
          <span className="cl-date">{date}</span>
        )}
        {entry.tags.length > 0 && (
          <ul className="cl-tags">
            {entry.tags.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
      </div>
      <div className="cl-body docs-prose">
        {entry.title && <p className="cl-summary">{entry.title}</p>}
        <MDXRemote
          source={entry.body}
          components={entryComponents(entry.date)}
          options={{
            mdxOptions: { format: "mdx", remarkPlugins: [remarkGfm], rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]] },
            blockJS: false,
          }}
        />
      </div>
    </article>
  );
}

export function ChangelogView({
  title,
  lede,
  intro,
  entries,
  page,
  pages,
  rss,
  credit,
}: {
  title: string;
  lede?: string;
  /** The body of `docs/changelog.mdx`, shown above the entries, if it exists. */
  intro?: React.ReactNode;
  /** The entries on this page. */
  entries: ChangelogEntry[];
  page: number;
  pages: number;
  /** Whether the RSS feed exists (it needs `seo.metadataBase`). */
  rss: boolean;
  credit: boolean;
}) {
  return (
    <>
      <main className="docs-main cl-main">
        <header className="cl-head">
          <h1 className="docs-h1">{title}</h1>
          {rss && (
            <a className="cl-rss" href={`${BASE}${CHANGELOG_PATH}/rss.xml`}>
              Subscribe via RSS {RssIcon}
            </a>
          )}
        </header>
        {lede && <p className="docs-lead">{lede}</p>}
        {intro && <div className="docs-prose cl-intro">{intro}</div>}
        <div className="cl-list">
          {entries.map((e) => <Entry key={e.date} entry={e} />)}
        </div>
        {pages > 1 && (
          <nav className="cl-pager" aria-label="Changelog pages">
            {page > 1 ? <Link href={pagePath(page - 1)}>← Newer</Link> : <span />}
            <span className="cl-pageno">Page {page} of {pages}</span>
            {page < pages ? <Link href={pagePath(page + 1)}>Older →</Link> : <span />}
          </nav>
        )}
        {credit && <SiteCredit />}
      </main>
      <DocsToc items={changelogToc(entries)} helpful={false} />
    </>
  );
}

/** One entry on its own page, with links to the entries either side. */
export function ChangelogEntryView({
  entry,
  newer,
  older,
  credit,
}: {
  entry: ChangelogEntry;
  newer?: ChangelogEntry;
  older?: ChangelogEntry;
  credit: boolean;
}) {
  return (
    <>
      <main className="docs-main cl-main">
        <Link className="cl-back" href={CHANGELOG_PATH}>← Changelog</Link>
        <h1 className="docs-h1">{entry.title ?? formatDate(entry.date)}</h1>
        <div className="cl-list">
          <Entry entry={{ ...entry, title: undefined }} linkDate={false} />
        </div>
        <nav className="cl-pager" aria-label="Other entries">
          {newer ? <Link href={entryPath(newer.date)}>← {formatDate(newer.date)}</Link> : <span />}
          <span />
          {older ? <Link href={entryPath(older.date)}>{formatDate(older.date)} →</Link> : <span />}
        </nav>
        {credit && <SiteCredit />}
      </main>
      <DocsToc items={changelogToc([entry])} helpful={false} />
    </>
  );
}
