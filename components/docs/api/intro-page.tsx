import Link from "next/link";
import type { OpenAPIDoc, OpenAPITag } from "@/lib/openapi";
import { operationHref } from "@/lib/openapi";
import { MethodBadge } from "./method-badge";

export function ApiIntroPage({
  doc,
  sections,
}: {
  doc: OpenAPIDoc;
  /** Rendered per-section MDX summaries, keyed by tag name (api/sections/<tag>.mdx). */
  sections?: Record<string, React.ReactNode>;
}) {
  return (
    <>
      <main className="api-main px-12 pt-8 pb-24 api-main-pad">
        <style>{`@media (max-width: 720px) { .api-main-pad { padding-left: 20px !important; padding-right: 20px !important; } }`}</style>

        <nav className="font-mono text-12 text-slate-5 mb-4">
          <Link href="/" className="text-slate-5 no-underline hover:text-ink">Docs</Link>
          <span className="mx-2 text-slate-4">/</span>
          <span className="text-ink">API reference</span>
        </nav>

        <h1
          className="font-semibold text-ink mb-3"
          style={{ fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1.1 }}
        >
          {doc.info.title}
        </h1>
        {doc.info.description && (
          <p className="text-16 leading-[1.55] text-slate-6 max-w-[60ch] mb-6">
            {doc.info.description}
          </p>
        )}

        {doc.servers.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-10 text-13">
            <span className="font-mono text-10 uppercase tracking-[0.08em] text-slate-5 font-medium">
              Servers
            </span>
            {doc.servers.map((s) => (
              <span key={s.url} className="flex items-baseline gap-2">
                <code className="font-mono text-ink">{s.url}</code>
                {s.description && <span className="text-slate-5">{s.description}</span>}
              </span>
            ))}
          </div>
        )}

        <div className="divide-y divide-slate-3">
          {doc.tags.map((tag) => (
            <TagSection key={tag.name} tag={tag} summary={sections?.[tag.name]} />
          ))}
        </div>
      </main>
      <aside />
    </>
  );
}

function TagSection({ tag, summary }: { tag: OpenAPITag; summary?: React.ReactNode }) {
  return (
    <section id={tagSlug(tag.name)} className="py-8 first:pt-0 last:pb-0 scroll-mt-20">
      <h2
        className="font-semibold text-ink mb-1"
        style={{ fontSize: 20, letterSpacing: "-0.01em" }}
      >
        {capitalize(tag.name)}
      </h2>
      {summary ? (
        <div className="docs-prose mb-4 max-w-[62ch]">{summary}</div>
      ) : (
        tag.description && (
          <p className="text-14 text-slate-6 leading-[1.55] mb-4 max-w-[60ch]">
            {tag.description}
          </p>
        )
      )}
      <ul className="flex flex-col">
        {tag.operations.map((op) => (
          <li key={op.operationId}>
            <Link
              href={operationHref(op)}
              className="group flex items-center gap-4 py-2 -mx-2 px-2 rounded-1 no-underline hover:bg-paper-2 transition-colors"
            >
              <span className="w-12 flex-shrink-0">
                <MethodBadge method={op.method} size="sm" />
              </span>
              <code className="font-mono text-13 text-slate-6 group-hover:text-ink transition-colors truncate">
                {op.path}
              </code>
              <span className="text-13 text-slate-5 ml-auto pl-4 truncate text-right">
                {op.summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function tagSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function capitalize(s: string): string {
  // Handle camelCase / kebab-case / snake_case gracefully:
  // splits into words, then title-cases each.
  return s
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
