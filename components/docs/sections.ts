import type { DocSection, DocLink, VersionedNav } from "./nav";
import { loadOpenApi, operationHref } from "@/lib/openapi";
import { loadConfig, type NavTab, type MarklineConfig } from "@/lib/config";

/** Build the API-reference sidebar from the OpenAPI spec's tags. */
function apiSections(): DocSection[] {
  const api = loadOpenApi();
  return [
    {
      title: "Overview",
      links: [{ href: "/api-reference", label: "Introduction" }],
    },
    ...api.tags.map((tag) => ({
      title: tag.name,
      links: tag.operations.map<DocLink>((op) => ({
        href: operationHref(op),
        label: op.summary ?? op.operationId,
        method: op.method,
      })),
    })),
  ];
}

function tabToSections(tab: NavTab): DocSection[] {
  if (tab.openapi) return apiSections();
  return (tab.groups ?? []).map((g) => ({ title: g.group, links: g.pages }));
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

export function getDocsTabs(): DocsTab[] {
  return buildTabs(loadConfig().navigation.tabs);
}

export const NO_VERSION = "__default__";

/**
 * Build the navigation for every configured version. The first version is the
 * default and uses the top-level `navigation`; others use their own
 * `navigation` (with already-prefixed hrefs), falling back to the default.
 * When no versions are configured, returns a single synthetic default.
 */
export function getVersionedNav(config: MarklineConfig = loadConfig()): VersionedNav {
  const versions = config.versions && config.versions.length > 0 ? config.versions : null;
  if (!versions) {
    return {
      versions: [],
      defaultVersionId: NO_VERSION,
      tabsByVersion: { [NO_VERSION]: buildTabs(config.navigation.tabs) },
    };
  }
  const defaultVersionId = versions[0].id;
  const tabsByVersion: Record<string, DocsTab[]> = {};
  for (const v of versions) {
    const nav = v.navigation ?? config.navigation;
    tabsByVersion[v.id] = buildTabs(nav.tabs);
  }
  return {
    versions: versions.map((v) => ({ id: v.id, label: v.label })),
    defaultVersionId,
    tabsByVersion,
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
