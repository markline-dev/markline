import type { DocSection, DocLink, NavData } from "./nav";
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

export const NO_VARIANT = "__default__";

/**
 * Build the navigation for every content variant. Versioning and i18n share the
 * URL-prefix mechanism; a project uses one dimension or the other (versions take
 * precedence if both are set). The first entry is the default (unprefixed) and
 * uses the top-level `navigation`; others use their own `navigation` (with
 * already-prefixed hrefs), falling back to the default.
 */
export function getNav(config: MarklineConfig = loadConfig()): NavData {
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
