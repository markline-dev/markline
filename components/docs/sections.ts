import type { DocSection, DocLink } from "./nav";
import { loadOpenApi, operationHref } from "@/lib/openapi";
import { loadConfig, type NavTab } from "@/lib/config";

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

export function getDocsTabs(): DocsTab[] {
  const cfg = loadConfig();
  return cfg.navigation.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.href,
    matchPrefixes: tab.match ?? [],
    sections: tabToSections(tab),
  }));
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
