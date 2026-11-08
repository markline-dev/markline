import { listDocs } from "@/lib/docs";
import { loadConfig } from "@/lib/config";
import { sectionIndex } from "@/scripts/llms.mjs";

// /<section>/llms.txt, an index of one top-level folder (next.config.mjs
// rewrites it here). Like app/api/md, this stands in for the file the build
// writes to public/ under `next dev` and the Node server.

export const dynamic = "force-dynamic";

function sectionDocs() {
  return listDocs()
    .filter((d) => !d.variant)
    .map((d) => ({ url: d.pathname, title: d.fm.title, lede: d.fm.lede, body: d.body, layout: d.fm.layout }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const config = loadConfig();
  const base = String(config.seo.metadataBase ?? process.env.MARKLINE_SITE_URL ?? "").replace(/\/$/, "");
  const text = sectionIndex(config, sectionDocs(), section, { name: config.name, abs: (u) => (base ? base + u : u) });
  if (!text) return new Response("Not found\n", { status: 404 });
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
