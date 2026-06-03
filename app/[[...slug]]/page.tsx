import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { getDoc, listDocs } from "@/lib/docs";
import { DocsPage } from "@/components/docs/page";
import { mdxComponents } from "@/components/docs/mdx";
import { getHighlighter, shellEnhancer } from "@/lib/shiki";
import { loadConfig } from "@/lib/config";
import { LandingPage } from "@/components/landing/landing";

// One transformer instance reused across all blocks — it's stateless.
const shellTransformer = shellEnhancer();

const prettyCodeOptions = {
  theme: "markline-dark",
  keepBackground: false,
  defaultLang: "plaintext",
  bypassInlineCode: true,
  getHighlighter,
  // Apply the same shell flag / HTTP method re-coloring used by <CodeBlock> and
  // the API code panels. The transformer's tokens() hook decides per-token
  // whether to repaint, so applying it to all langs is safe (it only matches
  // CLI-flag / HTTP-method shapes).
  transformers: [shellTransformer],
} as const;

export function generateStaticParams(): { slug?: string[] }[] {
  return listDocs().map((d) => ({ slug: d.slug.length ? d.slug : undefined }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  return {
    title: doc.fm.title,
    description: typeof doc.fm.lede === "string" ? doc.fm.lede : undefined,
  };
}

export default async function DocsCatchAll({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return notFound();
  const crumbs = doc.fm.crumbs ?? deriveCrumbs(doc.slug, doc.fm.title);
  const config = loadConfig();
  const editUrl = config.editUrl
    ? `${config.editUrl.replace(/\/$/, "")}/${doc.sourcePath}`
    : undefined;

  const content = (
    <MDXRemote
      source={doc.body}
      components={mdxComponents}
      options={{
        mdxOptions: {
          format: "mdx",
          remarkPlugins: [remarkGfm],
          rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
        },
        blockJS: false,
      }}
    />
  );

  if (doc.fm.layout === "landing") {
    return <LandingPage>{content}</LandingPage>;
  }

  return (
    <DocsPage
      crumbs={crumbs}
      title={doc.fm.title}
      lede={doc.fm.lede}
      toc={doc.fm.toc ?? []}
      lastUpdated={doc.fm.last_updated}
      editUrl={editUrl}
      feedbackEndpoint={config.feedback?.endpoint}
    >
      {content}
    </DocsPage>
  );
}

function deriveCrumbs(slug: string[], title: string) {
  if (slug.length === 0) return [{ label: "Docs" }, { label: title }];
  const sectionLabels: Record<string, string> = {
    concepts: "Concepts",
    api: "API reference",
    guides: "Guides",
    ops: "Operations",
  };
  const out: { label: string; href?: string }[] = [{ label: "Docs", href: "/" }];
  if (slug.length > 1 && sectionLabels[slug[0]]) {
    out.push({ label: sectionLabels[slug[0]] });
  } else {
    out.push({ label: "Get started" });
  }
  out.push({ label: title });
  return out;
}
