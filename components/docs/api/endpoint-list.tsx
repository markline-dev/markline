import Link from "next/link";
import { loadOpenApi, operationHref, type OpenAPITag } from "@/lib/openapi";
import { MethodBadge } from "./method-badge";

/**
 * Tag-grouped list of every operation in the OpenAPI spec. Designed to be
 * dropped into an MDX page (e.g. `content/api/introduction.mdx`) so authors
 * can write a custom intro and embed the auto-generated endpoint directory
 * wherever it fits.
 */
export function EndpointList({ tags }: { tags?: string[] } = {}) {
  const doc = loadOpenApi();
  const visible = tags?.length
    ? doc.tags.filter((t) => tags.includes(t.name))
    : doc.tags;
  return (
    <div className="divide-y divide-slate-3 my-8">
      {visible.map((tag) => (
        <TagSection key={tag.name} tag={tag} />
      ))}
    </div>
  );
}

function TagSection({ tag }: { tag: OpenAPITag }) {
  return (
    <section className="py-8 first:pt-0 last:pb-0">
      <h2
        className="font-semibold text-ink mb-1"
        style={{ fontSize: 20, letterSpacing: "-0.01em" }}
      >
        {capitalize(tag.name)}
      </h2>
      {tag.description && (
        <p className="text-14 text-slate-6 leading-[1.55] mb-4 max-w-[60ch]">
          {tag.description}
        </p>
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

function capitalize(s: string): string {
  return s
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
