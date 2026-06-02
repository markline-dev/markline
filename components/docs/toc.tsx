"use client";

import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

/**
 * Scroll-spy TOC. Uses IntersectionObserver to detect the topmost in-view
 * heading and highlights it. Clicking a link scrolls to the section.
 */
export function TocList({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    // Keep a live map of which sections are intersecting so we can pick the
    // first one (by document order) on each callback.
    const visible = new Map<string, boolean>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        // Choose the earliest-in-document intersecting id; if none, pick the
        // last one above the trigger line.
        const firstVisible = items.find((i) => visible.get(i.id));
        if (firstVisible) {
          setActiveId(firstVisible.id);
        } else {
          // Fallback: pick the closest one above the viewport top.
          let candidate = items[0].id;
          for (const i of items) {
            const el = document.getElementById(i.id);
            if (!el) continue;
            if (el.getBoundingClientRect().top < 80) candidate = i.id;
            else break;
          }
          setActiveId(candidate);
        }
      },
      // Activate when a heading enters the top ~25% of the viewport. The
      // negative bottom margin shrinks the active band so only one section is
      // "current" at a time.
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav>
      {items.map((i) => {
        const active = i.id === activeId;
        return (
          <a
            key={i.id}
            href={`#${i.id}`}
            className="relative flex items-center gap-2 py-1 pl-3 text-12 no-underline transition-colors"
            style={{
              color: active ? "rgb(var(--c-brand))" : "rgb(var(--c-slate-5))",
              fontWeight: active ? 600 : 400,
            }}
            onClick={() => setActiveId(i.id)}
          >
            <span
              aria-hidden
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full transition-opacity"
              style={{
                background: "rgb(var(--c-brand))",
                opacity: active ? 1 : 0,
              }}
            />
            {i.label}
          </a>
        );
      })}
    </nav>
  );
}
