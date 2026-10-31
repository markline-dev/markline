import { getDoc, listDocs } from "@/lib/docs";
import { markdownPath, pageMarkdown, pathFromMarkdown } from "@/scripts/llms.mjs";

// A page's Markdown at <page>.md (next.config.mjs rewrites /x/y.md here).
// The build also writes these as files in public/ (scripts/build-search.mjs),
// which is what a static export serves; this route covers `next dev` and the
// Node server before or without that step. Static export omits `.ts` routes.

export const dynamic = "force-static";

export function generateStaticParams() {
  return listDocs()
    .filter((d) => d.fm.layout !== "landing")
    .map((d) => ({ slug: markdownPath(d.pathname).slice(1).replace(/\.md$/, "").split("/") }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const pathname = pathFromMarkdown(`/${slug.join("/")}.md`);
  const doc = getDoc(pathname.split("/").filter(Boolean));
  if (!doc || doc.fm.layout === "landing") return new Response("Not found\n", { status: 404 });
  return new Response(pageMarkdown({ title: doc.fm.title, lede: doc.fm.lede, body: doc.body }), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
