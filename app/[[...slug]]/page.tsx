import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { getDoc, listDocs } from "@/lib/docs";
import { DocsPage } from "@/components/docs/page";
import { DocsShell } from "@/components/docs/nav";
import { mdxComponents } from "@/components/docs/mdx";
import { getHighlighter, shellEnhancer } from "@/lib/shiki";
import { loadConfig, aiConfig, feedbackConfig } from "@/lib/config";
import { getDocsTabs, pickActiveTab, getNav, flattenLinks, findNavTrail, collectionLinks } from "@/components/docs/sections";
import { HubHero } from "@/components/docs/hub-hero";
import { LandingPage } from "@/components/landing/landing";
import { remarkLandingProse } from "@/lib/landing-prose";
import { SiteCredit } from "@/components/site-credit";
import type { PageNavLink } from "@/components/docs/page";

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
  // Description precedence: frontmatter `description`, then the page `lede`, then
  // the site-wide `seo.description` — so every page (incl. the landing) has one.
  const config = loadConfig();
  const description =
    (typeof doc.fm.description === "string" && doc.fm.description) ||
    (typeof doc.fm.lede === "string" && doc.fm.lede) ||
    config.seo.description;
  const pathname = doc.slug.length ? `/${doc.slug.join("/")}` : "/";
  const title = typeof doc.fm.title === "string" ? doc.fm.title : undefined;
  // Next replaces (not deep-merges) openGraph/twitter when set per-page, so the
  // default image must be re-declared here or it'd be dropped.
  const images = config.seo.ogImage ? [config.seo.ogImage] : undefined;
  return {
    title,
    description,
    alternates: { canonical: pathname },
    openGraph: { title, description, url: pathname, type: "article", images },
    twitter: { title, description, images },
  };
}

export default async function DocsCatchAll({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) {
    // A docs-only site with no root page: send "/" to the first nav entry so the
    // brand/logo link lands somewhere instead of 404ing. Any other missing path
    // is a genuine 404. (Static-export sites serving a public/index.html at "/"
    // are unaffected — this only runs when the catch-all handles "/".)
    if (!slug || slug.length === 0) {
      const first = firstDocHref();
      if (first && first !== "/") redirect(first);
    }
    return notFound();
  }
  const crumbs = doc.fm.crumbs ?? navCrumbs(doc.slug, doc.fm.title) ?? deriveCrumbs(doc.slug, doc.fm.title);
  const config = loadConfig();
  const editUrl = config.editUrl
    ? `${config.editUrl.replace(/\/$/, "")}/${doc.sourcePath}`
    : undefined;

  // Previous/Next derived from the real flattened sidebar order of the active
  // (documentation) tab — no fabricated links.
  const pathname = doc.slug.length ? `/${doc.slug.join("/")}` : "/";
  const { prev, next } = pageNeighbors(pathname);

  const landing = doc.fm.layout === "landing";
  const content = (
    <MDXRemote
      source={doc.body}
      components={mdxComponents}
      options={{
        mdxOptions: {
          format: "mdx",
          remarkPlugins: landing ? [remarkGfm, remarkLandingProse] : [remarkGfm],
          rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
        },
        blockJS: false,
      }}
    />
  );

  if (landing) {
    return <LandingPage>{content}</LandingPage>;
  }

  const hub = doc.fm.layout === "hub";

  // The docs 3-pane shell (sidebar · main · toc) renders BELOW the shared
  // SiteNav. Only docs routes mount it — the home + API reference render their
  // own full-width content. A hub page puts a full-width hero above it.
  const shell = (
    <DocsShell
      nav={getNav(config)}
      ai={aiConfig()}
      aiSuggestions={doc.fm.aiSuggestions}
      searchInSidebar={config.layout.search !== "header"}
      variant={hub ? "hub" : undefined}
    >
      <DocsPage
        hub={hub}
        crumbs={crumbs}
        title={doc.fm.title}
        lede={doc.fm.lede}
        toc={doc.fm.toc ?? []}
        lastUpdated={doc.fm.last_updated}
        editUrl={editUrl}
        feedbackEnabled={feedbackConfig() != null}
        feedbackEndpoint={feedbackConfig()?.endpoint}
        aiEnabled={aiConfig() != null}
        prev={prev}
        next={next}
        related={hub ? [] : relatedLinks(doc.fm.related, pathname, config.layout.relatedArticles)}
      >
        {content}
      </DocsPage>
      <SiteCredit name={config.name} year={new Date().getFullYear()} />
    </DocsShell>
  );
  if (!hub) return shell;
  return (
    <>
      <HubHero title={doc.fm.title} lede={doc.fm.lede} image={doc.fm.hero?.image} placeholder={doc.fm.hero?.placeholder} />
      {shell}
    </>
  );
}

/**
 * "Related articles": the page's own frontmatter list, labelled from the
 * sidebar (or the page's title), or with `layout.relatedArticles:
 * "collection"` the other pages in its sidebar folder.
 */
function relatedLinks(
  listed: string[] | undefined,
  pathname: string,
  mode: "off" | "collection" | undefined,
): PageNavLink[] {
  const tabs = getDocsTabs();
  if (listed?.length) {
    const labels = new Map(tabs.flatMap((t) => t.sections.flatMap((s) => flattenLinks(s.links))).map((l) => [l.href, l.label]));
    return listed.map((href) => ({
      href,
      label: labels.get(href) ?? getDoc(href.split("/").filter(Boolean))?.fm.title ?? href,
    }));
  }
  if (mode !== "collection") return [];
  const tab = pickActiveTab(tabs, pathname);
  return !tab || tab.id === "api-reference" ? [] : collectionLinks(tab.sections, pathname);
}

/**
 * Find the previous/next doc relative to a pathname by flattening the active
 * tab's sidebar sections into document order. Only internal doc links (not the
 * OpenAPI tab) participate, so prev/next stay within the docs nav.
 */
function pageNeighbors(pathname: string): { prev?: PageNavLink; next?: PageNavLink } {
  const tabs = getDocsTabs();
  const tab = pickActiveTab(tabs, pathname);
  if (!tab || tab.id === "api-reference") return {};
  const flat: PageNavLink[] = [];
  for (const sec of tab.sections) flat.push(...flattenLinks(sec.links));
  const i = flat.findIndex((l) => l.href === pathname);
  if (i < 0) return {};
  return {
    prev: i > 0 ? flat[i - 1] : undefined,
    next: i < flat.length - 1 ? flat[i + 1] : undefined,
  };
}

/** First real navigation link across the configured tabs — the de-facto home
 *  for a docs-only site with no page at "/". */
function firstDocHref(): string | undefined {
  for (const tab of getDocsTabs()) {
    for (const sec of tab.sections) {
      const first = flattenLinks(sec.links)[0];
      if (first) return first.href;
    }
  }
  return undefined;
}

/**
 * Breadcrumbs from the page's place in the sidebar: tab › group › each item it
 * sits under › the page. Follows nesting exactly, where guessing from the URL
 * can't (/account/reset-password sits under "Account & security", not under a
 * folder named "account"). Undefined when the page isn't in the sidebar.
 */
function navCrumbs(slug: string[], title: string) {
  const pathname = slug.length ? `/${slug.join("/")}` : "/";
  const tab = pickActiveTab(getDocsTabs(), pathname);
  if (!tab || tab.id === "api-reference") return undefined;
  const trail = findNavTrail(tab.sections, pathname);
  if (!trail) return undefined;
  const out: { label: string; href?: string }[] = [{ label: tab.label, href: tab.href }];
  if (trail.section.title && trail.section.title !== tab.label) out.push({ label: trail.section.title });
  for (const l of trail.chain.slice(0, -1)) out.push({ label: l.label, href: l.href });
  out.push({ label: title });
  return out;
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
