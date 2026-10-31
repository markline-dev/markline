import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { getDoc, listDocs } from "@/lib/docs";
import { DocsPage } from "@/components/docs/page";
import { DocsShell } from "@/components/docs/nav";
import { mdxComponents } from "@/components/docs/mdx";
import { prettyCodeOptions } from "@/components/docs/mdx-options";
import { loadConfig, aiConfig, feedbackConfig } from "@/lib/config";
import { getDocsTabs, pickActiveTab, getNav, flattenLinks, findNavTrail, collectionLinks, type DocsTab } from "@/components/docs/sections";
import { HubHero } from "@/components/docs/hub-hero";
import { LandingPage } from "@/components/landing/landing";
import { remarkLandingProse } from "@/lib/landing-prose";
import { extractToc } from "@/lib/toc";
import { SiteFooter } from "@/components/site-footer";
import type { Crumb, PageNavLink } from "@/components/docs/page";
import { ChangelogEntryView, ChangelogView } from "@/components/docs/changelog";
import { getChangelogEntry, listChangelog } from "@/lib/changelog";
import {
  CHANGELOG_PATH, PER_PAGE, dateFromSlug, entryPath, formatDate, pageCount, pageFromSlug, pagePath,
} from "@/lib/changelog-core";


export function generateStaticParams(): { slug?: string[] }[] {
  const docs = listDocs().map((d) => ({ slug: d.slug.length ? d.slug : undefined }));
  const entries = listChangelog();
  if (!entries.length) return docs;
  const pages = Array.from({ length: pageCount(entries.length) }, (_, i) => pagePath(i + 1));
  const changelog = [...pages, ...entries.map((e) => entryPath(e.date))]
    .map((p) => ({ slug: p.split("/").filter(Boolean) }))
    // docs/changelog.mdx, if there is one, is shown as the changelog's intro
    .filter((p) => !docs.some((d) => d.slug?.join("/") === p.slug.join("/")));
  return [...docs, ...changelog];
}

/** Metadata for /changelog pages, or undefined when the slug isn't one. */
function changelogMetadata(slug: string[]): Metadata | undefined {
  if (!listChangelog().length) return undefined;
  const config = loadConfig();
  const rss = (config.seo.metadataBase ?? process.env.MARKLINE_SITE_URL) ? { types: { "application/rss+xml": `${process.env.NEXT_PUBLIC_MARKLINE_BASE_PATH ?? ""}${CHANGELOG_PATH}/rss.xml` } } : {};
  const date = dateFromSlug(slug);
  const entry = date ? getChangelogEntry(date) : undefined;
  if (entry) {
    const title = entry.title ? `${entry.title} (${formatDate(entry.date)})` : `Changelog: ${formatDate(entry.date)}`;
    return { title, alternates: { canonical: entryPath(entry.date), ...rss }, openGraph: { title, url: entryPath(entry.date) } };
  }
  const page = pageFromSlug(slug);
  if (!page) return undefined;
  const intro = getDoc(["changelog"]);
  const title = intro?.fm.title ?? "Changelog";
  const description = intro?.fm.lede ?? `What's new in ${config.name}.`;
  return { title, description, alternates: { canonical: pagePath(page), ...rss } };
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const cl = changelogMetadata(slug ?? []);
  if (cl) return cl;
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
  const changelog = slug?.[0] === CHANGELOG_PATH.slice(1) ? renderChangelog(slug) : undefined;
  if (changelog) return changelog;
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
  const config = loadConfig();
  // A translated or older-version page follows its own sidebar.
  const tabs = getDocsTabs(doc.variant);
  const crumbs =
    doc.fm.crumbs ??
    withCrumbsRoot(
      navCrumbs(tabs, doc.slug, doc.fm.title) ?? deriveCrumbs(doc.slug, doc.fm.title),
      config.layout.breadcrumbsRoot,
      doc.variant ? `/${doc.variant}` : "/",
    );
  const editUrl = config.editUrl
    ? `${config.editUrl.replace(/\/$/, "")}/${doc.sourcePath}`
    : undefined;

  // Previous/Next derived from the real flattened sidebar order of the active
  // (documentation) tab — no fabricated links.
  const pathname = doc.slug.length ? `/${doc.slug.join("/")}` : "/";
  const { prev, next } = pageNeighbors(tabs, pathname);

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
    return (
      <LandingPage>
        {content}
        <SiteFooter config={config} />
      </LandingPage>
    );
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
      sidebar={doc.fm.sidebar !== false}
      footer={<SiteFooter config={config} />}
    >
      <DocsPage
        hub={hub}
        crumbs={crumbs}
        crumbStyle={config.layout.breadcrumbs}
        actionStyle={config.layout.pageActions}
        title={doc.fm.title}
        lede={doc.fm.lede}
        toc={doc.fm.toc ?? extractToc(doc.body)}
        lastUpdated={doc.fm.last_updated}
        editUrl={editUrl}
        feedbackEnabled={feedbackConfig() != null}
        feedbackEndpoint={feedbackConfig()?.endpoint}
        aiEnabled={aiConfig() != null}
        prev={hub ? undefined : prev}
        next={hub ? undefined : next}
        related={hub ? [] : relatedLinks(tabs, doc.fm.related, pathname, config.layout.related)}
        credit={!config.footer}
      >
        {content}
      </DocsPage>
    </DocsShell>
  );
  if (!hub) return shell;
  return (
    <>
      <HubHero
        title={doc.fm.title}
        lede={doc.fm.lede}
        image={doc.fm.hero?.image}
        imageStyle={doc.fm.hero?.imageStyle}
        background={doc.fm.hero?.background}
        text={doc.fm.hero?.text}
        align={doc.fm.hero?.align}
        placeholder={doc.fm.hero?.placeholder}
      />
      {shell}
    </>
  );
}

/**
 * /changelog (paged) and /changelog/YYYY/MM/DD, when the content has a
 * changelog/ folder. Anything else under /changelog is an ordinary docs page.
 */
function renderChangelog(slug: string[]) {
  const entries = listChangelog();
  if (!entries.length) return undefined;
  const config = loadConfig();
  const shell = (children: React.ReactNode) => (
    <DocsShell
      nav={getNav(config)}
      ai={aiConfig()}
      searchInSidebar={config.layout.search !== "header"}
      sidebar={false}
      footer={<SiteFooter config={config} />}
    >
      {children}
    </DocsShell>
  );
  const credit = !config.footer;

  const date = dateFromSlug(slug);
  if (date) {
    const i = entries.findIndex((e) => e.date === date);
    if (i < 0) return notFound();
    return shell(<ChangelogEntryView entry={entries[i]} newer={entries[i - 1]} older={entries[i + 1]} credit={credit} />);
  }

  const page = pageFromSlug(slug);
  if (!page) return undefined;
  const pages = pageCount(entries.length);
  if (page > pages) return notFound();
  // docs/changelog.mdx, if it exists, supplies the title, lede and an intro.
  const intro = getDoc(["changelog"]);
  return shell(
    <ChangelogView
      title={intro?.fm.title ?? "Changelog"}
      lede={intro?.fm.lede}
      intro={
        intro?.body.trim() && page === 1 ? (
          <MDXRemote source={intro.body} components={mdxComponents} options={{ mdxOptions: { format: "mdx", remarkPlugins: [remarkGfm], rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]] }, blockJS: false }} />
        ) : undefined
      }
      entries={entries.slice((page - 1) * PER_PAGE, page * PER_PAGE)}
      page={page}
      pages={pages}
      rss={!!(config.seo.metadataBase ?? process.env.MARKLINE_SITE_URL)}
      credit={credit}
    />,
  );
}

/**
 * "Related articles": the page's own frontmatter list, labelled with each
 * page's title (or its sidebar label), or with `layout.related:
 * "collection"` the other pages in its sidebar folder.
 */
function relatedLinks(
  tabs: DocsTab[],
  listed: string[] | undefined,
  pathname: string,
  mode: "off" | "collection" | undefined,
): PageNavLink[] {
  if (listed?.length) {
    const labels = new Map(tabs.flatMap((t) => t.sections.flatMap((s) => flattenLinks(s.links))).map((l) => [l.href, l.label]));
    // The page's own title first: a sidebar label is written for its folder
    // ("Overview"), and reads as ambiguous once it's listed elsewhere.
    return listed.map((href) => ({
      href,
      label: getDoc(href.split("/").filter(Boolean))?.fm.title ?? labels.get(href) ?? href,
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
function pageNeighbors(tabs: DocsTab[], pathname: string): { prev?: PageNavLink; next?: PageNavLink } {
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

/** `layout.breadcrumbsRoot` renames the first crumb (the tab), e.g. to
 *  "All collections", and points it home. Frontmatter crumbs are left alone. */
function withCrumbsRoot(crumbs: Crumb[], root: string | undefined, home: string): Crumb[] {
  if (!root || crumbs.length === 0) return crumbs;
  return [{ label: root, href: home }, ...crumbs.slice(1)];
}

/**
 * Breadcrumbs from the page's place in the sidebar: tab › group › each item it
 * sits under › the page. Follows nesting exactly, where guessing from the URL
 * can't (/account/reset-password sits under "Account & security", not under a
 * folder named "account"). Undefined when the page isn't in the sidebar.
 */
function navCrumbs(tabs: DocsTab[], slug: string[], title: string) {
  const pathname = slug.length ? `/${slug.join("/")}` : "/";
  const tab = pickActiveTab(tabs, pathname);
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
