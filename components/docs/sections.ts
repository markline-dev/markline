import type { DocSection, DocLink, NavData } from "./nav";
import { loadOpenApi } from "@/lib/openapi";
import { tagSlug } from "@/lib/openapi-tags";
import { loadConfig, type NavLink, type NavTab, type MarklineConfig } from "@/lib/config";
import { navIcon } from "./nav-icons";
import { findNavTrail, flattenLinks, collectionLinks } from "./nav-tree";

export { findNavTrail, flattenLinks, collectionLinks };

/**
 * The API tab's entry in the docs navigation: one link per resource page. The
 * reference renders its own sidebar (operations included), so docs pages only
 * need somewhere to send the reader; listing every operation here put the
 * whole spec into every docs page's payload.
 */
function apiSections(): DocSection[] {
  const api = loadOpenApi();
  return [
    {
      title: "Overview",
      links: [{ href: "/api-reference", label: "Introduction" }],
    },
    {
      title: "Resources",
      links: api.tags.map<DocLink>((tag) => ({
        href: `/api-reference/${tagSlug(tag.name)}`,
        label: tag.displayName ?? tag.name,
      })),
    },
  ];
}

function toDocLink(l: NavLink): DocLink {
  return {
    href: l.href,
    label: l.label,
    badge: l.badge,
    method: l.method,
    icon: navIcon(l.icon),
    children: l.pages?.map(toDocLink),
    collapsed: l.collapsed,
  };
}

function tabToSections(tab: NavTab): DocSection[] {
  if (tab.openapi) return apiSections();
  return (tab.groups ?? []).map((g) => ({
    title: g.group,
    icon: navIcon(g.icon),
    links: g.pages.map(toDocLink),
    collapsible: g.collapsible,
    collapsed: g.collapsed,
  }));
}

export type DocsTab = {
  id: string;
  label: string;
  href: string;
  /** Pathname prefixes that activate this tab. Use "__default__" for the fallback tab. */
  matchPrefixes: string[];
  sections: DocSection[];
};

function buildTabs(navTabs: NavTab[]): DocsTab[] {
  return navTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.href,
    matchPrefixes: tab.match ?? [],
    sections: tabToSections(tab),
  }));
}

/** The docs tabs of a version or locale (its own `navigation`), or the default's. */
export function getDocsTabs(variant?: string): DocsTab[] {
  const config = loadConfig();
  const entries = config.versions?.length ? config.versions : (config.i18n?.locales ?? []);
  const v = variant ? entries.find((e) => e.id === variant) : undefined;
  return buildTabs((v?.navigation ?? config.navigation).tabs);
}

export const NO_VARIANT = "__default__";

/**
 * Build the navigation for every content variant. Versioning and i18n share the
 * URL-prefix mechanism; a project uses one dimension or the other (versions take
 * precedence if both are set). The first entry is the default (unprefixed) and
 * uses the top-level `navigation`; others use their own `navigation` (with
 * already-prefixed hrefs), falling back to the default.
 */
/** Header links the phone drawer repeats: navLinks, then topbar.links (menus
 *  flattened, GitHub left to its badge), then the secondary button. */
function headerLinks(config: MarklineConfig): { label: string; href: string }[] {
  const t = config.topbar;
  const links = (t.links ?? []).flatMap((l) => ("items" in l ? l.items : /github\.com/.test(l.href) ? [] : [l]));
  return [...(t.navLinks ?? []), ...links, ...(t.secondaryCta ? [t.secondaryCta] : [])].map((l) => ({ label: l.label, href: l.href }));
}

export function getNav(config: MarklineConfig = loadConfig()): NavData {
  return { ...buildNav(config), headerLinks: headerLinks(config) };
}

function buildNav(config: MarklineConfig): NavData {
  const buildVariantTabs = (v: { navigation?: { tabs: NavTab[] } }) =>
    buildTabs((v.navigation ?? config.navigation).tabs);

  const dimension =
    config.versions && config.versions.length > 0
      ? { kind: "versions" as const, entries: config.versions }
      : config.i18n?.locales && config.i18n.locales.length > 0
        ? { kind: "locales" as const, entries: config.i18n.locales }
        : null;

  if (!dimension) {
    return {
      versions: [],
      locales: [],
      defaultId: NO_VARIANT,
      tabsByVariant: { [NO_VARIANT]: buildTabs(config.navigation.tabs) },
    };
  }

  const tabsByVariant: Record<string, DocsTab[]> = {};
  for (const e of dimension.entries) tabsByVariant[e.id] = buildVariantTabs(e);
  const meta = dimension.entries.map((e) => ({ id: e.id, label: e.label }));
  return {
    versions: dimension.kind === "versions" ? meta : [],
    locales: dimension.kind === "locales" ? meta : [],
    defaultId: dimension.entries[0].id,
    tabsByVariant,
  };
}

/** Pick the active tab for a pathname. */
export function pickActiveTab(tabs: DocsTab[], pathname: string): DocsTab {
  for (const t of tabs) {
    if (t.matchPrefixes.includes("__default__")) continue;
    if (t.matchPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return t;
    }
  }
  return tabs.find((t) => t.matchPrefixes.includes("__default__")) ?? tabs[0];
}
