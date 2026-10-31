"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TocList, type TocItem } from "./toc";
import { DocsRate } from "./feedback";
import { DocsSearch } from "./search";
import { SidebarAskButton, SidebarSearchTrigger } from "./doc-actions";
import { AskDock } from "./ai/ask-dock";
import { MarkdownModal } from "./api/reference/apiref-extras";
import type { AiPublicConfig } from "@/lib/config";

export type DocLink = {
  href?: string;
  label: string;
  badge?: "new" | "beta";
  method?: string;
  /** Already-rendered icon (resolved from its name on the server). */
  icon?: React.ReactNode;
  children?: DocLink[];
  collapsed?: boolean;
};
export type DocSection = {
  title: string;
  icon?: React.ReactNode;
  links: DocLink[];
  collapsible?: boolean;
  collapsed?: boolean;
};

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

function holdsPath(link: DocLink, pathname: string): boolean {
  return link.href === pathname || (link.children ?? []).some((c) => holdsPath(c, pathname));
}

/** Keys of every item and group that contains the current page. */
function activeKeys(sections: DocSection[], pathname: string): string[] {
  const keys: string[] = [];
  const walk = (links: DocLink[], prefix: string) =>
    links.forEach((l, i) => {
      const k = `${prefix}/${i}`;
      if (l.children?.length && holdsPath(l, pathname)) keys.push(k);
      if (l.children) walk(l.children, k);
    });
  sections.forEach((sec, si) => {
    if (sec.links.some((l) => holdsPath(l, pathname))) keys.push(`g${si}`);
    walk(sec.links, `g${si}`);
  });
  return keys;
}

/** Keys that start open: items marked `collapsed: false` and groups that
 *  aren't marked collapsed, plus whatever holds the current page. */
function initialOpen(sections: DocSection[], pathname: string): Set<string> {
  const open = new Set(activeKeys(sections, pathname));
  const walk = (links: DocLink[], prefix: string) =>
    links.forEach((l, i) => {
      const k = `${prefix}/${i}`;
      if (l.children?.length && l.collapsed === false) open.add(k);
      if (l.children) walk(l.children, k);
    });
  sections.forEach((sec, si) => {
    if (!sec.collapsible || !sec.collapsed) open.add(`g${si}`);
    walk(sec.links, `g${si}`);
  });
  return open;
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg className={`chev${open ? " open" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <path d="M6 4l4 4-4 4" />
  </svg>
);

/** Nav groups (the design's .docs-nav): a section title over its links, which
 *  can nest. Method/badge chips and icons are kept. */
function SidebarSections({
  sections,
  pathname,
  onNavigate,
}: {
  sections: DocSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => initialOpen(sections, pathname));

  // On navigation, open the branch holding the new page. Branches the reader
  // opened stay open; nothing is closed behind their back.
  useEffect(() => {
    setOpen((prev) => {
      const next = new Set(prev);
      for (const k of activeKeys(sections, pathname)) next.add(k);
      return next.size === prev.size ? prev : next;
    });
  }, [pathname, sections]);

  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const rowContent = (l: DocLink) => (
    <>
      {l.icon && <span className="ic">{l.icon}</span>}
      {l.method && <SidebarMethod method={l.method} />}
      <span className="lbl">{l.label}</span>
      {l.badge && <span className="badge">{l.badge}</span>}
    </>
  );

  const renderLinks = (links: DocLink[], prefix: string): React.ReactNode =>
    links.map((l, i) => {
      const k = `${prefix}/${i}`;
      const kids = l.children ?? [];
      const active = l.href !== undefined && pathname === l.href;

      if (!kids.length) {
        if (!l.href) return null;
        return (
          <Link key={k} href={l.href} onClick={onNavigate} className={active ? "active" : undefined}>
            {rowContent(l)}
          </Link>
        );
      }

      const isOpen = open.has(k);
      const subId = `docs-nav-${k.replace(/[^a-z0-9]/gi, "-")}`;
      return (
        <div key={k} className="docs-nav-node">
          {l.href ? (
            // A page that also has children: the label navigates, the chevron
            // opens and closes.
            <div className="docs-nav-row">
              <Link href={l.href} onClick={onNavigate} className={active ? "active" : undefined}>
                {rowContent(l)}
              </Link>
              <button
                type="button"
                className="docs-nav-chev"
                aria-expanded={isOpen}
                aria-controls={subId}
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${l.label}`}
                onClick={() => toggle(k)}
              >
                <Chevron open={isOpen} />
              </button>
            </div>
          ) : (
            // A folder with no page of its own: the whole row toggles.
            <button
              type="button"
              className="docs-nav-folder"
              aria-expanded={isOpen}
              aria-controls={subId}
              onClick={() => toggle(k)}
            >
              {rowContent(l)}
              <Chevron open={isOpen} />
            </button>
          )}
          {isOpen && (
            <div id={subId} className="docs-nav-sub">
              {renderLinks(kids, k)}
            </div>
          )}
        </div>
      );
    });

  return (
    <nav className="docs-nav">
      {sections.map((sec, si) => {
        const k = `g${si}`;
        const isOpen = !sec.collapsible || open.has(k);
        const title = (
          <>
            {sec.icon && <span className="ic">{sec.icon}</span>}
            <span>{sec.title}</span>
          </>
        );
        return (
          <div key={k} className="docs-nav-grp">
            {sec.collapsible ? (
              <button
                type="button"
                className="t t-toggle"
                aria-expanded={isOpen}
                aria-controls={`docs-nav-${k}`}
                onClick={() => toggle(k)}
              >
                {title}
                <Chevron open={isOpen} />
              </button>
            ) : sec.title ? (
              <div className="t">{title}</div>
            ) : null}
            {isOpen && <div id={`docs-nav-${k}`}>{renderLinks(sec.links, k)}</div>}
          </div>
        );
      })}
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
  searchInSidebar = true,
  variant,
  children,
}: {
  nav: NavData;
  /** False when layout.search puts the search box in the header instead. */
  searchInSidebar?: boolean;
  /** "hub": no table of contents column, for a page under a HubHero. */
  variant?: "hub";
  ai?: AiPublicConfig | null;
  /** Page-specific Ask AI starter questions (frontmatter `aiSuggestions`). */
  aiSuggestions?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className={`docs-shell grid${variant === "hub" ? " docs-shell--hub" : ""}`}>
      <DocsSidebar nav={nav} ai={ai} aiSuggestions={aiSuggestions} searchInSidebar={searchInSidebar} />
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
  searchInSidebar = true,
}: {
  nav: NavData;
  searchInSidebar?: boolean;
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

  const closeDrawer = () => document.body.classList.remove("docnav-open");

  return (
    <>
      {/* Mobile drawer scrim (body.docnav-open contract — see app/docs.css). */}
      <div className="docnav-scrim" onClick={closeDrawer} />
      <aside className="docs-side" ref={sideRef}>
        {tabs.length > 1 && (
          <nav className="drawer-tabs">
            {tabs.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                className={t.id === activeId ? "active" : undefined}
                onClick={closeDrawer}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        {(searchInSidebar || ai) && (
          <div className="docs-tools">
            {searchInSidebar && <SidebarSearchTrigger />}
            {ai && <SidebarAskButton />}
          </div>
        )}
        <SidebarSections sections={sections} pathname={pathname} onNavigate={closeDrawer} />
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
  items: TocItem[];
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
