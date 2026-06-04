import { notFound } from "next/navigation";
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { loadOpenApi, hasOpenApiSpec } from "@/lib/openapi";
import { ApiOperationPage } from "@/components/docs/api/operation-page";
import { ApiIntroPage } from "@/components/docs/api/intro-page";
import { ApiIntroMdxPage } from "@/components/docs/api/intro-mdx-page";
import { mdxComponents } from "@/components/docs/mdx";
import { getHighlighter, shellEnhancer } from "@/lib/shiki";
import { contentRoot } from "@/lib/paths";

const shellTransformer = shellEnhancer();
const prettyCodeOptions = {
  theme: "markline-dark",
  keepBackground: false,
  defaultLang: "plaintext",
  bypassInlineCode: true,
  getHighlighter,
  transformers: [shellTransformer],
} as const;

const INTRO_MDX = path.join(contentRoot(), "api", "introduction.mdx");

function loadRaw() {
  const file = path.join(contentRoot(), "api", "openapi.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadIntroMdx(): string | null {
  try {
    return fs.readFileSync(INTRO_MDX, "utf8");
  } catch {
    return null;
  }
}

/**
 * Per-operation MDX overlay. If `content/api/operations/<operationId>.mdx`
 * exists, its content is rendered between the endpoint path and the
 * auto-generated parameter/body sections — same slot Mintlify uses for callouts,
 * use-cases, and extended prose.
 */
function loadOperationMdx(operationId: string): string | null {
  const file = path.join(contentRoot(), "api", "operations", `${operationId}.mdx`);
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
 * `description` (callouts, tables, links, components), Stripe-style.
 */
function loadSectionMdx(tagName: string): string | null {
  const file = path.join(contentRoot(), "api", "sections", `${sectionSlug(tagName)}.mdx`);
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
  if (hasOpenApiSpec()) {
    for (const id of Object.keys(loadOpenApi().operationsById)) {
      params.push({ slug: [id] });
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = loadOpenApi();
  if (!slug || slug.length === 0) {
    return { title: "API reference" };
  }
  const op = doc.operationsById[slug[0]];
  if (!op) return {};
  return {
    title: `${op.summary ?? op.operationId} · API`,
    description: op.description,
  };
}

export default async function ApiReferencePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  if (!hasOpenApiSpec()) return notFound();
  const { slug } = await params;
  const doc = loadOpenApi();
  const root = loadRaw();

  if (!slug || slug.length === 0) {
    const mdx = loadIntroMdx();
    if (mdx) {
      return <ApiIntroMdxPage>{renderMdx(mdx)}</ApiIntroMdxPage>;
    }
    // Per-section MDX summaries: render any api/sections/<tag>.mdx into a map
    // keyed by tag name, rendered as each resource's intro on the landing page.
    const sections: Record<string, React.ReactNode> = {};
    for (const tag of doc.tags) {
      const src = loadSectionMdx(tag.name);
      if (src) sections[tag.name] = renderMdx(src);
    }
    return <ApiIntroPage doc={doc} sections={sections} />;
  }

  const op = doc.operationsById[slug[0]];
  if (!op) return notFound();

  const crumbs = [
    { label: "Docs", href: "/" },
    { label: "API reference", href: "/api-reference" },
    { label: op.tag },
    { label: op.summary ?? op.operationId },
  ];

  const overlay = loadOperationMdx(op.operationId);
  const extendedContent = overlay ? renderMdx(overlay) : undefined;

  return (
    <ApiOperationPage
      op={op}
      doc={doc}
      root={root}
      crumbs={crumbs}
      extendedContent={extendedContent}
    />
  );
}
