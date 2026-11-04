import Link from "next/link";
import { DocsToc } from "./nav";
import { DocAiRow } from "./doc-actions";
import { LinkList, LinkItem } from "./authoring";
import { SiteCredit } from "../site-credit";

export type Crumb = { label: string; href?: string };
import type { TocItem } from "@/lib/toc";

export type { TocItem };
export type PageNavLink = { href: string; label: string };

const ChevronLeft = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="m15 6-6 6 6 6" />
  </svg>
);
const ChevronSep = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export function DocsPage({
  crumbs, title, lede, toc, lastUpdated, editUrl, feedbackEndpoint,
  feedbackEnabled = false, aiEnabled = false, prev, next, related = [], hub = false,
  crumbStyle = "slash", actionStyle = "inline", credit = true, children,
}: {
  crumbs: Crumb[];
  /** `layout.breadcrumbs` */
  crumbStyle?: "slash" | "chevron";
  /** `layout.pageActions` */
  actionStyle?: "inline" | "menu";
  title: string;
  lede?: React.ReactNode;
  toc: TocItem[];
  lastUpdated?: string;
  editUrl?: string;
  feedbackEndpoint?: string;
  /** Whether the "Was this page helpful?" widget renders (feedback opt-in). */
  feedbackEnabled?: boolean;
  /** Whether the "Ask AI about this page" affordance renders (AI opt-in). */
  aiEnabled?: boolean;
  prev?: PageNavLink;
  next?: PageNavLink;
  /** "Related articles" at the end of the page. */
  related?: PageNavLink[];
  /** Under a HubHero: the hero already shows the title and lede, and there's
   *  no table of contents. */
  hub?: boolean;
  /** The "Built with Markline" line. Off when the site has a footer, which
   *  carries the credit instead. */
  credit?: boolean;
  children: React.ReactNode;
}) {
  // With the menu-style actions the date sits beside them, not in the footer.
  const footDate = actionStyle === "menu" ? undefined : lastUpdated;
  return (
    <>
      <main className="docs-main">
        {!hub && crumbs.length > 0 && (
          <nav className={`docs-bc docs-bc--${crumbStyle}`} aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="bc-seg">
                {i > 0 && <span className="sep" aria-hidden>{crumbStyle === "chevron" ? ChevronSep : "/"}</span>}
                {c.href ? (
                  <a href={c.href}>{c.label}</a>
                ) : (
                  <span className={i === crumbs.length - 1 ? "cur" : undefined}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {!hub && (
          <>
            <h1 className="docs-h1">{title}</h1>
            {lede && <p className="docs-lead">{lede}</p>}
            <DocAiRow
              title={title}
              aiEnabled={aiEnabled}
              variant={actionStyle}
              lastUpdated={actionStyle === "menu" ? lastUpdated : undefined}
            />
          </>
        )}

        <div className="docs-prose">{children}</div>

        {related.length > 0 && (
          <section className="doc-related" aria-labelledby="related-articles">
            <h2 id="related-articles">Related articles</h2>
            <LinkList>
              {related.map((r) => (
                <LinkItem key={r.href} href={r.href} title={r.label} />
              ))}
            </LinkList>
          </section>
        )}

        {(prev || next) && (
          <nav className={`page-nav${next ? "" : " page-nav--last"}`} aria-label="Previous and next pages">
            {prev &&
              (next ? (
                <Link href={prev.href} className="pn-prev" title={prev.label} aria-label={`Previous: ${prev.label}`}>
                  {ChevronLeft} Previous
                </Link>
              ) : (
                <Link href={prev.href} className="pn-card">
                  <span className="d">{ChevronLeft} Previous</span>
                  <span className="t">{prev.label}</span>
                </Link>
              ))}
            {next && (
              <Link href={next.href} className="pn-card pn-next">
                <span className="t">{next.label}</span>
                <span className="d">Next {ChevronSep}</span>
              </Link>
            )}
          </nav>
        )}

        {(footDate || editUrl) && (
          <div className="doc-foot">
            <span>{footDate ? `Last updated ${footDate}` : ""}</span>
            {editUrl && (
              <a href={editUrl} target="_blank" rel="noreferrer">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                Edit this page on GitHub
              </a>
            )}
          </div>
        )}

        {credit && <SiteCredit />}
      </main>

      {!hub && <DocsToc items={toc} helpful={feedbackEnabled} feedbackEndpoint={feedbackEndpoint} />}
    </>
  );
}

// Prose headings/paragraphs are styled structurally by app/docs.css
// (.docs-prose h2/h3/p), so these emit plain elements with just the anchor id.
export function DocsH2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

export function DocsP({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

const CALLOUT_ICON = {
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  ),
  warn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  ok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function Callout({
  tone = "info", title, children,
}: {
  tone?: "info" | "warn" | "ok";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`callout tone-${tone}`}>
      <span className="ic">{CALLOUT_ICON[tone]}</span>
      <div className="callout-body">
        {title && <strong>{title}</strong>}{title && " "}
        {children}
      </div>
    </div>
  );
}
