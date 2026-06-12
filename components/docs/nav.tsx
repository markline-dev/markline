"use client";

import { useEffect, useRef } from "react";
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

/** Nav groups (the design's .docs-nav): a section title over its links.
 *  Method/badge chips on links are kept. */
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
          <div className="t">{sec.title}</div>
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
export function DocsShell({
  nav,
  ai = null,
  aiSuggestions,
  children,
}: {
  nav: NavData;
  ai?: AiPublicConfig | null;
  /** Page-specific Ask AI starter questions (frontmatter `aiSuggestions`). */
  aiSuggestions?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="docs-shell grid">
      <DocsSidebar nav={nav} ai={ai} aiSuggestions={aiSuggestions} />
      {children}
      {/* ⌘K / sidebar-trigger search palette (modal only — the inline trigger
          lives in the sidebar). */}
      <DocsSearch triggerless />
    </div>
  );
}

export function DocsSidebar({
  nav,
  ai = null,
  aiSuggestions,
}: {
  nav: NavData;
  ai?: AiPublicConfig | null;
  aiSuggestions?: string[];
}) {
  const pathname = usePathname();
  const tabs = nav.tabsByVariant[pickVariantId(nav, pathname)] ?? [];
  const activeId = pickActiveTabId(tabs, pathname);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const sections = activeTab?.sections ?? [];
  const sideRef = useRef<HTMLElement>(null);

  // After navigation the sidebar may render scrolled to the top, leaving the
  // active link below the fold. Scroll *only the sidebar* (never the window) so
  // the active link is in view — centered when it was off-screen. Deferred to a
  // frame so it measures after layout has settled (fonts, reflow).
  useEffect(() => {
    const aside = sideRef.current;
    if (!aside) return;
    const id = requestAnimationFrame(() => {
      const active = aside.querySelector<HTMLElement>("a.active");
      if (!active) return;
      const ar = aside.getBoundingClientRect();
      const lr = active.getBoundingClientRect();
      if (lr.top < ar.top || lr.bottom > ar.bottom) {
        aside.scrollTop += lr.top - ar.top - (aside.clientHeight - active.clientHeight) / 2;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <>
      <aside className="docs-side" ref={sideRef}>
        <div className="docs-tools">
          <SidebarSearchTrigger />
          {ai && <SidebarAskButton />}
        </div>
        <SidebarSections sections={sections} pathname={pathname} />
      </aside>
      {/* Page-level AI affordances (the doc-ai row + View-as-Markdown modal) live
          in the docs shell so they're available on every docs page. */}
      {ai && <AskDock ai={ai} suggestions={aiSuggestions} />}
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
