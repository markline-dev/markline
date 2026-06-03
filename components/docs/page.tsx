import { DocsToc } from "./nav";

export type Crumb = { label: string; href?: string };
export type TocItem = { id: string; label: string };

export function DocsPage({
  crumbs, title, lede, toc, lastUpdated, editUrl, feedbackEndpoint, children,
}: {
  crumbs: Crumb[];
  title: string;
  lede?: React.ReactNode;
  toc: TocItem[];
  lastUpdated?: string;
  editUrl?: string;
  feedbackEndpoint?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="docs-main max-w-[760px] px-12 pt-8 pb-24 docs-main-pad">
        <style>{`@media (max-width: 720px) { .docs-main-pad { padding-left: 20px !important; padding-right: 20px !important; } }`}</style>

        {crumbs.length > 0 && (
          <nav className="font-mono text-12 text-slate-5 mb-4">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-2 text-slate-4">/</span>}
                {c.href ? (
                  <a href={c.href} className="text-slate-5 no-underline hover:text-ink">{c.label}</a>
                ) : (
                  <span className={i === crumbs.length - 1 ? "text-ink" : "text-slate-5"}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <h1 className="font-semibold text-ink mb-2" style={{ fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {title}
        </h1>
        {lede && <p className="text-16 leading-[1.55] text-slate-6 max-w-[60ch] mb-8">{lede}</p>}

        <div className="docs-prose">{children}</div>

        {(lastUpdated || editUrl) && (
          <div className="mt-12 pt-6 border-t border-slate-3 flex items-center justify-between gap-4 font-mono text-12 text-slate-5">
            <span>{lastUpdated ? `Last updated · ${lastUpdated}` : ""}</span>
            {editUrl && (
              <a href={editUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-slate-5 no-underline hover:text-ink">
                <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path d="M11.5 2.5 13.5 4.5 6 12l-2.5.5L4 10l7.5-7.5Z" strokeLinejoin="round" />
                </svg>
                Edit this page
              </a>
            )}
          </div>
        )}
      </main>

      <DocsToc items={toc} feedbackEndpoint={feedbackEndpoint} />
    </>
  );
}

export function DocsH2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-22 font-semibold tracking-[-0.01em] mt-9 mb-3">
      {children}
    </h2>
  );
}

export function DocsP({ children }: { children: React.ReactNode }) {
  return <p className="text-15 leading-[1.65] text-slate-6 mb-4">{children}</p>;
}

export function Callout({
  tone = "info", title, children,
}: {
  tone?: "info" | "warn";
  title?: string;
  children: React.ReactNode;
}) {
  const accent = tone === "warn" ? "#EE7A4B" : "rgb(var(--c-brand))";
  return (
    <div className="my-5 flex gap-3 p-4 rounded-2 border border-slate-3 bg-paper-2">
      <div className="w-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
      <div className="text-14 text-slate-6 leading-[1.55]">
        {title && <strong className="text-ink">{title}</strong>}{title && " "}
        {children}
      </div>
    </div>
  );
}
