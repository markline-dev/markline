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
    <div className="ml-eplist">
      {visible.map((tag) => (
        <TagSection key={tag.name} tag={tag} />
      ))}
    </div>
  );
}

function TagSection({ tag }: { tag: OpenAPITag }) {
  return (
    <section className="ml-eplist-tag">
      <h2>{capitalize(tag.name)}</h2>
      {tag.description && (
        <p className="ml-eplist-desc">{tag.description}</p>
      )}
      <ul className="ml-eplist-ops">
        {tag.operations.map((op) => (
          <li key={op.operationId}>
            <Link href={operationHref(op)} className="ml-eplist-op">
              <span className="col-method">
                <MethodBadge method={op.method} size="sm" />
              </span>
              <code className="col-path">{op.path}</code>
              <span className="col-summary">{op.summary}</span>
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
