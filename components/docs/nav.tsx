"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { TocList } from "./toc";
import { FeedbackWidget } from "./feedback";
import { DocsSearch } from "./search";

export type DocLink = { href: string; label: string; badge?: "new" | "beta"; method?: string };
export type DocSection = { title: string; links: DocLink[] };

export type TopTab = { id: string; label: string; href: string; matchPrefixes: string[] };
export type TopTabWithSections = TopTab & { sections: DocSection[] };

export type VersionMeta = { id: string; label: string };
export type VersionedNav = {
  versions: VersionMeta[];
  defaultVersionId: string;
  tabsByVersion: Record<string, TopTabWithSections[]>;
};

/** Active version id for a pathname (first path segment if it's a non-default version). */
export function pickVersionId(nav: VersionedNav, pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  const match = nav.versions.find((v) => v.id === seg && v.id !== nav.defaultVersionId);
  return match ? match.id : nav.defaultVersionId;
}

/** Home path for a version: "/" for the default, "/<id>" otherwise. */
function versionHome(nav: VersionedNav, id: string): string {
  return id === nav.defaultVersionId ? "/" : `/${id}`;
}

export type Brand = {
  name: string;
  logo?: { light?: string; dark?: string; text?: string };
  links: { label: string; href: string }[];
  cta?: { label: string; href: string };
};

function BrandMark({ brand }: { brand: Brand }) {
  const { logo, name } = brand;
  if (logo?.light || logo?.dark) {
    const light = logo.light ?? logo.dark!;
    const dark = logo.dark ?? logo.light!;
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={light} alt={name} className="h-6 w-auto block dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dark} alt={name} className="h-6 w-auto hidden dark:block" />
      </>
    );
  }
  return <span className="text-16 font-semibold tracking-tight text-ink">{logo?.text ?? name}</span>;
}

export function DocsTopBar({ nav, brand }: { nav: VersionedNav; brand: Brand }) {
  const pathname = usePathname();
  const activeVersion = pickVersionId(nav, pathname);
  const tabs = nav.tabsByVersion[activeVersion] ?? [];
  const activeId = pickActiveTabId(tabs, pathname);
  return (
    <header className="docs-top sticky top-0 z-20 bg-paper border-b border-slate-3">
      <div className="h-14 px-6 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <MobileNav nav={nav} />
        <Link href="/" className="brand inline-flex items-center gap-2.5 no-underline text-ink font-semibold text-15">
          <BrandMark brand={brand} />
        </Link>
        {nav.versions.length > 1 && (
          <VersionSwitcher nav={nav} activeVersion={activeVersion} />
        )}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map((t) => {
            const active = t.id === activeId;
            return (
              <Link
                key={t.id}
                href={t.href}
                className={`relative px-3 py-1.5 text-13 no-underline rounded-1 ${
                  active ? "text-ink font-medium" : "text-slate-5 hover:text-ink"
                }`}
              >
                {t.label}
                {active && (
                  <span aria-hidden className="absolute left-2 right-2 -bottom-[15px] h-[2px] bg-brand" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <DocsSearch />
        {brand.links.map((l) => (
          <Link key={l.href} className="navlink hidden sm:inline-flex" href={l.href}>{l.label}</Link>
        ))}
        {brand.cta && (
          <Link className="btn btn-primary btn-sm" href={brand.cta.href}>{brand.cta.label}</Link>
        )}
        <ThemeToggle />
      </div>
      </div>
      <style>{`
        @media (max-width: 880px) { .docs-search { width: 220px !important; display: block !important; } }
        @media (max-width: 600px) { .docs-search { display: none !important; } }
      `}</style>
    </header>
  );
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
    <>
      {sections.map((sec, si) => (
        <div key={sec.title}>
          <h5 className={`font-mono text-10 uppercase tracking-[0.08em] text-slate-5 font-medium px-2 pb-1.5 ${si === 0 ? "pt-0" : "pt-4"}`}>
            {sec.title}
          </h5>
          {sec.links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={onNavigate}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-13 no-underline rounded-1 leading-[1.4] ${
                  active ? "text-ink font-medium" : "text-slate-6 hover:text-ink hover:bg-slate-2"
                }`}
              >
                {active && <span aria-hidden className="w-[2px] h-3.5 bg-brand -ml-2.5 mr-1.5" />}
                {l.method && <SidebarMethod method={l.method} />}
                <span className="truncate">{l.label}</span>
                {l.badge && (
                  <span className={`ml-auto font-mono text-[9px] px-1.5 py-px rounded-sm tracking-[0.04em] uppercase ${
                    l.badge === "new"
                      ? "bg-brand text-white"
                      : "bg-[#FBEACB] text-[#9A6A1A]"
                  }`}>
                    {l.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function DocsSidebar({ nav }: { nav: VersionedNav }) {
  const pathname = usePathname();
  const tabs = nav.tabsByVersion[pickVersionId(nav, pathname)] ?? [];
  const activeId = pickActiveTabId(tabs, pathname);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const sections = activeTab?.sections ?? [];
  return (
    <aside className="docs-side border-r border-slate-3 px-4 py-6 sticky self-start overflow-y-auto"
           style={{ top: 56, height: "calc(100vh - 56px)" }}>
      <SidebarSections sections={sections} pathname={pathname} />
    </aside>
  );
}

/** Hamburger + slide-over drawer for navigation on small screens. */
function MobileNav({ nav }: { nav: VersionedNav }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const tabs = nav.tabsByVersion[pickVersionId(nav, pathname)] ?? [];
  if (tabs.length === 0) return null;
  const activeId = pickActiveTabId(tabs, pathname);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const sections = activeTab?.sections ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="md:hidden inline-flex items-center justify-center -ml-1 w-9 h-9 rounded-1 text-ink hover:bg-slate-2"
      >
        <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)}>
          <nav
            className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[80vw] bg-paper border-r border-slate-3 overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-10 uppercase tracking-[0.08em] text-slate-5">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="w-8 h-8 inline-flex items-center justify-center rounded-1 text-slate-6 hover:bg-slate-2"
              >
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                  <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {tabs.length > 1 && (
              <div className="flex flex-col gap-0.5 pb-3 mb-3 border-b border-slate-3">
                {tabs.map((t) => (
                  <Link
                    key={t.id}
                    href={t.href}
                    onClick={() => setOpen(false)}
                    className={`px-2.5 py-1.5 text-13 no-underline rounded-1 ${
                      t.id === activeId ? "text-ink font-medium bg-slate-2" : "text-slate-6 hover:text-ink hover:bg-slate-2"
                    }`}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
            )}

            <SidebarSections sections={sections} pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      )}
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
    <span className="font-mono text-[9px] uppercase tracking-[0.04em] w-9 flex-shrink-0" style={{ color: color[m] ?? "#7882A0" }}>
      {m}
    </span>
  );
}

/** Dropdown to switch documentation versions; selecting navigates to that version's home. */
function VersionSwitcher({ nav, activeVersion }: { nav: VersionedNav; activeVersion: string }) {
  const router = useRouter();
  const active = nav.versions.find((v) => v.id === activeVersion) ?? nav.versions[0];
  return (
    <div className="relative">
      <select
        aria-label="Version"
        value={activeVersion}
        onChange={(e) => router.push(versionHome(nav, e.target.value))}
        className="appearance-none cursor-pointer bg-paper-2 border border-slate-3 rounded-1 text-12 font-medium text-ink pl-2.5 pr-7 py-1 hover:border-slate-4 focus:outline-none focus:border-brand"
      >
        {nav.versions.map((v) => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>
      <svg
        width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-5"
        aria-hidden
      >
        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{active?.label}</span>
    </div>
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
    <aside className="toc px-6 py-6 sticky self-start overflow-y-auto" style={{ top: 56, height: "calc(100vh - 56px)" }}>
      <h6 className="font-mono text-10 uppercase tracking-[0.08em] text-slate-5 font-medium mb-2">
        On this page
      </h6>
      <TocList items={items} />
      {helpful && <FeedbackWidget endpoint={feedbackEndpoint} />}
    </aside>
  );
}
