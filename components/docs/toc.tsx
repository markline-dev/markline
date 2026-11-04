"use client";

import { useEffect, useState } from "react";

import type { TocItem } from "@/lib/toc";

export type { TocItem };

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
    // The sticky header covers the top of the viewport; it's taller when
    // layout.header is "stacked", so read its height instead of assuming 60px.
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 60;

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
            if (el.getBoundingClientRect().top < navH + 20) candidate = i.id;
            else break;
          }
          setActiveId(candidate);
        }
      },
      // Activate when a heading enters the top ~25% of the viewport. The
      // negative bottom margin shrinks the active band so only one section is
      // "current" at a time.
      { rootMargin: `-${navH + 12}px 0px -70% 0px`, threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;
  return (
    <ul className="toc-list">
      {items.map((i) => {
        const active = i.id === activeId;
        return (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={[active && "active", i.depth === 3 && "sub"].filter(Boolean).join(" ") || undefined}
              onClick={() => setActiveId(i.id)}
            >
              {i.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
