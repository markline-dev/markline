import { notFound } from "next/navigation";
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { loadOpenApi, hasOpenApiSpec, apiSpecPath } from "@/lib/openapi";
import { ApiOperationPage } from "@/components/docs/api/operation-page";
import { MarklineApiRef } from "@/components/docs/api/reference/markline-apiref";
import { buildApiRefView, tagSlug, parseOpenApiTag } from "@/lib/apiref-view";
import { mdxComponents } from "@/components/docs/mdx";
import { getHighlighter, shellEnhancer } from "@/lib/shiki";
import { contentRoot } from "@/lib/paths";
import { aiConfig, loadConfig, nonDefaultVersionIds, feedbackConfig } from "@/lib/config";

const shellTransformer = shellEnhancer();
const prettyCodeOptions = {
  theme: "markline-dark",
  keepBackground: false,
  defaultLang: "plaintext",
  bypassInlineCode: true,
  getHighlighter,
  transformers: [shellTransformer],
} as const;

function loadRaw(variantId?: string) {
  const file = apiSpecPath(variantId);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The `api/` directory for the default version or a named version variant. */
function apiDir(variantId?: string): string {
  return variantId ? path.join(contentRoot(), variantId, "api") : path.join(contentRoot(), "api");
}

/**
 * Split a version-id prefix off the slug. `/api-reference/<id>/…` resolves that
 * version's spec + overlays; otherwise the default version. Only the version
 * ids declared in `markline.json` count as prefixes (so a tag/op named like a
 * version still works).
 */
function parseVariant(slug?: string[]): { variantId?: string; rest: string[] } {
  const s = slug ?? [];
  const ids = nonDefaultVersionIds(loadConfig());
  if (s.length > 0 && ids.includes(s[0])) return { variantId: s[0], rest: s.slice(1) };
  return { rest: s };
}

/**
 * Per-operation MDX overlay. If `content/api/operations/<operationId>.mdx`
 * exists, its content is rendered between the endpoint path and the
 * auto-generated parameter/body sections — a dedicated slot for callouts,
 * use-cases, and extended prose.
 */
function loadOperationMdx(operationId: string, variantId?: string): string | null {
  const file = path.join(apiDir(variantId), "operations", `${operationId}.mdx`);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Slugify a tag/section name for matching a content file. */
function sectionSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Per-section (tag/resource) MDX summary. If
 * `content/api/sections/<tag-slug>.mdx` exists, its content renders as the
 * resource intro on the API reference — richer than the OpenAPI tag
 * `description` (callouts, tables, links, components).
 */
function loadSectionMdx(tagName: string, variantId?: string): string | null {
  const file = path.join(apiDir(variantId), "sections", `${sectionSlug(tagName)}.mdx`);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Render an MDX source string with the shared options. */
function renderMdx(source: string) {
  return (
    <MDXRemote
      source={source}
      components={mdxComponents}
      options={{
        mdxOptions: {
          format: "mdx",
          remarkPlugins: [remarkGfm],
          rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
        },
      }}
    />
  );
}

// Only the params from generateStaticParams exist (keeps `output: export` happy).
export const dynamicParams = false;

export function generateStaticParams(): { slug?: string[] }[] {
  // Always include the base path so `output: export` has at least one path to
  // generate; on a docs-only site (no spec) the page renders notFound().
  const params: { slug?: string[] }[] = [{ slug: undefined }];

  // Resource pages (one per tag) + per-operation pages (back-compat deep links),
  // for a given version variant, under an optional path prefix.
  const pushVariant = (variantId: string | undefined, prefix: string[]) => {
    if (!hasOpenApiSpec(variantId)) return;
    const doc = loadOpenApi(variantId);
    for (const tag of doc.tags) params.push({ slug: [...prefix, tagSlug(tag.name)] });
    for (const id of Object.keys(doc.operationsById)) params.push({ slug: [...prefix, id] });
  };

  pushVariant(undefined, []);
  for (const id of nonDefaultVersionIds(loadConfig())) {
    params.push({ slug: [id] }); // the version's reference landing
    pushVariant(id, [id]);
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const { variantId, rest } = parseVariant(slug);
  const doc = loadOpenApi(variantId);
  const path = "/api-reference" + (slug?.length ? `/${slug.join("/")}` : "");
  // Next replaces openGraph/twitter per-page, so re-declare the default image.
  const images = loadConfig().seo.ogImage ? [loadConfig().seo.ogImage!] : undefined;
  const meta = (title: string, description?: string): Metadata => ({
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "article", images },
    twitter: { title, description, images },
  });
  const first = rest[0];
  if (!first) return meta("API reference");
  const tag = doc.tags.find((t) => tagSlug(t.name) === first);
  if (tag) return meta(`${tag.name} · API reference`, tag.description);
  const op = doc.operationsById[first];
  if (!op) return {};
  return meta(`${op.summary ?? op.operationId} · API`, op.description);
}

export default async function ApiReferencePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const { variantId, rest } = parseVariant(slug);
  if (!hasOpenApiSpec(variantId)) return notFound();
  const doc = loadOpenApi(variantId);
  const root = loadRaw(variantId);
  const base = variantId ? `/api-reference/${variantId}` : "/api-reference";

  // Resolve the (variant-stripped) slug. Empty → the first resource (the design
  // opens on its first tag). A tag-slug → that resource. An operationId → the
  // per-op page.
  const first = rest[0];
  const matchedTag = !first
    ? doc.tags[0]
    : doc.tags.find((t) => tagSlug(t.name) === first);

  if (matchedTag) {
    const view = buildApiRefView(doc, root, tagSlug(matchedTag.name), variantId);
    const sectionSrc = loadSectionMdx(matchedTag.name, variantId);
    const summary = sectionSrc ? renderMdx(sectionSrc) : undefined;
    return (
      <MarklineApiRef
        view={view}
        summary={summary}
        ai={aiConfig()}
        feedbackEnabled={feedbackConfig() != null}
        feedbackEndpoint={feedbackConfig()?.endpoint}
        siteName={loadConfig().name}
        year={new Date().getFullYear()}
      />
    );
  }

  const op = first ? doc.operationsById[first] : undefined;
  if (!op) return notFound();

  const parsedTag = parseOpenApiTag(op.tag);
  const crumbs = [
    { label: "Docs", href: "/" },
    { label: "API reference", href: base },
    ...parsedTag.parentDisplayNames.map((n) => ({ label: n })),
    { label: parsedTag.displayName, href: `${base}/${parsedTag.slug}` },
    { label: op.summary ?? op.operationId },
  ];

  const overlay = loadOperationMdx(op.operationId, variantId);
  const extendedContent = overlay ? renderMdx(overlay) : undefined;

  return (
    <ApiOperationPage
      op={op}
      doc={doc}
      root={root}
      crumbs={crumbs}
      extendedContent={extendedContent}
      base={base}
    />
  );
}
