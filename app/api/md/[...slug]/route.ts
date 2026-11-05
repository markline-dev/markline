import { getDoc } from "@/lib/docs";
import { listChangelog } from "@/lib/changelog";
import { CHANGELOG_PATH } from "@/lib/changelog-core";
import { pageMarkdown, pathFromMarkdown } from "@/scripts/llms.mjs";

// A page's Markdown at <page>.md (next.config.mjs rewrites /x/y.md here).
// The build also writes these as files in public/ (scripts/build-search.mjs),
// which is what a static export serves; this route covers `next dev` and the
// Node server before or without that step. Static export omits `.ts` routes.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const pathname = pathFromMarkdown(`/${slug.join("/")}.md`);
  const doc = getDoc(pathname.split("/").filter(Boolean));
  // With entries, /changelog is them; its .mdx is only the intro (as in the build).
  const introOnly = pathname === CHANGELOG_PATH && listChangelog().length > 0;
  if (!doc || doc.fm.layout === "landing" || introOnly) return new Response("Not found\n", { status: 404 });
  return new Response(pageMarkdown({ title: doc.fm.title, lede: doc.fm.lede, body: doc.body }), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
