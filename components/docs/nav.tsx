"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TocList } from "./toc";
import { DocsRate } from "./feedback";
import { DocsSearch } from "./search";
import { SidebarAskButton, SidebarSearchTrigger } from "./doc-actions";
import { AskDock } from "./ai/ask-dock";
import { MarkdownModal } from "./api/reference/apiref-extras";
import type { AiPublicConfig } from "@/lib/config";

export type DocLink = { href: string; label: string; badge?: "new" | "beta"; method?: string };
export type DocSection = { title: string; links: DocLink[] };

export type TopTab = { id: string; label: string; href: string; matchPrefixes: string[] };
export type TopTabWithSections = TopTab & { sections: DocSection[] };

export type VariantMeta = { id: string; label: string };
export type NavData = {
  versions: VariantMeta[];
  locales: VariantMeta[];
  defaultId: string;
  tabsByVariant: Record<string, TopTabWithSections[]>;
};

/** Active variant id for a pathname (first path segment if it's a non-default version/locale). */
export function pickVariantId(nav: NavData, pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  const match = [...nav.versions, ...nav.locales].find((v) => v.id === seg && v.id !== nav.defaultId);
  return match ? match.id : nav.defaultId;
}

function pickActiveTabId(tabs: TopTab[], pathname: string): string {
  for (const t of tabs) {
    if (t.matchPrefixes.includes("__default__")) continue;
    if (t.matchPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return t.id;
    }
  }
  return tabs.find((t) => t.matchPrefixes.includes("__default__"))?.id ?? tabs[0]?.id ?? "";
}

/** Numbered nav groups (the design's .docs-nav): "01 Get started", etc. The
 *  index is derived from the section's position. Method/badge chips are kept. */
function SidebarSections({
  sections,
  pathname,
  onNavigate,
}: {
  sections: DocSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="docs-nav">
      {sections.map((sec, si) => (
        <div key={sec.title} className="docs-nav-grp">
          <div className="t">
            <span className="n">{String(si + 1).padStart(2, "0")}</span> {sec.title}
          </div>
          {sec.links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={onNavigate}
                className={active ? "active" : undefined}
              >
                {l.method && <SidebarMethod method={l.method} />}
                <span className="lbl">{l.label}</span>
                {l.badge && <span className="badge">{l.badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Docs 3-pane shell. Rendered by the docs page ONLY (not the home / API
 * reference, which render their own full-width content). Sits BELOW the shared
 * <SiteNav/>; it no longer carries a topbar. The grid (sidebar · main · toc)
 * is styled in app/docs.css.
 */
export function DocsShell({ nav, ai = null, children }: { nav: NavData; ai?: AiPublicConfig | null; children: React.ReactNode }) {
  return (
    <div className="docs-shell grid">
      <DocsSidebar nav={nav} ai={ai} />
      {children}
      {/* ⌘K / sidebar-trigger search palette (modal only — the inline trigger
          lives in the sidebar). */}
      <DocsSearch triggerless />
    </div>
  );
}

export function DocsSidebar({ nav, ai = null }: { nav: NavData; ai?: AiPublicConfig | null }) {
  const pathname = usePathname();
  const tabs = nav.tabsByVariant[pickVariantId(nav, pathname)] ?? [];
  const activeId = pickActiveTabId(tabs, pathname);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const sections = activeTab?.sections ?? [];
  return (
    <>
      <aside className="docs-side">
        <div className="docs-tools">
          <SidebarSearchTrigger />
          {ai && <SidebarAskButton />}
        </div>
        <SidebarSections sections={sections} pathname={pathname} />
      </aside>
      {/* Page-level AI affordances (the doc-ai row + View-as-Markdown modal) live
          in the docs shell so they're available on every docs page. */}
      {ai && <AskDock ai={ai} />}
      <MarkdownModal />
    </>
  );
}

function SidebarMethod({ method }: { method: string }) {
  const m = method.toLowerCase();
  const color: Record<string, string> = {
    get: "#3CC88C",
    post: "#6E86FA",
    put: "#EE7A4B",
    patch: "#EE7A4B",
    delete: "#E14F4F",
  };
  return (
    <span className="method" style={{ color: color[m] ?? "#7882A0" }}>
      {m}
    </span>
  );
}

export function DocsToc({
  items,
  helpful = true,
  feedbackEndpoint,
}: {
  items: { id: string; label: string }[];
  helpful?: boolean;
  feedbackEndpoint?: string;
}) {
  return (
    <aside className="docs-toc">
      {items.length > 0 && (
        <>
          <div className="toc-h">On this page</div>
          <TocList items={items} />
        </>
      )}
      {helpful && <DocsRate endpoint={feedbackEndpoint} />}
    </aside>
  );
}
