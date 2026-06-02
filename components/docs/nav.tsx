"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropellerLogo, PropellerWordmark } from "@/components/chrome";
import { ThemeToggle } from "./theme-toggle";
import { TocList } from "./toc";
import { FeedbackWidget } from "./feedback";

export type DocLink = { href: string; label: string; badge?: "new" | "beta"; method?: string };
export type DocSection = { title: string; links: DocLink[] };

export type TopTab = { id: string; label: string; href: string; matchPrefixes: string[] };
export type TopTabWithSections = TopTab & { sections: DocSection[] };

export function DocsTopBar({ tabs }: { tabs: TopTab[] }) {
  const pathname = usePathname();
  const activeId = pickActiveTabId(tabs, pathname);
  return (
    <header className="docs-top sticky top-0 z-20 bg-paper border-b border-slate-3">
      <div className="h-14 px-6 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="brand inline-flex items-start  gap-2.5 no-underline text-ink font-semibold text-15">
          <PropellerLogo size={20} />
          <PropellerWordmark size={110} />
        </Link>
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
        <div className="relative w-[360px] h-[34px] hidden md:block docs-search">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-5"
               width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m11 11 3 3" />
          </svg>
          <input
            placeholder="Search docs…"
            className="w-full h-full pl-[34px] pr-14 bg-paper-2 border border-slate-4 rounded-2 text-13 text-ink focus:outline-none focus:border-slate-7"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-11 px-1.5 py-0.5 border border-slate-3 rounded text-slate-5">
            ⌘K
          </kbd>
        </div>
        <Link className="navlink hidden sm:inline-flex" href="https://hyphenmoney.com">hyphenmoney.com ↗</Link>
        <Link className="btn btn-primary btn-sm" href="https://app.hyphenmoney.com">Dashboard</Link>
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

export function DocsSidebar({ tabs }: { tabs: TopTabWithSections[] }) {
  const pathname = usePathname();
  const activeId = pickActiveTabId(tabs, pathname);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const sections = activeTab?.sections ?? [];
  return (
    <aside className="docs-side border-r border-slate-3 px-4 py-6 sticky self-start overflow-y-auto"
           style={{ top: 56, height: "calc(100vh - 56px)" }}>
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
    </aside>
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

export function DocsToc({ items, helpful = true }: { items: { id: string; label: string }[]; helpful?: boolean }) {
  return (
    <aside className="toc px-6 py-6 sticky self-start overflow-y-auto" style={{ top: 56, height: "calc(100vh - 56px)" }}>
      <h6 className="font-mono text-10 uppercase tracking-[0.08em] text-slate-5 font-medium mb-2">
        On this page
      </h6>
      <TocList items={items} />
      {helpful && <FeedbackWidget />}
    </aside>
  );
}
