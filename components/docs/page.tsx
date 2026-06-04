import Link from "next/link";
import { DocsToc } from "./nav";
import { DocAiRow } from "./doc-actions";

export type Crumb = { label: string; href?: string };
export type TocItem = { id: string; label: string };
export type PageNavLink = { href: string; label: string };

export function DocsPage({
  crumbs, title, lede, toc, lastUpdated, editUrl, feedbackEndpoint,
  aiEnabled = false, prev, next, children,
}: {
  crumbs: Crumb[];
  title: string;
  lede?: React.ReactNode;
  toc: TocItem[];
  lastUpdated?: string;
  editUrl?: string;
  feedbackEndpoint?: string;
  /** Whether the "Ask AI about this page" affordance renders (AI opt-in). */
  aiEnabled?: boolean;
  prev?: PageNavLink;
  next?: PageNavLink;
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="docs-main">
        {crumbs.length > 0 && (
          <nav className="docs-bc">
            {crumbs.map((c, i) => (
              <span key={i} className="bc-seg">
                {i > 0 && <span className="sep">/</span>}
                {c.href ? (
                  <a href={c.href}>{c.label}</a>
                ) : (
                  <span className={i === crumbs.length - 1 ? "cur" : undefined}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <h1 className="docs-h1">{title}</h1>
        {lede && <p className="docs-lead">{lede}</p>}

        <DocAiRow title={title} aiEnabled={aiEnabled} />

        <div className="docs-prose">{children}</div>

        {(prev || next) && (
          <div className="page-nav">
            {prev ? (
              <Link href={prev.href}>
                <div className="d">← Previous</div>
                <div className="t">{prev.label}</div>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={next.href} className="next-a">
                <div className="d">Next →</div>
                <div className="t">{next.label}</div>
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}

        {(lastUpdated || editUrl) && (
          <div className="doc-foot">
            <span>{lastUpdated ? `Last updated ${lastUpdated}` : ""}</span>
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
      </main>

      <DocsToc items={toc} feedbackEndpoint={feedbackEndpoint} />
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
