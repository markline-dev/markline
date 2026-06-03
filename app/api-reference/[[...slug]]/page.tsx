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
      return (
        <ApiIntroMdxPage>
          <MDXRemote
            source={mdx}
            components={mdxComponents}
            options={{
              mdxOptions: {
                format: "mdx",
                remarkPlugins: [remarkGfm],
                rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
              },
            }}
          />
        </ApiIntroMdxPage>
      );
    }
    return <ApiIntroPage doc={doc} />;
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
  const extendedContent = overlay ? (
    <MDXRemote
      source={overlay}
      components={mdxComponents}
      options={{
        mdxOptions: {
          format: "mdx",
          remarkPlugins: [remarkGfm],
          rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
        },
      }}
    />
  ) : undefined;

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
